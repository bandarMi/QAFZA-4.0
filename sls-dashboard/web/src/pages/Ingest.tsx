/**
 * Data ingestion — CSV upload with a column-mapping step.
 * The file is parsed in the browser so the mapping UI can show the real headers
 * and a preview before anything is written.
 */
import { useState } from 'react';
import { useData } from '../state';
import { Card, Badge, Skeleton, Empty } from '../components/ui';
import { api, downloadUrl } from '../lib/api';
import { nf } from '../lib/format';

/** RFC4180-ish CSV parser: handles quoted fields, embedded commas and newlines. */
function parseCsv(text: string): { headers: string[]; rows: Array<Record<string, string>> } {
  const out: string[][] = [];
  let row: string[] = [], field = '', inQuotes = false;
  const s = text.replace(/^﻿/, '');           // strip a BOM from Excel exports
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (inQuotes) {
      if (c === '"') { if (s[i + 1] === '"') { field += '"'; i++; } else inQuotes = false; }
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); out.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field || row.length) { row.push(field); out.push(row); }
  const headers = (out.shift() ?? []).map(h => h.trim());
  const rows = out.filter(r => r.some(v => v.trim() !== ''))
    .map(r => Object.fromEntries(headers.map((h, i) => [h, (r[i] ?? '').trim()])));
  return { headers, rows };
}

