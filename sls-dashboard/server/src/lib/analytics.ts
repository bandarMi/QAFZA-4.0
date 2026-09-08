/**
 * The single analytics layer. REST routes, PDF/Power BI exports and the AI's
 * tools all call these functions, so the dashboard, the export and the chat
 * answer can never disagree about a number.
 *
 * Every result carries `provenance` naming the tables and the filters used —
 * the AI is instructed to cite it, and the UI renders it under each chart.
 */
import { db } from '../db/index.js';
import { engagementWhere, eventWhere, memberWhere, describeFilters, type Filters } from './filters.js';

export type Provenance = { tables: string[]; filters: string; rowCount: number };

const prov = (tables: string[], f: Filters, rowCount: number): Provenance =>
  ({ tables, filters: describeFilters(f), rowCount });

const r2 = (n: number | null | undefined) => (n == null ? 0 : Math.round(n * 100) / 100);

// ------------------------------------------------------------------ overview --

export function overviewKpis(f: Filters) {
  const e = engagementWhere(f);
  const ev = eventWhere(f);
  const m = memberWhere(f);

  const hours = db.prepare(`
    SELECT ROUND(SUM(l.hours),1) total_hours,
           COUNT(*) entries,
           COUNT(DISTINCT l.member_id) active_members,
           ROUND(SUM(CASE WHEN l.source IN ('auto-calculated','qr') THEN l.hours ELSE 0 END),1) auto_hours,
           ROUND(SUM(CASE WHEN l.verified_flag=1 THEN l.hours ELSE 0 END),1) verified_hours
    FROM engagement_logs l
    JOIN members m ON m.id = l.member_id
    LEFT JOIN initiatives i ON i.id = l.related_initiative_id
    WHERE ${e.where}`).get(e.params) as any;

  const events = db.prepare(`
    SELECT COUNT(*) events, COALESCE(SUM(e.attendee_count),0) attendees,
           ROUND(AVG(e.satisfaction_score),2) avg_satisfaction
    FROM events e LEFT JOIN initiatives i ON i.id = e.initiative_id
    WHERE ${ev.where} AND e.status='closed'`).get(ev.params) as any;

  const members = db.prepare(`
    SELECT COUNT(*) total,
           SUM(CASE WHEN m.cohort_type='2030 Leader' THEN 1 ELSE 0 END) leaders_2030,
           SUM(CASE WHEN m.cohort_type='Misk Fellow' THEN 1 ELSE 0 END) fellows,
           SUM(CASE WHEN m.status='active' THEN 1 ELSE 0 END) active
    FROM members m WHERE ${m.where}`).get(m.params) as any;

  const onboarded = db.prepare(`
    SELECT COUNT(*) c FROM members m
    WHERE ${m.where}
      ${f.dateFrom ? 'AND m.join_date >= @dateFrom' : ''}
      ${f.dateTo ? 'AND m.join_date <= @dateTo' : ''}`)
    .get({ ...m.params, dateFrom: f.dateFrom, dateTo: f.dateTo }) as any;

  const startups = db.prepare(`
    SELECT COUNT(*) c FROM startups s
    LEFT JOIN members m ON m.id = s.member_id
    WHERE 1=1
      ${f.sector?.length ? `AND s.sector IN (${f.sector.map((_, i) => `@ssec${i}`).join(',')})` : ''}
      ${f.dateFrom ? "AND s.support_year >= CAST(substr(@dateFrom,1,4) AS INTEGER)" : ''}
      ${f.dateTo ? "AND s.support_year <= CAST(substr(@dateTo,1,4) AS INTEGER)" : ''}`)
    .get({
      ...Object.fromEntries((f.sector ?? []).map((v, i) => [`ssec${i}`, v])),
      dateFrom: f.dateFrom, dateTo: f.dateTo,
    }) as any;

  const recognised = db.prepare('SELECT COUNT(DISTINCT member_id) c FROM recognition_flags').get() as any;
  const unverified = db.prepare(`
    SELECT COUNT(*) c, ROUND(SUM(l.hours),1) h FROM engagement_logs l
    JOIN members m ON m.id=l.member_id
    LEFT JOIN initiatives i ON i.id=l.related_initiative_id
    WHERE ${e.where} AND l.verified_flag=0`).get(e.params) as any;

  const totalHours = hours?.total_hours ?? 0;
  const memberCount = members?.total ?? 0;

  return {
    kpis: {
      totalMembers: memberCount,
      leaders2030: members?.leaders_2030 ?? 0,
      miskFellows: members?.fellows ?? 0,
      activeMembers: members?.active ?? 0,
      membersOnboarded: onboarded?.c ?? 0,
      totalHours,
      avgHoursPerMember: memberCount ? r2(totalHours / memberCount) : 0,
      avgHoursPerEngagedMember: hours?.active_members ? r2(totalHours / hours.active_members) : 0,
      engagedMembers: hours?.active_members ?? 0,
      autoHoursShare: totalHours ? Math.round(((hours?.auto_hours ?? 0) / totalHours) * 100) : 0,
      verifiedHoursShare: totalHours ? Math.round(((hours?.verified_hours ?? 0) / totalHours) * 100) : 0,
      unverifiedEntries: unverified?.c ?? 0,
      unverifiedHours: unverified?.h ?? 0,
      events: events?.events ?? 0,
      eventAttendees: events?.attendees ?? 0,
      avgSatisfaction: events?.avg_satisfaction ?? null,
      startupsSupported: startups?.c ?? 0,
      membersRecognised: recognised?.c ?? 0,
    },
    provenance: prov(['members', 'engagement_logs', 'events', 'startups', 'recognition_flags'], f, 1),
  };
}

