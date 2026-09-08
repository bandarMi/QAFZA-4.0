/**
 * Engagement-hours engine.
 *
 * The design goal is that nobody logs hours by hand. Hours are DERIVED from
 * attendance records the moment an event is closed:
 *
 *   QR check-in + check-out  ->  actual elapsed hours (clamped, rounded to 0.25)
 *   QR check-in only         ->  the event's duration_hours (documented fallback)
 *   manual attendance mark   ->  the event's duration_hours
 *   no event duration        ->  engagement_rules.default_hours for the activity
 *
 * A role multiplier from the rules table then applies (a speaker or organiser
 * invests more than an attendee). Every write is mirrored into engagement_audit,
 * and a human override never silently overwrites the machine value — the original
 * is preserved in override_of_hours.
 */
import { db } from '../db/index.js';

export type Rule = {
  activity_type: string;
  default_hours: number;
  role_multiplier: Record<string, number>;
  counts_toward_recognition: number;
  description: string | null;
};

export function getRules(): Record<string, Rule> {
  const rows = db.prepare('SELECT * FROM engagement_rules').all() as any[];
  const out: Record<string, Rule> = {};
  for (const r of rows) {
    out[r.activity_type] = { ...r, role_multiplier: safeJson(r.role_multiplier, {}) };
  }
  return out;
}

function safeJson<T>(s: unknown, fallback: T): T {
  try { return typeof s === 'string' ? (JSON.parse(s) as T) : fallback; } catch { return fallback; }
}

/** Round to the nearest quarter hour — how programs actually report time. */
const quarter = (h: number) => Math.round(h * 4) / 4;

export type HoursDerivation = {
  hours: number;
  basis: 'checkin-checkout' | 'event-duration' | 'rule-default';
  roleMultiplier: number;
  rawHours: number;
  /** Set when a scan pair was rejected as implausible and the duration was used. */
  scanRejected?: 'too-short' | 'different-day' | 'negative';
};

/**
 * A check-out scanned less than this share of the scheduled duration after the
 * check-in is almost always a double-scan at the door, not a real early exit.
 * Trusting it would quietly under-report the member's hours.
 */
const MIN_PLAUSIBLE_SCAN_RATIO = 0.25;

export function deriveHours(
  args: { checkedInAt: string | null; checkedOutAt: string | null; eventDuration: number | null; role: string; rule: Rule | undefined },
): HoursDerivation {
  const { checkedInAt, checkedOutAt, eventDuration, role, rule } = args;
  let raw: number;
  let basis: HoursDerivation['basis'];

  let scanRejected: HoursDerivation['scanRejected'];

  if (checkedInAt && checkedOutAt) {
    const inMs = Date.parse(checkedInAt);
    const outMs = Date.parse(checkedOutAt);
    const elapsed = (outMs - inMs) / 3_600_000;
    const scheduled = eventDuration ?? rule?.default_hours ?? 2;
    const sameDay = checkedInAt.slice(0, 10) === checkedOutAt.slice(0, 10);

    if (!Number.isFinite(elapsed) || elapsed <= 0) {
      scanRejected = 'negative';
    } else if (!sameDay) {
      // A check-out on another day means the exit scan was missed and picked up
      // later, not a multi-day attendance.
      scanRejected = 'different-day';
    } else if (elapsed < scheduled * MIN_PLAUSIBLE_SCAN_RATIO) {
      // Almost certainly a double-scan at the door.
      scanRejected = 'too-short';
    }

    if (scanRejected) {
      raw = scheduled;
      basis = eventDuration != null ? 'event-duration' : 'rule-default';
    } else {
      raw = Math.min(elapsed, Math.max(scheduled * 2, 0.5));   // cap a forgotten exit scan
      basis = 'checkin-checkout';
    }
  } else if (eventDuration != null) {
    raw = eventDuration;
    basis = 'event-duration';
  } else {
    raw = rule?.default_hours ?? 1;
    basis = 'rule-default';
  }

  const roleMultiplier = rule?.role_multiplier?.[role] ?? 1;
  return { hours: quarter(raw * roleMultiplier), basis, roleMultiplier, rawHours: quarter(raw), scanRejected };
}

