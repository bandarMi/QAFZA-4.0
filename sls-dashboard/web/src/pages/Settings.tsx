import { useEffect, useState } from 'react';
import { useApp, useData } from '../state';
import { useI18n } from '../i18n';
import { Card, Badge, Skeleton, CopyButton } from '../components/ui';
import { ApiKeyCard, type SecretStatus } from '../components/ApiKeyCard';
import { api } from '../lib/api';

export function Settings() {
  const { t, lang, setLang } = useI18n();
  const { boot, refreshBoot } = useApp();
  const { data, loading, reload } = useData<any>('/settings');
  const [saved, setSaved] = useState(false);
  const [form, setForm] = useState<Record<string, any>>({});

  useEffect(() => { if (data?.settings) setForm(data.settings); }, [data]);
  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));

  const save = async () => {
    await api.put('/settings', form);
    setSaved(true); setTimeout(() => setSaved(false), 2000);
    reload(); refreshBoot();
  };

  if (loading && !data) return <Skeleton rows={4} height="h-32" />;

  const otherSecrets: SecretStatus[] = (data?.secrets ?? []).filter((s: SecretStatus) => s.name !== 'ANTHROPIC_API_KEY');

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="lg:col-span-2 space-y-4">
        {/* -------- the headline feature: turn the AI on -------- */}
        <ApiKeyCard onChanged={() => { reload(); refreshBoot(); }} />

        <Card title="Other API keys" subtitle="Stored the same way — encrypted on this machine, never returned to the browser.">
          <div className="space-y-3">
            {otherSecrets.map(s => <SecretRow key={s.name} secret={s} onChanged={reload} />)}
          </div>
        </Card>

        <Card title={t.settings.socialSection}>
          <label className="label">Active connector (layer 1)</label>
          <select className="input mb-3" value={form.linkedin_connector ?? 'none'} onChange={e => set('linkedin_connector', e.target.value)}>
            {(data?.connectors ?? []).map((c: any) => <option key={c.name} value={c.name}>{c.label}</option>)}
          </select>
          <label className="label">Tracked keywords (comma-separated)</label>
          <input className="input mb-3" value={(form.linkedin_keywords ?? []).join(', ')}
                 onChange={e => set('linkedin_keywords', e.target.value.split(',').map(s => s.trim()).filter(Boolean))} />
          <label className="label">Poll schedule (cron — for a future scheduler)</label>
          <input className="input font-mono" value={form.linkedin_poll_cron ?? ''} onChange={e => set('linkedin_poll_cron', e.target.value)} />
        </Card>

        <Card title={t.settings.anomalies} subtitle="How far something must fall before the Overview raises it.">
          <div className="grid sm:grid-cols-2 gap-3">
            <div><label className="label">Initiative decline threshold (%)</label>
              <input className="input" type="number" value={form.anomaly_decline_pct ?? 25}
                     onChange={e => set('anomaly_decline_pct', Number(e.target.value))} /></div>
            <div><label className="label">Member stall threshold (%)</label>
              <input className="input" type="number" value={form.anomaly_stall_pct ?? 40}
                     onChange={e => set('anomaly_stall_pct', Number(e.target.value))} /></div>
          </div>
        </Card>

        <Card title="Power BI">
          <div className="grid sm:grid-cols-2 gap-3">
            <div><label className="label">Workspace id</label>
              <input className="input font-mono" value={form.powerbi_workspace_id ?? ''} onChange={e => set('powerbi_workspace_id', e.target.value)} /></div>
            <div><label className="label">Dataset id</label>
              <input className="input font-mono" value={form.powerbi_dataset_id ?? ''} onChange={e => set('powerbi_dataset_id', e.target.value)} /></div>
          </div>
          <p className={`mt-3 text-[12px] px-3 py-2 rounded-md leading-relaxed ${data?.powerbi?.ready ? 'bg-state-goodSoft text-state-good' : 'bg-state-warningSoft text-state-warning'}`}>
            {data?.powerbi?.message}
          </p>
        </Card>

        <Card title="Organisation & report">
          <div className="grid sm:grid-cols-2 gap-3">
            <div><label className="label">Organisation name</label>
              <input className="input" value={form.organisation_name ?? ''} onChange={e => set('organisation_name', e.target.value)} /></div>
            <div><label className="label">Organisation name (Arabic)</label>
              <input className="input" dir="rtl" value={form.organisation_name_ar ?? ''} onChange={e => set('organisation_name_ar', e.target.value)} /></div>
            <div className="sm:col-span-2"><label className="label">PDF footer</label>
              <input className="input" value={form.report_footer ?? ''} onChange={e => set('report_footer', e.target.value)} /></div>
          </div>
        </Card>

        <div className="flex items-center gap-3">
          <button className="btn-primary" onClick={save}>{t.common.save}</button>
          {saved && <span className="text-[13px] text-state-good">✓ Saved</span>}
        </div>
      </div>

      <div className="space-y-4">
        <Card title={t.settings.language}>
          <div className="flex gap-2">
            {(['en', 'ar'] as const).map(l => (
              <button key={l} onClick={() => setLang(l)}
                      className={l === lang ? 'btn-primary flex-1' : 'btn-ghost flex-1'}>{t.lang[l]}</button>
            ))}
          </div>
          <p className="text-[12px] text-ink-muted mt-2.5 leading-relaxed">
            Arabic switches the whole interface to right-to-left. Program data renders as entered, using the Arabic column
            where one exists (initiatives, council roles, member names).
          </p>
        </Card>

        <BrandTokens tokens={data?.tokens} onSaved={() => { reload(); refreshBoot(); }} />

        <Card title="Data dictionary">
          <p className="text-[13px] text-ink-secondary leading-relaxed mb-2.5">
            Every table and column, generated live from the database.
          </p>
          <a className="btn-ghost w-full" href="/api/data-dictionary" target="_blank" rel="noreferrer">View as JSON ↗</a>
          <p className="text-[12px] text-ink-muted mt-2">
            The written version, with the engagement-hours rules explained, is in <code className="font-mono">docs/DATA_DICTIONARY.md</code>.
          </p>
        </Card>
      </div>
    </div>
  );
}

