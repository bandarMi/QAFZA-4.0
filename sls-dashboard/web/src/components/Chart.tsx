/**
 * The chart system.
 *
 * Rules baked in here rather than left to each caller:
 *  - Categorical hues are taken in FIXED SLOT ORDER from the brand tokens and
 *    never cycled; a 7th series folds into "Other".
 *  - Every chart with >= 2 series carries a legend, and <= 4 series are also
 *    direct-labelled, so identity is never colour-alone.
 *  - Every chart ships a Table toggle. That is the documented relief for the two
 *    palette slots that sit under 3:1 contrast on a light surface.
 *  - Stacked and adjacent fills carry a 2px surface gap.
 *  - Grid and axes are recessive; marks are thin; tooltips are on by default.
 *  - Never a dual-axis chart. Two measures of different scale get two charts.
 */
import { useMemo, useState, type ReactNode } from 'react';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart,
  Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, LabelList,
} from 'recharts';
import { useApp } from '../state';
import { useI18n } from '../i18n';
import { seriesColor, foldToCap, SERIES_CAP } from '../lib/tokens';
import { nf } from '../lib/format';
import { Toggle } from './ui';

export type Series = { key: string; label?: string; color?: string };

type Props = {
  kind: 'bar' | 'stacked-bar' | 'line' | 'area' | 'donut' | 'table';
  title?: ReactNode;
  subtitle?: ReactNode;
  rows: any[];
  xKey: string;
  series: Series[];
  unit?: string;
  note?: ReactNode;              // provenance line — tables + filters behind the numbers
  height?: number;
  actions?: ReactNode;
  formatX?: (v: any) => string;
  horizontal?: boolean;
  className?: string;
};

const TICK = { fontSize: 11, fill: 'var(--sls-chart-axisLabel)' };

function TooltipBox({ active, payload, label, unit, formatX }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="card shadow-md px-3 py-2 text-[12px]">
      <p className="font-semibold text-ink-primary mb-1">{formatX ? formatX(label) : label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} className="flex items-center gap-2 text-ink-secondary">
          <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: p.color }} />
          <span className="flex-1">{p.name}</span>
          <span className="font-semibold tabular-nums text-ink-primary">{nf(p.value, Number(p.value) % 1 ? 1 : 0)}{unit ? ` ${unit}` : ''}</span>
        </p>
      ))}
    </div>
  );
}