const audit = db.prepare('INSERT INTO engagement_audit (log_id, action, actor, detail) VALUES (?,?,?,?)');

/**
 * Generate (or refresh) engagement_logs for every attendee of an event.
 * Idempotent: safe to call whenever attendance changes or the event is re-closed.
 * A log a human has overridden or verified is never silently recalculated.
 */
export function postHoursForEvent(eventId: number, actor = 'system'): { created: number; updated: number; skipped: number } {
  const ev = db.prepare('SELECT * FROM events WHERE id=?').get(eventId) as any;
  if (!ev) throw new Error(`Event ${eventId} not found`);

  const rules = getRules();
  const rule = rules[ev.activity_type];
  const attendance = db.prepare('SELECT * FROM event_attendance WHERE event_id=? AND no_show=0').all(eventId) as any[];

  const findLog = db.prepare(
    'SELECT * FROM engagement_logs WHERE member_id=? AND related_event_id=? AND activity_type=? AND direction=?');
  const insLog = db.prepare(`INSERT INTO engagement_logs
    (member_id,activity_type,related_initiative_id,related_event_id,date,hours,direction,source,verified_flag,notes)
    VALUES (?,?,?,?,?,?,?,?,0,?)`);
  const updLog = db.prepare('UPDATE engagement_logs SET hours=?, date=?, source=?, notes=? WHERE id=?');

  let created = 0, updated = 0, skipped = 0;

  const tx = db.transaction(() => {
    for (const att of attendance) {
      const d = deriveHours({
        checkedInAt: att.checked_in_at,
        checkedOutAt: att.checked_out_at,
        eventDuration: ev.duration_hours,
        role: att.role,
        rule,
      });
      // Mentorship is double-entry: the mentor gives hours, the mentee receives them.
      const direction: 'participated' | 'given' | 'received' =
        att.role === 'mentor' ? 'given' : att.role === 'mentee' ? 'received' : 'participated';
      const source = att.source === 'qr' && att.checked_in_at ? 'qr' : 'auto-calculated';
      const reason = d.scanRejected === 'too-short' ? ' (check-out scanned too soon — likely a double scan)'
                   : d.scanRejected === 'different-day' ? ' (check-out scanned on a later day)'
                   : d.scanRejected === 'negative' ? ' (check-out before check-in)'
                   : '';
      const note = `Auto: ${d.basis}${reason}${d.roleMultiplier !== 1 ? ` × ${d.roleMultiplier} (${att.role})` : ''}`;

      const existing = findLog.get(att.member_id, eventId, ev.activity_type, direction) as any;
      if (!existing) {
        const r = insLog.run(att.member_id, ev.activity_type, ev.initiative_id, eventId, ev.date, d.hours, direction, source, note);
        audit.run(Number(r.lastInsertRowid), 'auto_created', actor, JSON.stringify({ eventId, ...d, direction }));
        created++;
      } else if (existing.override_of_hours != null || existing.verified_flag === 1) {
        skipped++;                                   // a human has spoken; leave it alone
      } else if (existing.hours !== d.hours || existing.date !== ev.date) {
        updLog.run(d.hours, ev.date, source, note, existing.id);
        audit.run(existing.id, 'recalculated', actor, JSON.stringify({ from: existing.hours, to: d.hours, basis: d.basis }));
        updated++;
      } else {
        skipped++;
      }
    }
    db.prepare("UPDATE events SET hours_posted_at=datetime('now') WHERE id=?").run(eventId);
  });
  tx();

  return { created, updated, skipped };
}

/** Close an event: flip status and post hours in one atomic step. */
export function closeEvent(eventId: number, actor = 'system') {
  db.prepare("UPDATE events SET status='closed' WHERE id=?").run(eventId);
  return postHoursForEvent(eventId, actor);
}

