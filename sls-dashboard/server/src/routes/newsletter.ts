/**
 * Newsletter API.
 *
 * Generation is deliberately two-step: `/generate` always returns a complete
 * issue composed from the database, and `/enrich` is a separate call that only
 * rewrites its wording. The editor calls both behind one button, but a failure
 * of the second never costs you the first.
 */
import { Router, type Request, type Response } from 'express';
import { db } from '../db/index.js';
import { composeIssue, availablePeriods } from '../lib/newsletter/compose.js';
import { enrichIssue } from '../lib/newsletter/enrich.js';
import { renderIssueHtml } from '../lib/newsletter/render.js';
import * as store from '../lib/newsletter/store.js';
import { DEFAULT_TEMPLATE } from '../lib/newsletter/template.js';
import { aiReady, MissingApiKeyError } from '../lib/ai.js';

export const newsletter = Router();

const h = (fn: (req: Request, res: Response) => unknown | Promise<unknown>) =>
  async (req: Request, res: Response) => {
    try {
      const out = await fn(req, res);
      if (out !== undefined && !res.headersSent) res.json(out);
    } catch (err: any) {
      if (err instanceof MissingApiKeyError) return res.status(428).json({ error: err.message, code: 'needs_api_key' });
      console.error(`[newsletter] ${req.method} ${req.path}:`, err?.message ?? err);
      if (!res.headersSent) res.status(400).json({ error: err?.message ?? String(err) });
    }
  };

const period = (req: Request) => {
  const p = String(req.params.period ?? req.query.period ?? '');
  if (!/^\d{4}-\d{2}$/.test(p)) throw new Error(`"${p}" is not a month. Use yyyy-mm.`);
  return p;
};

// ------------------------------------------------------------------ overview --

newsletter.get('/', h(() => ({
  template: DEFAULT_TEMPLATE,
  periods: availablePeriods(),
  issues: store.listIssues(),
  aiReady: aiReady(),
})));

newsletter.get('/template', h(() => DEFAULT_TEMPLATE));

// ---------------------------------------------------------------- generation --

/** One click: compose from the data, then (optionally) have the AI write it up. */
newsletter.post('/generate', h(async (req) => {
  const p = period(req);
  const useAi = req.body?.ai !== false && aiReady();
  const doc = store.generate(p, req.body?.issueNumber);

  let enrichment: { rewritten: number; batches: number; error?: string } | null = null;
  if (useAi) {
    const r = await enrichIssue(doc);
    enrichment = { rewritten: r.rewritten, batches: r.batches, error: r.error };
  }

  const saved = store.saveIssue(doc);
  return { ...saved, enrichment, aiReady: aiReady() };
}));

/** Rewrite the copy of an issue that already exists, keeping its structure. */
newsletter.post('/:period/enrich', h(async (req) => {
  const p = period(req);
  const found = store.getIssue(p);
  if (!found) throw new Error(`No issue for ${p} yet — generate it first.`);
  const r = await enrichIssue(found.doc);
  const saved = store.saveIssue(r.doc);
  return { ...saved, enrichment: { rewritten: r.rewritten, batches: r.batches, error: r.error } };
}));

// --------------------------------------------------------------------- CRUD --

newsletter.get('/issues', h(() => store.listIssues()));

newsletter.get('/:period', h((req) => {
  const p = period(req);
  const found = store.getIssue(p);
  if (!found) return { exists: false, period: p, preview: composeIssue(p) };
  return { exists: true, ...found };
}));

/** The editor saves the whole document; it is the single source of truth. */
newsletter.put('/:period', h((req) => {
  const p = period(req);
  const doc = req.body?.doc;
  if (!doc || doc.period !== p) throw new Error('The document does not match this month.');
  return store.saveIssue(doc, req.body?.status);
}));

newsletter.post('/:period/status', h((req) => store.setStatus(period(req), req.body?.status)));
newsletter.delete('/:period', h((req) => { store.deleteIssue(period(req)); return { ok: true }; }));

// ------------------------------------------------------------------- render --

newsletter.get('/:period/preview.html', h((req, res) => {
  const p = period(req);
  const found = store.getIssue(p);
  const doc = found?.doc ?? composeIssue(p);
  res.type('html').send(renderIssueHtml(doc));
}));

newsletter.get('/:period/export.html', h((req, res) => {
  const p = period(req);
  const found = store.getIssue(p);
  const doc = found?.doc ?? composeIssue(p);
  res.type('html')
     .attachment(`SLS-Newsletter-${p}.html`)
     .send(renderIssueHtml(doc));
}));

// ------------------------------------------------------------------- assets --

newsletter.post('/:period/asset', h((req) => {
  const p = period(req);
  const url = store.saveAsset(p, String(req.body?.dataUrl ?? ''), String(req.body?.hint ?? 'photo'));
  return { url };
}));

// --------------------------------------------------------------- milestones --
// Page 5 is the one part of the newsletter with no natural source elsewhere in
// the dashboard, so it gets its own small editor.

newsletter.get('/milestones/:period', h((req) => {
  const p = period(req);
  return db.prepare(`SELECT ms.*, m.name resolved_name FROM member_milestones ms
                     LEFT JOIN members m ON m.id = ms.member_id
                     WHERE substr(ms.date,1,7)=? ORDER BY ms.kind, ms.date`).all(p);
}));

newsletter.post('/milestones', h((req) => {
  const b = req.body ?? {};
  const KINDS = ['appointment', 'award', 'program_acceptance', 'board_seat'];
  if (!KINDS.includes(b.kind)) throw new Error(`kind must be one of ${KINDS.join(', ')}`);
  if (!b.title) throw new Error('A title is required.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(b.date ?? ''))) throw new Error('A date (yyyy-mm-dd) is required.');
  const r = db.prepare(`INSERT INTO member_milestones (member_id, member_name, kind, title, detail, organisation, date, photo_url)
    VALUES (?,?,?,?,?,?,?,?)`)
    .run(b.member_id ?? null, b.member_name ?? null, b.kind, b.title, b.detail ?? null, b.organisation ?? null, b.date, b.photo_url ?? null);
  return db.prepare('SELECT * FROM member_milestones WHERE id=?').get(Number(r.lastInsertRowid));
}));

newsletter.delete('/milestones/:id', h((req) => {
  db.prepare('DELETE FROM member_milestones WHERE id=?').run(Number(req.params.id));
  return { ok: true };
}));

// ----------------------------------------------------------------- chapters --

newsletter.get('/meta/chapters', h(() => db.prepare(`
  SELECT c.*, m.name lead_name, d.name deputy_name
  FROM chapters c
  LEFT JOIN members m ON m.id=c.lead_member_id
  LEFT JOIN members d ON d.id=c.deputy_member_id
  ORDER BY c.kind, c.sort_order`).all()));
