/**
 * The AI chat drawer — persistent, available from every page.
 *
 * Every answer that carries numbers comes back with the chart the model rendered
 * from the rows it actually retrieved, plus the tool calls it made. Each chart
 * can be pinned to the dashboard or added to the PDF report, which is how an
 * ad-hoc question becomes a permanent widget.
 */
import { useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useApp } from '../state';
import { useI18n } from '../i18n';
import { Chart } from './Chart';
import { ApiKeyCard, AiOffNotice } from './ApiKeyCard';
import { Badge } from './ui';

type ChatChart = { kind: any; title: string; xKey?: string; series?: Array<{ key: string; label?: string }>; rows: any[]; unit?: string; note?: string };
type Msg = { role: 'user' | 'assistant'; text: string; charts?: ChatChart[]; toolCalls?: any[]; error?: boolean };

const EXAMPLES = [
  'Show me startup support trends by sector for 2025',
  'Which initiative has the highest event-to-member conversion?',
  'Which members logged the most engagement hours this quarter?',
  'Compare 2030 Leaders vs Misk Fellows engagement hours in Topic Clubs',
  'Draft a paragraph summarising Q3 impact for a board update',
];

/** Infer a sensible x axis and series set when the model omits them. */
function inferSpec(c: ChatChart) {
  const first = c.rows?.[0] ?? {};
  const keys = Object.keys(first);
  const xKey = c.xKey && keys.includes(c.xKey) ? c.xKey : keys.find(k => typeof first[k] !== 'number') ?? keys[0] ?? 'name';
  const series = c.series?.length
    ? c.series.filter(s => keys.includes(s.key))
    : keys.filter(k => k !== xKey && typeof first[k] === 'number').slice(0, 6).map(k => ({ key: k, label: k.replace(/_/g, ' ') }));
  return { xKey, series: series.length ? series : [{ key: keys[1] ?? 'value', label: 'value' }] };
}

