/**
 * Ingestion layer: CSV/Excel-export upload with a column-mapping step.
 *
 * The browser parses the file and posts { targetTable, mapping, rows } here, so
 * updating the data center never means touching code. Every run is recorded in
 * `import_jobs` with its mapping and row-level errors, and imports upsert on a
 * natural key so re-uploading a corrected file fixes rows instead of duplicating.
 */
import { db } from '../db/index.js';
import { postHoursForEvent } from './engagement.js';

export type ImportTarget = 'members' | 'initiatives' | 'events' | 'event_attendance' | 'engagement_logs' | 'startups' | 'impact_metrics' | 'linkedin_mentions';

type FieldSpec = { field: string; label: string; required?: boolean; hint?: string; enum?: string[] };

/** What the mapping UI offers for each target table. */
export const IMPORT_SCHEMAS: Record<ImportTarget, { label: string; naturalKey: string; fields: FieldSpec[] }> = {
  members: {
    label: 'Members', naturalKey: 'member_code (or email)',
    fields: [
      { field: 'member_code', label: 'Member code', hint: 'Unique. Used for QR check-in. Generated if blank.' },
      { field: 'name', label: 'Full name', required: true },
      { field: 'name_ar', label: 'Name (Arabic)' },
      { field: 'cohort_type', label: 'Cohort', required: true, enum: ['2030 Leader', 'Misk Fellow'] },
      { field: 'cohort_year', label: 'Cohort year' },
      { field: 'join_date', label: 'SLS join date', hint: 'yyyy-mm-dd preferred; dd/mm/yyyy is assumed for slash dates' },
      { field: 'graduation_date', label: 'Graduation date', hint: 'yyyy-mm-dd' },
      { field: 'sector', label: 'Sector' }, { field: 'company', label: 'Company' },
      { field: 'title', label: 'Job title' }, { field: 'email', label: 'Email' },
      { field: 'region', label: 'Region' }, { field: 'linkedin_url', label: 'LinkedIn URL' },
      { field: 'status', label: 'Status', enum: ['active', 'inactive', 'alumni', 'paused'] },
      { field: 'tags', label: 'Tags', hint: 'Comma-separated' },
    ],
  },
  initiatives: {
    label: 'Initiatives', naturalKey: 'name',
    fields: [
      { field: 'name', label: 'Initiative name', required: true },
      { field: 'name_ar', label: 'Name (Arabic)' },
      { field: 'pillar', label: 'Pillar', required: true, enum: ['Grow to Great', 'Connect to Create', 'Lead with Impact'] },
      { field: 'description', label: 'Description' },
      { field: 'owner_council_role', label: 'Owning council role' },
      { field: 'recurring_flag', label: 'Recurring?', hint: '1 / 0, yes / no' },
      { field: 'cadence', label: 'Cadence' },
    ],
  },
  events: {
    label: 'Events', naturalKey: 'name + date',
    fields: [
      { field: 'name', label: 'Event name', required: true },
      { field: 'date', label: 'Date', required: true, hint: 'yyyy-mm-dd preferred; dd/mm/yyyy is assumed for slash dates' },
      { field: 'initiative_name', label: 'Initiative', hint: 'Matched by name to an existing initiative' },
      { field: 'attendee_count', label: 'Attendee count' },
      { field: 'location', label: 'Location' },
      { field: 'type', label: 'Format', enum: ['in-person', 'virtual', 'hybrid'] },
      { field: 'satisfaction_score', label: 'Satisfaction (0–5)' },
      { field: 'duration_hours', label: 'Duration (hours)', hint: 'Drives auto-calculated engagement hours' },
      { field: 'activity_type', label: 'Activity type', hint: 'Matched to the engagement-hours rules table' },
      { field: 'status', label: 'Status', enum: ['planned', 'open', 'closed', 'cancelled'] },
    ],
  },
  event_attendance: {
    label: 'Event attendance', naturalKey: 'event + member',
    fields: [
      { field: 'event_name', label: 'Event name', required: true },
      { field: 'event_date', label: 'Event date', required: true, hint: 'yyyy-mm-dd — with the name, identifies the event' },
      { field: 'member_code', label: 'Member code', hint: 'Or use member email / name' },
      { field: 'member_email', label: 'Member email' },
      { field: 'member_name', label: 'Member name' },
      { field: 'checked_in_at', label: 'Check-in timestamp' },
      { field: 'checked_out_at', label: 'Check-out timestamp' },
      { field: 'role', label: 'Role', enum: ['attendee', 'speaker', 'mentor', 'mentee', 'organiser', 'volunteer', 'judge'] },
      { field: 'no_show', label: 'No-show?', hint: '1 / 0' },
    ],
  },
  engagement_logs: {
    label: 'Engagement hours (manual/imported)', naturalKey: 'member + date + activity',
    fields: [
      { field: 'member_code', label: 'Member code' }, { field: 'member_email', label: 'Member email' },
      { field: 'activity_type', label: 'Activity type', required: true },
      { field: 'initiative_name', label: 'Initiative' },
      { field: 'date', label: 'Date', required: true },
      { field: 'hours', label: 'Hours', required: true },
      { field: 'direction', label: 'Direction', enum: ['participated', 'given', 'received'] },
      { field: 'notes', label: 'Notes' },
    ],
  },
  startups: {
    label: 'Startups', naturalKey: 'name',
    fields: [
      { field: 'name', label: 'Startup name', required: true },
      { field: 'member_code', label: 'Founder member code' }, { field: 'member_email', label: 'Founder email' },
      { field: 'sector', label: 'Sector' }, { field: 'funding_stage', label: 'Funding stage' },
      { field: 'support_type', label: 'Support type' }, { field: 'outcome_metric', label: 'Outcome metric' },
      { field: 'outcome_value', label: 'Outcome value' }, { field: 'support_year', label: 'Support year' },
    ],
  },
  impact_metrics: {
    label: 'Impact metrics', naturalKey: 'period + metric_name',
    fields: [
      { field: 'period', label: 'Period', required: true, hint: '"2026", "2026-Q1", "all-time"' },
      { field: 'metric_name', label: 'Metric name', required: true },
      { field: 'value', label: 'Value', required: true },
      { field: 'unit', label: 'Unit' }, { field: 'notes', label: 'Notes' },
    ],
  },
  linkedin_mentions: {
    label: 'LinkedIn mentions', naturalKey: 'post_url',
    fields: [
      { field: 'post_url', label: 'Post URL', required: true },
      { field: 'member_code', label: 'Member code' }, { field: 'author_name', label: 'Author' },
      { field: 'post_date', label: 'Post date' }, { field: 'content_snippet', label: 'Content snippet' },
      { field: 'engagement_count', label: 'Engagement count' },
    ],
  },
};

