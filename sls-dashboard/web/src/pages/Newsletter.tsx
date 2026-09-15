/**
 * The Newsletter workspace.
 *
 * One button generates a complete issue from the month's real data; everything
 * after that is adjustment. Each text box keeps the alternatives the generator
 * produced, so changing the wording is picking an option rather than writing from
 * scratch, and stories can be promoted to the lead slot, swapped between the
 * three cover cards, or pushed back to the bench.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApp, useData } from '../state';
import { api, downloadUrl, ApiError } from '../lib/api';
import { Card, Badge, Stat, Modal, Skeleton, ErrorBox, Toggle, Empty, CopyButton } from '../components/ui';
import { AiOffNotice } from '../components/ApiKeyCard';
import { nf } from '../lib/format';

type Field = { value: string; options?: string[]; sourceId?: number; sourceKind?: string };
type Story = {
  id: number; pillar: string; pillarLabel: string; pillarColor: string;
  date: string; dateLabel: string; title: Field; body: Field; image: string | null;
  facts: Record<string, unknown>;
};
type Doc = any;

const PILLARS: Record<string, string> = {
  GROW: '#9B75F2', CONNECT: '#38B6FF', IMPACT: '#00AEB8',
};

export function Newsletter() {
  const { navigate, aiReady } = useApp();
  const meta = useData<any>('/newsletter');
  const [period, setPeriod] = useState<string>('');
  const [doc, setDoc] = useState<Doc | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<'generate' | 'enrich' | 'save' | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [previewKey, setPreviewKey] = useState(0);
  const [tab, setTab] = useState('cover');
  const [showMilestones, setShowMilestones] = useState(false);

  // Default to the newest month that has activity.
  useEffect(() => {
    if (!period && meta.data?.periods?.length) setPeriod(meta.data.periods[0].period);
  }, [meta.data, period]);

  const loadIssue = useCallback(async (p: string) => {
    if (!p) return;
    try {
      const r = await api.get<any>(`/newsletter/${p}`);
      setDoc(r.exists ? r.doc : null);
      setDirty(false);
      setMsg(r.exists ? null : { ok: true, text: 'No issue for this month yet — generate one.' });
      setPreviewKey(k => k + 1);
    } catch (e: any) { setMsg({ ok: false, text: e?.message ?? String(e) }); }
  }, []);

  useEffect(() => { void loadIssue(period); }, [period, loadIssue]);

  const save = useCallback(async (next: Doc, status?: string) => {
    setBusy('save');
    try {
      await api.put(`/newsletter/${next.period}`, { doc: next, status });
      setDirty(false);
      setPreviewKey(k => k + 1);
    } catch (e: any) { setMsg({ ok: false, text: e?.message ?? String(e) }); }
    finally { setBusy(null); }
  }, []);

  /** Mutate the document immutably and mark it unsaved. */
  const edit = useCallback((fn: (d: Doc) => void) => {
    setDoc((prev: Doc) => {
      if (!prev) return prev;
      const next = structuredClone(prev);
      fn(next);
      return next;
    });
    setDirty(true);
  }, []);

  // Autosave shortly after the last edit, so the preview keeps up without a
  // Save button dance — but never mid-keystroke.
  const timer = useRef<number | null>(null);
  useEffect(() => {
    if (!dirty || !doc) return;
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => { void save(doc); }, 900);
    return () => { if (timer.current) window.clearTimeout(timer.current); };
  }, [dirty, doc, save]);

  const generate = async (withAi: boolean) => {
    setBusy(withAi ? 'enrich' : 'generate');
    setMsg(null);
    try {
      const r = await api.post<any>(`/newsletter/generate?period=${period}`, { ai: withAi });
      setDoc(r.doc);
      setDirty(false);
      setPreviewKey(k => k + 1);
      const e = r.enrichment;
      setMsg({
        ok: true,
        text: e
          ? e.error
            ? `Issue built from your data. The AI rewrote ${e.rewritten} of them before failing — ${e.error}`
            : `Issue built from your data and written up by the AI (${e.rewritten} boxes, each with alternatives).`
          : 'Issue built from your data. Add an Anthropic API key to have the AI write it up.',
      });
      meta.reload();
    } catch (e: any) {
      const needsKey = e instanceof ApiError && e.needsApiKey;
      setMsg({ ok: false, text: needsKey ? 'The AI needs an API key — Settings → AI.' : (e?.message ?? String(e)) });
    } finally { setBusy(null); }
  };

  if (meta.error) return <ErrorBox message={meta.error} onRetry={meta.reload} />;
  if (meta.loading && !meta.data) return <Skeleton rows={4} height="h-28" />;

  const periodMeta = meta.data?.periods?.find((p: any) => p.period === period);

  return (
    <>
      {/* ---- control bar ---- */}
      <Card className="mb-4" pad={false}>
        <div className="flex flex-wrap items-end gap-3 p-3.5">
          <div>
            <label className="label">Month</label>
            <select className="input w-52" value={period} onChange={e => setPeriod(e.target.value)}>
              {(meta.data?.periods ?? []).map((p: any) => (
                <option key={p.period} value={p.period}>{p.label} — {p.events} events</option>
              ))}
            </select>
          </div>
          {doc && (
            <div>
              <label className="label">Issue number</label>
              <input className="input w-28" type="number" min={1} value={doc.issueNumber}
                     onChange={e => edit(d => {
                       d.issueNumber = Number(e.target.value);
                       d.masthead.issueLabel = `MONTHLY NEWSLETTER · ISSUE ${d.issueNumber}`;
                     })} />
            </div>
          )}

          <button className="btn-primary" disabled={!period || busy !== null} onClick={() => generate(aiReady)}>
            {busy === 'generate' || busy === 'enrich' ? 'Generating…' : aiReady ? '✦ Generate with AI' : 'Generate'}
          </button>
          {doc && aiReady && (
            <button className="btn-ghost" disabled={busy !== null} onClick={async () => {
              setBusy('enrich');
              try {
                const r = await api.post<any>(`/newsletter/${period}/enrich`);
                setDoc(r.doc); setPreviewKey(k => k + 1);
                setMsg({ ok: true, text: `Rewrote ${r.enrichment.rewritten} boxes with fresh alternatives.` });
              } catch (e: any) { setMsg({ ok: false, text: e?.message ?? String(e) }); }
              finally { setBusy(null); }
            }}>✦ Rewrite copy</button>
          )}

          <div className="ms-auto flex flex-wrap items-center gap-2">
            {dirty && <span className="text-[12px] text-ink-muted">Saving…</span>}
            {doc && <>
              <button className="btn-ghost" onClick={() => setShowMilestones(true)}>Member milestones</button>
              <a className="btn-ghost" href={downloadUrl(`/newsletter/${period}/preview.html`)} target="_blank" rel="noreferrer">Open full size ↗</a>
              <a className="btn-ghost" href={downloadUrl(`/newsletter/${period}/export.html`)}>↓ HTML</a>
              <button className="btn-accent" onClick={() => {
                const w = window.open(downloadUrl(`/newsletter/${period}/preview.html`), '_blank');
                if (w) w.addEventListener('load', () => setTimeout(() => w.print(), 400));
              }}>🖨 Print / PDF</button>
            </>}
          </div>
        </div>

        {msg && (
          <p className={`px-4 py-2.5 text-[12px] border-t border-line-subtle leading-relaxed ${msg.ok ? 'text-ink-secondary' : 'text-state-critical'}`}>
            {msg.ok ? '' : '✕ '}{msg.text}
          </p>
        )}
      </Card>

      {!aiReady && (
        <div className="mb-4">
          <div className="card p-3.5 bg-state-warningSoft border-state-warning/25">
            <p className="text-[13px] text-ink-secondary leading-relaxed">
              <strong>The newsletter works without AI.</strong> Generate builds a complete, correct issue from your data
              either way — the AI only rewrites the wording and offers alternatives per box.{' '}
              <button className="underline font-medium" onClick={() => navigate('/settings')}>Add an API key</button> to switch that on.
            </p>
          </div>
        </div>
      )}

      {!doc ? (
        <Empty title={`No issue for ${periodMeta?.label ?? 'this month'} yet`}
               body="Generating reads that month's events, chapters, milestones and upcoming calendar, and fills all six pages of the template."
               action={<button className="btn-primary" disabled={!period || busy !== null} onClick={() => generate(aiReady)}>Generate it</button>} />
      ) : (
        <div className="grid gap-4 grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(0,560px)]">
          {/* ---- editor ---- */}
          <div className="space-y-4 min-w-0">
            {!!doc.gaps?.length && (
              <Card title="Worth a look" subtitle="What the month's data could not fill">
                <ul className="space-y-1.5">
                  {doc.gaps.map((g: string, i: number) => (
                    <li key={i} className="text-[13px] text-state-warning leading-relaxed">· {g}</li>
                  ))}
                </ul>
              </Card>
            )}

            <Toggle value={tab} onChange={setTab} options={[
              { value: 'cover', label: 'Page 1 · Cover' },
              { value: 'lead', label: 'Page 2 · Chapter lead' },
              { value: 'chapters', label: 'Pages 3–4 · Chapters' },
              { value: 'members', label: 'Page 5 · Members' },
              { value: 'ahead', label: 'Page 6 · Ahead' },
            ]} />

            {tab === 'cover' && <CoverEditor doc={doc} edit={edit} period={period} />}
            {tab === 'lead' && <LeadEditor doc={doc} edit={edit} period={period} />}
            {tab === 'chapters' && <ChaptersEditor doc={doc} edit={edit} period={period} />}
            {tab === 'members' && <MembersEditor doc={doc} edit={edit} period={period} onManage={() => setShowMilestones(true)} />}
            {tab === 'ahead' && <AheadEditor doc={doc} edit={edit} period={period} />}
          </div>

          {/* ---- live preview ---- */}
          <div className="xl:sticky xl:top-20 h-fit">
            <Card title="Preview" subtitle="Exactly what prints — all six A4 pages" pad={false}
                  actions={<button className="btn-quiet" aria-label="Refresh preview" onClick={() => setPreviewKey(k => k + 1)}>↻</button>}>
              <PreviewFrame key={previewKey} src={downloadUrl(`/newsletter/${period}/preview.html`)} />
            </Card>
          </div>
        </div>
      )}

      <MilestonesModal open={showMilestones} period={period} onClose={() => setShowMilestones(false)}
                       onChanged={() => setMsg({ ok: true, text: 'Milestones updated — regenerate to pull them into page 5.' })} />
    </>
  );
}

