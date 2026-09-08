import { useState } from 'react';
import { useApp, useData } from '../state';
import { useI18n } from '../i18n';
import { FilterBar } from '../components/FilterBar';
import { Card, Badge, Skeleton, CopyButton } from '../components/ui';
import { api, downloadUrl, qs } from '../lib/api';
import { nf } from '../lib/format';

export function Exports() {
  const { query, filters, boot, navigate } = useApp();
  const { t } = useI18n();
  const [sections, setSections] = useState<string[]>((boot?.reportSections ?? []).map(s => s.id));
  const [title, setTitle] = useState('');
  const [lang, setLang] = useState<'en' | 'ar'>('en');
  const pb = useData<any>('/export/powerbi/tables');
  const pins = useData<any>('/pins?target=report');
  const [pq, setPq] = useState<string | null>(null);

  const toggle = (id: string) => setSections(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
  const pdfHref = downloadUrl(`/export/pdf${qs(filters as any, { sections: sections.join(','), title: title || undefined, lang })}`);

  return (
    <>
      <FilterBar />
      <p className="text-[13px] text-ink-secondary mb-4 leading-relaxed">
        Exports use the filter bar above, so what you export is exactly what the dashboard is showing.
      </p>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Branded PDF report" subtitle="Print-ready, styled from design-tokens.json — fix the brand tokens and the report follows.">
          <label className="label">Report title</label>
          <input className="input mb-3" placeholder="Saudi Leadership Society — Impact Report" value={title} onChange={e => setTitle(e.target.value)} />

          <label className="label">Sections</label>
          <div className="grid sm:grid-cols-2 gap-1.5 mb-3">
            {(boot?.reportSections ?? []).map(s => (
              <label key={s.id} className="flex items-center gap-2 text-[13px] px-2 py-1.5 rounded hover:bg-surface-sunken cursor-pointer">
                <input type="checkbox" className="accent-[var(--sls-brand-primary)]" checked={sections.includes(s.id)} onChange={() => toggle(s.id)} />
                <span>{s.label}</span>
                {s.id === 'pinned' && !!pins.data?.length && <Badge tone="brand">{pins.data.length}</Badge>}
              </label>
            ))}
          </div>

          <label className="label">Language</label>
          <select className="input mb-3" value={lang} onChange={e => setLang(e.target.value as any)}>
            <option value="en">English</option>
            <option value="ar">العربية (Arabic)</option>
          </select>
          {lang === 'ar' && (
            <p className="text-[12px] text-state-warning mb-3 leading-relaxed">
              Arabic PDF output needs an Arabic TTF at <code className="font-mono">assets/fonts/arabic.ttf</code>. Without it the PDF
              generator has no Arabic glyphs and the export falls back to English — the cover page says so, rather than printing boxes.
              The in-app Arabic interface is unaffected.
            </p>
          )}

          <a className="btn-primary w-full" href={pdfHref} target="_blank" rel="noreferrer">↓ Generate the PDF</a>
        </Card>

        <Card title="Power BI" subtitle="A star schema shaped the way Power BI wants it, plus a one-paste Power Query script.">
          {pb.loading ? <Skeleton rows={4} height="h-9" /> : (
            <>
              <div className="space-y-1.5 mb-4">
                {(pb.data?.tables ?? []).map((tb: any) => (
                  <div key={tb.name} className="flex items-center gap-2 p-2 rounded-md bg-surface-sunken">
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-mono font-medium text-ink-primary">{tb.name}</p>
                      <p className="text-[11px] text-ink-muted leading-snug">{tb.description}</p>
                    </div>
                    <a className="btn-quiet text-[12px]" href={downloadUrl(`/export/powerbi/table?name=${tb.name}&format=csv${query.replace('?', '&')}`)}>CSV</a>
                    <a className="btn-quiet text-[12px]" href={downloadUrl(`/export/powerbi/table?name=${tb.name}&format=json${query.replace('?', '&')}`)}>JSON</a>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap gap-2">
                <a className="btn-primary" href={downloadUrl(`/export/powerbi/powerquery${query}`)}>↓ Power Query script (.m)</a>
                <button className="btn-ghost" onClick={async () => {
                  const b = await api.get<any>(`/export/powerbi/bundle${query}`); setPq(b.powerQuery);
                }}>Preview script</button>
              </div>

              <div className={`mt-4 p-3 rounded-md ${pb.data?.push?.ready ? 'bg-state-goodSoft' : 'bg-state-warningSoft'}`}>
                <p className="text-[13px] font-semibold text-ink-primary mb-1">Live push-dataset refresh</p>
                <p className="text-[12px] text-ink-secondary leading-relaxed">{pb.data?.push?.message}</p>
                {!pb.data?.push?.ready && (
                  <button className="btn-ghost mt-2" onClick={() => navigate('/settings')}>Add Power BI credentials →</button>
                )}
              </div>

              <p className="text-[12px] text-ink-muted mt-3 leading-relaxed">
                Why a script rather than a binary <code className="font-mono">.pbit</code>: a valid template is a packed Power BI Desktop
                artifact, and one generated without Power BI to open it could not be verified. The script provably works, and
                <code className="font-mono"> docs/POWERBI_SETUP.md</code> walks through saving it as a .pbit once the queries load.
              </p>
            </>
          )}
        </Card>

        {pq && (
          <Card title="Power Query script" className="lg:col-span-2"
                actions={<><CopyButton text={pq} /><button className="btn-quiet" onClick={() => setPq(null)}>{t.common.close}</button></>}>
            <pre className="scroll-x text-[11px] font-mono bg-surface-sunken p-3 rounded-md max-h-96 overflow-y-auto whitespace-pre">{pq}</pre>
          </Card>
        )}

        <Card title="Pinned report sections" subtitle="AI answers you added to the report appear in the PDF's “Pinned AI answers” section."
              className="lg:col-span-2" pad={false}>
          {!pins.data?.length ? (
            <p className="p-4 text-[13px] text-ink-muted">
              Nothing pinned yet. Ask the AI analyst a question and use “Add to report” on any chart it returns.
            </p>
          ) : (
            <ul className="divide-y divide-line-subtle">
              {pins.data.map((p: any) => {
                const spec = JSON.parse(p.spec);
                return (
                  <li key={p.id} className="flex items-center gap-3 px-4 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-medium text-ink-primary">{p.title}</p>
                      <p className="text-[11px] text-ink-muted">{spec.kind} · {nf(spec.rows?.length)} rows{spec.note ? ` · ${spec.note}` : ''}</p>
                    </div>
                    <button className="btn-quiet" onClick={async () => { await api.del(`/pins/${p.id}`); pins.reload(); }}>✕</button>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