const truthy = (v: unknown) => ['1', 'true', 'yes', 'y', 'نعم'].includes(String(v ?? '').trim().toLowerCase());
const nz = (v: unknown) => { const s = String(v ?? '').trim(); return s === '' ? null : s; };
const num = (v: unknown) => { const s = nz(v); if (s == null) return null; const n = Number(s.replace(/,/g, '')); return Number.isFinite(n) ? n : null; };

/** Accepts yyyy-mm-dd, dd/mm/yyyy, mm/dd/yyyy (heuristic) and ISO datetimes. */
function isoDate(v: unknown): string | null {
  const s = nz(v);
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (m) {
    const [, a, b, y] = m;
    // Day-first (dd/mm/yyyy) is the regional norm, so an ambiguous 01/03/2026 is
    // 1 March, not 3 January. Only a second component above 12 forces mm/dd.
    const [day, mon] = Number(b) > 12 ? [b, a] : [a, b];
    return `${y}-${String(mon).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

/** Exposed for tests — the slash-date default is easy to regress. */
export const __isoDateForTest = isoDate;

export type ImportResult = { jobId: number; rowCount: number; inserted: number; updated: number; skipped: number; errors: Array<{ row: number; message: string }> };

export function importRows(
  target: ImportTarget,
  mapping: Record<string, string>,      // dbField -> csvHeader
  rows: Array<Record<string, unknown>>,
  filename?: string,
): ImportResult {
  const errors: Array<{ row: number; message: string }> = [];
  let inserted = 0, updated = 0, skipped = 0;

  const val = (row: Record<string, unknown>, field: string) => {
    const header = mapping[field];
    return header ? row[header] : undefined;
  };

  const findMember = (row: Record<string, unknown>) => {
    const code = nz(val(row, 'member_code'));
    const email = nz(val(row, 'member_email'));
    const name = nz(val(row, 'member_name'));
    if (code) return db.prepare('SELECT id FROM members WHERE member_code=?').get(code) as any;
    if (email) return db.prepare('SELECT id FROM members WHERE email=?').get(email) as any;
    if (name) return db.prepare('SELECT id FROM members WHERE name=?').get(name) as any;
    return null;
  };
  const findInitiative = (row: Record<string, unknown>) => {
    const n = nz(val(row, 'initiative_name'));
    return n ? (db.prepare('SELECT id FROM initiatives WHERE name=?').get(n) as any) : null;
  };

  const touchedEvents = new Set<number>();

  const tx = db.transaction(() => {
    rows.forEach((row, idx) => {
      const lineNo = idx + 2;    // +1 for zero-index, +1 for the header line
      try {
        switch (target) {
          case 'members': {
            const name = nz(val(row, 'name'));
            const cohort = nz(val(row, 'cohort_type'));
            if (!name) throw new Error('Full name is required');
            if (cohort !== '2030 Leader' && cohort !== 'Misk Fellow') throw new Error(`Cohort must be "2030 Leader" or "Misk Fellow" (got "${cohort ?? ''}")`);
            const code = nz(val(row, 'member_code'));
            const email = nz(val(row, 'email'));
            const existing = (code && db.prepare('SELECT id FROM members WHERE member_code=?').get(code))
                          || (email && db.prepare('SELECT id FROM members WHERE email=?').get(email)) as any;
            const tags = nz(val(row, 'tags'));
            const payload = {
              member_code: code ?? `SLS-IMP-${Date.now().toString(36)}-${idx}`,
              name, name_ar: nz(val(row, 'name_ar')), cohort_type: cohort,
              cohort_year: num(val(row, 'cohort_year')), join_date: isoDate(val(row, 'join_date')),
              graduation_date: isoDate(val(row, 'graduation_date')), sector: nz(val(row, 'sector')),
              company: nz(val(row, 'company')), title: nz(val(row, 'title')), email,
              region: nz(val(row, 'region')), linkedin_url: nz(val(row, 'linkedin_url')),
              status: nz(val(row, 'status')) ?? 'active',
              tags: JSON.stringify(tags ? tags.split(',').map(s => s.trim()).filter(Boolean) : []),
            };
            if (existing) {
              db.prepare(`UPDATE members SET name=@name,name_ar=@name_ar,cohort_type=@cohort_type,cohort_year=@cohort_year,
                join_date=COALESCE(@join_date,join_date),graduation_date=COALESCE(@graduation_date,graduation_date),
                sector=@sector,company=@company,title=@title,email=COALESCE(@email,email),region=@region,
                linkedin_url=@linkedin_url,status=@status,tags=@tags,updated_at=datetime('now') WHERE id=@id`)
                .run({ ...payload, id: (existing as any).id });
              updated++;
            } else {
              db.prepare(`INSERT INTO members (member_code,name,name_ar,cohort_type,cohort_year,join_date,graduation_date,
                sector,company,title,email,region,linkedin_url,status,tags)
                VALUES (@member_code,@name,@name_ar,@cohort_type,@cohort_year,@join_date,@graduation_date,
                @sector,@company,@title,@email,@region,@linkedin_url,@status,@tags)`).run(payload);
              inserted++;
            }
            break;
          }
          case 'initiatives': {
            const name = nz(val(row, 'name'));
            const pillar = nz(val(row, 'pillar'));
            if (!name) throw new Error('Initiative name is required');
            if (!pillar) throw new Error('Pillar is required');
            const existing = db.prepare('SELECT id FROM initiatives WHERE name=?').get(name) as any;
            const p = { name, name_ar: nz(val(row, 'name_ar')), pillar, description: nz(val(row, 'description')),
              owner: nz(val(row, 'owner_council_role')), rec: truthy(val(row, 'recurring_flag')) ? 1 : 0, cadence: nz(val(row, 'cadence')) };
            if (existing) {
              db.prepare('UPDATE initiatives SET name_ar=?,pillar=?,description=?,owner_council_role=?,recurring_flag=?,cadence=? WHERE id=?')
                .run(p.name_ar, p.pillar, p.description, p.owner, p.rec, p.cadence, existing.id);
              updated++;
            } else {
              db.prepare('INSERT INTO initiatives (name,name_ar,pillar,description,owner_council_role,recurring_flag,cadence) VALUES (?,?,?,?,?,?,?)')
                .run(p.name, p.name_ar, p.pillar, p.description, p.owner, p.rec, p.cadence);
              inserted++;
            }
            break;
          }
          case 'events': {
            const name = nz(val(row, 'name'));
            const date = isoDate(val(row, 'date'));
            if (!name) throw new Error('Event name is required');
            if (!date) throw new Error('A valid event date is required');
            const init = findInitiative(row);
            const existing = db.prepare('SELECT id FROM events WHERE name=? AND date=?').get(name, date) as any;
            const p = {
              initiative_id: init?.id ?? null, name, date,
              attendee_count: num(val(row, 'attendee_count')) ?? 0, location: nz(val(row, 'location')),
              type: nz(val(row, 'type')) ?? 'in-person', satisfaction_score: num(val(row, 'satisfaction_score')),
              duration_hours: num(val(row, 'duration_hours')) ?? 2,
              activity_type: nz(val(row, 'activity_type')) ?? 'event attendance',
              status: nz(val(row, 'status')) ?? 'planned',
            };
            if (existing) {
              db.prepare(`UPDATE events SET initiative_id=@initiative_id,attendee_count=@attendee_count,location=@location,
                type=@type,satisfaction_score=@satisfaction_score,duration_hours=@duration_hours,
                activity_type=@activity_type,status=@status WHERE id=@id`).run({ ...p, id: existing.id });
              if (p.status === 'closed') touchedEvents.add(existing.id);
              updated++;
            } else {
              const r = db.prepare(`INSERT INTO events (initiative_id,name,date,attendee_count,location,type,satisfaction_score,duration_hours,activity_type,status,checkin_token)
                VALUES (@initiative_id,@name,@date,@attendee_count,@location,@type,@satisfaction_score,@duration_hours,@activity_type,@status,@token)`)
                .run({ ...p, token: `evt_${Math.random().toString(36).slice(2, 12)}` });
              if (p.status === 'closed') touchedEvents.add(Number(r.lastInsertRowid));
              inserted++;
            }
            break;
          }
          case 'event_attendance': {
            const evName = nz(val(row, 'event_name'));
            const evDate = isoDate(val(row, 'event_date'));
            const ev = db.prepare('SELECT id FROM events WHERE name=? AND date=?').get(evName, evDate) as any;
            if (!ev) throw new Error(`No event matched "${evName}" on ${evDate}. Import the event first.`);
            const mem = findMember(row);
            if (!mem) throw new Error('Could not match a member by code, email or name');
            const res = db.prepare(`INSERT INTO event_attendance (event_id,member_id,checked_in_at,checked_out_at,role,source,no_show)
              VALUES (?,?,?,?,?,'imported',?)
              ON CONFLICT(event_id,member_id) DO UPDATE SET
                checked_in_at=COALESCE(excluded.checked_in_at, event_attendance.checked_in_at),
                checked_out_at=COALESCE(excluded.checked_out_at, event_attendance.checked_out_at),
                role=excluded.role, no_show=excluded.no_show`)
              .run(ev.id, mem.id, nz(val(row, 'checked_in_at')), nz(val(row, 'checked_out_at')),
                   nz(val(row, 'role')) ?? 'attendee', truthy(val(row, 'no_show')) ? 1 : 0);
            touchedEvents.add(ev.id);
            if (res.changes) inserted++; else updated++;
            break;
          }
          case 'engagement_logs': {
            const mem = findMember(row);
            if (!mem) throw new Error('Could not match a member by code or email');
            const date = isoDate(val(row, 'date'));
            const hours = num(val(row, 'hours'));
            const activity = nz(val(row, 'activity_type'));
            if (!date) throw new Error('A valid date is required');
            if (hours == null) throw new Error('Hours must be a number');
            if (!activity) throw new Error('Activity type is required');
            const init = findInitiative(row);
            db.prepare(`INSERT INTO engagement_logs (member_id,activity_type,related_initiative_id,related_event_id,date,hours,direction,source,verified_flag,notes)
              VALUES (?,?,?,NULL,?,?,?,'imported',0,?)`)
              .run(mem.id, activity, init?.id ?? null, date, hours, nz(val(row, 'direction')) ?? 'participated', nz(val(row, 'notes')));
            inserted++;
            break;
          }
          case 'startups': {
            const name = nz(val(row, 'name'));
            if (!name) throw new Error('Startup name is required');
            const mem = findMember(row);
            const existing = db.prepare('SELECT id FROM startups WHERE name=?').get(name) as any;
            const p = [mem?.id ?? null, nz(val(row, 'sector')), nz(val(row, 'funding_stage')), nz(val(row, 'support_type')),
                       nz(val(row, 'outcome_metric')), num(val(row, 'outcome_value')), num(val(row, 'support_year'))];
            if (existing) {
              db.prepare('UPDATE startups SET member_id=?,sector=?,funding_stage=?,support_type=?,outcome_metric=?,outcome_value=?,support_year=? WHERE id=?')
                .run(...p, existing.id);
              updated++;
            } else {
              db.prepare('INSERT INTO startups (member_id,sector,funding_stage,support_type,outcome_metric,outcome_value,support_year,name) VALUES (?,?,?,?,?,?,?,?)')
                .run(...p, name);
              inserted++;
            }
            break;
          }
          case 'impact_metrics': {
            const period = nz(val(row, 'period'));
            const metric = nz(val(row, 'metric_name'));
            const value = num(val(row, 'value'));
            if (!period || !metric || value == null) throw new Error('Period, metric name and a numeric value are all required');
            db.prepare(`INSERT INTO impact_metrics (period,metric_name,value,unit,source,notes)
              VALUES (?,?,?,?,'import',?)
              ON CONFLICT(period,metric_name) DO UPDATE SET value=excluded.value, unit=excluded.unit,
                source='import', notes=excluded.notes, updated_at=datetime('now')`)
              .run(period, metric, value, nz(val(row, 'unit')), nz(val(row, 'notes')));
            inserted++;
            break;
          }
          case 'linkedin_mentions': {
            const url = nz(val(row, 'post_url'));
            if (!url) throw new Error('Post URL is required');
            const mem = findMember(row);
            db.prepare(`INSERT INTO linkedin_mentions (member_id,author_name,post_url,post_date,content_snippet,engagement_count,capture_source)
              VALUES (?,?,?,?,?,?,'manual') ON CONFLICT(post_url) DO UPDATE SET
                engagement_count=excluded.engagement_count, content_snippet=excluded.content_snippet`)
              .run(mem?.id ?? null, nz(val(row, 'author_name')), url, isoDate(val(row, 'post_date')),
                   nz(val(row, 'content_snippet')), num(val(row, 'engagement_count')) ?? 0);
            inserted++;
            break;
          }
        }
      } catch (err: any) {
        errors.push({ row: lineNo, message: err?.message ?? String(err) });
        skipped++;
      }
    });
  });
  tx();

  // Attendance or event changes must flow through to hours automatically.
  for (const id of touchedEvents) {
    try { postHoursForEvent(id, 'import'); } catch { /* event may have been cancelled */ }
  }

  const job = db.prepare(`INSERT INTO import_jobs (target_table,filename,row_count,inserted,updated,skipped,errors,mapping,status)
    VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(target, filename ?? null, rows.length, inserted, updated, skipped,
         JSON.stringify(errors.slice(0, 200)), JSON.stringify(mapping),
         errors.length ? 'completed_with_errors' : 'completed');

  return { jobId: Number(job.lastInsertRowid), rowCount: rows.length, inserted, updated, skipped, errors };
}

/** Suggest a dbField -> csvHeader mapping from the uploaded headers. */
export function suggestMapping(target: ImportTarget, headers: string[]): Record<string, string> {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const out: Record<string, string> = {};
  for (const f of IMPORT_SCHEMAS[target].fields) {
    const candidates = [f.field, f.label, f.field.replace(/_/g, ' ')].map(norm);
    const hit = headers.find(h => candidates.includes(norm(h)))
             ?? headers.find(h => candidates.some(c => norm(h).includes(c) || c.includes(norm(h))));
    if (hit) out[f.field] = hit;
  }
  return out;
}