/**
 * The newsletter renders at a fixed A4 width, so the preview scales it to fit
 * whatever space it has rather than forcing its container wide — which is what
 * used to push the whole page sideways on a phone.
 */
function PreviewFrame({ src }: { src: string }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.66);
  const PAGE_W = 794;

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const fit = () => setScale(Math.min(1, el.clientWidth / PAGE_W));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const height = Math.round(window.innerHeight * 0.78);
  return (
    <div ref={wrap} className="bg-surface-sunken rounded-b-lg overflow-hidden w-full max-w-full"
         style={{ height }}>
      <iframe title="Newsletter preview" src={src}
              className="border-0 origin-top-left block"
              style={{ width: PAGE_W, height: height / scale, transform: `scale(${scale})` }} />
    </div>
  );
}

// ------------------------------------------------------------ field controls --

/** A text box with its alternatives — the "1 to 3 options per box" control. */
function FieldEditor({ label, field, onChange, rows = 3, hint }:
  { label: string; field: Field; onChange: (v: string) => void; rows?: number; hint?: string }) {
  const options = field.options ?? [];
  const activeIndex = options.indexOf(field.value);
  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <label className="label mb-0">{label}</label>
        {options.length > 1 && (
          <div className="flex items-center gap-1">
            <span className="text-[11px] text-ink-muted">{options.length} options</span>
            {options.map((_, i) => (
              <button key={i} onClick={() => onChange(options[i]!)}
                title={options[i]}
                className={`w-6 h-6 rounded text-[11px] font-semibold transition-colors ${
                  i === activeIndex ? 'bg-brand text-brand-on' : 'bg-surface-sunken text-ink-muted hover:text-ink-secondary'}`}>
                {i + 1}
              </button>
            ))}
          </div>
        )}
      </div>
      {rows <= 1
        ? <input className="input" value={field.value} onChange={e => onChange(e.target.value)} />
        : <textarea className="input py-2 leading-relaxed" style={{ height: `${rows * 22 + 16}px` }}
                    value={field.value} onChange={e => onChange(e.target.value)} />}
      <div className="flex justify-between mt-1">
        {hint && <span className="text-[11px] text-ink-muted">{hint}</span>}
        <span className="text-[11px] text-ink-disabled ms-auto">{field.value.length} chars</span>
      </div>
    </div>
  );
}