// --------------------------------------------------------- engagement slices --

export function hoursByMonth(f: Filters) {
  const e = engagementWhere(f);
  const rows = db.prepare(`
    SELECT substr(l.date,1,7) month, ROUND(SUM(l.hours),1) hours, COUNT(*) entries,
           COUNT(DISTINCT l.member_id) members
    FROM engagement_logs l JOIN members m ON m.id=l.member_id
    LEFT JOIN initiatives i ON i.id=l.related_initiative_id
    WHERE ${e.where} GROUP BY month ORDER BY month`).all(e.params) as any[];
  return { rows, provenance: prov(['engagement_logs', 'members', 'initiatives'], f, rows.length) };
}

export function hoursByPillar(f: Filters) {
  const e = engagementWhere(f);
  const rows = db.prepare(`
    SELECT COALESCE(i.pillar,'Unattributed') pillar, ROUND(SUM(l.hours),1) hours,
           COUNT(DISTINCT l.member_id) members, COUNT(*) entries
    FROM engagement_logs l JOIN members m ON m.id=l.member_id
    LEFT JOIN initiatives i ON i.id=l.related_initiative_id
    WHERE ${e.where} GROUP BY pillar ORDER BY hours DESC`).all(e.params) as any[];
  return { rows, provenance: prov(['engagement_logs', 'initiatives'], f, rows.length) };
}

export function hoursByActivity(f: Filters) {
  const e = engagementWhere(f);
  const rows = db.prepare(`
    SELECT l.activity_type, ROUND(SUM(l.hours),1) hours, COUNT(*) entries,
           ROUND(AVG(l.hours),2) avg_hours,
           SUM(CASE WHEN l.source IN ('auto-calculated','qr') THEN 1 ELSE 0 END) auto_entries
    FROM engagement_logs l JOIN members m ON m.id=l.member_id
    LEFT JOIN initiatives i ON i.id=l.related_initiative_id
    WHERE ${e.where} GROUP BY l.activity_type ORDER BY hours DESC`).all(e.params) as any[];
  return { rows, provenance: prov(['engagement_logs', 'engagement_rules'], f, rows.length) };
}

