/**
 * Push design-tokens.json onto :root as CSS custom properties.
 * Everything downstream — Tailwind classes, inline styles, Recharts colours —
 * reads those variables, so swapping the token file restyles the whole app with
 * no rebuild. That is the "swappable later" requirement, made literal.
 */
export type Tokens = any;

export function applyTokens(tokens: Tokens) {
  const root = document.documentElement;
  const set = (k: string, v: unknown) => root.style.setProperty(`--sls-${k}`, String(v));

  for (const [group, vals] of Object.entries(tokens.color ?? {})) {
    if (group === 'chart' || group === 'pillar' || group === 'cohort') continue;
    for (const [k, v] of Object.entries(vals as Record<string, string>)) set(`${group}-${k}`, v);
  }
  set('font-sans', tokens.font?.sansEn);
  set('font-sansAr', tokens.font?.sansAr);
  set('font-mono', tokens.font?.mono);
  for (const [k, v] of Object.entries(tokens.radius ?? {})) set(`radius-${k}`, v);
  for (const [k, v] of Object.entries(tokens.shadow ?? {})) set(`shadow-${k}`, v);
  for (const [k, v] of Object.entries(tokens.space ?? {})) set(`space-${k}`, v);
  for (const [k, v] of Object.entries(tokens.layout ?? {})) set(`layout-${k}`, v);
  for (const [k, v] of Object.entries(tokens.motion ?? {})) set(`motion-${k}`, v);
  for (const [k, v] of Object.entries(tokens.color?.chart ?? {})) {
    if (typeof v === 'string') set(`chart-${k}`, v);
  }
  (tokens.color?.chart?.categorical ?? []).forEach((c: string, i: number) => set(`series-${i + 1}`, c));
}

/**
 * Categorical hues are assigned in FIXED SLOT ORDER and never cycled — a 7th
 * series folds into "Other" rather than reusing slot 1, which would make two
 * different entities the same colour.
 */
export function seriesColor(tokens: Tokens, index: number): string {
  const palette: string[] = tokens?.color?.chart?.categorical ?? [];
  return index < palette.length ? palette[index]! : (tokens?.color?.chart?.other ?? '#6B7C77');
}

export const SERIES_CAP = 6;

/** Keep the top N series by magnitude and fold the rest into a single "Other". */
export function foldToCap<T extends Record<string, any>>(rows: T[], labelKey: keyof T, valueKey: keyof T, cap = SERIES_CAP): T[] {
  if (rows.length <= cap) return rows;
  const sorted = [...rows].sort((a, b) => Number(b[valueKey]) - Number(a[valueKey]));
  const head = sorted.slice(0, cap - 1);
  const tail = sorted.slice(cap - 1);
  const other = { ...tail[0]!, [labelKey]: `Other (${tail.length})`, [valueKey]: tail.reduce((s, r) => s + Number(r[valueKey] || 0), 0) } as T;
  return [...head, other];
}
