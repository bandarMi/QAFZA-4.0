import { useApp, useData } from '../state';
import { useI18n } from '../i18n';
import { FilterBar } from '../components/FilterBar';
import { Chart, Provenance } from '../components/Chart';
import { Card, Stat, Badge, Empty, Skeleton, ErrorBox } from '../components/ui';
import { api } from '../lib/api';
import { hours, monthLabel, nf, pct } from '../lib/format';

export function Overview() {
  const { query, boot, navigate } = useApp();
  const { t } = useI18n();
  const { data, loading, error, reload } = useData<any>(`/overview${query}`);

  if (error) return <ErrorBox message={error} onRetry={reload} />;

  const k = data?.kpis;
  const tone = (sev: string) => (sev === 'critical' ? 'critical' : sev === 'serious' ? 'serious' : sev === 'warning' ? 'warning' : 'info') as any;

  return (
    <>
      <FilterBar />

      {loading && !data ? <Skeleton rows={4} height="h-24" /> : (
        <>
          {/* KPI band ------------------------------------------------------- */}
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 mb-5">
            <Stat label={t.kpi.totalMembers} value={nf(k?.totalMembers)}
                  sub={`${nf(k?.leaders2030)} ${t.kpi.leaders2030} · ${nf(k?.miskFellows)} ${t.kpi.miskFellows}`} />
            <Stat label={t.kpi.onboarded} value={nf(k?.membersOnboarded)} sub={t.overview.inPeriod} tone="accent" />
            <Stat label={t.kpi.totalHours} value={hours(k?.totalHours)} sub={`${pct(k?.autoHoursShare)} ${t.kpi.autoShare}`} />
            <Stat label={t.kpi.avgHours} value={nf(k?.avgHoursPerMember, 1)} sub={`${nf(k?.avgHoursPerEngagedMember, 1)}h ${t.overview.perEngaged}`} tone="neutral" />
            <Stat label={t.kpi.engagedMembers} value={nf(k?.engagedMembers)} sub={`${pct(k?.totalMembers ? (k.engagedMembers / k.totalMembers) * 100 : 0)} ${t.overview.ofMembers}`} tone="neutral" />
            <Stat label={t.kpi.events} value={nf(k?.events)} sub={`${nf(k?.eventAttendees)} ${t.kpi.attendees}`} tone="neutral" />
            <Stat label={t.kpi.satisfaction} value={k?.avgSatisfaction != null ? `${nf(k.avgSatisfaction, 2)}/5` : '—'} tone="neutral" />
            <Stat label={t.kpi.startups} value={nf(k?.startupsSupported)} tone="neutral" />
            <Stat label={t.kpi.recognised} value={nf(k?.membersRecognised)} sub={t.overview.metThreshold} tone="accent" />
            <Stat label={t.kpi.verified} value={pct(k?.verifiedHoursShare)}
                  sub={`${nf(k?.unverifiedEntries)} ${t.overview.awaitingSignoff}`} tone="neutral" />
          </div>

          {/* Alerts --------------------------------------------------------- */}
          {!!data?.alerts?.length && (
            <Card title={t.overview.alertsTitle}
                  subtitle={t.overview.alertsSubtitle}
                  actions={<button className="btn-ghost" onClick={async () => { await api.post('/alerts/run'); reload(); }}>{t.overview.rerun}</button>}
                  className="mb-5" pad={false}>
              <ul className="divide-y divide-line-subtle max-h-72 overflow-y-auto">
                {data.alerts.map((a: any) => (
                  <li key={a.id} className="flex items-start gap-3 px-4 py-2.5">
                    <Badge tone={tone(a.severity)}>{a.severity}</Badge>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-medium text-ink-primary">{a.title}</p>
                      <p className="text-[12px] text-ink-muted leading-snug">{a.detail}</p>
                    </div>
                    <button className="btn-quiet text-[12px] shrink-0"
                            onClick={async () => { await api.post(`/alerts/${a.id}/status`, { status: 'acknowledged' }); reload(); }}>
                      {t.overview.acknowledge}
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {/* Charts --------------------------------------------------------- */}
          <div className="grid gap-4 lg:grid-cols-2 mb-4">
            <Chart kind="area" title={t.overview.hoursOverTime} rows={data?.hoursByMonth?.rows ?? []}
                   xKey="month" series={[{ key: 'hours', label: 'Hours' }]} unit="h" formatX={monthLabel}
                   note={<Provenance p={data?.hoursByMonth?.provenance} />} />
            <Chart kind="bar" title={t.overview.hoursByPillar} rows={data?.hoursByPillar?.rows ?? []}
                   xKey="pillar" series={[{ key: 'hours', label: 'Hours' }]} unit="h" horizontal height={220}
                   note={<Provenance p={data?.hoursByPillar?.provenance} />} />
            <Chart kind="bar" title={t.overview.hoursByActivity}
                   subtitle={t.overview.activityNote}
                   rows={data?.hoursByActivity?.rows ?? []} xKey="activity_type"
                   series={[{ key: 'hours', label: 'Hours' }]} unit="h" horizontal
                   note={<Provenance p={data?.hoursByActivity?.provenance} />} />
            <Chart kind="donut" title={t.overview.hoursByCohort} rows={data?.hoursByCohort?.rows ?? []}
                   xKey="cohort_type" series={[{ key: 'hours', label: 'Hours' }]} unit="h"
                   note={<Provenance p={data?.hoursByCohort?.provenance} />} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card title={t.overview.initiativesTitle} subtitle={t.overview.initiativesSubtitle}
                  actions={<button className="btn-quiet" onClick={() => navigate('/initiatives')}>{t.common.open} →</button>} pad={false}>
              <div className="scroll-x max-h-80 overflow-y-auto">
                <table className="w-full border-collapse">
                  <thead className="sticky top-0 bg-surface-raised"><tr>
                    <th className="th">{t.overview.colInitiative}</th><th className="th">{t.overview.colPillar}</th>
                    <th className="th text-end">{t.overview.colHours}</th><th className="th text-end">{t.overview.colEvents}</th><th className="th text-end">{t.overview.colReach}</th>
                  </tr></thead>
                  <tbody>
                    {(data?.initiatives?.rows ?? []).map((r: any) => (
                      <tr key={r.initiative_id} className="hover:bg-surface-sunken/60">
                        <td className="td font-medium text-ink-primary">{r.name}</td>
                        <td className="td">
                          <span className="inline-flex items-center gap-1.5">
                            <i className="w-2 h-2 rounded-sm inline-block" style={{ background: boot?.tokens?.color?.pillar?.[r.pillar] ?? 'var(--sls-status-neutral)' }} />
                            {r.pillar}
                          </span>
                        </td>
                        <td className="td text-end tabular-nums">{hours(r.hours)}</td>
                        <td className="td text-end tabular-nums">{nf(r.events)}</td>
                        <td className="td text-end tabular-nums">{pct(r.member_reach_pct, 1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            <Card title={t.overview.leaderboardTitle} subtitle={t.overview.leaderboardSubtitle}
                  actions={<button className="btn-quiet" onClick={() => navigate('/engagement')}>{t.common.open} →</button>} pad={false}>
              <div className="scroll-x max-h-80 overflow-y-auto">
                <table className="w-full border-collapse">
                  <thead className="sticky top-0 bg-surface-raised"><tr>
                    <th className="th">#</th><th className="th">{t.overview.colMember}</th><th className="th">{t.overview.colCohort}</th><th className="th text-end">{t.overview.colHours}</th>
                  </tr></thead>
                  <tbody>
                    {(data?.leaderboard?.rows ?? []).map((r: any, i: number) => (
                      <tr key={r.member_id} className="hover:bg-surface-sunken/60 cursor-pointer" onClick={() => navigate(`/members/${r.member_id}`)}>
                        <td className="td tabular-nums text-ink-muted">{i + 1}</td>
                        <td className="td font-medium text-ink-primary">{r.name}<span className="block text-[11px] text-ink-muted">{r.company}</span></td>
                        <td className="td">{r.cohort_type}</td>
                        <td className="td text-end tabular-nums font-semibold text-brand-primary">{hours(r.hours)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>

          {/* Pinned AI answers ---------------------------------------------- */}
          {!!data?.pinned?.length && (
            <div className="mt-4">
              <h3 className="text-[13px] font-semibold text-ink-secondary mb-2.5">📌 {t.overview.pinnedTitle}</h3>
              <div className="grid gap-4 lg:grid-cols-2">
                {data.pinned.map((p: any) => {
                  const spec = JSON.parse(p.spec);
                  return (
                    <Chart key={p.id} kind={spec.kind} title={p.title} rows={spec.rows ?? []}
                           xKey={spec.xKey} series={spec.series ?? []} unit={spec.unit} note={spec.note} height={200}
                           actions={<button className="btn-quiet" onClick={async () => { await api.del(`/pins/${p.id}`); reload(); }}>✕</button>} />
                  );
                })}
              </div>
            </div>
          )}

          {!loading && !data?.kpis?.totalMembers && (
            <Empty title={t.overview.noData} body={t.overview.noDataBody}
                   action={<button className="btn-primary" onClick={() => navigate('/ingest')}>{t.overview.goIngest}</button>} />
          )}
        </>
      )}
    </>
  );
}
