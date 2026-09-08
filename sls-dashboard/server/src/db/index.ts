import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = process.env.SLS_DATA_DIR
  ? path.resolve(process.env.SLS_DATA_DIR)
  : path.resolve(__dirname, '../../data');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, 'sls.db');

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function applySchema() {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  db.exec(sql);
}

/** Tables the AI's read-only SQL tool is allowed to touch. */
export const AI_READABLE_TABLES = [
  'members', 'initiatives', 'events', 'event_attendance', 'engagement_logs',
  'engagement_rules', 'startups', 'impact_metrics', 'council', 'linkedin_mentions',
  'recognition_rules', 'recognition_flags', 'challenge_submissions', 'challenge_scores',
  'pillars', 'alerts',
] as const;

applySchema();
