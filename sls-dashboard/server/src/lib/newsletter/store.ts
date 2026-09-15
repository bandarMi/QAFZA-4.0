/**
 * Issue persistence.
 *
 * The whole newsletter is stored as one JSON document per month, including the
 * alternative options the generator produced. Reopening an issue therefore
 * restores exactly what the editor last saw — the chosen wording *and* the
 * options not taken — instead of regenerating and quietly changing the copy
 * someone already approved.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from '../../db/index.js';
import { DEFAULT_TEMPLATE, DEFAULT_TEMPLATE_KEY, TEMPLATES } from './template.js';
import { composeIssue, type NewsletterDoc } from './compose.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../../..');
export const NEWSLETTER_ASSETS = path.join(ROOT, 'assets', 'newsletter');

export function ensureTemplates() {
  const ins = db.prepare(`INSERT INTO newsletter_templates (key, name, is_default, spec, updated_at)
    VALUES (?,?,?,?,datetime('now'))
    ON CONFLICT(key) DO UPDATE SET name=excluded.name, spec=excluded.spec, updated_at=datetime('now')`);
  for (const t of Object.values(TEMPLATES)) {
    ins.run(t.key, t.name, t.key === DEFAULT_TEMPLATE_KEY ? 1 : 0, JSON.stringify(t));
  }
}

export type IssueRow = {
  id: number; period: string; issue_number: number | null; template_key: string;
  status: 'draft' | 'review' | 'published'; generated_with: 'rules' | 'ai';
  created_at: string; updated_at: string;
};

export function listIssues(): IssueRow[] {
  return db.prepare(`SELECT id, period, issue_number, template_key, status, generated_with, created_at, updated_at
                     FROM newsletter_issues ORDER BY period DESC`).all() as IssueRow[];
}

export function getIssue(period: string): { row: IssueRow; doc: NewsletterDoc } | null {
  const row = db.prepare('SELECT * FROM newsletter_issues WHERE period=?').get(period) as any;
  if (!row) return null;
  return { row, doc: JSON.parse(row.doc) as NewsletterDoc };
}

export function saveIssue(doc: NewsletterDoc, status?: IssueRow['status']) {
  db.prepare(`INSERT INTO newsletter_issues (period, issue_number, template_key, status, doc, generated_with, updated_at)
    VALUES (@period, @issue_number, @template_key, @status, @doc, @generated_with, datetime('now'))
    ON CONFLICT(period) DO UPDATE SET
      issue_number=excluded.issue_number, template_key=excluded.template_key,
      doc=excluded.doc, generated_with=excluded.generated_with,
      status=COALESCE(@status_override, newsletter_issues.status),
      updated_at=datetime('now')`)
    .run({
      period: doc.period, issue_number: doc.issueNumber, template_key: doc.templateKey,
      status: status ?? 'draft', doc: JSON.stringify(doc), generated_with: doc.generatedWith,
      status_override: status ?? null,
    });
  return getIssue(doc.period)!;
}

export function setStatus(period: string, status: IssueRow['status']) {
  db.prepare("UPDATE newsletter_issues SET status=?, updated_at=datetime('now') WHERE period=?").run(status, period);
  return getIssue(period);
}

export function deleteIssue(period: string) {
  db.prepare('DELETE FROM newsletter_issues WHERE period=?').run(period);
}

/** Generate a fresh document, preserving a manually set issue number if there is one. */
export function generate(period: string, issueNumber?: number): NewsletterDoc {
  const existing = getIssue(period);
  return composeIssue(period, { issueNumber: issueNumber ?? existing?.doc.issueNumber });
}

export const templateSpec = () => DEFAULT_TEMPLATE;

// ------------------------------------------------------------------- assets --

const EXT: Record<string, string> = {
  'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif', 'image/svg+xml': '.svg',
};
const MAX_BYTES = 8 * 1024 * 1024;

/** Store a data-URL upload under assets/newsletter and return its served path. */
export function saveAsset(period: string, dataUrl: string, hint = 'photo'): string {
  const m = /^data:([^;]+);base64,(.+)$/s.exec(String(dataUrl).trim());
  if (!m) throw new Error('Expected a base64 data URL.');
  const [, mime, b64] = m;
  const ext = EXT[mime!];
  if (!ext) throw new Error(`Unsupported image type "${mime}". Use JPEG, PNG, WebP, GIF or SVG.`);
  const buf = Buffer.from(b64!, 'base64');
  if (buf.length > MAX_BYTES) throw new Error(`That image is ${(buf.length / 1048576).toFixed(1)} MB; the limit is 8 MB.`);

  const dir = path.join(NEWSLETTER_ASSETS, period.replace(/[^0-9-]/g, ''));
  fs.mkdirSync(dir, { recursive: true });
  const name = `${hint.replace(/[^a-z0-9_-]/gi, '') || 'photo'}-${Date.now().toString(36)}${ext}`;
  fs.writeFileSync(path.join(dir, name), buf);
  return `/assets/newsletter/${period}/${name}`;
}