export function hoursByCohort(f: Filters) {
  const e = engagementWhere(f);
  const rows = db.prepare(`
    SELECT m.cohort_type, ROUND(SUM(l.hours),1) hours, COUNT(DISTINCT l.member_id) members,
           ROUND(SUM(l.hours) / NULLIF(COUNT(DISTINCT l.member_id),0), 2) avg_per_member
    FROM engagement_logs l JOIN members m ON m.id=l.member_id
    LEFT JOIN initiatives i ON i.id=l.related_initiative_id
    WHERE ${e.where} GROUP BY m.cohort_type ORDER BY hours DESC`).all(e.params) as any[];
  return { rows, provenance: prov(['engagement_logs', 'members'], f, rows.length) };
}

export function hoursByCohortAndInitiative(f: Filters) {
  const e = engagementWhere(f);
  const rows = db.prepare(`
    SELECT i.name initiative, m.cohort_type, ROUND(SUM(l.hours),1) hours,
           COUNT(DISTINCT l.member_id) members
    FROM engagement_logs l JOIN members m ON m.id=l.member_id
    JOIN initiatives i ON i.id=l.related_initiative_id
    WHERE ${e.where} GROUP BY i.name, m.cohort_type ORDER BY i.name`).all(e.params) as any[];
  return { rows, provenance: prov(['engagement_logs', 'members', 'initiatives'], f, rows.length) };
}

export function engagementLeaderboard(f: Filters, limit = 25) {
  const e = engagementWhere(f);
  const having: string[] = [];
  if (f.hoursMin != null) having.push('SUM(l.hours) >= @hoursMin');
  if (f.hoursMax != null) having.push('SUM(l.hours) <= @hoursMax');
  const rows = db.prepare(`
    SELECT m.id member_id, m.name, m.member_code, m.cohort_type, m.sector, m.company,
           ROUND(SUM(l.hours),1) hours, COUNT(*) entries,
           ROUND(SUM(CASE WHEN l.direction='given' THEN l.hours ELSE 0 END),1) hours_given,
           ROUND(SUM(CASE WHEN l.verified_flag=1 THEN l.hours ELSE 0 END),1) verified_hours
    FROM engagement_logs l JOIN members m ON m.id=l.member_id
    LEFT JOIN initiatives i ON i.id=l.related_initiative_id
    WHERE ${e.where} GROUP BY m.id
    ${having.length ? `HAVING ${having.join(' AND ')}` : ''}
    ORDER BY hours DESC LIMIT @limit`)
    .all({ ...e.params, limit, hoursMin: f.hoursMin, hoursMax: f.hoursMax }) as any[];
  return { rows, provenance: prov(['engagement_logs', 'members'], f, rows.length) };
}

// -------------------------------------------------------------- initiatives --

