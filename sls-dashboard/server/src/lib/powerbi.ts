/**
 * Power BI export.
 *
 * Two routes, both documented in docs/POWERBI_SETUP.md:
 *
 *  (a) STRUCTURED DATASET EXPORT — LIVE.
 *      A star schema (fact_engagement + dimension tables) as CSV or JSON, which is
 *      the shape Power BI wants. Plus a generated Power Query (M) script that wires
 *      every table up in one paste, so building the .pbit takes about two minutes.
 *
 *      Why a Power Query script and not a binary .pbit: a valid .pbit is a packed
 *      Power BI Desktop artifact, and one generated blind here could not be opened
 *      or verified in this environment. Shipping an untested binary that may fail
 *      to open is worse than shipping a script that provably works. The doc walks
 *      through Save As → .pbit once the queries load.
 *
 *  (b) PUSH-DATASET REST INTEGRATION — STUB, needs credentials.
 *      Real-time refresh via the Power BI REST API. The dataset definition and the
 *      row-shaping are implemented; the OAuth client-credentials call is gated on
 *      POWERBI_CLIENT_ID / _SECRET / _TENANT_ID and a workspace id.
 */
import { db } from '../db/index.js';
import { engagementWhere, type Filters } from './filters.js';
import { getSecret, getSetting } from './settings.js';

export type TableName = 'fact_engagement' | 'dim_member' | 'dim_initiative' | 'dim_event' | 'dim_date' | 'fact_startup' | 'fact_attendance' | 'dim_activity_rule';

export const POWERBI_TABLES: Array<{ name: TableName; description: string; key: string }> = [
  { name: 'fact_engagement',  description: 'One row per logged engagement-hour entry. The primary fact table.', key: 'log_id' },
  { name: 'fact_attendance',  description: 'One row per member per event, with check-in/out stamps.', key: 'attendance_id' },
  { name: 'fact_startup',     description: 'One row per supported startup.', key: 'startup_id' },
  { name: 'dim_member',       description: 'Member dimension, incl. cohort, sector and mentor.', key: 'member_id' },
  { name: 'dim_initiative',   description: 'Initiative dimension, incl. pillar and owning council role.', key: 'initiative_id' },
  { name: 'dim_event',        description: 'Event dimension, incl. type, duration and satisfaction.', key: 'event_id' },
  { name: 'dim_date',         description: 'Date dimension spanning the data, for time intelligence.', key: 'date_key' },
  { name: 'dim_activity_rule',description: 'Activity type -> default hours rules, so the hours logic is visible in Power BI.', key: 'activity_type' },
];

export function buildTable(name: TableName, f: Filters = {}): any[] {
  const e = engagementWhere(f);
  switch (name) {
    case 'fact_engagement':
      return db.prepare(`
        SELECT l.id log_id, l.member_id, l.related_initiative_id initiative_id, l.related_event_id event_id,
               l.date date_key, l.activity_type, l.hours, l.direction, l.source, l.verified_flag,
               l.override_of_hours, COALESCE(i.pillar,'Unattributed') pillar, m.cohort_type, m.sector
        FROM engagement_logs l
        JOIN members m ON m.id=l.member_id
        LEFT JOIN initiatives i ON i.id=l.related_initiative_id
        WHERE ${e.where} ORDER BY l.date`).all(e.params) as any[];
    case 'fact_attendance':
      return db.prepare(`
        SELECT a.id attendance_id, a.event_id, a.member_id, e.date date_key, a.role, a.source,
               a.checked_in_at, a.checked_out_at, a.no_show,
               CASE WHEN a.checked_in_at IS NOT NULL AND a.checked_out_at IS NOT NULL
                    THEN ROUND((julianday(a.checked_out_at)-julianday(a.checked_in_at))*24, 2) END actual_hours
        FROM event_attendance a JOIN events e ON e.id=a.event_id
        ${f.dateFrom ? 'WHERE e.date >= @dateFrom' : 'WHERE 1=1'} ${f.dateTo ? 'AND e.date <= @dateTo' : ''}`)
        .all({ dateFrom: f.dateFrom, dateTo: f.dateTo }) as any[];
    case 'fact_startup':
      return db.prepare('SELECT id startup_id, member_id, name, sector, funding_stage, support_type, outcome_metric, outcome_value, support_year FROM startups').all() as any[];
    case 'dim_member':
      return db.prepare(`
        SELECT m.id member_id, m.member_code, m.name, m.cohort_type, m.cohort_year, m.join_date,
               m.graduation_date, m.sector, m.company, m.title, m.region, m.status, m.mentor_id,
               mm.name mentor_name
        FROM members m LEFT JOIN members mm ON mm.id=m.mentor_id`).all() as any[];
    case 'dim_initiative':
      return db.prepare('SELECT id initiative_id, name, name_ar, pillar, owner_council_role, cadence, recurring_flag, active FROM initiatives').all() as any[];
    case 'dim_event':
      return db.prepare(`
        SELECT e.id event_id, e.initiative_id, e.name, e.date date_key, e.type, e.location,
               e.duration_hours, e.attendee_count, e.satisfaction_score, e.activity_type, e.status
        FROM events e`).all() as any[];
    case 'dim_activity_rule':
      return db.prepare('SELECT activity_type, default_hours, role_multiplier, counts_toward_recognition, description FROM engagement_rules').all() as any[];
    case 'dim_date': {
      const r = db.prepare(`SELECT MIN(d) mn, MAX(d) mx FROM (
        SELECT MIN(date) d FROM engagement_logs UNION SELECT MAX(date) FROM engagement_logs
        UNION SELECT MIN(date) FROM events UNION SELECT MAX(date) FROM events)`).get() as any;
      const start = new Date(`${(r?.mn ?? '2024-01-01').slice(0, 10)}T00:00:00Z`);
      const end = new Date(`${(r?.mx ?? '2026-12-31').slice(0, 10)}T00:00:00Z`);
      const out: any[] = [];
      for (const d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
        const iso = d.toISOString().slice(0, 10);
        const q = Math.floor(d.getUTCMonth() / 3) + 1;
        out.push({
          date_key: iso, year: d.getUTCFullYear(), quarter: `Q${q}`, month: d.getUTCMonth() + 1,
          month_name: d.toLocaleString('en-US', { month: 'long', timeZone: 'UTC' }),
          year_month: iso.slice(0, 7), day: d.getUTCDate(),
          day_of_week: d.toLocaleString('en-US', { weekday: 'long', timeZone: 'UTC' }),
          is_weekend: [5, 6].includes(d.getUTCDay()) ? 1 : 0,   // Fri/Sat weekend
        });
      }
      return out;
    }
  }
}

