/**
 * Tools the AI can call against the LIVE database.
 *
 * This is deliberately tool-use, not RAG over a summary: the model runs real
 * queries and answers from the rows that come back, so figures are current and
 * traceable. Two guardrails make that safe:
 *   - `run_sql` accepts a single read-only SELECT against an allow-listed set of
 *     tables, with a hard LIMIT; anything else is rejected before it reaches SQLite.
 *   - every tool returns `provenance` (tables + filters + row count), and the
 *     system prompt requires the model to cite it and to say "insufficient data"
 *     rather than estimate.
 */
import { db, AI_READABLE_TABLES } from '../db/index.js';
import * as A from './analytics.js';
import { memberLedger } from './engagement.js';
import type { Filters } from './filters.js';

export type ToolResult = { ok: true; data: unknown } | { ok: false; error: string };

const FILTER_SCHEMA = {
  type: 'object' as const,
  description: 'Optional filters. Omit a field to leave that dimension unfiltered.',
  properties: {
    dateFrom: { type: 'string', description: 'ISO date yyyy-mm-dd, inclusive' },
    dateTo: { type: 'string', description: 'ISO date yyyy-mm-dd, inclusive' },
    pillar: { type: 'array', items: { type: 'string', enum: ['Grow to Great', 'Connect to Create', 'Lead with Impact'] } },
    initiativeId: { type: 'array', items: { type: 'number' } },
    cohortType: { type: 'array', items: { type: 'string', enum: ['2030 Leader', 'Misk Fellow'] } },
    sector: { type: 'array', items: { type: 'string' } },
    councilRole: { type: 'array', items: { type: 'string' } },
    hoursMin: { type: 'number' },
    hoursMax: { type: 'number' },
  },
};

export const TOOLS = [
  {
    name: 'get_schema',
    description: 'Return the table and column names available. Call this first if unsure what data exists.',
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'overview_kpis',
    description: 'Headline KPIs: members by cohort, engagement hours, auto-logged share, events, attendees, startups, members recognised.',
    input_schema: { type: 'object' as const, properties: { filters: FILTER_SCHEMA }, required: [] },
  },
  {
    name: 'engagement_breakdown',
    description: 'Engagement hours sliced by one dimension. Use for "hours by X" questions and cohort comparisons.',
    input_schema: {
      type: 'object' as const,
      properties: {
        dimension: { type: 'string', enum: ['month', 'pillar', 'activity', 'cohort', 'cohort_by_initiative'] },
        filters: FILTER_SCHEMA,
      },
      required: ['dimension'],
    },
  },
  {
    name: 'engagement_leaderboard',
    description: 'Members ranked by engagement hours. Use for "who logged the most hours" questions.',
    input_schema: {
      type: 'object' as const,
      properties: { limit: { type: 'number', description: 'default 25, max 200' }, filters: FILTER_SCHEMA },
      required: [],
    },
  },
  {
    name: 'initiative_performance',
    description: 'Per-initiative events, attendees, hours, unique members reached, member reach %, attendees per event, satisfaction. Use for initiative comparisons and conversion questions.',
    input_schema: { type: 'object' as const, properties: { filters: FILTER_SCHEMA }, required: [] },
  },
  {
    name: 'startup_trends',
    description: 'Startups supported, broken down by sector and year, by funding stage, and by support type.',
    input_schema: { type: 'object' as const, properties: { filters: FILTER_SCHEMA }, required: [] },
  },
  {
    name: 'member_ledger',
    description: 'One member\'s engagement ledger: hours by category and direction, by month with running total, and year-over-year.',
    input_schema: {
      type: 'object' as const,
      properties: { memberId: { type: 'number' }, dateFrom: { type: 'string' }, dateTo: { type: 'string' } },
      required: ['memberId'],
    },
  },
  {
    name: 'find_members',
    description: 'Look up members by name, member code, sector, company or cohort. Use to resolve a name to an id before calling member_ledger.',
    input_schema: {
      type: 'object' as const,
      properties: { query: { type: 'string' }, cohortType: { type: 'string' }, sector: { type: 'string' }, limit: { type: 'number' } },
      required: [],
    },
  },
  {
    name: 'impact_metrics',
    description: 'Reported headline impact metrics with their period and provenance (manual / import / impact-report / computed).',
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'challenge_leaderboard',
    description: 'Annual Impact Challenge standings: weighted judging scores per submission, plus each lead member\'s logged hours.',
    input_schema: { type: 'object' as const, properties: { year: { type: 'number' } }, required: [] },
  },
  {
    name: 'linkedin_mentions',
    description: 'Captured LinkedIn mentions with relevance score, engagement count and status.',
    input_schema: {
      type: 'object' as const,
      properties: { status: { type: 'string' }, minRelevance: { type: 'number' }, limit: { type: 'number' } },
      required: [],
    },
  },
  {
    name: 'run_sql',
    description:
      'Escape hatch for a question the other tools cannot express. Runs ONE read-only SELECT against the SLS database. ' +
      `Allowed tables: ${AI_READABLE_TABLES.join(', ')}. No writes, no PRAGMA, no ATTACH, no multiple statements. A LIMIT is enforced.`,
    input_schema: {
      type: 'object' as const,
      properties: { sql: { type: 'string', description: 'A single SELECT statement.' } },
      required: ['sql'],
    },
  },
  {
    name: 'render_chart',
    description:
      'Render a chart or table in the chat alongside your answer. Call this whenever your answer contains numbers, ' +
      'passing rows you actually retrieved from another tool. The user can then pin it to the dashboard or add it to a report. ' +
      'Never invent rows for this tool.',
    input_schema: {
      type: 'object' as const,
      properties: {
        kind: { type: 'string', enum: ['bar', 'line', 'area', 'stacked-bar', 'donut', 'table'] },
        title: { type: 'string' },
        xKey: { type: 'string', description: 'Row property for the category / time axis.' },
        series: { type: 'array', items: { type: 'object', properties: { key: { type: 'string' }, label: { type: 'string' } }, required: ['key'] } },
        rows: { type: 'array', items: { type: 'object' }, description: 'The data rows, straight from a tool result.' },
        unit: { type: 'string', description: 'e.g. "hours", "members", "SAR"' },
        note: { type: 'string', description: 'One line naming the tables and filters behind these numbers.' },
      },
      required: ['kind', 'title', 'rows'],
    },
  },
];

