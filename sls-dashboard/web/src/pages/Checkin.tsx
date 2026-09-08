/**
 * The mobile check-in page a QR scan opens.
 * Deliberately standalone: no sidebar, big touch targets, works on any phone's
 * built-in camera without an app or scanner hardware.
 */
import { useState } from 'react';
import { useData } from '../state';
import { api } from '../lib/api';
import { Skeleton } from '../components/ui';

export function Checkin({ token }: { token: string }) {
  const { data, loading, error } = useData<any>(`/checkin/${token}/info`);
  const [code, setCode] = useState('');
  const [result, setResult] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  const scan = async () => {
    setBusy(true); setResult(null);
    try { setResult(await api.post(`/checkin/${token}`, { memberCode: code })); }
    catch (e: any) { setResult({ ok: false, message: e?.message ?? String(e) }); }
    finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-5"
         style={{ background: 'var(--sls-brand-primary, #0F5C4D)' }}>
      <div className="w-full max-w-sm">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-center mb-1"
           style={{ color: 'var(--sls-brand-accent, #C98500)' }}>Misk Foundation</p>
        <h1 className="text-white text-xl font-bold text-center mb-6">Saudi Leadership Society</h1>

        <div className="card p-5">
          {loading ? <Skeleton rows={2} height="h-10" /> : error ? (
            <p className="text-[14px] text-state-critical text-center">{error}</p>
          ) : (
            <>
              <p className="text-[11px] uppercase tracking-wide text-ink-muted">Checking in to</p>
              <h2 className="text-[16px] font-semibold text-ink-primary leading-snug">{data?.event?.name}</h2>
              <p className="text-[13px] text-ink-muted mt-0.5">
                {data?.event?.initiative_name} · {data?.event?.date}{data?.event?.location ? ` · ${data.event.location}` : ''}
              </p>

              {!result || !result.ok ? (
                <>
                  <label className="label mt-5">Your member code</label>
                  <input className="input h-12 text-[16px] font-mono text-center tracking-wider uppercase"
                         placeholder="SLS-0000" value={code} autoCapitalize="characters" autoComplete="off"
                         onChange={e => setCode(e.target.value)} onKeyDown={e => e.key === 'Enter' && scan()} />
                  <button className="btn-primary w-full h-12 mt-3 text-[15px]" onClick={scan} disabled={!code.trim() || busy}>
                    {busy ? 'Checking…' : 'Check in'}
                  </button>
                  {result && !result.ok && <p className="mt-3 text-[13px] text-state-critical text-center">{result.message}</p>}
                  <p className="text-[12px] text-ink-muted mt-4 text-center leading-relaxed">
                    Scan this code again on your way out and your hours are calculated from the time you actually spent here.
                  </p>
                </>
              ) : (
                <div className="text-center py-4">
                  <p className="text-4xl mb-3">{result.action === 'checked-out' ? '👋' : result.action === 'already-complete' ? '✓' : '✅'}</p>
                  <p className="text-[16px] font-semibold text-ink-primary">{result.message}</p>
                  {result.hours != null && (
                    <p className="text-[13px] text-ink-secondary mt-2">
                      <strong>{result.hours}h</strong> logged to your engagement ledger.
                    </p>
                  )}
                  {result.action === 'checked-in' && (
                    <p className="text-[13px] text-ink-muted mt-2">Scan again when you leave to log your exact hours.</p>
                  )}
                  <button className="btn-ghost w-full mt-5" onClick={() => { setResult(null); setCode(''); }}>
                    Check in someone else
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        <p className="text-center text-[11px] mt-4" style={{ color: 'var(--sls-ink-onInverseMuted, #BBD6CF)' }}>
          Grow to Great · Connect to Create · Lead with Impact
        </p>
      </div>
    </div>
  );
}