export function Ingest() {
  const schemas = useData<any>('/ingest/schemas');
  const jobs = useData<any>('/ingest/jobs');
  const scheduled = useData<any>('/ingest/scheduled');
  const [target, setTarget] = useState('members');
  const [file, setFile] = useState<{ name: string; headers: string[]; rows: any[] } | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [result, setResult] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  const schema = schemas.data?.[target];

  const onFile = async (f: File) => {
    const text = await f.text();
    const { headers, rows } = parseCsv(text);
    setFile({ name: f.name, headers, rows });
    setResult(null);
    const s = await api.post<any>('/ingest/suggest', { target, headers });
    setMapping(s.mapping);
  };

  const run = async () => {
    if (!file) return;
    setBusy(true);
    try {
      setResult(await api.post('/ingest/import', { target, mapping, rows: file.rows, filename: file.name }));
      jobs.reload();
    } catch (e: any) { setResult({ error: e?.message ?? String(e) }); }
    finally { setBusy(false); }
  };

  const missingRequired = (schema?.fields ?? []).filter((f: any) => f.required && !mapping[f.field]).map((f: any) => f.label);

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="lg:col-span-2 space-y-4">
        <Card title="Upload a CSV" subtitle="Export from Excel, Google Sheets or your CRM as CSV. Re-uploading a corrected file updates rows rather than duplicating them.">
          <label className="label">Import into</label>
          <select className="input mb-3" value={target} onChange={e => { setTarget(e.target.value); setFile(null); setMapping({}); setResult(null); }}>
            {Object.entries(schemas.data ?? {}).map(([k, v]: any) => <option key={k} value={k}>{v.label}</option>)}
          </select>

          <div className="flex flex-wrap gap-2 mb-3">
            <label className="btn-primary cursor-pointer">
              Choose a CSV file
              <input type="file" accept=".csv,text/csv" className="hidden"
                     onChange={e => e.target.files?.[0] && onFile(e.target.files[0])} />
            </label>
            <a className="btn-ghost" href={downloadUrl(`/ingest/template/${target}`)}>↓ Blank template</a>
          </div>

          {schema && (
            <p className="text-[12px] text-ink-muted leading-relaxed">
              Rows are matched on <strong>{schema.naturalKey}</strong>. Existing rows are updated; new ones are inserted.
            </p>
          )}

          {file && (
            <div className="mt-4">
              <div className="flex items-center gap-2 mb-2">
                <Badge tone="brand">{file.name}</Badge>
                <Badge tone="neutral">{nf(file.rows.length)} rows</Badge>
                <Badge tone="neutral">{file.headers.length} columns</Badge>
              </div>

              <p className="label mt-3">Column mapping</p>
              <div className="grid sm:grid-cols-2 gap-2">
                {(schema?.fields ?? []).map((f: any) => (
                  <div key={f.field}>
                    <label className="label">
                      {f.label}{f.required && <span className="text-state-critical"> *</span>}
                    </label>
                    <select className={`input ${f.required && !mapping[f.field] ? 'border-state-critical' : ''}`}
                            value={mapping[f.field] ?? ''}
                            onChange={e => setMapping(m => ({ ...m, [f.field]: e.target.value }))}>
                      <option value="">— not mapped —</option>
                      {file.headers.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                    {f.hint && <p className="text-[11px] text-ink-muted mt-0.5 leading-snug">{f.hint}</p>}
                  </div>
                ))}
              </div>

              <p className="label mt-4">Preview (first 5 rows, as mapped)</p>
              <div className="scroll-x border border-line-subtle rounded-md">
                <table className="w-full border-collapse">
                  <thead><tr>{Object.keys(mapping).filter(k => mapping[k]).map(k => <th key={k} className="th">{k}</th>)}</tr></thead>
                  <tbody>
                    {file.rows.slice(0, 5).map((r, i) => (
                      <tr key={i}>
                        {Object.keys(mapping).filter(k => mapping[k]).map(k => (
                          <td key={k} className="td">{String(r[mapping[k]!] ?? '')}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {!!missingRequired.length && (
                <p className="mt-3 text-[12px] text-state-critical">Map these required columns first: {missingRequired.join(', ')}</p>
              )}

              <button className="btn-primary mt-3" onClick={run} disabled={busy || !!missingRequired.length}>
                {busy ? 'Importing…' : `Import ${nf(file.rows.length)} rows`}
              </button>
            </div>
          )}

          {result && (
            <div className={`mt-4 p-3 rounded-md ${result.error ? 'bg-state-criticalSoft' : 'bg-state-goodSoft'}`}>
              {result.error ? <p className="text-[13px] text-state-critical">{result.error}</p> : (
                <>
                  <p className="text-[13px] text-state-good font-medium">
                    {nf(result.inserted)} inserted · {nf(result.updated)} updated · {nf(result.skipped)} skipped
                  </p>
                  {!!result.errors?.length && (
                    <details className="mt-2 text-[12px] text-ink-secondary">
                      <summary className="cursor-pointer">{result.errors.length} row errors</summary>
                      <ul className="mt-1.5 space-y-0.5 max-h-40 overflow-y-auto">
                        {result.errors.map((e: any, i: number) => <li key={i}>Row {e.row}: {e.message}</li>)}
                      </ul>
                    </details>
                  )}
                  <p className="text-[12px] text-ink-muted mt-1.5">
                    Any imported attendance re-ran the hours engine automatically.
                  </p>
                </>
              )}
            </div>
          )}
        </Card>

        <Card title="Import history" pad={false}>
          {jobs.loading ? <div className="p-4"><Skeleton rows={3} height="h-8" /></div> : !jobs.data?.length ? (
            <Empty title="No imports yet" />
          ) : (
            <div className="scroll-x">
              <table className="w-full border-collapse">
                <thead><tr><th className="th">When</th><th className="th">Target</th><th className="th">File</th>
                  <th className="th text-end">Rows</th><th className="th text-end">Inserted</th>
                  <th className="th text-end">Updated</th><th className="th text-end">Skipped</th><th className="th">Status</th></tr></thead>
                <tbody>
                  {jobs.data.map((j: any) => (
                    <tr key={j.id}>
                      <td className="td font-mono text-[12px]">{j.created_at}</td>
                      <td className="td">{j.target_table}</td>
                      <td className="td">{j.filename ?? '—'}</td>
                      <td className="td text-end tabular-nums">{nf(j.row_count)}</td>
                      <td className="td text-end tabular-nums">{nf(j.inserted)}</td>
                      <td className="td text-end tabular-nums">{nf(j.updated)}</td>
                      <td className="td text-end tabular-nums">{nf(j.skipped)}</td>
                      <td className="td"><Badge tone={j.status === 'completed' ? 'good' : 'warning'}>{j.status}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      <Card title="Scheduled imports" subtitle="Layer for a future CRM / Airtable / Sheets sync">
        <Badge tone="warning">Not wired to a source yet</Badge>
        <p className="text-[13px] text-ink-secondary mt-2.5 leading-relaxed">{scheduled.data?.message}</p>
        <ul className="mt-3 space-y-2">
          {(scheduled.data?.supportedSources ?? []).map((s: any) => (
            <li key={s.id} className="p-2.5 rounded-md bg-surface-sunken">
              <p className="text-[13px] font-medium text-ink-primary">{s.label}</p>
              <p className="text-[12px] text-ink-muted leading-snug">{s.needs}</p>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
