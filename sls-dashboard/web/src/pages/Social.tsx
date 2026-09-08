/**
 * Social Listening — three layers, honestly labelled in the UI itself.
 */
import { useState } from 'react';
import { useApp, useData } from '../state';
import { Card, Badge, Stat, Modal, Skeleton, ErrorBox, Toggle, Empty, CopyButton } from '../components/ui';
import { AiOffNotice } from '../components/ApiKeyCard';
import { api } from '../lib/api';
import { nf } from '../lib/format';

export function Social() {
  const { aiReady, navigate } = useApp();
  const [status, setStatus] = useState('all');
  const [capturing, setCapturing] = useState(false);
  const { data, loading, error, reload } = useData<any>(`/linkedin${status === 'all' ? '' : `?status=${status}`}`, [status]);
  const [busy, setBusy] = useState<number | null>(null);
  const [pollResult, setPollResult] = useState<string | null>(null);

  if (error) return <ErrorBox message={error} onRetry={reload} />;

  const triage = async (id: number) => {
    setBusy(id);
    try { await api.post(`/linkedin/${id}/triage`); reload(); }
    catch (e: any) { setPollResult(e?.message ?? String(e)); }
    finally { setBusy(null); }
  };

  return (
    <>
      <div className="card p-4 mb-5 bg-state-infoSoft border-state-info/20">
        <p className="text-[13px] text-ink-primary leading-relaxed">
          <strong>How this works, plainly.</strong> LinkedIn does not permit open scraping, and its official API does not expose
          public-post search for a use case like this. So this module ships three layers and lets you choose:
          <strong> Layer 2</strong> (live now) — paste a post URL and it is captured, scored and tagged to a member;
          <strong> Layer 1</strong> (pluggable) — a scheduled connector for a licensed provider, inert until you supply a key and
          implement its request mapping; <strong>Layer 3</strong> (live, needs an AI key) — AI triage that drafts reshare captions
          and flags high-engagement posts.
        </p>
      </div>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 mb-5">
        <Stat label="Captured mentions" value={nf(data?.totals?.total)} />
        <Stat label="Awaiting review" value={nf(data?.totals?.unreviewed)} tone="accent" />
        <Stat label="Priority flagged" value={nf(data?.totals?.priority)} tone="neutral" />
        <Stat label="Total engagement" value={nf(data?.totals?.engagement)} tone="neutral" />
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <Toggle value={status} onChange={setStatus} options={[
          { value: 'all', label: 'All' }, { value: 'new', label: 'New' },
          { value: 'reviewed', label: 'Reviewed' }, { value: 'shared', label: 'Shared' }]} />
        <button className="btn-primary ms-auto" onClick={() => setCapturing(true)}>+ Capture a post</button>
        <button className="btn-ghost" onClick={async () => {
          const r = await api.post<any>('/linkedin/poll'); setPollResult(`${r.connector}: ${r.message}`);
        }}>↻ Run connector poll</button>
      </div>

      {pollResult && (
        <div className="card p-3 mb-4 bg-state-warningSoft border-state-warning/20">
          <p className="text-[12px] text-ink-secondary leading-relaxed">{pollResult}</p>
          <button className="btn-quiet mt-1.5 text-[12px]" onClick={() => setPollResult(null)}>Dismiss</button>
        </div>
      )}

      {!aiReady && (
        <div className="mb-4"><AiOffNotice onAddKey={() => navigate('/settings')} /></div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card title="Social wall" subtitle="Captured member posts mentioning the program" pad={false}>
            {loading && !data ? <div className="p-4"><Skeleton rows={4} height="h-20" /></div> : !data?.rows?.length ? (
              <Empty title="No mentions captured yet" body="Paste a LinkedIn post URL to capture the first one."
                     action={<button className="btn-primary" onClick={() => setCapturing(true)}>Capture a post</button>} />
            ) : (
              <ul className="divide-y divide-line-subtle max-h-[720px] overflow-y-auto">
                {data.rows.map((m: any) => (
                  <li key={m.id} className="p-4">
                    <div className="flex items-start justify-between gap-3 mb-1.5">
                      <div className="min-w-0">
                        <p className="text-[13px] font-semibold text-ink-primary">{m.member_name ?? m.author_name ?? 'Unknown author'}</p>
                        <p className="text-[11px] text-ink-muted">{m.cohort_type ?? ''} {m.company ? `· ${m.company}` : ''} · {m.post_date}</p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {!!m.priority_flag && <Badge tone="warning">★ priority</Badge>}
                        <Badge tone={m.sls_relevance_score >= 70 ? 'good' : m.sls_relevance_score >= 40 ? 'info' : 'neutral'}>
                          {nf(m.sls_relevance_score)}% relevant
                        </Badge>
                      </div>
                    </div>
                    <p className="text-[13px] text-ink-secondary leading-relaxed">{m.content_snippet}</p>
                    <div className="flex flex-wrap items-center gap-1.5 mt-2">
                      <Badge tone="neutral">{nf(m.engagement_count)} engagements</Badge>
                      <Badge tone="neutral">{m.status}</Badge>
                      {JSON.parse(m.matched_keywords || '[]').map((k: string) => <Badge key={k} tone="brand">{k}</Badge>)}
                      <a className="btn-quiet text-[12px] ms-auto" href={m.post_url} target="_blank" rel="noreferrer">Open ↗</a>
                      <button className="btn-quiet text-[12px]" disabled={busy === m.id} onClick={() => triage(m.id)}>
                        {busy === m.id ? '…' : '✦ AI triage'}
                      </button>
                      <select className="input h-7 w-auto text-[12px]" value={m.status}
                              onChange={async e => { await api.post(`/linkedin/${m.id}/status`, { status: e.target.value }); reload(); }}>
                        {['new', 'reviewed', 'shared', 'ignored'].map(s => <option key={s}>{s}</option>)}
                      </select>
                    </div>
                    {m.ai_caption && (
                      <div className="mt-2.5 p-2.5 rounded-md bg-brand-softer">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted mb-1">Suggested reshare caption</p>
                        <p className="text-[13px] text-ink-primary leading-relaxed whitespace-pre-wrap">{m.ai_caption}</p>
                        <div className="mt-1.5"><CopyButton text={m.ai_caption} /></div>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <Card title="Connectors" subtitle="Layer 1 — scheduled polling">
            <ul className="space-y-2.5">
              {(data?.connectors ?? []).map((c: any) => (
                <li key={c.name} className="p-3 rounded-md bg-surface-sunken">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <p className="text-[13px] font-semibold text-ink-primary">{c.label}</p>
                    <Badge tone={c.ready ? 'good' : c.configured ? 'warning' : 'neutral'}>
                      {c.ready ? 'ready' : c.configured ? 'needs key' : 'available'}
                    </Badge>
                  </div>
                  <p className="text-[12px] text-ink-muted leading-snug">{c.notes}</p>
                  {c.docsUrl && <a className="text-[12px] text-state-info" href={c.docsUrl} target="_blank" rel="noreferrer">Provider docs ↗</a>}
                </li>
              ))}
            </ul>
            <button className="btn-ghost w-full mt-3" onClick={() => navigate('/settings')}>Configure in Settings →</button>
          </Card>

          <Card title="Tracked keywords">
            <div className="flex flex-wrap gap-1.5">
              {(data?.keywords ?? []).map((k: string) => <Badge key={k} tone="brand">{k}</Badge>)}
            </div>
            <p className="text-[12px] text-ink-muted mt-2.5 leading-relaxed">
              A captured post is scored against these. The exact program name scores highest, a hashtag next, a bare "Misk" lowest.
            </p>
          </Card>

          <MonthlyHighlights />
        </div>
      </div>

      <CaptureModal open={capturing} onClose={() => setCapturing(false)} onSaved={() => { setCapturing(false); reload(); }} />
    </>
  );
}

function MonthlyHighlights() {
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const { data } = useData<any>(`/linkedin/highlights?month=${month}`, [month]);
  return (
    <Card title="Monthly highlights reel" subtitle="Exportable digest for the community update">
      <input type="month" className="input mb-3" value={month} onChange={e => setMonth(e.target.value)} />
      <div className="grid grid-cols-2 gap-2 text-center">
        {[['Posts', data?.totals?.posts], ['Engagement', data?.totals?.engagement],
          ['Members', data?.totals?.members], ['Avg relevance', data?.totals?.avg_relevance]].map(([l, v]) => (
          <div key={l as string} className="p-2.5 rounded-md bg-surface-sunken">
            <p className="text-[11px] uppercase tracking-wide text-ink-muted">{l}</p>
            <p className="text-lg font-bold text-brand-primary">{nf(v as number)}</p>
          </div>
        ))}
      </div>
      <button className="btn-ghost w-full mt-3" onClick={() => {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob); a.download = `sls-social-highlights-${month}.json`; a.click();
        URL.revokeObjectURL(a.href);
      }}>Download digest (JSON)</button>
    </Card>
  );
}

function CaptureModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const [url, setUrl] = useState('');
  const [snippet, setSnippet] = useState('');
  const [memberQuery, setMemberQuery] = useState('');
  const [memberId, setMemberId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null);
  const members = useData<any>(memberQuery.length > 1 ? `/members?q=${encodeURIComponent(memberQuery)}&limit=8` : null, [memberQuery]);

  const capture = async () => {
    setBusy(true); setResult(null);
    try {
      setResult(await api.post<any>('/linkedin/capture', { url, snippet: snippet || undefined, memberId }));
    } catch (e: any) { setResult({ error: e?.message ?? String(e) }); }
    finally { setBusy(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title="Capture a LinkedIn post">
      <div className="space-y-3">
        <div><label className="label">Post URL *</label>
          <input className="input" placeholder="https://www.linkedin.com/posts/…" value={url} onChange={e => setUrl(e.target.value)} /></div>
        <div>
          <label className="label">Tag to a member</label>
          <input className="input" placeholder="Search by name or member code" value={memberQuery}
                 onChange={e => { setMemberQuery(e.target.value); setMemberId(null); }} />
          {!!members.data?.rows?.length && !memberId && (
            <ul className="mt-1 card max-h-40 overflow-y-auto p-1">
              {members.data.rows.map((m: any) => (
                <li key={m.id}>
                  <button className="w-full text-start px-2 py-1.5 rounded hover:bg-surface-sunken text-[13px]"
                          onClick={() => { setMemberId(m.id); setMemberQuery(m.name); }}>
                    {m.name} <span className="text-ink-muted font-mono text-[11px]">{m.member_code}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <label className="label">Post text</label>
          <textarea className="input h-24 py-2" placeholder="Paste the post text — used for relevance scoring."
                    value={snippet} onChange={e => setSnippet(e.target.value)} />
          <p className="text-[11px] text-ink-muted mt-1 leading-relaxed">
            The server tries to read the post's OpenGraph metadata first. LinkedIn usually refuses anonymous requests,
            so pasting the text here is the reliable path — and the result below will tell you exactly which happened.
          </p>
        </div>
      </div>
      {result && (
        <div className={`mt-3 p-3 rounded-md text-[12px] leading-relaxed ${result.error ? 'bg-state-criticalSoft text-state-critical' : 'bg-state-goodSoft text-state-good'}`}>
          {result.error ? result.error : (
            <>
              {result.created ? 'Captured.' : 'Updated the existing capture.'} Relevance {result.relevance.score}%
              {result.relevance.matched.length ? ` (matched: ${result.relevance.matched.join(', ')})` : ' — no program keywords matched'}.
              <span className="block mt-1 text-ink-muted">
                Metadata fetch: {result.metadata.fetched ? 'succeeded' : `not available — ${result.metadata.reason}`}
              </span>
            </>
          )}
        </div>
      )}
      <div className="flex justify-end gap-2 mt-4">
        <button className="btn-ghost" onClick={onClose}>Close</button>
        <button className="btn-primary" onClick={capture} disabled={!url.trim() || busy}>{busy ? 'Capturing…' : 'Capture'}</button>
        {result && !result.error && <button className="btn-accent" onClick={onSaved}>Done</button>}
      </div>
    </Modal>
  );
}
