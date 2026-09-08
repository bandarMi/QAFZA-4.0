/**
 * Anomaly & momentum detection. Runs on demand (and on server start) and writes
 * into `alerts`, so the Overview can surface "what changed" without anyone asking.
 *
 * Four detectors, all thresholded from Settings so they can be tuned without code:
 *   1. initiative_decline        — an initiative's hours fell vs its own trailing average
 *   2. cohort_underrepresented   — a cohort's share of attendance lags its share of membership
 *   3. member_stall              — an engaged member's hours dropped below their own history
 *   4. mention_spike             — LinkedIn mention volume jumped vs the trailing average
 * Plus one hygiene check: unverified_backlog (hours waiting on a council spot-check).
 */
import { db } from '../db/index.js';
import { getSetting } from './settings.js';

/** A stall list longer than this stops being a to-do list and starts being noise. */
const MAX_STALL_ALERTS = 12;

/** Below this much prior-window engagement there is no trend worth judging. */
const MIN_BASELINE_HOURS = 10;

const upsert = db.prepare(`
  INSERT INTO alerts (kind, severity, title, detail, entity_type, entity_id, metric, status)
  VALUES (@kind, @severity, @title, @detail, @entity_type, @entity_id, @metric, 'open')
  ON CONFLICT(kind, entity_type, entity_id, status)
  DO UPDATE SET title=excluded.title, detail=excluded.detail, metric=excluded.metric,
                severity=excluded.severity, detected_at=datetime('now')`);

/** Latest month that actually has data — the demo dataset ends in the present. */
function latestMonth(): string {
  const r = db.prepare('SELECT MAX(substr(date,1,7)) m FROM engagement_logs').get() as any;
  return r?.m ?? new Date().toISOString().slice(0, 7);
}

function monthsBefore(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y!, (m! - 1) - n, 1));
  return d.toISOString().slice(0, 7);
}

