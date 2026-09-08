export const nf = (n: number | null | undefined, digits = 0) =>
  n == null || Number.isNaN(n) ? '—' : Number(n).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });

export const hours = (n: number | null | undefined) => (n == null ? '—' : `${nf(n, n % 1 ? 1 : 0)}h`);
export const pct = (n: number | null | undefined, digits = 0) => (n == null ? '—' : `${nf(n, digits)}%`);

export const monthLabel = (ym: string) => {
  const [y, m] = String(ym).split('-');
  if (!y || !m) return ym;
  return `${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][Number(m) - 1] ?? m} ${y.slice(2)}`;
};

export const todayIso = () => new Date().toISOString().slice(0, 10);
export const yearStart = (offset = 0) => `${new Date().getFullYear() - offset}-01-01`;