export function initiativePerformance(f: Filters) {
  // Date filters belong on the joined events/logs, not on the initiative itself —
  // an initiative with no events in the window must still appear, at zero.
  const params: Record<string, unknown> = { dateFrom: f.dateFrom, dateTo: f.dateTo };
  const iWhere: string[] = ['1=1'];
  if (f.pillar?.length) {
    iWhere.push(`i.pillar IN (${f.pillar.map((v, k) => { params[`pil${k}`] = v; return `@pil${k}`; }).join(',')})`);
  }
  if (f.initiativeId?.length) {
    iWhere.push(`i.id IN (${f.initiativeId.map((v, k) => { params[`ini${k}`] = v; return `@ini${k}`; }).join(',')})`);
  }
  if (f.councilRole?.length) {
    iWhere.push(`i.owner_council_role IN (${f.councilRole.map((v, k) => { params[`cro${k}`] = v; return `@cro${k}`; }).join(',')})`);
  }
  const dateOnEvents = `${f.dateFrom ? 'AND e.date >= @dateFrom' : ''} ${f.dateTo ? 'AND e.date <= @dateTo' : ''}`;
  const dateOnLogs = `${f.dateFrom ? 'AND l.date >= @dateFrom' : ''} ${f.dateTo ? 'AND l.date <= @dateTo' : ''}`;

  const rows = db.prepare(`
    SELECT i.id initiative_id, i.name, i.name_ar, i.pillar, i.owner_council_role, i.cadence,
           COUNT(DISTINCT e.id) events,
           COALESCE(SUM(e.attendee_count),0) attendees,
           ROUND(AVG(e.satisfaction_score),2) avg_satisfaction,
           COALESCE((SELECT ROUND(SUM(l.hours),1) FROM engagement_logs l
                     WHERE l.related_initiative_id = i.id ${dateOnLogs}),0) hours,
           COALESCE((SELECT COUNT(DISTINCT l.member_id) FROM engagement_logs l
                     WHERE l.related_initiative_id = i.id ${dateOnLogs}),0) unique_members
    FROM initiatives i
    LEFT JOIN events e ON e.initiative_id = i.id AND e.status='closed' ${dateOnEvents}
    WHERE ${iWhere.join(' AND ')}
    GROUP BY i.id ORDER BY hours DESC`).all(params) as any[];

  const totalMembers = (db.prepare('SELECT COUNT(*) c FROM members').get() as any).c || 1;
  const withConversion = rows.map(r => ({
    ...r,
    // "event-to-member conversion": share of the society this initiative reaches.
    member_reach_pct: Math.round((r.unique_members / totalMembers) * 1000) / 10,
    attendees_per_event: r.events ? Math.round((r.attendees / r.events) * 10) / 10 : 0,
    hours_per_member: r.unique_members ? Math.round((r.hours / r.unique_members) * 10) / 10 : 0,
  }));
  return { rows: withConversion, provenance: prov(['initiatives', 'events', 'engagement_logs'], f, rows.length) };
}

export function eventsList(f: Filters, limit = 500) {
  const ev = eventWhere(f);
  const rows = db.prepare(`
    SELECT e.*, i.name initiative_name, i.pillar,
           (SELECT COUNT(*) FROM event_attendance a WHERE a.event_id=e.id) linked_attendees,
           (SELECT COUNT(*) FROM event_attendance a WHERE a.event_id=e.id AND a.checked_in_at IS NOT NULL) checked_in,
           (SELECT ROUND(SUM(l.hours),1) FROM engagement_logs l WHERE l.related_event_id=e.id) hours_logged
    FROM events e LEFT JOIN initiatives i ON i.id=e.initiative_id
    WHERE ${ev.where} ORDER BY e.date DESC LIMIT @limit`).all({ ...ev.params, limit }) as any[];
  return { rows, provenance: prov(['events', 'initiatives', 'event_attendance', 'engagement_logs'], f, rows.length) };
}

// ------------------------------------------------------------ impact/startups --

export function startupTrends(f: Filters) {
  const bySector = db.prepare(`
    SELECT s.sector, COUNT(*) startups, s.support_year year
    FROM startups s WHERE 1=1
      ${f.dateFrom ? "AND s.support_year >= CAST(substr(@dateFrom,1,4) AS INTEGER)" : ''}
      ${f.dateTo ? "AND s.support_year <= CAST(substr(@dateTo,1,4) AS INTEGER)" : ''}
    GROUP BY s.sector, s.support_year ORDER BY s.support_year, startups DESC`)
    .all({ dateFrom: f.dateFrom, dateTo: f.dateTo }) as any[];

  const byStage = db.prepare('SELECT funding_stage, COUNT(*) startups FROM startups GROUP BY funding_stage').all() as any[];
  const bySupport = db.prepare('SELECT support_type, COUNT(*) startups FROM startups GROUP BY support_type ORDER BY startups DESC').all() as any[];
  return { bySector, byStage, bySupport, provenance: prov(['startups'], f, bySector.length) };
}

