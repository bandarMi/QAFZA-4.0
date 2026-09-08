/**
 * One filter model, used by every surface: REST endpoints, PDF/Power BI exports
 * and the AI's tools. That is what makes "what I see" and "what I export" and
 * "what the AI answered from" the same numbers.
 */
export type Filters = {
  dateFrom?: string;
  dateTo?: string;
  pillar?: string[];
  initiativeId?: number[];
  cohortType?: string[];
  sector?: string[];
  councilRole?: string[];
  memberStatus?: string[];
  hoursMin?: number;
  hoursMax?: number;
};

const arr = (v: unknown): string[] | undefined => {
  if (v == null || v === '') return undefined;
  const a = (Array.isArray(v) ? v : String(v).split(',')).map(s => String(s).trim()).filter(Boolean);
  return a.length ? a : undefined;
};

export function parseFilters(q: Record<string, unknown>): Filters {
  const num = (v: unknown) => (v == null || v === '' ? undefined : Number(v));
  return {
    dateFrom: (q.dateFrom as string) || undefined,
    dateTo: (q.dateTo as string) || undefined,
    pillar: arr(q.pillar),
    initiativeId: arr(q.initiativeId)?.map(Number).filter(n => Number.isFinite(n)),
    cohortType: arr(q.cohortType),
    sector: arr(q.sector),
    councilRole: arr(q.councilRole),
    memberStatus: arr(q.memberStatus),
    hoursMin: num(q.hoursMin),
    hoursMax: num(q.hoursMax),
  };
}

type Built = { where: string; params: Record<string, unknown>; applied: string[] };

const list = (name: string, vals: readonly (string | number)[], params: Record<string, unknown>) => {
  const keys = vals.map((v, i) => {
    const k = `${name}${i}`;
    params[k] = v;
    return `@${k}`;
  });
  return keys.join(',');
};

/**
 * SQL fragment for engagement_logs `l`, joined to members `m` and initiatives `i`.
 * `applied` is echoed back to the UI and cited by the AI, so a number is never
 * shown without the filter that produced it.
 */
export function engagementWhere(f: Filters, alias = 'l'): Built {
  const params: Record<string, unknown> = {};
  const w: string[] = ['1=1'];
  const applied: string[] = [];

  if (f.dateFrom) { w.push(`${alias}.date >= @dateFrom`); params.dateFrom = f.dateFrom; applied.push(`date >= ${f.dateFrom}`); }
  if (f.dateTo)   { w.push(`${alias}.date <= @dateTo`);   params.dateTo = f.dateTo;     applied.push(`date <= ${f.dateTo}`); }
  if (f.pillar?.length)       { w.push(`i.pillar IN (${list('pil', f.pillar, params)})`); applied.push(`pillar in [${f.pillar.join(', ')}]`); }
  if (f.initiativeId?.length) { w.push(`${alias}.related_initiative_id IN (${list('ini', f.initiativeId, params)})`); applied.push(`initiative id in [${f.initiativeId.join(', ')}]`); }
  if (f.cohortType?.length)   { w.push(`m.cohort_type IN (${list('coh', f.cohortType, params)})`); applied.push(`cohort in [${f.cohortType.join(', ')}]`); }
  if (f.sector?.length)       { w.push(`m.sector IN (${list('sec', f.sector, params)})`); applied.push(`sector in [${f.sector.join(', ')}]`); }
  if (f.councilRole?.length)  { w.push(`i.owner_council_role IN (${list('cro', f.councilRole, params)})`); applied.push(`council owner in [${f.councilRole.join(', ')}]`); }
  if (f.memberStatus?.length) { w.push(`m.status IN (${list('mst', f.memberStatus, params)})`); applied.push(`member status in [${f.memberStatus.join(', ')}]`); }

  return { where: w.join(' AND '), params, applied };
}

/** Same filter set, expressed against members `m` (for member-level queries). */
export function memberWhere(f: Filters): Built {
  const params: Record<string, unknown> = {};
  const w: string[] = ['1=1'];
  const applied: string[] = [];

  if (f.cohortType?.length)   { w.push(`m.cohort_type IN (${list('coh', f.cohortType, params)})`); applied.push(`cohort in [${f.cohortType.join(', ')}]`); }
  if (f.sector?.length)       { w.push(`m.sector IN (${list('sec', f.sector, params)})`); applied.push(`sector in [${f.sector.join(', ')}]`); }
  if (f.memberStatus?.length) { w.push(`m.status IN (${list('mst', f.memberStatus, params)})`); applied.push(`member status in [${f.memberStatus.join(', ')}]`); }

  return { where: w.join(' AND '), params, applied };
}

/** Same filter set, expressed against events `e` joined to initiatives `i`. */
export function eventWhere(f: Filters): Built {
  const params: Record<string, unknown> = {};
  const w: string[] = ['1=1'];
  const applied: string[] = [];

  if (f.dateFrom) { w.push('e.date >= @dateFrom'); params.dateFrom = f.dateFrom; applied.push(`date >= ${f.dateFrom}`); }
  if (f.dateTo)   { w.push('e.date <= @dateTo');   params.dateTo = f.dateTo;     applied.push(`date <= ${f.dateTo}`); }
  if (f.pillar?.length)       { w.push(`i.pillar IN (${list('pil', f.pillar, params)})`); applied.push(`pillar in [${f.pillar.join(', ')}]`); }
  if (f.initiativeId?.length) { w.push(`e.initiative_id IN (${list('ini', f.initiativeId, params)})`); applied.push(`initiative id in [${f.initiativeId.join(', ')}]`); }
  if (f.councilRole?.length)  { w.push(`i.owner_council_role IN (${list('cro', f.councilRole, params)})`); applied.push(`council owner in [${f.councilRole.join(', ')}]`); }

  return { where: w.join(' AND '), params, applied };
}

export function describeFilters(f: Filters): string {
  const parts: string[] = [];
  if (f.dateFrom || f.dateTo) parts.push(`period ${f.dateFrom ?? 'start'} → ${f.dateTo ?? 'today'}`);
  if (f.pillar?.length) parts.push(`pillar: ${f.pillar.join(', ')}`);
  if (f.initiativeId?.length) parts.push(`initiative ids: ${f.initiativeId.join(', ')}`);
  if (f.cohortType?.length) parts.push(`cohort: ${f.cohortType.join(', ')}`);
  if (f.sector?.length) parts.push(`sector: ${f.sector.join(', ')}`);
  if (f.councilRole?.length) parts.push(`council owner: ${f.councilRole.join(', ')}`);
  if (f.hoursMin != null) parts.push(`hours ≥ ${f.hoursMin}`);
  if (f.hoursMax != null) parts.push(`hours ≤ ${f.hoursMax}`);
  return parts.length ? parts.join(' · ') : 'no filters (all data)';
}