/** Photo slot: upload a file or paste a URL. */
function ImageField({ label, value, period, hint, onChange }:
  { label: string; value: string | null; period: string; hint?: string; onChange: (v: string | null) => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const upload = async (file: File) => {
    setBusy(true); setErr(null);
    try {
      const dataUrl = await new Promise<string>((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(String(r.result));
        r.onerror = () => rej(new Error('Could not read that file.'));
        r.readAsDataURL(file);
      });
      const r = await api.post<{ url: string }>(`/newsletter/${period}/asset`, { dataUrl, hint: label.toLowerCase().replace(/\s+/g, '-') });
      onChange(r.url);
    } catch (e: any) { setErr(e?.message ?? String(e)); }
    finally { setBusy(false); }
  };

  return (
    <div>
      <label className="label">{label}</label>
      <div className="flex items-center gap-2">
        {value
          ? <img src={value} alt="" className="w-16 h-12 object-cover rounded border border-line" />
          : <div className="w-16 h-12 rounded bg-surface-sunken border border-line flex items-center justify-center text-ink-disabled text-[10px]">none</div>}
        <label className="btn-ghost cursor-pointer">
          {busy ? '…' : value ? 'Replace' : 'Upload'}
          <input type="file" accept="image/*" className="hidden"
                 onChange={e => e.target.files?.[0] && upload(e.target.files[0])} />
        </label>
        {value && <button className="btn-quiet text-[12px]" onClick={() => onChange(null)}>Remove</button>}
      </div>
      {hint && <p className="text-[11px] text-ink-muted mt-1">{hint}</p>}
      {err && <p className="text-[11px] text-state-critical mt-1">{err}</p>}
    </div>
  );
}

function PillarTag({ label, color }: { label: string; color: string }) {
  return <span className="chip border-transparent text-[11px]" style={{ background: `${color}22`, color }}>{label}</span>;
}

// -------------------------------------------------------------- page editors --

function StoryEditor({ story, edit, path, period, actions }:
  { story: Story; edit: (fn: (d: Doc) => void) => void; path: string; period: string; actions?: React.ReactNode }) {
  const at = (d: Doc): Story => path.split('.').reduce((o: any, k) => o[isNaN(Number(k)) ? k : Number(k)], d);
  return (
    <div className="p-3.5 rounded-md bg-surface-sunken/60 border border-line-subtle space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <PillarTag label={story.pillarLabel} color={story.pillarColor} />
        <span className="text-[12px] text-ink-muted">{story.dateLabel}</span>
        <span className="text-[11px] text-ink-disabled font-mono">event #{story.id}</span>
        <div className="ms-auto flex flex-wrap gap-1.5">{actions}</div>
      </div>
      <FieldEditor label="Headline" rows={1} field={story.title}
                   onChange={v => edit(d => { at(d).title.value = v; })} hint="Max 70 characters" />
      <FieldEditor label="Story" rows={4} field={story.body}
                   onChange={v => edit(d => { at(d).body.value = v; })} hint="Max 520 characters" />
      <ImageField label="Photo" period={period} value={story.image}
                  onChange={v => edit(d => { at(d).image = v; })} />
    </div>
  );
}

function CoverEditor({ doc, edit, period }: { doc: Doc; edit: (fn: (d: Doc) => void) => void; period: string }) {
  /** Promote a bench story into a cover slot, sending the displaced one back. */
  const useFromBench = (benchIdx: number, target: 'hero' | number) => edit(d => {
    const incoming = d.bench[benchIdx];
    d.bench.splice(benchIdx, 1);
    if (target === 'hero') { if (d.hero) d.bench.unshift(d.hero); d.hero = incoming; }
    else { if (d.also[target]) d.bench.unshift(d.also[target]); d.also[target] = incoming; }
  });

  const swapWithHero = (i: number) => edit(d => { const h = d.hero; d.hero = d.also[i]; d.also[i] = h; });
  const toBench = (i: number) => edit(d => { const [s] = d.also.splice(i, 1); d.bench.unshift(s); });
  const move = (i: number, dir: -1 | 1) => edit(d => {
    const j = i + dir;
    if (j < 0 || j >= d.also.length) return;
    [d.also[i], d.also[j]] = [d.also[j], d.also[i]];
  });

  return (
    <div className="space-y-4">
      <Card title="Masthead">
        <div className="grid sm:grid-cols-2 gap-3">
          <div><label className="label">Month</label>
            <input className="input" value={doc.masthead.monthLabel} onChange={e => edit(d => { d.masthead.monthLabel = e.target.value; })} /></div>
          <div><label className="label">Year</label>
            <input className="input" value={doc.masthead.yearLabel} onChange={e => edit(d => { d.masthead.yearLabel = e.target.value; })} /></div>
        </div>
      </Card>

      <Card title="Lead story" subtitle="The month's headline activity, given the largest space on the cover">
        {doc.hero
          ? <StoryEditor story={doc.hero} edit={edit} path="hero" period={period} />
          : <p className="text-[13px] text-ink-muted">No lead story — promote one from the bench below.</p>}
      </Card>

      <Card title="Also this month" subtitle="Three supporting stories. Promote any of them to the lead slot, reorder, or push one back to the bench.">
        <div className="space-y-3">
          {doc.also.map((s: Story, i: number) => (
            <StoryEditor key={`${s.id}-${i}`} story={s} edit={edit} path={`also.${i}`} period={period}
              actions={<>
                <button className="btn-quiet text-[12px]" onClick={() => swapWithHero(i)} title="Swap with the lead story">↑ Make lead</button>
                <button className="btn-quiet text-[12px]" aria-label="Move left" disabled={i === 0} onClick={() => move(i, -1)}>←</button>
                <button className="btn-quiet text-[12px]" aria-label="Move right" disabled={i === doc.also.length - 1} onClick={() => move(i, 1)}>→</button>
                <button className="btn-quiet text-[12px] text-ink-muted" onClick={() => toBench(i)}>Remove</button>
              </>} />
          ))}
          {!doc.also.length && <p className="text-[13px] text-ink-muted">Nothing here — add from the bench below.</p>}
        </div>
      </Card>

      <Card title={`Bench — ${doc.bench.length} more stories`}
            subtitle="Everything else that happened this month. Put any of it on the cover.">
        {!doc.bench.length ? <p className="text-[13px] text-ink-muted">No other activity recorded this month.</p> : (
          <ul className="space-y-1.5 max-h-80 overflow-y-auto">
            {doc.bench.map((s: Story, i: number) => (
              <li key={`${s.id}-${i}`} className="flex flex-wrap items-center gap-2 p-2.5 rounded-md bg-surface-sunken/60">
                <PillarTag label={s.pillarLabel} color={s.pillarColor} />
                <span className="text-[13px] font-medium text-ink-primary truncate max-w-xs">{s.title.value}</span>
                <span className="text-[12px] text-ink-muted">{s.dateLabel}</span>
                <div className="ms-auto flex gap-1.5">
                  <button className="btn-quiet text-[12px]" onClick={() => useFromBench(i, 'hero')}>→ Lead</button>
                  {[0, 1, 2].map(n => (
                    <button key={n} className="btn-quiet text-[12px]" onClick={() => useFromBench(i, n)}>→ Card {n + 1}</button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function LeadEditor({ doc, edit, period }: { doc: Doc; edit: (fn: (d: Doc) => void) => void; period: string }) {
  const cl = doc.chapterLead;
  if (!cl) return <Card title="Chapter lead"><p className="text-[13px] text-ink-muted">No chapter lead on record for this month.</p></Card>;
  return (
    <Card title="Chapter lead of the month" subtitle={`${cl.chapterName} — chosen because it ran the most activity this month`}>
      <div className="space-y-3">
        <div className="grid sm:grid-cols-2 gap-3">
          <div><label className="label">Name</label>
            <input className="input" value={cl.name} onChange={e => edit(d => { d.chapterLead.name = e.target.value; })} /></div>
          <div><label className="label">Role</label>
            <input className="input" value={cl.role} onChange={e => edit(d => { d.chapterLead.role = e.target.value; })} /></div>
        </div>
        <ImageField label="Portrait" period={period} value={cl.portrait}
                    onChange={v => edit(d => { d.chapterLead.portrait = v; })} />
        <FieldEditor label="Pull quote" rows={3} field={cl.quote}
                     onChange={v => edit(d => { d.chapterLead.quote.value = v; })} hint="Max 300 characters" />
        <FieldEditor label="Message to the society" rows={4} field={cl.message}
                     onChange={v => edit(d => { d.chapterLead.message.value = v; })} hint="Max 420 characters" />
        <div>
          <label className="label">Their month in photos</label>
          <div className="space-y-2">
            {cl.photos.map((p: any, i: number) => (
              <div key={i} className="flex flex-wrap items-center gap-2 p-2.5 rounded-md bg-surface-sunken/60">
                <PillarTag label={p.pillarLabel} color={p.pillarColor} />
                <input className="input flex-1 min-w-40" value={p.caption}
                       onChange={e => edit(d => { d.chapterLead.photos[i].caption = e.target.value; })} />
                <ImageField label="" period={period} value={p.image}
                            onChange={v => edit(d => { d.chapterLead.photos[i].image = v; })} />
              </div>
            ))}
            {!cl.photos.length && <p className="text-[13px] text-ink-muted">This chapter ran no activity this month.</p>}
          </div>
        </div>
      </div>
    </Card>
  );
}

function ChaptersEditor({ doc, edit, period }: { doc: Doc; edit: (fn: (d: Doc) => void) => void; period: string }) {
  const block = (key: 'localChapters' | 'globalChapters', title: string, sub: string) => (
    <Card title={title} subtitle={sub}>
      {!doc[key].length ? <p className="text-[13px] text-ink-muted">No activity recorded for these chapters this month.</p> : (
        <div className="space-y-4">
          {doc[key].map((c: any, i: number) => (
            <div key={c.id} className="p-3.5 rounded-md bg-surface-sunken/60 border border-line-subtle">
              <div className="flex items-center gap-2 mb-2.5">
                <h4 className="text-[13px] font-semibold text-ink-primary">{c.name}</h4>
                <Badge tone="neutral">{c.activities.length} activities</Badge>
              </div>
              <div className="grid sm:grid-cols-3 gap-2 mb-3">
                {[0, 1, 2].map(n => (
                  <ImageField key={n} label={n === 0 ? 'Main photo' : `Photo ${n + 1}`} period={period}
                              value={c.images[n]} onChange={v => edit(d => { d[key][i].images[n] = v; })} />
                ))}
              </div>
              <ul className="space-y-1.5">
                {c.activities.map((a: any, j: number) => (
                  <li key={j} className="flex flex-wrap items-center gap-2">
                    <PillarTag label={a.pillarLabel} color={a.pillarColor} />
                    <input className="input flex-1 min-w-40" value={a.title}
                           onChange={e => edit(d => { d[key][i].activities[j].title = e.target.value; })} />
                    <span className="text-[12px] text-ink-muted">{a.dateLabel}</span>
                    <button className="btn-quiet text-[12px]"
                            aria-label="Remove activity" onClick={() => edit(d => { d[key][i].activities.splice(j, 1); })}>✕</button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
  return <div className="space-y-4">
    {block('localChapters', 'Page 3 · Local chapters', 'Across the Kingdom')}
    {block('globalChapters', 'Page 4 · Global chapters', 'SLS around the world')}
  </div>;
}

function MembersEditor({ doc, edit, period, onManage }:
  { doc: Doc; edit: (fn: (d: Doc) => void) => void; period: string; onManage: () => void }) {
  const group = (key: 'appointments' | 'awards' | 'boards', title: string) => (
    <Card title={title} actions={<button className="btn-quiet" onClick={onManage}>Manage source data</button>}>
      {!doc.members[key].length ? <p className="text-[13px] text-ink-muted">Nothing recorded this month.</p> : (
        <div className="space-y-3">
          {doc.members[key].map((m: any, i: number) => (
            <div key={m.id} className="p-3 rounded-md bg-surface-sunken/60 space-y-2.5">
              <input className="input font-medium" value={m.name}
                     onChange={e => edit(d => { d.members[key][i].name = e.target.value; })} />
              <FieldEditor label="Detail" rows={2} field={m.detail}
                           onChange={v => edit(d => { d.members[key][i].detail.value = v; })} hint="Max 160 characters" />
              <ImageField label="Photo" period={period} value={m.image}
                          onChange={v => edit(d => { d.members[key][i].image = v; })} />
            </div>
          ))}
        </div>
      )}
    </Card>
  );

  const prog = doc.members.programs[0];
  return (
    <div className="space-y-4">
      {group('appointments', 'New appointments')}
      {group('awards', 'Awards & recognition')}
      <Card title="Program acceptances">
        {!prog ? <p className="text-[13px] text-ink-muted">Nothing recorded this month.</p> : (
          <div className="space-y-2.5">
            <FieldEditor label="Headline" rows={1} field={prog.title}
                         onChange={v => edit(d => { d.members.programs[0].title.value = v; })} hint="Max 80 characters" />
            <div><label className="label">Members</label>
              <input className="input" value={prog.names}
                     onChange={e => edit(d => { d.members.programs[0].names = e.target.value; })} /></div>
            <ImageField label="Photo" period={period} value={prog.image}
                        onChange={v => edit(d => { d.members.programs[0].image = v; })} />
          </div>
        )}
      </Card>
      {group('boards', 'Board & committee seats')}
    </div>
  );
}

function AheadEditor({ doc, edit, period }: { doc: Doc; edit: (fn: (d: Doc) => void) => void; period: string }) {
  return (
    <div className="space-y-4">
      <Card title="Next three months" subtitle="Pulled from scheduled events. Edit the wording, or drop anything that should not be announced yet.">
        <div className="space-y-4">
          {doc.upcoming.map((m: any, i: number) => (
            <div key={i}>
              <h4 className="text-[13px] font-semibold text-ink-primary mb-2">{m.monthLabel} {m.yearLabel}</h4>
              {!m.entries.length ? <p className="text-[13px] text-ink-muted">Nothing scheduled.</p> : (
                <ul className="space-y-1.5">
                  {m.entries.map((e: any, j: number) => (
                    <li key={j} className="flex flex-wrap items-center gap-2">
                      <PillarTag label={e.pillarLabel} color={e.pillarColor} />
                      <span className="text-[12px] text-ink-muted w-14">{e.dateLabel}</span>
                      <input className="input flex-1 min-w-40" value={e.title}
                             onChange={ev => edit(d => { d.upcoming[i].entries[j].title = ev.target.value; })} />
                      <button className="btn-quiet text-[12px]"
                              aria-label="Remove entry" onClick={() => edit(d => { d.upcoming[i].entries.splice(j, 1); })}>✕</button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </Card>

      <Card title="Photo of the month">
        <ImageField label="Photo" period={period} value={doc.photoOfMonth.image}
                    onChange={v => edit(d => { d.photoOfMonth.image = v; })} />
        <div className="mt-3"><label className="label">Location</label>
          <input className="input" value={doc.photoOfMonth.location}
                 onChange={e => edit(d => { d.photoOfMonth.location = e.target.value; })} /></div>
      </Card>

      <Card title="Closing callout">
        <div className="space-y-3">
          <FieldEditor label="Heading" rows={1} field={doc.callout.title}
                       onChange={v => edit(d => { d.callout.title.value = v; })} />
          <FieldEditor label="Body" rows={3} field={doc.callout.body}
                       onChange={v => edit(d => { d.callout.body.value = v; })} hint="Max 300 characters" />
        </div>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------- milestones --

function MilestonesModal({ open, period, onClose, onChanged }:
  { open: boolean; period: string; onClose: () => void; onChanged: () => void }) {
  const { data, loading, reload } = useData<any[]>(open && period ? `/newsletter/milestones/${period}` : null, [open, period]);
  const [form, setForm] = useState<any>({ kind: 'appointment' });
  const [err, setErr] = useState<string | null>(null);

  const KINDS = [
    { v: 'appointment', l: 'New appointment' },
    { v: 'award', l: 'Award or recognition' },
    { v: 'program_acceptance', l: 'Program acceptance' },
    { v: 'board_seat', l: 'Board or committee seat' },
  ];

  return (
    <Modal open={open} onClose={onClose} title={`Member milestones — ${period}`} wide>
      <p className="text-[13px] text-ink-secondary leading-relaxed mb-3">
        These fill page 5. They are the one part of the newsletter with no other source in the dashboard,
        so add them here (or import them as a CSV) and regenerate.
      </p>
      {loading ? <Skeleton rows={3} height="h-9" /> : (
        <div className="scroll-x max-h-64 overflow-y-auto mb-4">
          <table className="w-full border-collapse">
            <thead><tr><th scope="col" className="th">Member</th><th scope="col" className="th">Kind</th><th scope="col" className="th">Title</th>
              <th scope="col" className="th">Organisation</th><th scope="col" className="th">Date</th><th scope="col" className="th"></th></tr></thead>
            <tbody>
              {(data ?? []).map(m => (
                <tr key={m.id}>
                  <td className="td font-medium text-ink-primary">{m.resolved_name ?? m.member_name ?? '—'}</td>
                  <td className="td">{m.kind.replace(/_/g, ' ')}</td>
                  <td className="td max-w-xs truncate">{m.title}</td>
                  <td className="td">{m.organisation ?? '—'}</td>
                  <td className="td font-mono text-[12px]">{m.date}</td>
                  <td className="td"><button className="btn-quiet text-[12px]"
                    onClick={async () => { await api.del(`/newsletter/milestones/${m.id}`); reload(); onChanged(); }}>✕</button></td>
                </tr>
              ))}
              {!data?.length && <tr><td className="td text-ink-muted" colSpan={6}>Nothing recorded for this month.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      <div className="grid sm:grid-cols-2 gap-3">
        <div><label className="label">Member name *</label>
          <input className="input" value={form.member_name ?? ''} onChange={e => setForm({ ...form, member_name: e.target.value })} /></div>
        <div><label className="label">Kind *</label>
          <select className="input" value={form.kind} onChange={e => setForm({ ...form, kind: e.target.value })}>
            {KINDS.map(k => <option key={k.v} value={k.v}>{k.l}</option>)}
          </select></div>
        <div className="sm:col-span-2"><label className="label">Title *</label>
          <input className="input" placeholder="Elected Vice Chair of the Saudi Leadership Society"
                 value={form.title ?? ''} onChange={e => setForm({ ...form, title: e.target.value })} /></div>
        <div><label className="label">Organisation</label>
          <input className="input" value={form.organisation ?? ''} onChange={e => setForm({ ...form, organisation: e.target.value })} /></div>
        <div><label className="label">Date *</label>
          <input className="input" type="date" value={form.date ?? ''} onChange={e => setForm({ ...form, date: e.target.value })} /></div>
      </div>
      {err && <p className="mt-2 text-[12px] text-state-critical">{err}</p>}
      <div className="flex justify-end gap-2 mt-4">
        <button className="btn-ghost" onClick={onClose}>Close</button>
        <button className="btn-primary" disabled={!form.member_name || !form.title || !form.date}
          onClick={async () => {
            setErr(null);
            try { await api.post('/newsletter/milestones', form); setForm({ kind: form.kind }); reload(); onChanged(); }
            catch (e: any) { setErr(e?.message ?? String(e)); }
          }}>Add</button>
      </div>
    </Modal>
  );
}