function SecretRow({ secret, onChanged }: { secret: SecretStatus; onChanged: () => void }) {
  const [value, setValue] = useState('');
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  return (
    <div className="p-3 rounded-md bg-surface-sunken">
      <div className="flex items-center justify-between gap-2 mb-1">
        <p className="text-[13px] font-medium text-ink-primary">{secret.label}</p>
        <Badge tone={secret.configured ? 'good' : 'neutral'}>{secret.configured ? secret.masked : 'not set'}</Badge>
      </div>
      <p className="text-[11px] text-ink-muted leading-snug mb-2">
        Needed for: {secret.requiredFor} · env var <code className="font-mono">{secret.envVar}</code>
      </p>
      {editing ? (
        <div className="flex gap-2">
          <input className="input font-mono" type="password" autoComplete="off" placeholder="Paste the key"
                 value={value} onChange={e => setValue(e.target.value)} />
          <button className="btn-primary" disabled={!value.trim() || busy} onClick={async () => {
            setBusy(true);
            try { await api.put(`/settings/secrets/${secret.name}`, { value: value.trim(), verify: false }); setValue(''); setEditing(false); onChanged(); }
            finally { setBusy(false); }
          }}>Save</button>
          <button className="btn-quiet" onClick={() => { setEditing(false); setValue(''); }}>Cancel</button>
        </div>
      ) : (
        <div className="flex gap-1.5">
          <button className="btn-quiet text-[12px]" onClick={() => setEditing(true)}>{secret.configured ? 'Change' : 'Add key'}</button>
          {secret.source === 'stored' && (
            <button className="btn-quiet text-[12px] text-state-critical" onClick={async () => { await api.del(`/settings/secrets/${secret.name}`); onChanged(); }}>Remove</button>
          )}
        </div>
      )}
    </div>
  );
}

/** Brand tokens are editable at runtime — this is where the real hexes go in. */
function BrandTokens({ tokens, onSaved }: { tokens: any; onSaved: () => void }) {
  const [text, setText] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => { if (tokens) setText(JSON.stringify(tokens, null, 2)); }, [tokens]);

  const brandColors = Object.entries(tokens?.color?.brand ?? {}).filter(([, v]) => String(v).startsWith('#'));

  return (
    <Card title="Brand tokens" subtitle={tokens?.$meta?.provenance?.status}>
      <div className="flex flex-wrap gap-1.5 mb-3">
        {brandColors.map(([k, v]) => (
          <span key={k} className="chip border-line" title={`${k}: ${v}`}>
            <i className="w-3 h-3 rounded-sm border border-black/10" style={{ background: String(v) }} />
            <span className="font-mono text-[11px]">{String(v)}</span>
          </span>
        ))}
      </div>
      <p className="text-[12px] text-ink-muted leading-relaxed mb-3">
        Replace these with the real values from the SLS brand and the whole app, every chart and every PDF export follows —
        no rebuild. See <code className="font-mono">docs/DESIGN_TOKENS_REPORT.md</code>.
      </p>
      <div className="flex gap-1.5">
        <button className="btn-ghost flex-1" onClick={() => setOpen(o => !o)}>{open ? 'Hide editor' : 'Edit tokens'}</button>
        <CopyButton text={text} label="Copy JSON" />
      </div>
      {open && (
        <>
          <textarea className="input mt-3 font-mono text-[11px] h-64 py-2 leading-relaxed" value={text}
                    onChange={e => { setText(e.target.value); setMsg(null); }} spellCheck={false} />
          <button className="btn-primary w-full mt-2" onClick={async () => {
            try {
              const parsed = JSON.parse(text);
              await api.put('/settings/tokens', parsed);
              setMsg({ ok: true, text: 'Saved. A backup of the previous file is at design-tokens.backup.json.' });
              onSaved();
            } catch (e: any) {
              setMsg({ ok: false, text: e?.message ?? String(e) });
            }
          }}>Save tokens</button>
          {msg && <p className={`mt-2 text-[12px] ${msg.ok ? 'text-state-good' : 'text-state-critical'}`}>{msg.text}</p>}
        </>
      )}
    </Card>
  );
}
