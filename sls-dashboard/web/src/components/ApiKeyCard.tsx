/**
 * The AI on/off switch.
 *
 * Everything about entering, testing, changing and removing the Anthropic API key
 * lives here, and it appears in three places: Settings, the AI Reports page, and
 * inside the chat drawer when the AI is off — so the switch is always one click
 * from wherever the user hit the wall.
 *
 * The key is verified against the API before it is stored, so a typo can never
 * silently leave the AI switched off. The stored value never comes back to the
 * browser; only a masked preview and a status do.
 */
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useApp } from '../state';
import { useI18n } from '../i18n';
import { Badge } from './ui';

export type SecretStatus = {
  name: string; label: string; envVar: string; requiredFor: string;
  configured: boolean; source: 'stored' | 'env' | 'none';
  masked: string | null; updatedAt: string | null; envOverridden: boolean;
};

export function ApiKeyCard({ compact, onChanged }: { compact?: boolean; onChanged?: () => void }) {
  const { t } = useI18n();
  const { boot, setAiReady, refreshBoot } = useApp();
  const [status, setStatus] = useState<SecretStatus | null>(null);
  const [model, setModel] = useState<string>(String(boot?.settings?.ai_model ?? 'claude-sonnet-5'));
  const [value, setValue] = useState('');
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState<'save' | 'test' | 'remove' | null>(null);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const load = async () => {
    try {
      const s = await api.get<{ ready: boolean; model: string; key: SecretStatus }>('/ai/status');
      setStatus(s.key);
      setModel(s.model);
      setAiReady(s.ready);
    } catch { /* server may be starting */ }
  };
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, []);

  const save = async () => {
    if (!value.trim()) return;
    setBusy('save'); setResult(null);
    try {
      const r = await api.put<{ ok: boolean; stored: boolean; test?: { ok: boolean; message: string }; status: SecretStatus }>(
        '/settings/secrets/ANTHROPIC_API_KEY', { value: value.trim(), model });
      setResult(r.test ?? { ok: r.ok, message: r.ok ? 'Saved.' : 'Could not save that key.' });
      if (r.stored) {
        setValue(''); setEditing(false); setStatus(r.status);
        await load(); await refreshBoot(); onChanged?.();
      }
    } catch (e: any) {
      setResult({ ok: false, message: e?.message ?? String(e) });
    } finally { setBusy(null); }
  };

  const test = async () => {
    setBusy('test'); setResult(null);
    try {
      setResult(await api.post<{ ok: boolean; message: string }>('/settings/secrets/ANTHROPIC_API_KEY/test', { value: value.trim() || undefined, model }));
    } catch (e: any) {
      setResult({ ok: false, message: e?.message ?? String(e) });
    } finally { setBusy(null); }
  };

  const remove = async () => {
    setBusy('remove'); setResult(null);
    try {
      const r = await api.del<{ status: SecretStatus }>('/settings/secrets/ANTHROPIC_API_KEY');
      setStatus(r.status); setEditing(false); setValue('');
      setResult({ ok: true, message: r.status.configured
        ? `Stored key removed — an ${r.status.envVar} environment variable is still active.`
        : 'Key removed. AI features are now off.' });
      await load(); await refreshBoot(); onChanged?.();
    } catch (e: any) {
      setResult({ ok: false, message: e?.message ?? String(e) });
    } finally { setBusy(null); }
  };

  const configured = !!status?.configured;
  const showForm = editing || !configured;

  return (
    <div className={compact ? '' : 'card p-4'}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <h3 className="text-[14px] font-semibold text-ink-primary">{t.settings.aiSection}</h3>
          <p className="text-[12px] text-ink-muted mt-0.5 leading-relaxed">{t.settings.apiKeyHelp}</p>
        </div>
        {configured
          ? <Badge tone="good">● {t.settings.configured}</Badge>
          : <Badge tone="warning">● {t.settings.notConfigured}</Badge>}
      </div>

      {configured && !editing && (
        <div className="flex flex-wrap items-center gap-2 p-3 rounded-md bg-surface-sunken mb-3">
          <code className="text-[13px] font-mono text-ink-primary">{status?.masked}</code>
          <span className="text-[11px] text-ink-muted">
            {status?.source === 'env' ? `${t.settings.fromEnv} ${status.envVar}` : t.settings.fromStored}
            {status?.updatedAt ? ` · ${new Date(status.updatedAt).toLocaleDateString()}` : ''}
          </span>
          <div className="ms-auto flex gap-1.5">
            <button className="btn-ghost" onClick={test} disabled={busy !== null}>
              {busy === 'test' ? '…' : t.settings.test}
            </button>
            <button className="btn-ghost" onClick={() => { setEditing(true); setResult(null); }}>{t.settings.changeKey}</button>
            {status?.source === 'stored' && (
              <button className="btn-danger" onClick={remove} disabled={busy !== null}>
                {busy === 'remove' ? '…' : t.settings.removeKey}
              </button>
            )}
          </div>
        </div>
      )}

      {showForm && (
        <div className="space-y-3">
          <div>
            <label className="label" htmlFor="anthropic-key">{t.settings.apiKey}</label>
            <input id="anthropic-key" type="password" autoComplete="off" spellCheck={false} className="input font-mono"
                   placeholder={t.settings.paste} value={value}
                   onChange={e => { setValue(e.target.value); setResult(null); }}
                   onKeyDown={e => e.key === 'Enter' && save()} />
          </div>
          <div>
            <label className="label" htmlFor="anthropic-model">{t.settings.model}</label>
            <select id="anthropic-model" className="input" value={model} onChange={e => setModel(e.target.value)}>
              {(boot?.models ?? []).map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="btn-primary" onClick={save} disabled={!value.trim() || busy !== null}>
              {busy === 'save' ? 'Verifying…' : t.settings.saveKey}
            </button>
            <button className="btn-ghost" onClick={test} disabled={!value.trim() || busy !== null}>
              {busy === 'test' ? '…' : t.settings.test}
            </button>
            {configured && <button className="btn-quiet" onClick={() => { setEditing(false); setValue(''); setResult(null); }}>{t.common.cancel}</button>}
          </div>
          <p className="text-[11px] text-ink-muted leading-relaxed">
            The key is checked against the Anthropic API before it is saved, so a mistyped key never silently leaves the AI off.
            You can also set it from a terminal with <code className="font-mono bg-surface-sunken px-1 rounded">npm run set-key</code>,
            or via the <code className="font-mono bg-surface-sunken px-1 rounded">ANTHROPIC_API_KEY</code> environment variable.
          </p>
        </div>
      )}

      {result && (
        <p className={`mt-3 text-[12px] px-3 py-2 rounded-md leading-relaxed ${result.ok ? 'bg-state-goodSoft text-state-good' : 'bg-state-criticalSoft text-state-critical'}`}>
          {result.ok ? '✓ ' : '✕ '}{result.message}
        </p>
      )}

      {status?.envOverridden && (
        <p className="mt-3 text-[11px] text-ink-muted">
          This key comes from the <code className="font-mono">{status.envVar}</code> environment variable.
          A key saved here takes precedence over it.
        </p>
      )}
    </div>
  );
}

/** The blocking state shown wherever an AI feature needs a key. */
export function AiOffNotice({ onAddKey }: { onAddKey: () => void }) {
  const { t } = useI18n();
  return (
    <div className="card p-5 text-center border-state-warning/25 bg-state-warningSoft">
      <p className="text-[15px] font-semibold text-ink-primary">✦ {t.ai.keyMissing}</p>
      <p className="text-[13px] text-ink-secondary mt-1.5 max-w-md mx-auto leading-relaxed">{t.ai.keyMissingBody}</p>
      <button className="btn-primary mt-4" onClick={onAddKey}>{t.ai.addKey}</button>
    </div>
  );
}