// ------------------------------------------------------------ SQL guardrail --

const FORBIDDEN = /\b(insert|update|delete|drop|alter|create|replace|attach|detach|pragma|vacuum|reindex|trigger|begin|commit|rollback)\b/i;

export function guardSql(sqlIn: string): { ok: true; sql: string } | { ok: false; error: string } {
  let sql = sqlIn.trim().replace(/;\s*$/, '');
  if (!sql) return { ok: false, error: 'Empty statement.' };
  if (sql.includes(';')) return { ok: false, error: 'Only a single statement is allowed.' };
  if (!/^\s*(select|with)\b/i.test(sql)) return { ok: false, error: 'Only SELECT (or WITH … SELECT) is allowed.' };
  if (FORBIDDEN.test(sql)) return { ok: false, error: 'This statement contains a write or administrative keyword. Reads only.' };

  // Every identifier that follows FROM/JOIN must be an allow-listed table or a CTE.
  const ctes = new Set(Array.from(sql.matchAll(/\bwith\s+([a-z_][\w]*)\s+as\b|,\s*([a-z_][\w]*)\s+as\s*\(/gi))
    .flatMap(m => [m[1], m[2]]).filter(Boolean).map(s => s!.toLowerCase()));
  const refs = Array.from(sql.matchAll(/\b(?:from|join)\s+([`"[]?)([a-zA-Z_][\w]*)\1/gi)).map(m => m[2]!.toLowerCase());
  const allowed = new Set<string>([...AI_READABLE_TABLES.map(t => t.toLowerCase()), ...ctes]);
  const bad = refs.filter(t => !allowed.has(t));
  if (bad.length) return { ok: false, error: `Table(s) not readable: ${[...new Set(bad)].join(', ')}. Allowed: ${AI_READABLE_TABLES.join(', ')}.` };

  if (!/\blimit\s+\d+/i.test(sql)) sql += ' LIMIT 500';
  return { ok: true, sql };
}

// --------------------------------------------------------------- dispatcher --

export function runTool(name: string, input: any): ToolResult {
  try {
    const filters: Filters = (input?.filters ?? {}) as Filters;
    switch (name) {
      case 'get_schema': {
        const tables = AI_READABLE_TABLES.map(t => ({
          table: t,
          columns: (db.prepare(`PRAGMA table_info(${t})`).all() as any[]).map(c => `${c.name} ${c.type}`),
          rows: (db.prepare(`SELECT COUNT(*) c FROM ${t}`).get() as any).c,
        }));
        return { ok: true, data: { tables } };
      }
      case 'overview_kpis':          return { ok: true, data: A.overviewKpis(filters) };
      case 'engagement_breakdown': {
        const d = input?.dimension;
        const map: Record<string, () => unknown> = {
          month: () => A.hoursByMonth(filters),
          pillar: () => A.hoursByPillar(filters),
          activity: () => A.hoursByActivity(filters),
          cohort: () => A.hoursByCohort(filters),
          cohort_by_initiative: () => A.hoursByCohortAndInitiative(filters),
        };
        if (!map[d]) return { ok: false, error: `Unknown dimension "${d}".` };
        return { ok: true, data: map[d]!() };
      }
      case 'engagement_leaderboard': return { ok: true, data: A.engagementLeaderboard(filters, Math.min(Number(input?.limit) || 25, 200)) };
      case 'initiative_performance': return { ok: true, data: A.initiativePerformance(filters) };
      case 'startup_trends':         return { ok: true, data: A.startupTrends(filters) };
      case 'impact_metrics':         return { ok: true, data: A.impactMetrics() };
      case 'challenge_leaderboard':  return { ok: true, data: A.challengeLeaderboard(input?.year ? Number(input.year) : undefined) };
      case 'member_ledger': {
        const id = Number(input?.memberId);
        const m = db.prepare('SELECT id, name, member_code, cohort_type, sector FROM members WHERE id=?').get(id);
        if (!m) return { ok: false, error: `No member with id ${id}. Use find_members first.` };
        return { ok: true, data: { member: m, ...memberLedger(id, input?.dateFrom, input?.dateTo) } };
      }
      case 'find_members': {
        const q = input?.query ? `%${String(input.query)}%` : null;
        const rows = db.prepare(`
          SELECT id, member_code, name, cohort_type, sector, company, title, status,
                 COALESCE((SELECT ROUND(SUM(hours),1) FROM engagement_logs l WHERE l.member_id=members.id),0) total_hours
          FROM members
          WHERE (@q IS NULL OR name LIKE @q OR member_code LIKE @q OR company LIKE @q)
            AND (@cohort IS NULL OR cohort_type=@cohort)
            AND (@sector IS NULL OR sector=@sector)
          ORDER BY total_hours DESC LIMIT @limit`)
          .all({ q, cohort: input?.cohortType ?? null, sector: input?.sector ?? null, limit: Math.min(Number(input?.limit) || 25, 100) });
        return { ok: true, data: { rows, provenance: { tables: ['members', 'engagement_logs'], filters: JSON.stringify(input ?? {}), rowCount: (rows as any[]).length } } };
      }
      case 'linkedin_mentions': {
        const rows = db.prepare(`
          SELECT lm.*, m.name member_name FROM linkedin_mentions lm
          LEFT JOIN members m ON m.id=lm.member_id
          WHERE (@status IS NULL OR lm.status=@status)
            AND lm.sls_relevance_score >= @minRel
          ORDER BY lm.post_date DESC LIMIT @limit`)
          .all({ status: input?.status ?? null, minRel: Number(input?.minRelevance) || 0, limit: Math.min(Number(input?.limit) || 50, 200) });
        return { ok: true, data: { rows, provenance: { tables: ['linkedin_mentions'], filters: JSON.stringify(input ?? {}), rowCount: (rows as any[]).length } } };
      }
      case 'run_sql': {
        const g = guardSql(String(input?.sql ?? ''));
        if (!g.ok) return { ok: false, error: g.error };
        const rows = db.prepare(g.sql).all();
        return { ok: true, data: { sql: g.sql, rows, provenance: { tables: ['(ad-hoc SQL)'], filters: g.sql, rowCount: (rows as any[]).length } } };
      }
      case 'render_chart': {
        const rows = Array.isArray(input?.rows) ? input.rows : [];
        if (!rows.length) return { ok: false, error: 'render_chart needs at least one row. Retrieve data with another tool first.' };
        return { ok: true, data: { rendered: true, kind: input.kind, title: input.title, rowCount: rows.length } };
      }
      default:
        return { ok: false, error: `Unknown tool "${name}".` };
    }
  } catch (err: any) {
    return { ok: false, error: `Tool "${name}" failed: ${err?.message ?? String(err)}` };
  }
}
