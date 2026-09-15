import Database from './sqlite.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = process.env.SLS_DATA_DIR
  ? path.resolve(process.env.SLS_DATA_DIR)
  : path.resolve(__dirname, '../../data');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, 'sls.db');

function openDatabase(): Database {
  try {
    return new Database(DB_PATH);
  } catch (err: any) {
    if (String(err?.message ?? err).includes('node:sqlite')) {
      throw new Error(
        'This build needs Node 24 or newer, where SQLite is built into Node itself.\n' +
        `You are running ${process.version}. Install Node 24 LTS from https://nodejs.org, ` +
        'or use the portable Windows bundle, which carries its own Node runtime.',
      );
    }
    throw err;
  }
}

export const db = openDatabase();
// Wait rather than fail if another process holds the write lock. Two things can
// hit the same file at once — a second app instance, or the parallel test runner
// — and without this the loser gets SQLITE_BUSY instead of simply queueing.
db.pragma('busy_timeout = 10000');
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function applySchema() {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  db.exec(`BEGIN IMMEDIATE;\n${sql}\nCOMMIT;`);
}

/** Tables the AI's read-only SQL tool is allowed to touch. */
export const AI_READABLE_TABLES = [
  'members', 'initiatives', 'events', 'event_attendance', 'engagement_logs',
  'engagement_rules', 'startups', 'impact_metrics', 'council', 'linkedin_mentions',
  'recognition_rules', 'recognition_flags', 'challenge_submissions', 'challenge_scores',
  'pillars', 'alerts',
] as const;

applySchema();