export function ChatDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const { aiReady, navigate } = useApp();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [conversationId, setConversationId] = useState<number | undefined>();
  const [pinned, setPinned] = useState<Record<string, string>>({});
  const [showKey, setShowKey] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, busy]);

  const send = async (text: string) => {
    if (!text.trim() || busy) return;
    setMessages(m => [...m, { role: 'user', text }]);
    setInput('');
    setBusy(true);
    try {
      const r = await api.post<any>('/ai/chat', { message: text, conversationId });
      setConversationId(r.conversationId);
      setMessages(m => [...m, { role: 'assistant', text: r.text, charts: r.charts, toolCalls: r.toolCalls }]);
    } catch (e: any) {
      const needsKey = e instanceof ApiError && e.needsApiKey;
      if (needsKey) setShowKey(true);
      setMessages(m => [...m, { role: 'assistant', text: e?.message ?? String(e), error: true }]);
    } finally { setBusy(false); }
  };

  const pin = async (c: ChatChart, target: 'dashboard' | 'report', key: string) => {
    const spec = { ...inferSpec(c), kind: c.kind, rows: c.rows, unit: c.unit, note: c.note };
    await api.post('/pins', { title: c.title, target, spec });
    setPinned(p => ({ ...p, [key]: target }));
  };

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/25 z-40 no-print" onClick={onClose} />
      <aside className="fixed top-0 bottom-0 ltr:right-0 rtl:left-0 z-50 bg-surface-raised border-s border-line flex flex-col shadow-lg no-print w-full"
             style={{ maxWidth: 'var(--sls-layout-chatDrawerWidth, 420px)' }}>
        <header className="flex items-center gap-2 px-4 h-14 border-b border-line-subtle shrink-0">
          <span className="text-brand-accent">✦</span>
          <h2 className="text-[14px] font-semibold flex-1">{t.ai.title}</h2>
          {aiReady && messages.length > 0 && (
            <button className="btn-quiet" onClick={() => { setMessages([]); setConversationId(undefined); }}>{t.ai.clear}</button>
          )}
          <button className="btn-quiet" onClick={onClose} aria-label={t.common.close}>✕</button>
        </header>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {!aiReady || showKey ? (
            <ApiKeyCard onChanged={() => setShowKey(false)} />
          ) : messages.length === 0 ? (
            <div>
              <p className="text-[13px] text-ink-secondary leading-relaxed">
                Ask anything about the live SLS dataset. Answers come from real queries against the database — never from memory — and any
                answer with numbers arrives with a chart you can pin.
              </p>
              <p className="label mt-5">{t.ai.examples}</p>
              <div className="space-y-1.5">
                {EXAMPLES.map(ex => (
                  <button key={ex} onClick={() => send(ex)}
                    className="w-full text-start text-[13px] px-3 py-2 rounded-md bg-surface-sunken hover:bg-brand-soft text-ink-secondary hover:text-brand-primary transition-colors leading-snug">
                    {ex}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {messages.map((m, i) => (
            <div key={i}>
              {m.role === 'user' ? (
                <div className="flex justify-end">
                  <p className="bg-brand text-brand-on rounded-lg rounded-ee-sm px-3 py-2 text-[13px] max-w-[85%] leading-relaxed">{m.text}</p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  <div className={`rounded-lg px-3 py-2.5 text-[13px] leading-relaxed whitespace-pre-wrap ${m.error ? 'bg-state-criticalSoft text-state-critical' : 'bg-surface-sunken text-ink-primary'}`}>
                    {m.text}
                  </div>

                  {m.charts?.map((c, ci) => {
                    const key = `${i}-${ci}`;
                    const spec = inferSpec(c);
                    return (
                      <div key={ci}>
                        <Chart kind={c.kind} title={c.title} rows={c.rows} xKey={spec.xKey} series={spec.series}
                               unit={c.unit} height={200} note={c.note} />
                        <div className="flex gap-1.5 mt-1.5">
                          {pinned[key] ? (
                            <Badge tone="good">✓ {t.ai.pinned} → {pinned[key]}</Badge>
                          ) : (
                            <>
                              <button className="btn-quiet text-[12px]" onClick={() => pin(c, 'dashboard', key)}>📌 {t.ai.pinDashboard}</button>
                              <button className="btn-quiet text-[12px]" onClick={() => pin(c, 'report', key)}>📄 {t.ai.addReport}</button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {!!m.toolCalls?.length && (
                    <details className="text-[11px] text-ink-muted">
                      <summary className="cursor-pointer hover:text-ink-secondary">{t.ai.usedTools} ({m.toolCalls.length})</summary>
                      <ul className="mt-1.5 space-y-1 ps-3">
                        {m.toolCalls.map((tc, k) => (
                          <li key={k} className={tc.ok ? '' : 'text-state-critical'}>
                            <span className="font-mono">{tc.name}</span>
                            {tc.rowCount != null && ` → ${tc.rowCount} rows`}
                            {tc.error && ` — ${tc.error}`}
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </div>
              )}
            </div>
          ))}

          {busy && <p className="text-[13px] text-ink-muted animate-pulse">{t.ai.thinking}</p>}
          <div ref={endRef} />
        </div>

        {aiReady && !showKey && (
          <form className="p-3 border-t border-line-subtle shrink-0 flex gap-2"
                onSubmit={e => { e.preventDefault(); send(input); }}>
            <input className="input" placeholder={t.ai.ask} value={input} onChange={e => setInput(e.target.value)} disabled={busy} />
            <button className="btn-primary" type="submit" disabled={!input.trim() || busy}>→</button>
          </form>
        )}
        {!aiReady && (
          <div className="p-3 border-t border-line-subtle shrink-0">
            <button className="btn-ghost w-full" onClick={() => { onClose(); navigate('/settings'); }}>{t.ai.addKey} → {t.nav.settings}</button>
          </div>
        )}
      </aside>
    </>
  );
}

export { AiOffNotice };
