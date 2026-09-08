import { Router, type Request, type Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from '../db/index.js';
import * as A from '../lib/analytics.js';
import { parseFilters } from '../lib/filters.js';
import * as E from '../lib/engagement.js';
import { evaluateRecognition, recognitionSummary } from '../lib/recognition.js';
import { runAnomalyDetection, listAlerts } from '../lib/alerts.js';
import * as S from '../lib/settings.js';
import * as AI from '../lib/ai.js';
import * as LI from '../lib/linkedin.js';
import * as PB from '../lib/powerbi.js';
import * as RC from '../lib/recap.js';
import * as CI from '../lib/checkin.js';
import { buildReport, ALL_SECTIONS, loadTokens, type ReportSection } from '../lib/pdf.js';
import { IMPORT_SCHEMAS, importRows, suggestMapping, type ImportTarget } from '../lib/ingest.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../..');

export const api = Router();

/** Wrap a handler so a thrown error becomes a clean JSON error, not a stack trace. */
const h = (fn: (req: Request, res: Response) => unknown | Promise<unknown>) =>
  async (req: Request, res: Response) => {
    try {
      const out = await fn(req, res);
      if (out !== undefined && !res.headersSent) res.json(out);
    } catch (err: any) {
      if (err instanceof AI.MissingApiKeyError) {
        return res.status(428).json({ error: err.message, code: 'needs_api_key' });
      }
      console.error(`[api] ${req.method} ${req.path}:`, err?.message ?? err);
      if (!res.headersSent) res.status(400).json({ error: err?.message ?? String(err) });
    }
  };