export function impactMetrics() {
  const rows = db.prepare('SELECT * FROM impact_metrics ORDER BY period DESC, metric_name').all();
  return { rows, provenance: { tables: ['impact_metrics'], filters: 'none', rowCount: (rows as any[]).length } };
}

// ----------------------------------------------------------- member journey --

export function memberJourney(memberId: number) {
  const member = db.prepare(`
    SELECT m.*, mentor.name mentor_name
    FROM members m LEFT JOIN members mentor ON mentor.id = m.mentor_id
    WHERE m.id=?`).get(memberId) as any;
  if (!member) return null;

  const events: any[] = [];
  if (member.graduation_date) {
    events.push({ date: member.graduation_date, kind: 'graduation', title: `Graduated — ${member.cohort_type}`, detail: `Cohort ${member.cohort_year ?? ''}`.trim() });
  }
  if (member.join_date) {
    events.push({ date: member.join_date, kind: 'onboarding', title: 'Joined the Saudi Leadership Society', detail: member.sector ?? '' });
  }

  const firstPerInitiative = db.prepare(`
    SELECT i.name initiative, i.pillar, MIN(l.date) first_date, ROUND(SUM(l.hours),1) hours, COUNT(*) entries
    FROM engagement_logs l JOIN initiatives i ON i.id=l.related_initiative_id
    WHERE l.member_id=? GROUP BY i.id ORDER BY first_date`).all(memberId) as any[];
  for (const r of firstPerInitiative) {
    events.push({ date: r.first_date, kind: 'initiative', title: `Joined ${r.initiative}`, detail: `${r.pillar} · ${r.hours}h across ${r.entries} activities`, pillar: r.pillar, hours: r.hours });
  }

  const mentorship = db.prepare(`
    SELECT direction, MIN(date) first_date, ROUND(SUM(hours),1) hours, COUNT(*) sessions
    FROM engagement_logs WHERE member_id=? AND activity_type='mentorship session'
    GROUP BY direction`).all(memberId) as any[];
  for (const r of mentorship) {
    events.push({
      date: r.first_date, kind: 'mentorship',
      title: r.direction === 'given' ? 'Began mentoring' : 'Began being mentored',
      detail: `${r.sessions} sessions · ${r.hours}h`, hours: r.hours,
    });
  }

  const startups = db.prepare('SELECT * FROM startups WHERE member_id=? ORDER BY support_year').all(memberId) as any[];
  for (const s of startups) {
    events.push({ date: `${s.support_year}-01-01`, kind: 'startup', title: `Startup supported — ${s.name}`, detail: `${s.sector ?? ''} · ${s.funding_stage ?? ''} · ${s.support_type ?? ''}` });
  }

  const flags = db.prepare(`
    SELECT f.*, r.name rule_name, r.threshold_hours FROM recognition_flags f
    JOIN recognition_rules r ON r.id=f.rule_id WHERE f.member_id=? ORDER BY f.flagged_at`).all(memberId) as any[];
  for (const fl of flags) {
    events.push({ date: String(fl.flagged_at).slice(0, 10), kind: 'recognition', title: `Recognition — ${fl.rule_name}`, detail: `${fl.hours_at_flag}h in ${fl.period_label}` });
  }

  const mentions = db.prepare('SELECT * FROM linkedin_mentions WHERE member_id=? ORDER BY post_date').all(memberId) as any[];
  for (const mn of mentions) {
    events.push({ date: mn.post_date, kind: 'linkedin', title: 'LinkedIn post mentioning SLS', detail: (mn.content_snippet ?? '').slice(0, 120), url: mn.post_url });
  }

  events.sort((a, b) => String(a.date).localeCompare(String(b.date)));
  return { member, timeline: events, startups, recognition: flags, mentions };
}

