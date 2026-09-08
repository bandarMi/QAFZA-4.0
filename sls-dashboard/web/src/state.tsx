import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, qs } from './lib/api';
import { applyTokens, type Tokens } from './lib/tokens';

export type Filters = {
  dateFrom?: string; dateTo?: string;
  pillar: string[]; initiativeId: number[]; cohortType: string[];
  sector: string[]; councilRole: string[]; memberStatus: string[];
  hoursMin?: number; hoursMax?: number;
};

export const EMPTY_FILTERS: Filters = {
  dateFrom: undefined, dateTo: undefined, pillar: [], initiativeId: [],
  cohortType: [], sector: [], councilRole: [], memberStatus: [],
  hoursMin: undefined, hoursMax: undefined,
};

/**
 * The dashboard opens on the current calendar year rather than all-time: several
 * headline figures ("members onboarded", satisfaction) are period metrics and read
 * as nonsense against an unbounded range. "All time" is one click away.
 */
export const DEFAULT_FILTERS: Filters = {
  ...EMPTY_FILTERS,
  dateFrom: `${new Date().getFullYear()}-01-01`,
  dateTo: new Date().toISOString().slice(0, 10),
};

export function activeFilterCount(f: Filters): number {
  return [f.dateFrom, f.dateTo, f.hoursMin, f.hoursMax].filter(v => v != null && v !== '').length
    + [f.pillar, f.initiativeId, f.cohortType, f.sector, f.councilRole, f.memberStatus].filter(a => a.length).length;
}

type Bootstrap = {
  tokens: Tokens;
  options: any;
  settings: Record<string, any>;
  aiReady: boolean;
  models: Array<{ id: string; label: string }>;
  pillars: any[]; values: any[]; council: any[];
  reportSections: Array<{ id: string; label: string; label_ar: string }>;
  baseUrl: string;
};

type AppState = {
  boot: Bootstrap | null;
  loading: boolean;
  error: string | null;
  filters: Filters;
  setFilters: (f: Filters | ((prev: Filters) => Filters)) => void;
  query: string;                       // the filter query string every page appends
  refreshBoot: () => Promise<void>;
  aiReady: boolean;
  setAiReady: (v: boolean) => void;
  route: string;
  navigate: (to: string) => void;
};

const Ctx = createContext<AppState>({} as AppState);

const readHash = () => window.location.hash.replace(/^#/, '') || '/overview';

export function AppProvider({ children }: { children: ReactNode }) {
  const [boot, setBoot] = useState<Bootstrap | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [aiReady, setAiReady] = useState(false);
  const [route, setRoute] = useState(readHash);

  useEffect(() => {
    const onHash = () => setRoute(readHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const navigate = useCallback((to: string) => {
    window.location.hash = to;
    window.scrollTo({ top: 0 });
  }, []);

  const refreshBoot = useCallback(async () => {
    try {
      setError(null);
      const b = await api.get<Bootstrap>('/bootstrap');
      applyTokens(b.tokens);
      setBoot(b);
      setAiReady(b.aiReady);
    } catch (err: any) {
      setError(err?.message ?? 'Could not reach the SLS API. Is the server running on port 4317?');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refreshBoot(); }, [refreshBoot]);

  const query = useMemo(() => qs(filters as unknown as Record<string, unknown>), [filters]);

  const value = useMemo<AppState>(() => ({
    boot, loading, error, filters, setFilters, query, refreshBoot, aiReady, setAiReady, route, navigate,
  }), [boot, loading, error, filters, query, refreshBoot, aiReady, route, navigate]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useApp = () => useContext(Ctx);

/** Fetch-on-filter-change hook used by every page. */
export function useData<T>(path: string | null, deps: unknown[] = []): { data: T | null; loading: boolean; error: string | null; reload: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(!!path);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!path) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    api.get<T>(path)
      .then(d => { if (!cancelled) { setData(d); setError(null); } })
      .catch(e => { if (!cancelled) setError(e?.message ?? String(e)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, nonce, ...deps]);

  return { data, loading, error, reload: () => setNonce(n => n + 1) };
}