export function toCsv(rows: any[]): string {
  if (!rows.length) return '';
  const cols = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    if (v == null) return '';
    const s = String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(','), ...rows.map(r => cols.map(c => esc(r[c])).join(','))].join('\r\n');
}

/** A Power Query (M) script that loads every exported table in one paste. */
export function powerQueryScript(baseUrl: string, f: Filters = {}): string {
  const qs = new URLSearchParams();
  if (f.dateFrom) qs.set('dateFrom', f.dateFrom);
  if (f.dateTo) qs.set('dateTo', f.dateTo);
  const suffix = qs.toString() ? `&${qs}` : '';

  const queries = POWERBI_TABLES.map(t => `
// ${t.name} — ${t.description}
${t.name} = let
    Source = Csv.Document(
        Web.Contents("${baseUrl}/api/export/powerbi/table?name=${t.name}&format=csv${suffix}"),
        [Delimiter = ",", Encoding = 65001, QuoteStyle = QuoteStyle.Csv]),
    Promoted = Table.PromoteHeaders(Source, [PromoteAllScalars = true]),
    Typed = Table.TransformColumnTypes(Promoted, {})
  in Typed`).join(',\n');

  return `// =====================================================================
// SLS Data Center -> Power BI
// Paste into Power BI Desktop: Home > Transform data > Advanced Editor
// (create one blank query first). Then Close & Apply.
//
// Relationships to create in Model view once loaded:
//   fact_engagement[member_id]      -> dim_member[member_id]
//   fact_engagement[initiative_id]  -> dim_initiative[initiative_id]
//   fact_engagement[event_id]       -> dim_event[event_id]
//   fact_engagement[date_key]       -> dim_date[date_key]      (mark dim_date as the date table)
//   fact_attendance[member_id]      -> dim_member[member_id]
//   fact_attendance[event_id]       -> dim_event[event_id]
//   fact_startup[member_id]         -> dim_member[member_id]
//   dim_event[initiative_id]        -> dim_initiative[initiative_id]
//
// Suggested measures (DAX):
//   Total Hours          = SUM(fact_engagement[hours])
//   Auto-captured Hours  = CALCULATE([Total Hours], fact_engagement[source] IN {"auto-calculated","qr"})
//   Automation Rate      = DIVIDE([Auto-captured Hours], [Total Hours])
//   Verified Hours       = CALCULATE([Total Hours], fact_engagement[verified_flag] = 1)
//   Engaged Members      = DISTINCTCOUNT(fact_engagement[member_id])
//   Hours per Member     = DIVIDE([Total Hours], [Engaged Members])
//   Hours YoY %          = DIVIDE([Total Hours] - CALCULATE([Total Hours], SAMEPERIODLASTYEAR(dim_date[date_key])),
//                                 CALCULATE([Total Hours], SAMEPERIODLASTYEAR(dim_date[date_key])))
// =====================================================================
let
${queries}
in
    fact_engagement`;
}

/** Everything a Power BI push dataset needs, derived from the same tables. */
export function pushDatasetDefinition() {
  const typeOf = (v: unknown) => (typeof v === 'number' ? 'Double' : /^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? 'DateTime' : 'String');
  return {
    name: 'SLS Data Center',
    defaultMode: 'Push',
    tables: POWERBI_TABLES.map(t => {
      const sample = buildTable(t.name).slice(0, 1)[0] ?? {};
      return { name: t.name, columns: Object.entries(sample).map(([name, v]) => ({ name, dataType: typeOf(v) })) };
    }),
  };
}

export function pushStatus() {
  const needed = ['POWERBI_CLIENT_ID', 'POWERBI_CLIENT_SECRET', 'POWERBI_TENANT_ID'] as const;
  const missing = needed.filter(k => !getSecret(k));
  const workspace = String(getSetting('powerbi_workspace_id') ?? '');
  return {
    implemented: false,
    ready: missing.length === 0 && !!workspace,
    missingSecrets: missing,
    workspaceConfigured: !!workspace,
    message: missing.length || !workspace
      ? `Push-dataset refresh needs ${[...missing, ...(workspace ? [] : ['a workspace id'])].join(', ')}. Add them in Settings, then follow docs/POWERBI_SETUP.md.`
      : 'Credentials are stored. The OAuth token exchange and row-push calls are the remaining step — see docs/POWERBI_SETUP.md; the dataset definition and row shaping are already generated by pushDatasetDefinition() / buildTable().',
  };
}