// -------------------------------------------------------- challenge leaderboard --

export function challengeLeaderboard(year?: number) {
  const y = year ?? (db.prepare('SELECT MAX(year) y FROM challenge_submissions').get() as any)?.y ?? new Date().getFullYear();
  const rows = db.prepare(`
    SELECT s.id, s.team_name, s.project_title, s.pillar, s.status, s.year,
           m.name member_name, m.id member_id, m.cohort_type,
           ROUND(SUM(c.score * c.weight) / NULLIF(SUM(c.weight),0), 2) weighted_score,
           COUNT(c.id) criteria_scored,
           COALESCE((SELECT ROUND(SUM(l.hours),1) FROM engagement_logs l
                     WHERE l.member_id = s.member_id AND substr(l.date,1,4) = CAST(s.year AS TEXT)),0) member_hours
    FROM challenge_submissions s
    LEFT JOIN challenge_scores c ON c.submission_id = s.id
    LEFT JOIN members m ON m.id = s.member_id
    WHERE s.year = ? GROUP BY s.id ORDER BY weighted_score DESC NULLS LAST`).all(y) as any[];

  const criteria = db.prepare(`
    SELECT c.criterion, ROUND(AVG(c.score),2) avg_score, MAX(c.weight) weight
    FROM challenge_scores c JOIN challenge_submissions s ON s.id=c.submission_id
    WHERE s.year=? GROUP BY c.criterion`).all(y) as any[];

  const years = (db.prepare('SELECT DISTINCT year FROM challenge_submissions ORDER BY year DESC').all() as any[]).map(r => r.year);
  return { year: y, years, rows, criteria, provenance: { tables: ['challenge_submissions', 'challenge_scores', 'engagement_logs'], filters: `year = ${y}`, rowCount: rows.length } };
}

// ------------------------------------------------------------- council view --

export function councilCockpit(role: string, f: Filters) {
  const scoped: Filters = { ...f, councilRole: [role] };
  return {
    role,
    council: db.prepare('SELECT * FROM council WHERE role=? AND active=1').get(role) ?? null,
    initiatives: initiativePerformance(scoped).rows,
    kpis: overviewKpis(scoped).kpis,
    hoursByMonth: hoursByMonth(scoped).rows,
    alerts: db.prepare(`
      SELECT a.* FROM alerts a
      WHERE a.status='open' AND (
        a.entity_type='initiative' AND a.entity_id IN (SELECT id FROM initiatives WHERE owner_council_role=?)
        OR a.entity_type IN ('global','cohort'))
      ORDER BY CASE a.severity WHEN 'critical' THEN 0 WHEN 'serious' THEN 1 WHEN 'warning' THEN 2 ELSE 3 END`).all(role),
    provenance: prov(['initiatives', 'events', 'engagement_logs', 'council'], scoped, 1),
  };
}

// ---------------------------------------------------------- filter options ---

export function filterOptions() {
  const col = (sql: string) => (db.prepare(sql).all() as any[]).map(r => r.v).filter(Boolean);
  return {
    pillars: col('SELECT name v FROM pillars ORDER BY sort_order'),
    initiatives: db.prepare('SELECT id, name, name_ar, pillar, owner_council_role FROM initiatives ORDER BY name').all(),
    cohortTypes: ['2030 Leader', 'Misk Fellow'],
    sectors: col('SELECT DISTINCT sector v FROM members WHERE sector IS NOT NULL ORDER BY sector'),
    councilRoles: col('SELECT DISTINCT owner_council_role v FROM initiatives WHERE owner_council_role IS NOT NULL ORDER BY 1'),
    memberStatuses: ['active', 'inactive', 'alumni', 'paused'],
    activityTypes: col('SELECT activity_type v FROM engagement_rules ORDER BY activity_type'),
    dateRange: db.prepare('SELECT MIN(date) min, MAX(date) max FROM engagement_logs').get(),
  };
}