export function runAnomalyDetection() {
  const declinePct = Number(getSetting('anomaly_decline_pct')) || 25;
  const stallPct = Number(getSetting('anomaly_stall_pct')) || 40;

  // Compare a THREE-MONTH window against the three months before it, not a single
  // month against an average. Most initiatives run monthly or less often, so a
  // one-month comparison reports "down 100%" every time a cadence simply lands in
  // the next month — noise that trains people to ignore the alert list.
  const current = latestMonth();
  const rEnd = monthsBefore(current, 1);   // last complete month
  const rStart = monthsBefore(current, 3);
  const pEnd = monthsBefore(current, 4);
  const pStart = monthsBefore(current, 6);
  const win = { rStart, rEnd, pStart, pEnd };

  let created = 0;

  // 1. Initiative engagement decline -----------------------------------------
  const initiatives = db.prepare(`
    SELECT i.id, i.name, i.owner_council_role,
      COALESCE((SELECT SUM(l.hours) FROM engagement_logs l
                WHERE l.related_initiative_id=i.id
                  AND substr(l.date,1,7) BETWEEN @rStart AND @rEnd),0) recent,
      COALESCE((SELECT SUM(l.hours) FROM engagement_logs l
                WHERE l.related_initiative_id=i.id
                  AND substr(l.date,1,7) BETWEEN @pStart AND @pEnd),0) prior
    FROM initiatives i WHERE i.active=1`).all(win) as any[];

  for (const it of initiatives) {
    if (it.prior < MIN_BASELINE_HOURS) continue;         // too little history to judge
    const drop = ((it.prior - it.recent) / it.prior) * 100;
    if (drop >= declinePct) {
      upsert.run({
        kind: 'initiative_decline',
        severity: drop >= 60 ? 'serious' : 'warning',
        title: `${it.name}: engagement down ${Math.round(drop)}%`,
        detail: `${Math.round(it.recent * 10) / 10}h in ${rStart}–${rEnd} vs ${Math.round(it.prior * 10) / 10}h in ${pStart}–${pEnd}. Owner: ${it.owner_council_role ?? 'unassigned'}.`,
        entity_type: 'initiative', entity_id: it.id, metric: Math.round(drop * 10) / 10,
      });
      created++;
    }
  }

  // 2. Cohort under-representation -------------------------------------------
  const cohortShare = db.prepare(`
    SELECT m.cohort_type,
      (SELECT COUNT(*) FROM members x WHERE x.cohort_type=m.cohort_type) * 1.0
        / (SELECT COUNT(*) FROM members) membership_share,
      COUNT(DISTINCT a.member_id) * 1.0 / NULLIF((
        SELECT COUNT(DISTINCT a2.member_id) FROM event_attendance a2
        JOIN events e2 ON e2.id=a2.event_id WHERE substr(e2.date,1,7) >= @rStart),0) attendance_share
    FROM members m
    LEFT JOIN event_attendance a ON a.member_id=m.id
    LEFT JOIN events e ON e.id=a.event_id AND substr(e.date,1,7) >= @rStart
    GROUP BY m.cohort_type`).all(win) as any[];

  for (const c of cohortShare) {
    if (!c.attendance_share) continue;
    const gapPct = ((c.membership_share - c.attendance_share) / c.membership_share) * 100;
    if (gapPct >= 15) {
      upsert.run({
        kind: 'cohort_underrepresented',
        severity: gapPct >= 30 ? 'warning' : 'info',
        title: `${c.cohort_type} under-represented at events`,
        detail: `${Math.round(c.membership_share * 100)}% of membership but ${Math.round(c.attendance_share * 100)}% of event attendees since ${rStart}.`,
        entity_type: 'cohort', entity_id: 0, metric: Math.round(gapPct * 10) / 10,
      });
      created++;
    }
  }

  // 3. Member engagement stall ------------------------------------------------
  const stalled = db.prepare(`
    SELECT m.id, m.name, m.member_code,
      COALESCE(SUM(CASE WHEN substr(l.date,1,7) BETWEEN @rStart AND @rEnd THEN l.hours END),0) recent,
      COALESCE(SUM(CASE WHEN substr(l.date,1,7) BETWEEN @pStart AND @pEnd THEN l.hours END),0) prior
    FROM members m JOIN engagement_logs l ON l.member_id=m.id
    WHERE m.status='active'
    GROUP BY m.id
    HAVING prior >= ${MIN_BASELINE_HOURS}`).all(win) as any[];

  // Rank stalls by how much engagement is actually at risk and keep only the top
  // few: a council lead can act on a dozen names, not eighty.
  const ranked = stalled
    .map(s => ({ ...s, drop: ((s.prior - s.recent) / s.prior) * 100 }))
    .filter(s => s.drop >= stallPct)
    .sort((a, b) => b.prior - a.prior)
    .slice(0, MAX_STALL_ALERTS);

  for (const s of ranked) {
    upsert.run({
      kind: 'member_stall',
      severity: s.drop >= 80 ? 'warning' : 'info',
      title: `${s.name} (${s.member_code}) engagement stalled`,
      detail: `${Math.round(s.recent * 10) / 10}h in ${rStart}–${rEnd} vs ${Math.round(s.prior * 10) / 10}h in the three months before.`,
      entity_type: 'member', entity_id: s.id, metric: Math.round(s.drop * 10) / 10,
    });
    created++;
  }

  // 4. LinkedIn mention spike -------------------------------------------------
  const mentionMonths = db.prepare(`
    SELECT substr(post_date,1,7) month, COUNT(*) c FROM linkedin_mentions
    WHERE post_date IS NOT NULL GROUP BY month ORDER BY month DESC LIMIT 4`).all() as any[];
  if (mentionMonths.length >= 3) {
    const [latest, ...rest] = mentionMonths;
    const avg = rest.reduce((a, r) => a + r.c, 0) / rest.length;
    if (avg > 0 && latest!.c >= avg * 1.8 && latest!.c >= 5) {
      upsert.run({
        kind: 'mention_spike', severity: 'info',
        title: `LinkedIn mentions spiked in ${latest!.month}`,
        detail: `${latest!.c} captured mentions vs a ${Math.round(avg * 10) / 10} trailing average. Worth a resharing push.`,
        entity_type: 'linkedin', entity_id: 0, metric: latest!.c,
      });
      created++;
    }
  }

  // 5. Unverified hours backlog ----------------------------------------------
  const unver = db.prepare(`
    SELECT COUNT(*) c, ROUND(SUM(hours),1) h FROM engagement_logs WHERE verified_flag=0`).get() as any;
  if (unver?.c > 0) {
    const total = (db.prepare('SELECT ROUND(SUM(hours),1) h FROM engagement_logs').get() as any)?.h || 1;
    const share = (unver.h / total) * 100;
    upsert.run({
      kind: 'unverified_backlog',
      severity: share >= 80 ? 'warning' : 'info',
      title: `${unver.c.toLocaleString()} hour entries awaiting verification`,
      detail: `${unver.h}h (${Math.round(share)}% of all logged hours) have not been spot-checked by a council lead. Verify before they go into an official report.`,
      entity_type: 'global', entity_id: 0, metric: Math.round(share),
    });
    created++;
  }

  // Auto-resolve alerts that this run did not reproduce: every live alert had its
  // detected_at refreshed by the upsert above, so anything still stale is gone.
  db.prepare(`UPDATE alerts SET status='resolved'
              WHERE status='open' AND detected_at < datetime('now','-1 minute')`).run();

  return { detected: created };
}

export function listAlerts(status = 'open') {
  return db.prepare(`
    SELECT * FROM alerts WHERE status=?
    ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'serious' THEN 1 WHEN 'warning' THEN 2 ELSE 3 END,
             detected_at DESC`).all(status);
}
