/**
 * The global filter bar. One filter state drives Overview, Engagement,
 * Initiatives, Impact — and every export, so what you see is what you export.
 */
import { useState } from 'react';
import { useApp, DEFAULT_FILTERS, activeFilterCount, type Filters } from '../state';
import { useI18n } from '../i18n';
import { MultiSelect, Badge } from './ui';
import { todayIso, yearStart } from '../lib/format';

export function FilterBar() {
  const { filters, setFilters, boot } = useApp();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const o = boot?.options;
  const count = activeFilterCount(filters);

  const set = <K extends keyof Filters,>(k: K, v: Filters[K]) => setFilters(f => ({ ...f, [k]: v }));

  const quick = (from: string | undefined, to: string | undefined) => setFilters(f => ({ ...f, dateFrom: from, dateTo: to }));
  const y = new Date().getFullYear();
  const ninetyAgo = new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10);

  return (
    <div className="card mb-5 no-print">
      <div className="flex flex-wrap items-center gap-2 px-3.5 py-2.5">
        <button className="btn-ghost" onClick={() => setOpen(v => !v)}>
          ⚙ {t.filters.title}{count > 0 && <span className="ms-1.5 px-1.5 rounded-pill bg-brand-soft text-brand-primary text-[11px] font-semibold">{count}</span>}
        </button>

        <div className="flex items-center gap-1.5 flex-wrap">
          {[
            { label: t.filters.thisYear, from: `${y}-01-01`, to: todayIso() },
            { label: t.filters.lastYear, from: yearStart(1), to: `${y - 1}-12-31` },
            { label: t.filters.last90, from: ninetyAgo, to: todayIso() },
            { label: t.filters.allTime, from: undefined, to: undefined },
          ].map(q => {
            const on = filters.dateFrom === q.from && filters.dateTo === q.to;
            return (
              <button key={q.label} onClick={() => quick(q.from, q.to)}
                className={`chip ${on ? 'bg-brand-soft text-brand-primary border-transparent' : 'border-line text-ink-muted hover:bg-surface-sunken'}`}>
                {q.label}
              </button>
            );
          })}
        </div>

        {count > 0 && (
          <button className="btn-quiet ms-auto text-ink-muted" onClick={() => setFilters(DEFAULT_FILTERS)}>
            ✕ {t.filters.reset}
          </button>
        )}
      </div>

      {open && (
        <div className="border-t border-line-subtle p-3.5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="label">{t.filters.from}</label>
            <input type="date" className="input" value={filters.dateFrom ?? ''} onChange={e => set('dateFrom', e.target.value || undefined)} />
          </div>
          <div>
            <label className="label">{t.filters.to}</label>
            <input type="date" className="input" value={filters.dateTo ?? ''} onChange={e => set('dateTo', e.target.value || undefined)} />
          </div>
          <MultiSelect label={t.filters.pillar} value={filters.pillar} onChange={v => set('pillar', v)}
                       options={(o?.pillars ?? []).map((p: string) => ({ value: p, label: p }))} placeholder={t.filters.all} />
          <MultiSelect label={t.filters.initiative} value={filters.initiativeId.map(String)}
                       onChange={v => set('initiativeId', v.map(Number))}
                       options={(o?.initiatives ?? []).map((i: any) => ({ value: String(i.id), label: i.name }))} placeholder={t.filters.all} />
          <MultiSelect label={t.filters.cohort} value={filters.cohortType} onChange={v => set('cohortType', v)}
                       options={(o?.cohortTypes ?? []).map((c: string) => ({ value: c, label: c }))} placeholder={t.filters.all} />
          <MultiSelect label={t.filters.sector} value={filters.sector} onChange={v => set('sector', v)}
                       options={(o?.sectors ?? []).map((s: string) => ({ value: s, label: s }))} placeholder={t.filters.all} />
          <MultiSelect label={t.filters.councilOwner} value={filters.councilRole} onChange={v => set('councilRole', v)}
                       options={(o?.councilRoles ?? []).map((r: string) => ({ value: r, label: r }))} placeholder={t.filters.all} />
          <div>
            <label className="label">{t.filters.hoursRange}</label>
            <div className="flex gap-2">
              <input type="number" min={0} className="input" placeholder={t.filters.min} value={filters.hoursMin ?? ''}
                     onChange={e => set('hoursMin', e.target.value === '' ? undefined : Number(e.target.value))} />
              <input type="number" min={0} className="input" placeholder={t.filters.max} value={filters.hoursMax ?? ''}
                     onChange={e => set('hoursMax', e.target.value === '' ? undefined : Number(e.target.value))} />
            </div>
          </div>
        </div>
      )}

      {count > 0 && !open && (
        <div className="border-t border-line-subtle px-3.5 py-2 flex flex-wrap gap-1.5 items-center">
          {filters.dateFrom && <Badge tone="brand">{t.filters.from} {filters.dateFrom}</Badge>}
          {filters.dateTo && <Badge tone="brand">{t.filters.to} {filters.dateTo}</Badge>}
          {filters.pillar.map(p => <Badge key={p} tone="neutral">{p}</Badge>)}
          {filters.cohortType.map(c => <Badge key={c} tone="neutral">{c}</Badge>)}
          {filters.sector.map(s => <Badge key={s} tone="neutral">{s}</Badge>)}
          {filters.councilRole.map(c => <Badge key={c} tone="neutral">{c}</Badge>)}
          {filters.initiativeId.length > 0 && <Badge tone="neutral">{filters.initiativeId.length} {t.filters.initiative}</Badge>}
          {filters.hoursMin != null && <Badge tone="neutral">≥ {filters.hoursMin}h</Badge>}
          {filters.hoursMax != null && <Badge tone="neutral">≤ {filters.hoursMax}h</Badge>}
        </div>
      )}
    </div>
  );
}