export function overrideHours(logId: number, hours: number, actor: string, reason?: string) {
  const log = db.prepare('SELECT * FROM engagement_logs WHERE id=?').get(logId) as any;
  if (!log) throw new Error(`Log ${logId} not found`);
  const original = log.override_of_hours ?? log.hours;
  db.prepare('UPDATE engagement_logs SET hours=?, override_of_hours=?, notes=? WHERE id=?')
    .run(hours, original, reason ? `Override: ${reason}` : log.notes, logId);
  audit.run(logId, 'overridden', actor, JSON.stringify({ from: log.hours, to: hours, original, reason }));
  return db.prepare('SELECT * FROM engagement_logs WHERE id=?').get(logId);
}

export function setVerified(logIds: number[], verified: boolean, actor: string) {
  const upd = db.prepare(
    "UPDATE engagement_logs SET verified_flag=?, verified_by=?, verified_at=CASE WHEN ? THEN datetime('now') ELSE NULL END WHERE id=?");
  const tx = db.transaction(() => {
    for (const id of logIds) {
      upd.run(verified ? 1 : 0, verified ? actor : null, verified ? 1 : 0, id);
      audit.run(id, verified ? 'verified' : 'unverified', actor, null);
    }
  });
  tx();
  return logIds.length;
}

/** Per-member engagement ledger: totals by category, running total, YoY. */
export function memberLedger(memberId: number, from?: string, to?: string) {
  const f = from ?? '0000-01-01';
  const t = to ?? '9999-12-31';

  const byCategory = db.prepare(`
    SELECT activity_type, direction, ROUND(SUM(hours),2) hours, COUNT(*) entries
    FROM engagement_logs WHERE member_id=? AND date BETWEEN ? AND ?
    GROUP BY activity_type, direction ORDER BY hours DESC`).all(memberId, f, t) as any[];

  const byMonth = db.prepare(`
    SELECT substr(date,1,7) month, ROUND(SUM(hours),2) hours
    FROM engagement_logs WHERE member_id=? AND date BETWEEN ? AND ?
    GROUP BY month ORDER BY month`).all(memberId, f, t) as any[];

  let running = 0;
  const cumulative = byMonth.map(r => ({ ...r, cumulative: (running = Math.round((running + r.hours) * 100) / 100) }));

  const byYear = db.prepare(`
    SELECT substr(date,1,4) year, ROUND(SUM(hours),2) hours, COUNT(*) entries
    FROM engagement_logs WHERE member_id=? GROUP BY year ORDER BY year`).all(memberId) as any[];

  const totals = db.prepare(`
    SELECT ROUND(SUM(hours),2) total_hours, COUNT(*) entries,
           ROUND(SUM(CASE WHEN verified_flag=1 THEN hours ELSE 0 END),2) verified_hours,
           SUM(CASE WHEN source IN ('auto-calculated','qr') THEN 1 ELSE 0 END) auto_entries
    FROM engagement_logs WHERE member_id=? AND date BETWEEN ? AND ?`).get(memberId, f, t) as any;

  const years = byYear.map(r => Number(r.year));
  const thisYear = Math.max(...(years.length ? years : [new Date().getFullYear()]));
  const cur = byYear.find(r => Number(r.year) === thisYear)?.hours ?? 0;
  const prev = byYear.find(r => Number(r.year) === thisYear - 1)?.hours ?? 0;

  return {
    totals: {
      total_hours: totals?.total_hours ?? 0,
      entries: totals?.entries ?? 0,
      verified_hours: totals?.verified_hours ?? 0,
      auto_entries: totals?.auto_entries ?? 0,
      auto_share: totals?.entries ? Math.round((totals.auto_entries / totals.entries) * 100) : 0,
    },
    byCategory,
    byMonth: cumulative,
    byYear,
    yoy: {
      year: thisYear, current: cur, previous: prev,
      deltaPct: prev > 0 ? Math.round(((cur - prev) / prev) * 1000) / 10 : null,
    },
  };
}

export function recalcAllClosedEvents(actor = 'system') {
  const rows = db.prepare("SELECT id FROM events WHERE status='closed'").all() as Array<{ id: number }>;
  let created = 0, updated = 0, skipped = 0;
  for (const r of rows) {
    const res = postHoursForEvent(r.id, actor);
    created += res.created; updated += res.updated; skipped += res.skipped;
  }
  return { events: rows.length, created, updated, skipped };
}
