/**
 * Settings + secret store.
 *
 * Non-secret settings live in the `app_settings` table.
 * Secrets (the Anthropic API key, connector keys, Power BI credentials) are
 * encrypted with AES-256-GCM under a locally generated master key and written to
 * `data/secrets.local.json`. Neither file is ever committed, and a stored secret
 * is never returned to the browser — only a masked preview and a status.
 *
 * Resolution order for any secret:  stored (UI)  >  environment variable.
 * The UI shows which source is live so it is always obvious where a key came from.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { db, DATA_DIR } from '../db/index.js';

const SECRETS_PATH = path.join(DATA_DIR, 'secrets.local.json');
const MASTER_KEY_PATH = path.join(DATA_DIR, '.masterkey');

function masterKey(): Buffer {
  if (process.env.SLS_MASTER_KEY) {
    return crypto.createHash('sha256').update(process.env.SLS_MASTER_KEY).digest();
  }
  if (!fs.existsSync(MASTER_KEY_PATH)) {
    fs.writeFileSync(MASTER_KEY_PATH, crypto.randomBytes(32).toString('base64'), { mode: 0o600 });
  }
  return Buffer.from(fs.readFileSync(MASTER_KEY_PATH, 'utf8').trim(), 'base64');
}

function encrypt(plain: string): string {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', masterKey(), iv);
  const enc = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return [iv.toString('base64'), c.getAuthTag().toString('base64'), enc.toString('base64')].join('.');
}

function decrypt(blob: string): string | null {
  try {
    const [iv, tag, data] = blob.split('.');
    if (!iv || !tag || !data) return null;
    const d = crypto.createDecipheriv('aes-256-gcm', masterKey(), Buffer.from(iv, 'base64'));
    d.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([d.update(Buffer.from(data, 'base64')), d.final()]).toString('utf8');
  } catch {
    return null;   // wrong master key, or the file was tampered with
  }
}

type SecretFile = Record<string, { value: string; updated_at: string }>;

function readSecrets(): SecretFile {
  if (!fs.existsSync(SECRETS_PATH)) return {};
  try { return JSON.parse(fs.readFileSync(SECRETS_PATH, 'utf8')) as SecretFile; } catch { return {}; }
}

function writeSecrets(s: SecretFile) {
  fs.writeFileSync(SECRETS_PATH, JSON.stringify(s, null, 2), { mode: 0o600 });
}

// --------------------------------------------------------------- secrets API --

/** Every secret the app knows about, and the env var that can stand in for it. */
export const SECRET_KEYS = {
  ANTHROPIC_API_KEY:   { env: 'ANTHROPIC_API_KEY',   label: 'Anthropic (Claude) API key', required_for: 'AI chat, AI reports, LinkedIn AI triage, recap-card captions' },
  LINKEDIN_CONNECTOR_KEY: { env: 'LINKEDIN_CONNECTOR_KEY', label: 'LinkedIn connector API key', required_for: 'Layer 1 scheduled social listening' },
  POWERBI_CLIENT_ID:     { env: 'POWERBI_CLIENT_ID',     label: 'Power BI client ID',     required_for: 'Power BI push-dataset integration' },
  POWERBI_CLIENT_SECRET: { env: 'POWERBI_CLIENT_SECRET', label: 'Power BI client secret', required_for: 'Power BI push-dataset integration' },
  POWERBI_TENANT_ID:     { env: 'POWERBI_TENANT_ID',     label: 'Power BI tenant ID',     required_for: 'Power BI push-dataset integration' },
} as const;

export type SecretName = keyof typeof SECRET_KEYS;

export function setSecret(name: SecretName, value: string) {
  const s = readSecrets();
  s[name] = { value: encrypt(value), updated_at: new Date().toISOString() };
  writeSecrets(s);
}

export function clearSecret(name: SecretName) {
  const s = readSecrets();
  delete s[name];
  writeSecrets(s);
}

/** The live value: stored first, then the environment. Never sent to the browser. */
export function getSecret(name: SecretName): string | null {
  const s = readSecrets();
  const stored = s[name] ? decrypt(s[name]!.value) : null;
  if (stored) return stored;
  const env = process.env[SECRET_KEYS[name].env];
  return env && env.trim() ? env.trim() : null;
}

export function secretSource(name: SecretName): 'stored' | 'env' | 'none' {
  const s = readSecrets();
  if (s[name] && decrypt(s[name]!.value)) return 'stored';
  const env = process.env[SECRET_KEYS[name].env];
  return env && env.trim() ? 'env' : 'none';
}

/** `sk-ant-api03-…J8xQ` — enough to recognise a key, not enough to use one. */
export function maskSecret(value: string | null): string | null {
  if (!value) return null;
  if (value.length <= 12) return `${value.slice(0, 2)}…${value.slice(-2)}`;
  return `${value.slice(0, 11)}…${value.slice(-4)}`;
}

export function secretStatus(name: SecretName) {
  const source = secretSource(name);
  const value = getSecret(name);
  const s = readSecrets();
  return {
    name,
    label: SECRET_KEYS[name].label,
    envVar: SECRET_KEYS[name].env,
    requiredFor: SECRET_KEYS[name].required_for,
    configured: source !== 'none',
    source,
    masked: maskSecret(value),
    updatedAt: s[name]?.updated_at ?? null,
    canEditInUi: true,
    envOverridden: source === 'env',
  };
}

export function allSecretStatuses() {
  return (Object.keys(SECRET_KEYS) as SecretName[]).map(secretStatus);
}

// ------------------------------------------------------- non-secret settings --

const DEFAULT_SETTINGS: Record<string, unknown> = {
  ai_model: 'claude-sonnet-5',
  ai_max_tokens: 4096,
  ai_enabled: true,
  language: 'en',
  organisation_name: 'Saudi Leadership Society',
  organisation_name_ar: 'جمعية القيادات السعودية',
  report_footer: 'Saudi Leadership Society — a Misk Foundation community.',
  linkedin_keywords: ['SLS', 'Saudi Leadership Society', 'Misk', '#SaudiLeadershipSociety', '#MiskFoundation'],
  linkedin_connector: 'none',
  linkedin_poll_cron: '0 6 * * *',
  anomaly_decline_pct: 25,
  anomaly_stall_pct: 40,
  powerbi_workspace_id: '',
  powerbi_dataset_id: '',
};

export function getSetting<T = unknown>(key: string): T {
  const row = db.prepare('SELECT value FROM app_settings WHERE key=?').get(key) as any;
  if (!row) return DEFAULT_SETTINGS[key] as T;
  try { return JSON.parse(row.value) as T; } catch { return row.value as T; }
}

export function setSetting(key: string, value: unknown) {
  db.prepare(`INSERT INTO app_settings (key, value, is_secret, updated_at)
              VALUES (?,?,0,datetime('now'))
              ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=datetime('now')`)
    .run(key, JSON.stringify(value));
}

export function allSettings(): Record<string, unknown> {
  const rows = db.prepare('SELECT key, value FROM app_settings').all() as any[];
  const out: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const r of rows) {
    try { out[r.key] = JSON.parse(r.value); } catch { out[r.key] = r.value; }
  }
  return out;
}

/** Models offered in the Settings dropdown. */
export const AI_MODELS = [
  { id: 'claude-sonnet-5',  label: 'Claude Sonnet 5 — balanced (recommended)' },
  { id: 'claude-opus-5',    label: 'Claude Opus 5 — most capable' },
  { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 — fastest / cheapest' },
];