const F = (req: Request) => parseFilters(req.query as Record<string, unknown>);
const baseUrl = (req: Request) => (process.env.SLS_PUBLIC_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');

// ================================================================== meta =====
api.get('/health', h(() => ({ ok: true, aiReady: AI.aiReady(), time: new Date().toISOString() })));
api.get('/tokens', h(() => loadTokens()));
api.get('/filters/options', h(() => A.filterOptions()));

api.get('/bootstrap', h((req) => ({
  tokens: loadTokens(),
  options: A.filterOptions(),
  settings: S.allSettings(),
  aiReady: AI.aiReady(),
  models: S.AI_MODELS,
  pillars: db.prepare('SELECT * FROM pillars ORDER BY sort_order').all(),
  values: db.prepare('SELECT * FROM values_ref ORDER BY sort_order').all(),
  council: db.prepare('SELECT * FROM council WHERE active=1').all(),
  reportSections: ALL_SECTIONS,
  baseUrl: baseUrl(req),
})));

// ============================================================== overview =====
api.get('/overview', h((req) => {
  const f = F(req);
  return {
    ...A.overviewKpis(f),
    hoursByMonth: A.hoursByMonth(f),
    hoursByPillar: A.hoursByPillar(f),
    hoursByActivity: A.hoursByActivity(f),
    hoursByCohort: A.hoursByCohort(f),
    initiatives: A.initiativePerformance(f),
    leaderboard: A.engagementLeaderboard(f, 10),
    alerts: listAlerts('open'),
    pinned: db.prepare("SELECT * FROM pinned_widgets WHERE target='dashboard' ORDER BY sort_order, id").all(),
  };
}));

api.get('/alerts', h((req) => listAlerts(String(req.query.status ?? 'open'))));
api.post('/alerts/run', h(() => runAnomalyDetection()));
api.post('/alerts/:id/status', h((req) => {
  db.prepare('UPDATE alerts SET status=? WHERE id=?').run(String(req.body.status), Number(req.params.id));
  return { ok: true };
}));

// =============================================================== members =====
api.get('/members', h((req) => {
  const f = F(req);
  const q = req.query.q ? `%${String(req.query.q)}%` : null;
  const limit = Math.min(Number(req.query.limit) || 50, 500);
  const offset = Number(req.query.offset) || 0;
  const where: string[] = ['1=1'];
  const params: any = { q, limit, offset };
  if (q) where.push('(m.name LIKE @q OR m.member_code LIKE @q OR m.company LIKE @q OR m.email LIKE @q)');
  if (f.cohortType?.length) { where.push(`m.cohort_type IN (${f.cohortType.map((_, i) => `@c${i}`).join(',')})`); f.cohortType.forEach((v, i) => (params[`c${i}`] = v)); }
  if (f.sector?.length) { where.push(`m.sector IN (${f.sector.map((_, i) => `@s${i}`).join(',')})`); f.sector.forEach((v, i) => (params[`s${i}`] = v)); }
  if (f.memberStatus?.length) { where.push(`m.status IN (${f.memberStatus.map((_, i) => `@st${i}`).join(',')})`); f.memberStatus.forEach((v, i) => (params[`st${i}`] = v)); }

  const hoursFilter = [f.hoursMin != null ? 'total_hours >= @hoursMin' : null, f.hoursMax != null ? 'total_hours <= @hoursMax' : null].filter(Boolean);
  params.hoursMin = f.hoursMin; params.hoursMax = f.hoursMax;
  params.dateFrom = f.dateFrom ?? '0000-01-01'; params.dateTo = f.dateTo ?? '9999-12-31';

  const sql = `
    SELECT * FROM (
      SELECT m.*, mm.name mentor_name,
        COALESCE((SELECT ROUND(SUM(l.hours),1) FROM engagement_logs l
                  WHERE l.member_id=m.id AND l.date BETWEEN @dateFrom AND @dateTo),0) total_hours,
        (SELECT COUNT(*) FROM engagement_logs l WHERE l.member_id=m.id) entries,
        (SELECT COUNT(*) FROM recognition_flags rf WHERE rf.member_id=m.id) recognition_count
      FROM members m LEFT JOIN members mm ON mm.id=m.mentor_id
      WHERE ${where.join(' AND ')}
    ) ${hoursFilter.length ? `WHERE ${hoursFilter.join(' AND ')}` : ''}
    ORDER BY total_hours DESC, name LIMIT @limit OFFSET @offset`;
  const rows = db.prepare(sql).all(params);
  const total = (db.prepare(`SELECT COUNT(*) c FROM members m WHERE ${where.join(' AND ')}`).get(params) as any).c;
  return { rows, total, limit, offset };
}));

api.get('/members/:id', h((req) => {
  const id = Number(req.params.id);
  const journey = A.memberJourney(id);
  if (!journey) throw new Error(`Member ${id} not found`);
  return { ...journey, ledger: E.memberLedger(id, req.query.dateFrom as string, req.query.dateTo as string) };
}));

api.post('/members', h((req) => {
  const b = req.body ?? {};
  if (!b.name) throw new Error('Name is required');
  if (b.cohort_type !== '2030 Leader' && b.cohort_type !== 'Misk Fellow') throw new Error('Cohort must be "2030 Leader" or "Misk Fellow"');
  const code = b.member_code || `SLS-${Date.now().toString(36).toUpperCase()}`;
  const r = db.prepare(`INSERT INTO members (member_code,name,name_ar,cohort_type,cohort_year,join_date,graduation_date,sector,company,title,email,region,linkedin_url,status,mentor_id,tags)
    VALUES (@member_code,@name,@name_ar,@cohort_type,@cohort_year,@join_date,@graduation_date,@sector,@company,@title,@email,@region,@linkedin_url,@status,@mentor_id,@tags)`)
    .run({
      member_code: code, name: b.name, name_ar: b.name_ar ?? null, cohort_type: b.cohort_type,
      cohort_year: b.cohort_year ?? null, join_date: b.join_date ?? null, graduation_date: b.graduation_date ?? null,
      sector: b.sector ?? null, company: b.company ?? null, title: b.title ?? null, email: b.email ?? null,
      region: b.region ?? null, linkedin_url: b.linkedin_url ?? null, status: b.status ?? 'active',
      mentor_id: b.mentor_id ?? null, tags: JSON.stringify(b.tags ?? []),
    });
  return db.prepare('SELECT * FROM members WHERE id=?').get(Number(r.lastInsertRowid));
}));

api.patch('/members/:id', h((req) => {
  const allowed = ['name', 'name_ar', 'cohort_type', 'cohort_year', 'join_date', 'graduation_date', 'sector', 'company', 'title', 'email', 'region', 'linkedin_url', 'status', 'mentor_id'];
  const sets = allowed.filter(k => k in (req.body ?? {}));
  if (!sets.length) throw new Error('Nothing to update');
  db.prepare(`UPDATE members SET ${sets.map(k => `${k}=@${k}`).join(', ')}, updated_at=datetime('now') WHERE id=@id`)
    .run({ ...Object.fromEntries(sets.map(k => [k, req.body[k]])), id: Number(req.params.id) });
  return db.prepare('SELECT * FROM members WHERE id=?').get(Number(req.params.id));
}));

// ========================================================== initiatives =====
api.get('/initiatives', h((req) => A.initiativePerformance(F(req))));
api.post('/initiatives', h((req) => {
  const b = req.body ?? {};
  if (!b.name || !b.pillar) throw new Error('Name and pillar are required');
  const r = db.prepare('INSERT INTO initiatives (name,name_ar,pillar,description,owner_council_role,recurring_flag,cadence) VALUES (?,?,?,?,?,?,?)')
    .run(b.name, b.name_ar ?? null, b.pillar, b.description ?? null, b.owner_council_role ?? null, b.recurring_flag ? 1 : 0, b.cadence ?? null);
  return db.prepare('SELECT * FROM initiatives WHERE id=?').get(Number(r.lastInsertRowid));
}));

// ================================================================ events =====
api.get('/events', h((req) => A.eventsList(F(req), Math.min(Number(req.query.limit) || 200, 1000))));

api.get('/events/:id', h((req) => {
  const id = Number(req.params.id);
  const event = db.prepare('SELECT e.*, i.name initiative_name, i.pillar FROM events e LEFT JOIN initiatives i ON i.id=e.initiative_id WHERE e.id=?').get(id);
  if (!event) throw new Error(`Event ${id} not found`);
  return {
    event,
    attendance: db.prepare(`SELECT a.*, m.name, m.member_code, m.cohort_type FROM event_attendance a
                            JOIN members m ON m.id=a.member_id WHERE a.event_id=? ORDER BY m.name`).all(id),
    logs: db.prepare('SELECT * FROM engagement_logs WHERE related_event_id=?').all(id),
    recap: RC.recapData(id),
  };
}));

api.post('/events', h((req) => {
  const b = req.body ?? {};
  if (!b.name || !b.date) throw new Error('Name and date are required');
  const r = db.prepare(`INSERT INTO events (initiative_id,name,name_ar,date,attendee_count,location,type,satisfaction_score,duration_hours,activity_type,status,checkin_token,notes)
    VALUES (@initiative_id,@name,@name_ar,@date,@attendee_count,@location,@type,@satisfaction_score,@duration_hours,@activity_type,@status,@token,@notes)`)
    .run({
      initiative_id: b.initiative_id ?? null, name: b.name, name_ar: b.name_ar ?? null, date: b.date,
      attendee_count: b.attendee_count ?? 0, location: b.location ?? null, type: b.type ?? 'in-person',
      satisfaction_score: b.satisfaction_score ?? null, duration_hours: b.duration_hours ?? 2,
      activity_type: b.activity_type ?? 'event attendance', status: b.status ?? 'planned',
      token: `evt_${Math.random().toString(36).slice(2, 12)}`, notes: b.notes ?? null,
    });
  return db.prepare('SELECT * FROM events WHERE id=?').get(Number(r.lastInsertRowid));
}));

api.patch('/events/:id', h((req) => {
  const allowed = ['name', 'date', 'initiative_id', 'attendee_count', 'location', 'type', 'satisfaction_score', 'duration_hours', 'activity_type', 'status', 'notes'];
  const sets = allowed.filter(k => k in (req.body ?? {}));
  if (!sets.length) throw new Error('Nothing to update');
  const id = Number(req.params.id);
  db.prepare(`UPDATE events SET ${sets.map(k => `${k}=@${k}`).join(', ')} WHERE id=@id`)
    .run({ ...Object.fromEntries(sets.map(k => [k, req.body[k]])), id });
  // Any change to duration or status re-derives hours automatically.
  const ev = db.prepare('SELECT status FROM events WHERE id=?').get(id) as any;
  const posted = ev?.status === 'closed' ? E.postHoursForEvent(id, 'event-edit') : null;
  return { event: db.prepare('SELECT * FROM events WHERE id=?').get(id), hoursPosted: posted };
}));

api.post('/events/:id/close', h((req) => ({
  ...E.closeEvent(Number(req.params.id), 'ui'),
  recognition: evaluateRecognition(),
})));

api.post('/events/:id/attendance', h((req) => {
  const eventId = Number(req.params.id);
  const memberIds: number[] = req.body?.memberIds ?? [];
  const role = req.body?.role ?? 'attendee';
  const ins = db.prepare(`INSERT INTO event_attendance (event_id,member_id,registered_at,role,source,no_show)
    VALUES (?,?,datetime('now'),?,'manual',0) ON CONFLICT(event_id,member_id) DO UPDATE SET role=excluded.role`);
  const tx = db.transaction(() => { for (const m of memberIds) ins.run(eventId, m, role); });
  tx();
  const ev = db.prepare('SELECT status FROM events WHERE id=?').get(eventId) as any;
  return { added: memberIds.length, hoursPosted: ev?.status === 'closed' ? E.postHoursForEvent(eventId, 'ui') : null };
}));

// QR --------------------------------------------------------------------------
api.get('/events/:id/qr', h(async (req) => {
  const token = CI.ensureToken(Number(req.params.id));
  const url = `${baseUrl(req)}/checkin/${token}`;
  return { token, url, svg: await CI.checkinQrSvg(token, baseUrl(req)) };
}));

api.get('/checkin/:token/info', h((req) => {
  const ev = CI.eventByToken(String(req.params.token));
  if (!ev) throw new Error('That check-in code is not valid.');
  return { event: { id: ev.id, name: ev.name, date: ev.date, initiative_name: ev.initiative_name, location: ev.location, status: ev.status } };
}));
api.post('/checkin/:token', h((req) => CI.scan(String(req.params.token), String(req.body?.memberCode ?? ''))));

// Recap cards -----------------------------------------------------------------
api.get('/events/:id/recap.svg', h((req, res) => {
  const svg = RC.renderRecapSvg(Number(req.params.id), (req.query.size as RC.RecapSize) || 'linkedin', req.query.quote as string);
  res.type('image/svg+xml').send(svg);
}));
api.get('/events/:id/recap', h(async (req) => ({
  sizes: RC.SIZES, data: RC.recapData(Number(req.params.id)),
  suggestion: AI.aiReady() ? await RC.suggestRecapQuote(Number(req.params.id)) : { quote: '', ai: false },
})));

// =========================================================== engagement =====
api.get('/engagement/rules', h(() => db.prepare('SELECT * FROM engagement_rules ORDER BY activity_type').all()));
api.put('/engagement/rules/:activityType', h((req) => {
  const at = String(req.params.activityType);
  const b = req.body ?? {};
  db.prepare(`INSERT INTO engagement_rules (activity_type, default_hours, role_multiplier, counts_toward_recognition, description, updated_at)
    VALUES (?,?,?,?,?,datetime('now'))
    ON CONFLICT(activity_type) DO UPDATE SET default_hours=excluded.default_hours, role_multiplier=excluded.role_multiplier,
      counts_toward_recognition=excluded.counts_toward_recognition, description=excluded.description, updated_at=datetime('now')`)
    .run(at, Number(b.default_hours), JSON.stringify(b.role_multiplier ?? {}), b.counts_toward_recognition ? 1 : 0, b.description ?? null);
  return db.prepare('SELECT * FROM engagement_rules WHERE activity_type=?').get(at);
}));
api.delete('/engagement/rules/:activityType', h((req) => {
  db.prepare('DELETE FROM engagement_rules WHERE activity_type=?').run(String(req.params.activityType));
  return { ok: true };
}));
api.post('/engagement/recalculate', h(() => ({ ...E.recalcAllClosedEvents('ui'), recognition: evaluateRecognition() })));

api.get('/engagement/logs', h((req) => {
  const f = F(req);
  const limit = Math.min(Number(req.query.limit) || 100, 1000);
  const verified = req.query.verified as string | undefined;
  const rows = db.prepare(`
    SELECT l.*, m.name member_name, m.member_code, m.cohort_type, i.name initiative_name, i.pillar, e.name event_name
    FROM engagement_logs l
    JOIN members m ON m.id=l.member_id
    LEFT JOIN initiatives i ON i.id=l.related_initiative_id
    LEFT JOIN events e ON e.id=l.related_event_id
    WHERE l.date BETWEEN @from AND @to
      ${verified === 'true' ? 'AND l.verified_flag=1' : verified === 'false' ? 'AND l.verified_flag=0' : ''}
      ${req.query.memberId ? 'AND l.member_id=@memberId' : ''}
      ${req.query.activityType ? 'AND l.activity_type=@activityType' : ''}
    ORDER BY l.date DESC, l.id DESC LIMIT @limit`)
    .all({ from: f.dateFrom ?? '0000-01-01', to: f.dateTo ?? '9999-12-31', limit, memberId: req.query.memberId, activityType: req.query.activityType });
  return { rows };
}));

api.post('/engagement/logs', h((req) => {
  const b = req.body ?? {};
  if (!b.member_id || !b.activity_type || !b.date || b.hours == null) throw new Error('member_id, activity_type, date and hours are required');
  const r = db.prepare(`INSERT INTO engagement_logs (member_id,activity_type,related_initiative_id,related_event_id,date,hours,direction,source,verified_flag,notes)
    VALUES (?,?,?,?,?,?,?,'manual',0,?)`)
    .run(b.member_id, b.activity_type, b.related_initiative_id ?? null, b.related_event_id ?? null, b.date, Number(b.hours), b.direction ?? 'participated', b.notes ?? null);
  db.prepare('INSERT INTO engagement_audit (log_id, action, actor, detail) VALUES (?,?,?,?)')
    .run(Number(r.lastInsertRowid), 'manual_created', 'ui', JSON.stringify(b));
  evaluateRecognition();
  return db.prepare('SELECT * FROM engagement_logs WHERE id=?').get(Number(r.lastInsertRowid));
}));

api.post('/engagement/logs/:id/override', h((req) => E.overrideHours(Number(req.params.id), Number(req.body.hours), req.body.actor ?? 'council-lead', req.body.reason)));
api.post('/engagement/verify', h((req) => ({ verified: E.setVerified(req.body?.ids ?? [], req.body?.verified !== false, req.body?.actor ?? 'council-lead') })));
api.get('/engagement/audit', h((req) => db.prepare(`
  SELECT a.*, l.member_id, m.name member_name FROM engagement_audit a
  LEFT JOIN engagement_logs l ON l.id=a.log_id LEFT JOIN members m ON m.id=l.member_id
  ${req.query.logId ? 'WHERE a.log_id=@logId' : ''}
  ORDER BY a.id DESC LIMIT @limit`).all({ logId: req.query.logId, limit: Math.min(Number(req.query.limit) || 100, 500) })));

api.get('/engagement/summary', h((req) => {
  const f = F(req);
  return {
    byMonth: A.hoursByMonth(f), byPillar: A.hoursByPillar(f), byActivity: A.hoursByActivity(f),
    byCohort: A.hoursByCohort(f), byCohortInitiative: A.hoursByCohortAndInitiative(f),
    leaderboard: A.engagementLeaderboard(f, Math.min(Number(req.query.limit) || 25, 200)),
  };
}));

api.get('/recognition', h(() => ({
  ...recognitionSummary(),
  rules: db.prepare('SELECT * FROM recognition_rules ORDER BY threshold_hours').all(),
  flags: db.prepare(`SELECT f.*, m.name member_name, m.member_code, m.cohort_type, r.name rule_name
                     FROM recognition_flags f JOIN members m ON m.id=f.member_id
                     JOIN recognition_rules r ON r.id=f.rule_id
                     ORDER BY f.hours_at_flag DESC`).all(),
})));
api.post('/recognition/rules', h((req) => {
  const b = req.body ?? {};
  const r = db.prepare('INSERT INTO recognition_rules (name,name_ar,threshold_hours,period,cohort_filter,active) VALUES (?,?,?,?,?,1)')
    .run(b.name, b.name_ar ?? null, Number(b.threshold_hours), b.period ?? 'calendar_year', b.cohort_filter ?? null);
  evaluateRecognition();
  return db.prepare('SELECT * FROM recognition_rules WHERE id=?').get(Number(r.lastInsertRowid));
}));
api.patch('/recognition/rules/:id', h((req) => {
  const allowed = ['name', 'name_ar', 'threshold_hours', 'period', 'cohort_filter', 'active'];
  const sets = allowed.filter(k => k in (req.body ?? {}));
  if (!sets.length) throw new Error('Nothing to update');
  db.prepare(`UPDATE recognition_rules SET ${sets.map(k => `${k}=@${k}`).join(', ')} WHERE id=@id`)
    .run({ ...Object.fromEntries(sets.map(k => [k, req.body[k]])), id: Number(req.params.id) });
  evaluateRecognition();
  return db.prepare('SELECT * FROM recognition_rules WHERE id=?').get(Number(req.params.id));
}));
api.post('/recognition/flags/:id/status', h((req) => {
  db.prepare('UPDATE recognition_flags SET status=? WHERE id=?').run(String(req.body.status), Number(req.params.id));
  return { ok: true };
}));

// =============================================== impact / startups / council =
api.get('/impact', h((req) => ({ ...A.startupTrends(F(req)), metrics: A.impactMetrics().rows })));
api.get('/startups', h(() => db.prepare(`SELECT s.*, m.name member_name FROM startups s LEFT JOIN members m ON m.id=s.member_id ORDER BY s.support_year DESC, s.name`).all()));
api.post('/impact/metrics', h((req) => {
  const b = req.body ?? {};
  db.prepare(`INSERT INTO impact_metrics (period,metric_name,value,unit,source,notes) VALUES (?,?,?,?,'manual',?)
    ON CONFLICT(period,metric_name) DO UPDATE SET value=excluded.value, unit=excluded.unit, notes=excluded.notes, source='manual', updated_at=datetime('now')`)
    .run(b.period, b.metric_name, Number(b.value), b.unit ?? null, b.notes ?? null);
  return { ok: true };
}));
api.get('/council', h(() => db.prepare('SELECT * FROM council ORDER BY id').all()));
api.get('/council/:role', h((req) => A.councilCockpit(decodeURIComponent(String(req.params.role)), F(req))));
api.get('/challenge', h((req) => A.challengeLeaderboard(req.query.year ? Number(req.query.year) : undefined)));

// ============================================================== ingestion ====
api.get('/ingest/schemas', h(() => IMPORT_SCHEMAS));
api.post('/ingest/suggest', h((req) => ({ mapping: suggestMapping(req.body.target as ImportTarget, req.body.headers ?? []) })));
api.post('/ingest/import', h((req) => {
  const { target, mapping, rows, filename } = req.body ?? {};
  if (!target || !IMPORT_SCHEMAS[target as ImportTarget]) throw new Error('Unknown import target');
  if (!Array.isArray(rows)) throw new Error('rows must be an array');
  const result = importRows(target as ImportTarget, mapping ?? {}, rows, filename);
  evaluateRecognition();
  return result;
}));
api.get('/ingest/jobs', h(() => db.prepare('SELECT * FROM import_jobs ORDER BY id DESC LIMIT 50').all()));
api.get('/ingest/template/:target', h((req, res) => {
  const target = req.params.target as ImportTarget;
  const schema = IMPORT_SCHEMAS[target];
  if (!schema) throw new Error('Unknown import target');
  const headers = schema.fields.map(f => f.field).join(',');
  res.type('text/csv').attachment(`sls-${target}-template.csv`).send(`${headers}\r\n`);
}));
/** Scheduled-import stub: the contract a future CRM/Airtable/Sheets sync plugs into. */
api.get('/ingest/scheduled', h(() => ({
  implemented: false,
  message: 'Scheduled imports are not wired to a source yet. The contract is: POST the same body as /api/ingest/import on a timer. Add the source credentials in Settings, then implement the fetch in server/src/lib/ingest.ts.',
  supportedSources: [
    { id: 'google_sheets', label: 'Google Sheets', needs: 'A service-account JSON key and the sheet id.' },
    { id: 'airtable', label: 'Airtable', needs: 'A personal access token, base id and table name.' },
    { id: 'crm_webhook', label: 'Generic CRM webhook', needs: 'An inbound URL — POST rows to /api/ingest/import.' },
  ],
  lastJobs: db.prepare('SELECT * FROM import_jobs ORDER BY id DESC LIMIT 5').all(),
})));

// ================================================================= AI ========
api.get('/ai/status', h(() => ({
  ready: AI.aiReady(),
  model: S.getSetting('ai_model'),
  models: S.AI_MODELS,
  key: S.secretStatus('ANTHROPIC_API_KEY'),
})));

api.post('/ai/chat', h(async (req) => {
  const { message, conversationId } = req.body ?? {};
  if (!message?.trim()) throw new Error('A message is required');
  const convId = AI.ensureConversation(conversationId, message);
  const history = AI.conversationHistory(convId).slice(-12);
  AI.saveMessage(convId, 'user', { text: message });
  const result = await AI.chat(message, history);
  AI.saveMessage(convId, 'assistant', result);
  return { conversationId: convId, ...result };
}));

api.get('/ai/conversations', h(() => db.prepare('SELECT * FROM ai_conversations ORDER BY id DESC LIMIT 50').all()));
api.get('/ai/conversations/:id', h((req) => ({
  conversation: db.prepare('SELECT * FROM ai_conversations WHERE id=?').get(Number(req.params.id)),
  messages: (db.prepare('SELECT * FROM ai_messages WHERE conversation_id=? ORDER BY id').all(Number(req.params.id)) as any[])
    .map(m => ({ ...m, content: JSON.parse(m.content) })),
})));
api.delete('/ai/conversations/:id', h((req) => {
  db.prepare('DELETE FROM ai_conversations WHERE id=?').run(Number(req.params.id));
  return { ok: true };
}));

// Pin an AI answer to the dashboard, or add it to the report.
api.get('/pins', h((req) => db.prepare('SELECT * FROM pinned_widgets WHERE target=? ORDER BY sort_order, id').all(String(req.query.target ?? 'dashboard'))));
api.post('/pins', h((req) => {
  const b = req.body ?? {};
  if (!b.title || !b.spec) throw new Error('title and spec are required');
  const r = db.prepare('INSERT INTO pinned_widgets (title,target,spec,sort_order) VALUES (?,?,?,?)')
    .run(b.title, b.target ?? 'dashboard', JSON.stringify(b.spec), b.sort_order ?? 0);
  return db.prepare('SELECT * FROM pinned_widgets WHERE id=?').get(Number(r.lastInsertRowid));
}));
api.delete('/pins/:id', h((req) => {
  db.prepare('DELETE FROM pinned_widgets WHERE id=?').run(Number(req.params.id));
  return { ok: true };
}));

// ========================================================= social listening ==
api.get('/linkedin', h((req) => ({
  rows: db.prepare(`SELECT lm.*, m.name member_name, m.cohort_type, m.company FROM linkedin_mentions lm
                    LEFT JOIN members m ON m.id=lm.member_id
                    ${req.query.status ? 'WHERE lm.status=@status' : ''}
                    ORDER BY lm.priority_flag DESC, lm.post_date DESC LIMIT @limit`)
    .all({ status: req.query.status, limit: Math.min(Number(req.query.limit) || 100, 500) }),
  connectors: LI.connectorStatuses(),
  keywords: S.getSetting('linkedin_keywords'),
  aiReady: AI.aiReady(),
  totals: db.prepare(`SELECT COUNT(*) total, SUM(status='new') unreviewed, SUM(priority_flag) priority,
                             COALESCE(SUM(engagement_count),0) engagement FROM linkedin_mentions`).get(),
})));
api.post('/linkedin/capture', h(async (req) => {
  const { url, memberId, snippet, authorName, postDate, engagementCount } = req.body ?? {};
  if (!url?.trim()) throw new Error('A LinkedIn post URL is required');
  return LI.capturePost({ url: url.trim(), memberId: memberId ?? null, snippet, authorName, postDate, engagementCount });
}));
api.post('/linkedin/:id/triage', h((req) => LI.triageMention(Number(req.params.id))));
api.post('/linkedin/:id/status', h((req) => {
  db.prepare('UPDATE linkedin_mentions SET status=? WHERE id=?').run(String(req.body.status), Number(req.params.id));
  return { ok: true };
}));
api.post('/linkedin/poll', h(() => LI.runConnectorPoll()));
api.get('/linkedin/highlights', h((req) => LI.monthlyHighlights(req.query.month as string)));

// ================================================================ exports ====
api.get('/export/sections', h(() => ALL_SECTIONS));

api.get('/export/pdf', h((req, res) => {
  const sections = (String(req.query.sections ?? '').split(',').filter(Boolean) as ReportSection[]);
  const doc = buildReport({
    filters: F(req),
    sections: sections.length ? sections : ALL_SECTIONS.map(s => s.id),
    title: req.query.title as string,
    lang: (req.query.lang as 'en' | 'ar') ?? 'en',
  });
  res.type('application/pdf').attachment(`SLS-report-${new Date().toISOString().slice(0, 10)}.pdf`);
  doc.pipe(res);
}));

api.get('/export/powerbi/tables', h(() => ({ tables: PB.POWERBI_TABLES, push: PB.pushStatus() })));
api.get('/export/powerbi/table', h((req, res) => {
  const name = req.query.name as PB.TableName;
  if (!PB.POWERBI_TABLES.some(t => t.name === name)) throw new Error(`Unknown table "${name}"`);
  const rows = PB.buildTable(name, F(req));
  if ((req.query.format ?? 'csv') === 'json') return res.json(rows);
  res.type('text/csv').attachment(`${name}.csv`).send(PB.toCsv(rows));
}));
api.get('/export/powerbi/bundle', h((req) => {
  const f = F(req);
  return {
    generatedAt: new Date().toISOString(),
    filters: f,
    powerQuery: PB.powerQueryScript(baseUrl(req), f),
    tables: Object.fromEntries(PB.POWERBI_TABLES.map(t => [t.name, PB.buildTable(t.name, f)])),
    pushDataset: PB.pushDatasetDefinition(),
    push: PB.pushStatus(),
  };
}));
api.get('/export/powerbi/powerquery', h((req, res) => {
  res.type('text/plain').attachment('sls-powerquery.m').send(PB.powerQueryScript(baseUrl(req), F(req)));
}));
api.get('/export/csv/:table', h((req, res) => {
  const name = req.params.table as PB.TableName;
  if (!PB.POWERBI_TABLES.some(t => t.name === name)) throw new Error(`Unknown table "${name}"`);
  res.type('text/csv').attachment(`${name}.csv`).send(PB.toCsv(PB.buildTable(name, F(req))));
}));

// =============================================================== settings ====
api.get('/settings', h(() => ({
  settings: S.allSettings(),
  secrets: S.allSecretStatuses(),
  models: S.AI_MODELS,
  aiReady: AI.aiReady(),
  connectors: LI.connectorStatuses(),
  powerbi: PB.pushStatus(),
  tokens: loadTokens(),
})));

api.put('/settings', h((req) => {
  for (const [k, v] of Object.entries(req.body ?? {})) S.setSetting(k, v);
  return { settings: S.allSettings() };
}));

/** ---- API key management: the AI on/off switch ---------------------------- */
api.get('/settings/secrets', h(() => S.allSecretStatuses()));

api.put('/settings/secrets/:name', h(async (req) => {
  const name = req.params.name as S.SecretName;
  if (!(name in S.SECRET_KEYS)) throw new Error(`Unknown secret "${name}"`);
  const value = String(req.body?.value ?? '').trim();
  if (!value) throw new Error('The key cannot be empty. Use DELETE to remove a stored key.');

  // Verify an Anthropic key before storing it, so a typo never silently disables the AI.
  if (name === 'ANTHROPIC_API_KEY' && req.body?.verify !== false) {
    const test = await AI.testApiKey(value, req.body?.model);
    if (!test.ok) return { ok: false, stored: false, test, status: S.secretStatus(name) };
    S.setSecret(name, value);
    if (req.body?.model) S.setSetting('ai_model', req.body.model);
    return { ok: true, stored: true, test, status: S.secretStatus(name) };
  }
  S.setSecret(name, value);
  return { ok: true, stored: true, status: S.secretStatus(name) };
}));

api.delete('/settings/secrets/:name', h((req) => {
  const name = req.params.name as S.SecretName;
  if (!(name in S.SECRET_KEYS)) throw new Error(`Unknown secret "${name}"`);
  S.clearSecret(name);
  return { ok: true, status: S.secretStatus(name) };
}));

/** Test a key without storing it — or test the one already configured. */
api.post('/settings/secrets/ANTHROPIC_API_KEY/test', h(async (req) => {
  const candidate = String(req.body?.value ?? '').trim() || S.getSecret('ANTHROPIC_API_KEY');
  if (!candidate) return { ok: false, message: 'No key to test. Paste one above, or add it to the ANTHROPIC_API_KEY environment variable.' };
  return AI.testApiKey(candidate, req.body?.model);
}));

/** Brand tokens are editable at runtime — the whole UI and every PDF reads them. */
api.put('/settings/tokens', h((req) => {
  const incoming = req.body;
  if (!incoming?.color || !incoming?.font) throw new Error('That does not look like a design-tokens document (expected `color` and `font` keys).');
  const file = path.join(ROOT, 'design-tokens.json');
  fs.copyFileSync(file, path.join(ROOT, 'design-tokens.backup.json'));
  fs.writeFileSync(file, JSON.stringify(incoming, null, 2));
  return { ok: true, tokens: loadTokens() };
}));

api.get('/data-dictionary', h(() => {
  const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as any[]).map(t => t.name);
  return tables.map(name => ({
    table: name,
    rows: (db.prepare(`SELECT COUNT(*) c FROM "${name}"`).get() as any).c,
    columns: (db.prepare(`PRAGMA table_info("${name}")`).all() as any[]).map(c => ({
      name: c.name, type: c.type, notNull: !!c.notnull, default: c.dflt_value, pk: !!c.pk,
    })),
  }));
}));