export function Chart({ kind, title, subtitle, rows, xKey, series, unit, note, height = 260, actions, formatX, horizontal, className = '' }: Props) {
  const { boot } = useApp();
  const { t } = useI18n();
  const [view, setView] = useState<'chart' | 'table'>(kind === 'table' ? 'table' : 'chart');
  const tokens = boot?.tokens;

  // Fixed slot order; a colour belongs to the entity, never to its rank.
  const resolved = useMemo(() => series.map((s, i) => ({ ...s, color: s.color ?? seriesColor(tokens, i) })), [series, tokens]);

  // A donut is part-to-whole over the x dimension, so it folds rows, not series.
  const data = useMemo(() => (kind === 'donut' ? foldToCap(rows, xKey, resolved[0]?.key ?? 'value', SERIES_CAP) : rows), [kind, rows, xKey, resolved]);

  const empty = !rows?.length;
  const multi = resolved.length >= 2;
  const directLabel = resolved.length <= 4 && rows.length <= 14 && kind !== 'donut';

  const body = () => {
    if (empty) return <div className="flex items-center justify-center text-[13px] text-ink-muted" style={{ height }}>{t.chart.noData}</div>;

    if (view === 'table') {
      return (
        <div className="scroll-x" dir="auto" style={{ maxHeight: Math.max(height, 220) }}>
          <table className="w-full border-collapse">
            <thead className="sticky top-0 bg-surface-raised">
              <tr>
                <th className="th">{xKey.replace(/_/g, ' ')}</th>
                {resolved.map(s => <th key={s.key} className="th text-end">{s.label ?? s.key.replace(/_/g, ' ')}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td className="td font-medium text-ink-primary">{formatX ? formatX(r[xKey]) : String(r[xKey] ?? '—')}</td>
                  {resolved.map(s => <td key={s.key} className="td text-end tabular-nums">{nf(r[s.key], Number(r[s.key]) % 1 ? 1 : 0)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    const common = {
      data,
      margin: {
        top: directLabel && !horizontal ? 18 : 8,
        // A horizontal bar's direct label sits to the right of the mark; without
        // this gutter the longest bar's value gets clipped by the plot edge.
        right: horizontal && directLabel ? 56 : 12,
        left: horizontal ? 0 : -12,
        bottom: 0,
      },
    };
    const legend = multi ? <Legend verticalAlign="bottom" height={28} iconType="circle" iconSize={8}
      wrapperStyle={{ fontSize: 11, color: 'var(--sls-ink-secondary)' }} /> : null;

    if (kind === 'donut') {
      const key = resolved[0]!.key;
      const total = data.reduce((s, r) => s + Number(r[key] || 0), 0);
      return (
        <ResponsiveContainer width="100%" height={height}>
          <PieChart>
            <Pie data={data} dataKey={key} nameKey={xKey} innerRadius="58%" outerRadius="86%"
                 paddingAngle={2} stroke="var(--sls-chart-surfaceGap)" strokeWidth={2}
                 label={(e: any) => `${e[xKey]} · ${Math.round((Number(e[key]) / (total || 1)) * 100)}%`}
                 labelLine={{ stroke: 'var(--sls-border-default)' }}>
              {data.map((_, i) => <Cell key={i} fill={seriesColor(tokens, i)} />)}
            </Pie>
            <Tooltip content={<TooltipBox unit={unit} />} />
          </PieChart>
        </ResponsiveContainer>
      );
    }

    if (kind === 'line' || kind === 'area') {
      const C = kind === 'area' ? AreaChart : LineChart;
      return (
        <ResponsiveContainer width="100%" height={height}>
          <C {...common}>
            <CartesianGrid stroke="var(--sls-chart-grid)" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey={xKey} tick={TICK} tickLine={false} axisLine={{ stroke: 'var(--sls-chart-grid)' }} tickFormatter={formatX} minTickGap={18} />
            <YAxis tick={TICK} tickLine={false} axisLine={false} width={48} />
            <Tooltip content={<TooltipBox unit={unit} formatX={formatX} />} cursor={{ stroke: 'var(--sls-border-strong)', strokeWidth: 1 }} />
            {legend}
            {resolved.map(s => kind === 'area' ? (
              <Area key={s.key} type="monotone" dataKey={s.key} name={s.label ?? s.key} stroke={s.color}
                    strokeWidth={2} fill={s.color} fillOpacity={0.14} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--sls-surface-raised)' }} />
            ) : (
              <Line key={s.key} type="monotone" dataKey={s.key} name={s.label ?? s.key} stroke={s.color}
                    strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--sls-surface-raised)' }} />
            ))}
          </C>
        </ResponsiveContainer>
      );
    }

    const stacked = kind === 'stacked-bar';
    return (
      <ResponsiveContainer width="100%" height={height}>
        <BarChart {...common} layout={horizontal ? 'vertical' : 'horizontal'}>
          <CartesianGrid stroke="var(--sls-chart-grid)" strokeDasharray="3 3" vertical={!!horizontal} horizontal={!horizontal} />
          {horizontal ? <>
            <XAxis type="number" tick={TICK} tickLine={false} axisLine={false} />
            <YAxis type="category" dataKey={xKey} tick={TICK} tickLine={false} axisLine={false} width={140} tickFormatter={formatX} />
          </> : <>
            <XAxis dataKey={xKey} tick={TICK} tickLine={false} axisLine={{ stroke: 'var(--sls-chart-grid)' }} tickFormatter={formatX} minTickGap={12} />
            <YAxis tick={TICK} tickLine={false} axisLine={false} width={48} />
          </>}
          <Tooltip content={<TooltipBox unit={unit} formatX={formatX} />} cursor={{ fill: 'var(--sls-surface-sunken)' }} />
          {legend}
          {resolved.map((s, i) => (
            <Bar key={s.key} dataKey={s.key} name={s.label ?? s.key} fill={s.color}
                 stackId={stacked ? 'a' : undefined} radius={horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]}
                 stroke="var(--sls-chart-surfaceGap)" strokeWidth={stacked || resolved.length > 1 ? 2 : 0}
                 maxBarSize={horizontal ? 18 : 44}>
              {directLabel && i === resolved.length - 1 && !stacked && (
                <LabelList dataKey={s.key} position={horizontal ? 'right' : 'top'}
                           style={{ fontSize: 10, fill: 'var(--sls-ink-secondary)', fontWeight: 600 }}
                           formatter={(v: any) => nf(v, Number(v) % 1 ? 1 : 0)} />
              )}
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
    );
  };

  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <header className="flex items-start justify-between gap-3 px-4 pt-3.5 pb-2.5 border-b border-line-subtle">
          <div className="min-w-0">
            {title && <h3 className="text-[14px] font-semibold text-ink-primary leading-tight">{title}</h3>}
            {subtitle && <p className="text-[12px] text-ink-muted mt-0.5">{subtitle}</p>}
          </div>
          <div className="flex items-center gap-1.5 shrink-0 no-print">
            {actions}
            {kind !== 'table' && !empty && (
              <Toggle value={view} onChange={v => setView(v as any)}
                      options={[{ value: 'chart', label: t.chart.chart }, { value: 'table', label: t.chart.table }]} />
            )}
          </div>
        </header>
      )}
      {/* SVG geometry is always LTR; the card around it still follows the page direction. */}
      <div className="p-3 pt-3" dir="ltr">{body()}</div>
      {note && <p className="px-4 pb-3 text-[11px] text-ink-muted leading-relaxed">{note}</p>}
    </section>
  );
}

/** Provenance line rendered under a chart — tables + filters behind the numbers. */
export function Provenance({ p }: { p?: { tables: string[]; filters: string; rowCount: number } }) {
  const { t } = useI18n();
  if (!p) return null;
  return <>{t.chart.source}: <span className="font-mono">{p.tables.join(', ')}</span> · {p.filters} · {p.rowCount} rows</>;
}
