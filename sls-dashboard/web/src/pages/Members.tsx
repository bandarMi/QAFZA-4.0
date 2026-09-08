import { useState } from 'react';
import { useApp, useData } from '../state';
import { useI18n } from '../i18n';
import { FilterBar } from '../components/FilterBar';
import { Card, Badge, Modal, Skeleton, ErrorBox, Empty } from '../components/ui';
import { Chart } from '../components/Chart';
import { api, qs } from '../lib/api';
import { hours, monthLabel, nf } from '../lib/format';

export function Members() {
  const { query, filters, navigate } = useApp();
  const { t } = useI18n();
  const [q, setQ] = useState('');
  const [page, setPage] = useState(0);
  const [adding, setAdding] = useState(false);
  const limit = 50;

  const path = `/members${qs(filters as any, { q: q || undefined, limit, offset: page * limit })}`;
  const { data, loading, error, reload } = useData<any>(path, [query, q, page]);

  if (error) return <ErrorBox message={error} onRetry={reload} />;

  return (
    <>
      <FilterBar />
      <Card
        title={`${t.nav.members}${data ? ` — ${nf(data.total)}` : ''}`}
        subtitle="Hours shown are within the selected date range. Click a member for their journey and ledger."
        actions={<>
          <input className="input w-52" placeholder={t.common.search} value={q}
                 onChange={e => { setQ(e.target.value); setPage(0); }} />
          <button className="btn-primary" onClick={() => setAdding(true)}>+ {t.common.add}</button>
        </>}
        pad={false}
      >
        {loading && !data ? <div className="p-4"><Skeleton rows={6} height="h-9" /></div> : !data?.rows?.length ? (
          <Empty title="No members match" body="Try clearing the filters or the search box." />
        ) : (
          <>
            <div className="scroll-x">
              <table className="w-full border-collapse">
                <thead><tr>
                  <th className="th">Member</th><th className="th">Cohort</th><th className="th">Sector</th>
                  <th className="th">Company</th><th className="th">Mentor</th><th className="th">Status</th>
                  <th className="th text-end">Hours</th><th className="th text-end">Recognition</th>
                </tr></thead>
                <tbody>
                  {data.rows.map((m: any) => (
                    <tr key={m.id} className="hover:bg-surface-sunken/60 cursor-pointer" onClick={() => navigate(`/members/${m.id}`)}>
                      <td className="td">
                        <span className="font-medium text-ink-primary">{m.name}</span>
                        <span className="block text-[11px] text-ink-muted font-mono">{m.member_code}</span>
                      </td>
                      <td className="td">{m.cohort_type}</td>
                      <td className="td">{m.sector ?? '—'}</td>
                      <td className="td">{m.company ?? '—'}</td>
                      <td className="td">{m.mentor_name ?? '—'}</td>
                      <td className="td"><Badge tone={m.status === 'active' ? 'good' : 'neutral'}>{m.status}</Badge></td>
                      <td className="td text-end tabular-nums font-semibold text-brand-primary">{hours(m.total_hours)}</td>
                      <td className="td text-end tabular-nums">{m.recognition_count > 0 ? `★ ${m.recognition_count}` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between px-4 py-2.5 border-t border-line-subtle">
              <p className="text-[12px] text-ink-muted">
                {t.common.showing} {page * limit + 1}–{Math.min((page + 1) * limit, data.total)} {t.common.of} {nf(data.total)}
              </p>
              <div className="flex gap-1.5">
                <button className="btn-ghost" disabled={page === 0} onClick={() => setPage(p => p - 1)}>←</button>
                <button className="btn-ghost" disabled={(page + 1) * limit >= data.total} onClick={() => setPage(p => p + 1)}>→</button>
              </div>
            </div>
          </>
        )}
      </Card>

      <AddMemberModal open={adding} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); reload(); }} />
    </>
  );
}

function AddMemberModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const { boot } = useApp();
  const { t } = useI18n();
  const [form, setForm] = useState<any>({ cohort_type: '2030 Leader', status: 'active' });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  const save = async () => {
    setBusy(true); setErr(null);
    try { await api.post('/members', form); setForm({ cohort_type: '2030 Leader', status: 'active' }); onSaved(); }
    catch (e: any) { setErr(e?.message ?? String(e)); }
    finally { setBusy(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title="Add a member">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2"><label className="label">Full name *</label>
          <input className="input" value={form.name ?? ''} onChange={e => set('name', e.target.value)} /></div>
        <div><label className="label">Cohort *</label>
          <select className="input" value={form.cohort_type} onChange={e => set('cohort_type', e.target.value)}>
            <option>2030 Leader</option><option>Misk Fellow</option>
          </select></div>
        <div><label className="label">Member code</label>
          <input className="input font-mono" placeholder="auto" value={form.member_code ?? ''} onChange={e => set('member_code', e.target.value)} /></div>
        <div><label className="label">Sector</label>
          <select className="input" value={form.sector ?? ''} onChange={e => set('sector', e.target.value)}>
            <option value="">—</option>{(boot?.options?.sectors ?? []).map((s: string) => <option key={s}>{s}</option>)}
          </select></div>
        <div><label className="label">Company</label>
          <input className="input" value={form.company ?? ''} onChange={e => set('company', e.target.value)} /></div>
        <div><label className="label">Title</label>
          <input className="input" value={form.title ?? ''} onChange={e => set('title', e.target.value)} /></div>
        <div><label className="label">Email</label>
          <input className="input" type="email" value={form.email ?? ''} onChange={e => set('email', e.target.value)} /></div>
        <div><label className="label">SLS join date</label>
          <input className="input" type="date" value={form.join_date ?? ''} onChange={e => set('join_date', e.target.value)} /></div>
        <div><label className="label">LinkedIn URL</label>
          <input className="input" value={form.linkedin_url ?? ''} onChange={e => set('linkedin_url', e.target.value)} /></div>
      </div>
      {err && <p className="mt-3 text-[12px] text-state-critical">{err}</p>}
      <div className="flex justify-end gap-2 mt-4">
        <button className="btn-ghost" onClick={onClose}>{t.common.cancel}</button>
        <button className="btn-primary" onClick={save} disabled={busy || !form.name}>{t.common.save}</button>
      </div>
    </Modal>
  );
}

/** Member Journey Timeline — graduation → onboarding → initiatives → mentorship → hours → startups. */
export function MemberDetail({ id }: { id: number }) {
  const { navigate, boot } = useApp();
  const { t } = useI18n();
  const { data, loading, error, reload } = useData<any>(`/members/${id}`);

  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (loading || !data) return <Skeleton rows={5} height="h-24" />;

  const m = data.member;
  const led = data.ledger;
  const kindIcon: Record<string, string> = {
    graduation: '🎓', onboarding: '◈', initiative: '❖', mentorship: '⇄',
    startup: '▲', recognition: '★', linkedin: '◎',
  };

  return (
    <>
      <button className="btn-quiet mb-3" onClick={() => navigate('/members')}>← {t.nav.members}</button>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title={m.name} subtitle={`${m.member_code} · ${m.cohort_type}`} className="lg:col-span-1">
          <dl className="space-y-2 text-[13px]">
            {[['Sector', m.sector], ['Company', m.company], ['Title', m.title], ['Region', m.region],
              ['Joined SLS', m.join_date], ['Graduated', m.graduation_date], ['Mentor', m.mentor_name],
              ['Status', m.status]].map(([k, v]) => (
              <div key={k as string} className="flex justify-between gap-3">
                <dt className="text-ink-muted">{k}</dt>
                <dd className="text-ink-primary font-medium text-end">{(v as string) ?? '—'}</dd>
              </div>
            ))}
          </dl>
          {m.linkedin_url && (
            <a className="btn-ghost w-full mt-3" href={m.linkedin_url} target="_blank" rel="noreferrer">LinkedIn ↗</a>
          )}
          <div className="grid grid-cols-2 gap-2 mt-4">
            <div className="p-3 rounded-md bg-brand-softer text-center">
              <p className="text-[11px] uppercase tracking-wide text-ink-muted">{t.common.total}</p>
              <p className="text-xl font-bold text-brand-primary">{hours(led.totals.total_hours)}</p>
            </div>
            <div className="p-3 rounded-md bg-surface-sunken text-center">
              <p className="text-[11px] uppercase tracking-wide text-ink-muted">Auto-captured</p>
              <p className="text-xl font-bold text-ink-primary">{led.totals.auto_share}%</p>
            </div>
          </div>
          {led.yoy.deltaPct != null && (
            <p className="mt-3 text-[12px] text-ink-secondary">
              {led.yoy.year}: <strong>{hours(led.yoy.current)}</strong> vs {hours(led.yoy.previous)} in {led.yoy.year - 1}
              <span className={led.yoy.deltaPct >= 0 ? 'text-state-good ms-1.5' : 'text-state-serious ms-1.5'}>
                {led.yoy.deltaPct >= 0 ? '▲' : '▼'} {Math.abs(led.yoy.deltaPct)}%
              </span>
            </p>
          )}
          {!!data.recognition?.length && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {data.recognition.map((r: any) => <Badge key={r.id} tone="warning">★ {r.rule_name}</Badge>)}
            </div>
          )}
        </Card>

        <div className="lg:col-span-2 space-y-4">
          <Chart kind="area" title="Engagement hours by month" rows={led.byMonth} xKey="month"
                 series={[{ key: 'hours', label: 'Hours' }, { key: 'cumulative', label: 'Running total' }]}
                 unit="h" formatX={monthLabel} height={220} />
          <Chart kind="bar" title="Hours by category" horizontal height={200}
                 rows={led.byCategory.map((c: any) => ({ ...c, label: `${c.activity_type}${c.direction !== 'participated' ? ` (${c.direction})` : ''}` }))}
                 xKey="label" series={[{ key: 'hours', label: 'Hours' }]} unit="h" />
        </div>
      </div>

      <Card title="Member journey" subtitle="Graduation → onboarding → initiatives → mentorship → hours → startups → recognition"
            className="mt-4" pad={false}>
        <ol className="relative ps-8 pe-4 py-4">
          <span className="absolute start-[19px] top-4 bottom-4 w-px bg-line" />
          {data.timeline.map((e: any, i: number) => (
            <li key={i} className="relative pb-4 last:pb-0">
              <span className="absolute -start-[26px] top-0.5 w-6 h-6 rounded-full bg-surface-raised border border-line flex items-center justify-center text-[11px]">
                {kindIcon[e.kind] ?? '•'}
              </span>
              <div className="flex flex-wrap items-baseline gap-2">
                <p className="text-[13px] font-medium text-ink-primary">{e.title}</p>
                <span className="text-[11px] text-ink-muted font-mono">{e.date}</span>
                {e.pillar && <i className="w-2 h-2 rounded-sm" style={{ background: boot?.tokens?.color?.pillar?.[e.pillar] }} />}
              </div>
              {e.detail && <p className="text-[12px] text-ink-muted mt-0.5 leading-snug">{e.detail}</p>}
              {e.url && <a className="text-[12px] text-state-info" href={e.url} target="_blank" rel="noreferrer">View post ↗</a>}
            </li>
          ))}
        </ol>
      </Card>
    </>
  );
}
