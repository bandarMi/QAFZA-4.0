/**
 * Engagement Hours — the automation surface.
 * Shows what the engine derived, from what basis, what still needs verifying,
 * and lets a council lead override or sign off without leaving the page.
 */
import { useState } from 'react';
import { useApp, useData } from '../state';
import { useI18n } from '../i18n';
import { FilterBar } from '../components/FilterBar';
import { Chart, Provenance } from '../components/Chart';
import { Card, Badge, Stat, Skeleton, ErrorBox, Toggle, Modal, Empty } from '../components/ui';
import { api, qs } from '../lib/api';
import { hours, monthLabel, nf, pct } from '../lib/format';

export function Engagement() {
  const { query, filters, navigate } = useApp();
  const { t } = useI18n();
  const [tab, setTab] = useState('summary');
  const { data, loading, error, reload } = useData<any>(`/engagement/summary${query}`);
  const kpi = useData<any>(`/overview${query}`);

  if (error) return <ErrorBox message={error} onRetry={reload} />;
  const k = kpi.data?.kpis;

  return (
    <>
      <FilterBar />

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 mb-5">
        <Stat label={t.kpi.totalHours} value={hours(k?.totalHours)} />
        <Stat label="Auto-captured" value={pct(k?.autoHoursShare)} tone="accent"
              sub="derived from attendance & QR scans, not hand-logged" />
        <Stat label="Verified" value={pct(k?.verifiedHoursShare)} tone="neutral"
              sub={`${nf(k?.unverifiedEntries)} entries awaiting a council spot-check`} />
        <Stat label={t.kpi.avgHours} value={nf(k?.avgHoursPerMember, 1)} tone="neutral" />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Toggle value={tab} onChange={setTab} options={[
          { value: 'summary', label: 'Summary' },
          { value: 'ledger', label: 'Hour ledger' },
          { value: 'rules', label: 'Rules & automation' },
          { value: 'recognition', label: 'Recognition' },
        ]} />
        <button className="btn-ghost ms-auto" onClick={async () => { await api.post('/engagement/recalculate'); reload(); }}>
          ↻ Recalculate all closed events
        </button>
      </div>

      {tab === 'summary' && (loading && !data ? <Skeleton rows={3} height="h-64" /> : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Chart kind="area" title="Hours over time" rows={data?.byMonth?.rows ?? []} xKey="month"
                 series={[{ key: 'hours', label: 'Hours' }]} unit="h" formatX={monthLabel}
                 note={<Provenance p={data?.byMonth?.provenance} />} />
          <Chart kind="bar" title="Hours by activity type" horizontal rows={data?.byActivity?.rows ?? []}
                 xKey="activity_type" series={[{ key: 'hours', label: 'Hours' }]} unit="h"
                 note={<Provenance p={data?.byActivity?.provenance} />} />
          <Chart kind="bar" title="Hours by cohort" rows={data?.byCohort?.rows ?? []} xKey="cohort_type"
                 series={[{ key: 'hours', label: 'Total hours' }, { key: 'avg_per_member', label: 'Avg per member' }]}
                 unit="h" height={220} note={<Provenance p={data?.byCohort?.provenance} />} />
          <Chart kind="bar" title="Hours by pillar" horizontal height={200} rows={data?.byPillar?.rows ?? []}
                 xKey="pillar" series={[{ key: 'hours', label: 'Hours' }]} unit="h"
                 note={<Provenance p={data?.byPillar?.provenance} />} />

          <Card title="Engagement leaderboard" className="lg:col-span-2" pad={false}
                subtitle="Filterable by every dimension in the filter bar, including an hours range">
            <div className="scroll-x max-h-96 overflow-y-auto">
              <table className="w-full border-collapse">
                <thead className="sticky top-0 bg-surface-raised"><tr>
                  <th className="th">#</th><th className="th">Member</th><th className="th">Cohort</th>
                  <th className="th">Sector</th><th className="th text-end">Hours</th>
                  <th className="th text-end">Given</th><th className="th text-end">Verified</th><th className="th text-end">Entries</th>
                </tr></thead>
                <tbody>
                  {(data?.leaderboard?.rows ?? []).map((r: any, i: number) => (
                    <tr key={r.member_id} className="hover:bg-surface-sunken/60 cursor-pointer" onClick={() => navigate(`/members/${r.member_id}`)}>
                      <td className="td tabular-nums text-ink-muted">{i + 1}</td>
                      <td className="td font-medium text-ink-primary">{r.name}</td>
                      <td className="td">{r.cohort_type}</td>
                      <td className="td">{r.sector ?? '—'}</td>
                      <td className="td text-end tabular-nums font-semibold text-brand-primary">{hours(r.hours)}</td>
                      <td className="td text-end tabular-nums">{hours(r.hours_given)}</td>
                      <td className="td text-end tabular-nums">{hours(r.verified_hours)}</td>
                      <td className="td text-end tabular-nums">{nf(r.entries)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Chart kind="stacked-bar" title="Cohort mix per initiative" className="lg:col-span-2"
                 rows={pivotCohort(data?.byCohortInitiative?.rows ?? [])} xKey="initiative"
                 series={[{ key: '2030 Leader', label: '2030 Leaders' }, { key: 'Misk Fellow', label: 'Misk Fellows' }]}
                 unit="h" horizontal height={340} note={<Provenance p={data?.byCohortInitiative?.provenance} />} />
        </div>
      ))}

      {tab === 'ledger' && <Ledger />}
      {tab === 'rules' && <Rules />}
      {tab === 'recognition' && <Recognition />}
    </>
  );
}

function pivotCohort(rows: any[]) {
  const byInit: Record<string, any> = {};
  for (const r of rows) {
    byInit[r.initiative] ??= { initiative: r.initiative, '2030 Leader': 0, 'Misk Fellow': 0 };
    byInit[r.initiative][r.cohort_type] = r.hours;
  }
  return Object.values(byInit);
}

/** The verification / audit surface. */
function Ledger() {
  const { filters } = useApp();
  const { t } = useI18n();
  const [verified, setVerified] = useState('all');
  const [selected, setSelected] = useState<number[]>([]);
  const [override, setOverride] = useState<any>(null);
  const path = `/engagement/logs${qs(filters as any, { limit: 200, verified: verified === 'all' ? undefined : verified })}`;
  const { data, loading, reload } = useData<any>(path, [verified]);

  const basisTone = (src: string) => (src === 'qr' ? 'good' : src === 'auto-calculated' ? 'brand' : src === 'imported' ? 'info' : 'neutral') as any;

  return (
    <Card title="Engagement-hour ledger"
          subtitle="Every entry keeps its source and verification state. Auto entries are never silently overwritten once a human has touched them."
          actions={<>
            <Toggle value={verified} onChange={setVerified} options={[
              { value: 'all', label: 'All' }, { value: 'false', label: t.common.unverified }, { value: 'true', label: t.common.verified }]} />
            <button className="btn-primary" disabled={!selected.length}
                    onClick={async () => { await api.post('/engagement/verify', { ids: selected, verified: true }); setSelected([]); reload(); }}>
              ✓ {t.common.verify} {selected.length || ''}
            </button>
          </>} pad={false}>
      {loading && !data ? <div className="p-4"><Skeleton rows={6} height="h-8" /></div> : !data?.rows?.length ? (
        <Empty title="No entries" body="Nothing matches the current filters." />
      ) : (
        <div className="scroll-x max-h-[560px] overflow-y-auto">
          <table className="w-full border-collapse">
            <thead className="sticky top-0 bg-surface-raised"><tr>
              <th className="th w-8"><input type="checkbox" className="accent-[var(--sls-brand-primary)]"
                    checked={!!data.rows.length && selected.length === data.rows.length}
                    onChange={e => setSelected(e.target.checked ? data.rows.map((r: any) => r.id) : [])} /></th>
              <th className="th">Date</th><th className="th">Member</th><th className="th">Activity</th>
              <th className="th">Initiative</th><th className="th text-end">Hours</th>
              <th className="th">Basis</th><th className="th">{t.common.status}</th><th className="th"></th>
            </tr></thead>
            <tbody>
              {data.rows.map((r: any) => (
                <tr key={r.id} className="hover:bg-surface-sunken/60">
                  <td className="td"><input type="checkbox" className="accent-[var(--sls-brand-primary)]" checked={selected.includes(r.id)}
                        onChange={e => setSelected(s => e.target.checked ? [...s, r.id] : s.filter(x => x !== r.id))} /></td>
                  <td className="td font-mono text-[12px]">{r.date}</td>
                  <td className="td font-medium text-ink-primary">{r.member_name}</td>
                  <td className="td">{r.activity_type}{r.direction !== 'participated' && <span className="text-ink-muted"> ({r.direction})</span>}</td>
                  <td className="td">{r.initiative_name ?? '—'}</td>
                  <td className="td text-end tabular-nums font-semibold">
                    {hours(r.hours)}
                    {r.override_of_hours != null && <span className="block text-[11px] text-ink-muted line-through">{hours(r.override_of_hours)}</span>}
                  </td>
                  <td className="td"><Badge tone={basisTone(r.source)}>{r.source}</Badge></td>
                  <td className="td">{r.verified_flag ? <Badge tone="good">✓ {t.common.verified}</Badge> : <Badge tone="neutral">{t.common.unverified}</Badge>}</td>
                  <td className="td"><button className="btn-quiet text-[12px]" onClick={() => setOverride(r)}>Override</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <OverrideModal log={override} onClose={() => setOverride(null)} onSaved={() => { setOverride(null); reload(); }} />
    </Card>
  );
}

function OverrideModal({ log, onClose, onSaved }: { log: any; onClose: () => void; onSaved: () => void }) {
  const { t } = useI18n();
  const [h, setH] = useState('');
  const [reason, setReason] = useState('');
  const [audit, setAudit] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);

  const loadAudit = async () => { if (log) setAudit(await api.get<any[]>(`/engagement/audit?logId=${log.id}`)); };

  return (
    <Modal open={!!log} onClose={onClose} title={`Override hours — ${log?.member_name ?? ''}`}>
      {log && (
        <>
          <p className="text-[13px] text-ink-secondary mb-3">
            {log.activity_type} on {log.date} · currently <strong>{hours(log.hours)}</strong>
            <span className="block text-[12px] text-ink-muted mt-0.5">{log.notes}</span>
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label className="label">New hours</label>
              <input className="input" type="number" step="0.25" min="0" value={h} onChange={e => setH(e.target.value)} /></div>
            <div><label className="label">Reason</label>
              <input className="input" value={reason} onChange={e => setReason(e.target.value)} placeholder="Left early / extra prep time…" /></div>
          </div>
          <button className="btn-quiet mt-3 text-[12px]" onClick={loadAudit}>Show audit trail</button>
          {!!audit.length && (
            <ul className="mt-2 space-y-1 text-[12px] text-ink-muted max-h-40 overflow-y-auto">
              {audit.map(a => <li key={a.id}><span className="font-mono">{a.created_at}</span> · {a.action} by {a.actor}</li>)}
            </ul>
          )}
          <div className="flex justify-end gap-2 mt-4">
            <button className="btn-ghost" onClick={onClose}>{t.common.cancel}</button>
            <button className="btn-primary" disabled={!h || busy} onClick={async () => {
              setBusy(true);
              try { await api.post(`/engagement/logs/${log.id}/override`, { hours: Number(h), reason }); onSaved(); }
              finally { setBusy(false); }
            }}>{t.common.save}</button>
          </div>
        </>
      )}
    </Modal>
  );
}

/** The rules table — activity type → default hours, editable without code. */
function Rules() {
  const { data, loading, reload } = useData<any[]>('/engagement/rules');
  const [edit, setEdit] = useState<any>(null);

  return (
    <Card title="Activity-type → hours rules"
          subtitle="When an event is closed, every attendee's hours are derived from these rules and the event's own duration. Editing a rule changes future calculations; use Recalculate to reapply to past events."
          actions={<button className="btn-primary" onClick={() => setEdit({ activity_type: '', default_hours: 1, role_multiplier: {}, counts_toward_recognition: 1 })}>+ Add rule</button>}
          pad={false}>
      {loading ? <div className="p-4"><Skeleton rows={4} height="h-9" /></div> : (
        <div className="scroll-x">
          <table className="w-full border-collapse">
            <thead><tr>
              <th className="th">Activity type</th><th className="th text-end">Default hours</th>
              <th className="th">Role multipliers</th><th className="th">Counts for recognition</th>
              <th className="th">Notes</th><th className="th"></th>
            </tr></thead>
            <tbody>
              {(data ?? []).map(r => (
                <tr key={r.activity_type}>
                  <td className="td font-medium text-ink-primary">{r.activity_type}</td>
                  <td className="td text-end tabular-nums font-semibold">{r.default_hours}h</td>
                  <td className="td font-mono text-[12px]">{Object.entries(JSON.parse(r.role_multiplier || '{}')).map(([k, v]) => `${k}×${v}`).join(', ') || '—'}</td>
                  <td className="td">{r.counts_toward_recognition ? '✓' : '—'}</td>
                  <td className="td max-w-md whitespace-normal text-[12px]">{r.description}</td>
                  <td className="td"><button className="btn-quiet text-[12px]" onClick={() => setEdit({ ...r, role_multiplier: JSON.parse(r.role_multiplier || '{}') })}>Edit</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <RuleModal rule={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload(); }} />
    </Card>
  );
}

function RuleModal({ rule, onClose, onSaved }: { rule: any; onClose: () => void; onSaved: () => void }) {
  const { t } = useI18n();
  const [f, setF] = useState<any>(rule);
  const [err, setErr] = useState<string | null>(null);
  if (rule && f?.activity_type !== rule.activity_type && f?.__id !== rule.activity_type) {
    // reset the form when a different rule is opened
    setF({ ...rule, __id: rule.activity_type });
  }
  const set = (k: string, v: any) => setF((s: any) => ({ ...s, [k]: v }));

  return (
    <Modal open={!!rule} onClose={onClose} title={rule?.activity_type ? `Edit rule — ${rule.activity_type}` : 'Add a rule'}>
      {f && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label className="label">Activity type *</label>
              <input className="input" value={f.activity_type ?? ''} disabled={!!rule?.activity_type}
                     onChange={e => set('activity_type', e.target.value)} /></div>
            <div><label className="label">Default hours *</label>
              <input className="input" type="number" step="0.25" min="0" value={f.default_hours ?? ''}
                     onChange={e => set('default_hours', Number(e.target.value))} /></div>
            <div className="sm:col-span-2"><label className="label">Role multipliers (JSON)</label>
              <input className="input font-mono" value={JSON.stringify(f.role_multiplier ?? {})}
                     onChange={e => { try { set('role_multiplier', JSON.parse(e.target.value)); setErr(null); } catch { setErr('Role multipliers must be valid JSON, e.g. {"speaker":1.5}'); } }} /></div>
            <div className="sm:col-span-2"><label className="label">Description</label>
              <input className="input" value={f.description ?? ''} onChange={e => set('description', e.target.value)} /></div>
            <label className="flex items-center gap-2 text-[13px] sm:col-span-2">
              <input type="checkbox" className="accent-[var(--sls-brand-primary)]" checked={!!f.counts_toward_recognition}
                     onChange={e => set('counts_toward_recognition', e.target.checked ? 1 : 0)} />
              Counts toward recognition thresholds
            </label>
          </div>
          {err && <p className="mt-3 text-[12px] text-state-critical">{err}</p>}
          <div className="flex justify-end gap-2 mt-4">
            <button className="btn-ghost" onClick={onClose}>{t.common.cancel}</button>
            <button className="btn-primary" disabled={!f.activity_type || !!err}
                    onClick={async () => { await api.put(`/engagement/rules/${encodeURIComponent(f.activity_type)}`, f); onSaved(); }}>
              {t.common.save}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}

function Recognition() {
  const { navigate } = useApp();
  const { data, loading, reload } = useData<any>('/recognition');
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<any>({ threshold_hours: 50, period: 'calendar_year' });

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="Recognition thresholds"
            subtitle="Members crossing a threshold are flagged automatically — this is what feeds the “members recognised” reporting metric."
            actions={<button className="btn-primary" onClick={() => setAdding(true)}>+ Rule</button>} pad={false}>
        {loading ? <div className="p-4"><Skeleton rows={3} height="h-9" /></div> : (
          <table className="w-full border-collapse">
            <thead><tr><th className="th">Rule</th><th className="th text-end">Threshold</th><th className="th">Period</th><th className="th text-end">Flagged</th></tr></thead>
            <tbody>
              {(data?.byRule ?? []).map((r: any) => (
                <tr key={r.rule_id}>
                  <td className="td font-medium text-ink-primary">{r.name}</td>
                  <td className="td text-end tabular-nums">{r.threshold_hours}h</td>
                  <td className="td">{String(r.period).replace('_', ' ')}</td>
                  <td className="td text-end tabular-nums font-semibold text-brand-primary">{nf(r.flagged)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="px-4 py-3 text-[12px] text-ink-muted border-t border-line-subtle">
          <strong>{nf(data?.distinctMembersFlagged)}</strong> distinct members have met at least one threshold.
        </p>
      </Card>

      <Card title="Flagged members" pad={false}>
        <div className="scroll-x max-h-96 overflow-y-auto">
          <table className="w-full border-collapse">
            <thead className="sticky top-0 bg-surface-raised"><tr>
              <th className="th">Member</th><th className="th">Rule</th><th className="th">Period</th>
              <th className="th text-end">Hours</th><th className="th">Status</th></tr></thead>
            <tbody>
              {(data?.flags ?? []).map((f: any) => (
                <tr key={f.id} className="hover:bg-surface-sunken/60 cursor-pointer" onClick={() => navigate(`/members/${f.member_id}`)}>
                  <td className="td font-medium text-ink-primary">{f.member_name}</td>
                  <td className="td">{f.rule_name}</td>
                  <td className="td">{f.period_label}</td>
                  <td className="td text-end tabular-nums">{hours(f.hours_at_flag)}</td>
                  <td className="td">
                    <select className="input h-7 text-[12px]" value={f.status} onClick={e => e.stopPropagation()}
                            onChange={async e => { await api.post(`/recognition/flags/${f.id}/status`, { status: e.target.value }); reload(); }}>
                      {['flagged', 'confirmed', 'recognised', 'dismissed'].map(s => <option key={s}>{s}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal open={adding} onClose={() => setAdding(false)} title="Add a recognition rule">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2"><label className="label">Name *</label>
            <input className="input" value={form.name ?? ''} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
          <div><label className="label">Threshold hours *</label>
            <input className="input" type="number" value={form.threshold_hours} onChange={e => setForm({ ...form, threshold_hours: Number(e.target.value) })} /></div>
          <div><label className="label">Period</label>
            <select className="input" value={form.period} onChange={e => setForm({ ...form, period: e.target.value })}>
              <option value="calendar_year">calendar year</option><option value="rolling_12m">rolling 12 months</option><option value="all_time">all time</option>
            </select></div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button className="btn-ghost" onClick={() => setAdding(false)}>Cancel</button>
          <button className="btn-primary" disabled={!form.name}
                  onClick={async () => { await api.post('/recognition/rules', form); setAdding(false); reload(); }}>Save</button>
        </div>
      </Modal>
    </div>
  );
}
