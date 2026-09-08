const BASE = '/api';

export class ApiError extends Error {
  constructor(message: string, public status: number, public code?: string) { super(message); }
  get needsApiKey() { return this.code === 'needs_api_key' || this.status === 428; }
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });
  const text = await res.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = { error: text }; }
  if (!res.ok) throw new ApiError(body?.error ?? `Request failed (${res.status})`, res.status, body?.code);
  return body as T;
}

export const api = {
  get: <T,>(path: string) => req<T>(path),
  post: <T,>(path: string, body?: unknown) => req<T>(path, { method: 'POST', body: JSON.stringify(body ?? {}) }),
  put: <T,>(path: string, body?: unknown) => req<T>(path, { method: 'PUT', body: JSON.stringify(body ?? {}) }),
  patch: <T,>(path: string, body?: unknown) => req<T>(path, { method: 'PATCH', body: JSON.stringify(body ?? {}) }),
  del: <T,>(path: string) => req<T>(path, { method: 'DELETE' }),
};

/** Turn the filter object into the query string every endpoint understands. */
export function qs(filters: Record<string, unknown>, extra: Record<string, unknown> = {}): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...filters, ...extra })) {
    if (v == null || v === '' || (Array.isArray(v) && !v.length)) continue;
    p.set(k, Array.isArray(v) ? v.join(',') : String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : '';
}

export function downloadUrl(path: string): string { return `${BASE}${path}`; }
