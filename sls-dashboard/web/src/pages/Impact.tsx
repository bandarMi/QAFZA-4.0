import { useState } from 'react';
import { useApp, useData } from '../state';
import { FilterBar } from '../components/FilterBar';
import { Chart, Provenance } from '../components/Chart';
import { Card, Badge, Skeleton, ErrorBox, Toggle, Stat } from '../components/ui';
import { hours, nf } from '../lib/format';

export function Impact() {
  const { query, navigate } = useApp();
  const [tab, setTab] = useState('startups');
  const { data, loading, error, reload } = useData<any>(`/impact${query}`);
  const challenge = useData<any>('/challenge');

  if (error) return <ErrorBox message={error} onRetry={reload} />;

  const bySectorTotal = Object.entries(
    (data?.bySector ?? []).reduce((acc: Record<string, number>, r: any) => {
      acc[r.sector] = (acc[r.sector] ?? 0) + r.startups; return acc;
    }, {}),
  ).map(([sector, startups]) => ({ sector, startups })).sort((a: any, b: any) => b.startups - a.startups);

  const byYear = Object.entries(
    (data?.bySector ?? []).reduce((acc: Record<string, number>, r: any) => {
      acc[r.year] = (acc[r.year] ?? 0) + r.startups; return acc;
    }, {}),
  ).map(([year, startups]) => ({ year, startups })).sort((a: any, b: any) => String(a.year).localeCompare(String(b.year)));

  return (
    <>
      <FilterBar />
      <Toggle value={tab} onChange={setTab} options={[
        { value: 'startups', label: 'Startups & metrics' },
        { value: 'challenge', label: 'Impact Challenge leaderboard' }]} />

      {tab === 'startups' && (loading && !data ? <Skeleton rows={3} height="h-64" /> : (
        <div className="grid gap-4 lg:grid-cols-2 mt-4">
          <Chart kind="bar" title="Startups supported by sector" horizontal height={300}
                 rows={bySectorTotal} xKey="sector" series={[{ key: 'startups', label: 'Startups' }]}
                 note={<Provenance p={data?.provenance} />} />
          <Chart kind="bar" title="Startups supported by year" rows={byYear} xKey="year"
                 series={[{ key: 'startups', label: 'Startups' }]} height={300} />
          <Chart kind="donut" title="By funding stage" rows={data?.byStage ?? []} xKey="funding_stage"
                 series={[{ key: 'startups', label: 'Startups' }]} />
          <Chart kind="bar" title="By support type" horizontal rows={data?.bySupport ?? []} xKey="support_type"
                 series={[{ key: 'startups', label: 'Startups' }]} height={220} />

          <Card title="Reported impact metrics" className="lg:col-span-2"
                subtitle="What was published, with its provenance. These may differ from what the transactional tables now compute — both are shown so the difference is visible rather than hidden."
                pad={false}>
            <div className="scroll-x">
              <table className="w-full border-collapse">
                <thead><tr><th className="th">Period</th><th className="th">Metric</th><th className="th text-end">Value</th>
                  <th className="th">Unit</th><th className="th">Source</th><th className="th">Notes</th></tr></thead>
                <tbody>
                  {(data?.metrics ?? []).map((m: any) => (
                    <tr key={m.id}>
                      <td className="td font-mono text-[12px]">{m.period}</td>
                      <td className="td font-medium text-ink-primary">{m.metric_name}</td>
                      <td className="td text-end tabular-nums font-semibold">{nf(m.value)}</td>
                      <td className="td">{m.unit ?? '—'}</td>
                      <td className="td"><Badge tone={m.source === 'computed' ? 'good' : m.source === 'impact-report' ? 'info' : 'neutral'}>{m.source}</Badge></td>
                      <td className="td max-w-md whitespace-normal text-[12px] text-ink-muted">{m.notes ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      ))}

      {tab === 'challenge' && (
        <div className="mt-4 grid gap-4">
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
            <Stat label="Submissions" value={nf(challenge.data?.rows?.length)} />
            <Stat label="Year" value={challenge.data?.year ?? '—'} tone="neutral" />
            <Stat label="Finalists" value={nf((challenge.data?.rows ?? []).filter((r: any) => ['finalist', 'shortlisted', 'winner'].includes(r.status)).length)} tone="accent" />
            <Stat label="Avg weighted score" value={nf(avg((challenge.data?.rows ?? []).map((r: any) => r.weighted_score)), 2)} tone="neutral" />
          </div>

          <Chart kind="bar" title="Weighted judging score by submission" horizontal height={360}
                 rows={(challenge.data?.rows ?? []).map((r: any) => ({ ...r, label: `${r.project_title} — ${r.team_name}` }))}
                 xKey="label" series={[{ key: 'weighted_score', label: 'Weighted score' }]}
                 note={<Provenance p={challenge.data?.provenance} />} />

          <Card title="Impact Challenge leaderboard"
                subtitle="Weighted judging score alongside each lead member's logged engagement hours for the same year — effort and outcome side by side."
                pad={false}>
            <div className="scroll-x">
              <table className="w-full border-collapse">
                <thead><tr>
                  <th className="th">#</th><th className="th">Project</th><th className="th">Team</th>
                  <th className="th">Lead member</th><th className="th">Pillar</th>
                  <th className="th text-end">Score</th><th className="th text-end">Member hours</th><th className="th">Status</th>
                </tr></thead>
                <tbody>
                  {(challenge.data?.rows ?? []).map((r: any, i: number) => (
                    <tr key={r.id} className="hover:bg-surface-sunken/60">
                      <td className="td tabular-nums text-ink-muted">{i + 1}</td>
                      <td className="td font-medium text-ink-primary">{r.project_title}</td>
                      <td className="td">{r.team_name}</td>
                      <td className="td">
                        {r.member_id
                          ? <button className="text-brand-primary hover:underline" onClick={() => navigate(`/members/${r.member_id}`)}>{r.member_name}</button>
                          : '—'}
                      </td>
                      <td className="td">{r.pillar ?? '—'}</td>
                      <td className="td text-end tabular-nums font-semibold text-brand-primary">{nf(r.weighted_score, 2)}</td>
                      <td className="td text-end tabular-nums">{hours(r.member_hours)}</td>
                      <td className="td"><Badge tone={r.status === 'winner' ? 'good' : r.status === 'finalist' ? 'info' : 'neutral'}>{r.status}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="px-4 py-3 text-[12px] text-ink-muted border-t border-line-subtle">
              Criteria weights: {(challenge.data?.criteria ?? []).map((c: any) => `${c.criterion} ×${c.weight}`).join(' · ')}
            </p>
          </Card>
        </div>
      )}
    </>
  );
}

const avg = (a: number[]) => (a.filter(Number.isFinite).length ? a.filter(Number.isFinite).reduce((s, n) => s + n, 0) / a.filter(Number.isFinite).length : 0);
