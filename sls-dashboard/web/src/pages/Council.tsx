/** Council ownership view — a personal cockpit per council role. */
import { useState } from 'react';
import { useApp, useData } from '../state';
import { FilterBar } from '../components/FilterBar';
import { Chart } from '../components/Chart';
import { Card, Stat, Badge, Skeleton, ErrorBox } from '../components/ui';
import { hours, monthLabel, nf, pct } from '../lib/format';

export function Council() {
  const { boot, query } = useApp();
  const roles: string[] = boot?.options?.councilRoles ?? [];
  const [role, setRole] = useState<string>('');
  const active = role || roles[0] || '';
  const { data, loading, error, reload } = useData<any>(active ? `/council/${encodeURIComponent(active)}${query}` : null, [active, query]);

  if (error) return <ErrorBox message={error} onRetry={reload} />;

  return (
    <>
      <FilterBar />
      <div className="flex flex-wrap gap-1.5 mb-4">
        {roles.map(r => (
          <button key={r} onClick={() => setRole(r)}
            className={`chip ${r === active ? 'bg-brand text-brand-on border-transparent' : 'border-line text-ink-secondary hover:bg-surface-sunken'}`}>
            {r}
          </button>
        ))}
      </div>

      {loading && !data ? <Skeleton rows={3} height="h-40" /> : data && (
        <>
          <Card title={active} subtitle={data.council ? `${data.council.name} · term ${data.council.term_start ?? '—'} → ${data.council.term_end ?? '—'}` : 'No council member assigned to this role'}
                className="mb-4">
            <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
              <Stat label="Owned initiatives" value={nf(data.initiatives.length)} />
              <Stat label="Engagement hours" value={hours(data.kpis.totalHours)} tone="accent" />
              <Stat label="Events" value={nf(data.kpis.events)} tone="neutral" />
              <Stat label="Members engaged" value={nf(data.kpis.engagedMembers)} tone="neutral" />
            </div>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2 mb-4">
            <Chart kind="area" title="Hours over time — this portfolio" rows={data.hoursByMonth} xKey="month"
                   series={[{ key: 'hours', label: 'Hours' }]} unit="h" formatX={monthLabel} />
            <Chart kind="bar" title="Hours by owned initiative" horizontal rows={data.initiatives} xKey="name"
                   series={[{ key: 'hours', label: 'Hours' }]} unit="h" height={260} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="Owned initiatives" pad={false}>
              <div className="scroll-x">
                <table className="w-full border-collapse">
                  <thead><tr><th className="th">Initiative</th><th className="th">Pillar</th>
                    <th className="th text-end">Events</th><th className="th text-end">Hours</th><th className="th text-end">Reach</th></tr></thead>
                  <tbody>
                    {data.initiatives.map((i: any) => (
                      <tr key={i.initiative_id}>
                        <td className="td font-medium text-ink-primary">{i.name}</td>
                        <td className="td">{i.pillar}</td>
                        <td className="td text-end tabular-nums">{nf(i.events)}</td>
                        <td className="td text-end tabular-nums font-semibold text-brand-primary">{hours(i.hours)}</td>
                        <td className="td text-end tabular-nums">{pct(i.member_reach_pct, 1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            <Card title="Alerts for this portfolio" pad={false}>
              {!data.alerts.length ? (
                <p className="p-4 text-[13px] text-ink-muted">Nothing needs attention right now.</p>
              ) : (
                <ul className="divide-y divide-line-subtle">
                  {data.alerts.map((a: any) => (
                    <li key={a.id} className="flex items-start gap-3 px-4 py-2.5">
                      <Badge tone={a.severity === 'serious' ? 'serious' : a.severity === 'warning' ? 'warning' : 'info'}>{a.severity}</Badge>
                      <div className="min-w-0">
                        <p className="text-[13px] font-medium text-ink-primary">{a.title}</p>
                        <p className="text-[12px] text-ink-muted leading-snug">{a.detail}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </>
      )}
    </>
  );
}
