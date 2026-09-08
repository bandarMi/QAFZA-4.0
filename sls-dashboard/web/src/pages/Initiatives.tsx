import { useState } from 'react';
import { useApp, useData } from '../state';
import { useI18n } from '../i18n';
import { FilterBar } from '../components/FilterBar';
import { Chart, Provenance } from '../components/Chart';
import { Card, Badge, Modal, Skeleton, ErrorBox, Toggle, Empty, CopyButton } from '../components/ui';
import { api, qs, downloadUrl } from '../lib/api';
import { hours, nf, pct } from '../lib/format';

export function Initiatives() {
  const { query, filters, boot } = useApp();
  const { t } = useI18n();
  const [tab, setTab] = useState('initiatives');
  const inits = useData<any>(`/initiatives${query}`);
  const events = useData<any>(`/events${qs(filters as any, { limit: 300 })}`, [query]);
  const [openEvent, setOpenEvent] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);

  if (inits.error) return <ErrorBox message={inits.error} onRetry={inits.reload} />;

  return (
    <>
      <FilterBar />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Toggle value={tab} onChange={setTab} options={[
          { value: 'initiatives', label: 'Initiatives' }, { value: 'events', label: 'Events' }]} />
        {tab === 'events' && <button className="btn-primary ms-auto" onClick={() => setCreating(true)}>+ New event</button>}
      </div>

      {tab === 'initiatives' && (inits.loading && !inits.data ? <Skeleton rows={3} height="h-64" /> : (
        <div className="grid gap-4">
          <Chart kind="bar" title="Engagement hours by initiative" horizontal height={360}
                 rows={inits.data?.rows ?? []} xKey="name" series={[{ key: 'hours', label: 'Hours' }]} unit="h"
                 note={<Provenance p={inits.data?.provenance} />} />

          <Card title="Initiative performance"
                subtitle="Member reach is this initiative's unique members as a share of the whole society — the event-to-member conversion view."
                pad={false}>
            <div className="scroll-x">
              <table className="w-full border-collapse">
                <thead><tr>
                  <th className="th">Initiative</th><th className="th">Pillar</th><th className="th">Council owner</th>
                  <th className="th">Cadence</th><th className="th text-end">Events</th><th className="th text-end">Attendees</th>
                  <th className="th text-end">Per event</th><th className="th text-end">Hours</th>
                  <th className="th text-end">Members</th><th className="th text-end">Reach</th><th className="th text-end">Satisfaction</th>
                </tr></thead>
                <tbody>
                  {(inits.data?.rows ?? []).map((r: any) => (
                    <tr key={r.initiative_id} className="hover:bg-surface-sunken/60">
                      <td className="td font-medium text-ink-primary">{r.name}<span className="block text-[11px] text-ink-muted">{r.name_ar}</span></td>
                      <td className="td"><span className="inline-flex items-center gap-1.5">
                        <i className="w-2 h-2 rounded-sm" style={{ background: boot?.tokens?.color?.pillar?.[r.pillar] }} />{r.pillar}</span></td>
                      <td className="td">{r.owner_council_role ?? '—'}</td>
                      <td className="td">{r.cadence ?? '—'}</td>
                      <td className="td text-end tabular-nums">{nf(r.events)}</td>
                      <td className="td text-end tabular-nums">{nf(r.attendees)}</td>
                      <td className="td text-end tabular-nums">{nf(r.attendees_per_event, 1)}</td>
                      <td className="td text-end tabular-nums font-semibold text-brand-primary">{hours(r.hours)}</td>
                      <td className="td text-end tabular-nums">{nf(r.unique_members)}</td>
                      <td className="td text-end tabular-nums">{pct(r.member_reach_pct, 1)}</td>
                      <td className="td text-end tabular-nums">{r.avg_satisfaction ? `${nf(r.avg_satisfaction, 2)}/5` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      ))}

      {tab === 'events' && (
        <Card title="Events" subtitle="Closing an event auto-generates engagement hours for every checked-in attendee." pad={false}>
          {events.loading && !events.data ? <div className="p-4"><Skeleton rows={6} height="h-9" /></div> : !events.data?.rows?.length ? (
            <Empty title="No events match" />
          ) : (
            <div className="scroll-x max-h-[640px] overflow-y-auto">
              <table className="w-full border-collapse">
                <thead className="sticky top-0 bg-surface-raised"><tr>
                  <th className="th">Date</th><th className="th">Event</th><th className="th">Initiative</th>
                  <th className="th">Type</th><th className="th text-end">Attendees</th><th className="th text-end">Linked</th>
                  <th className="th text-end">Checked in</th><th className="th text-end">Duration</th>
                  <th className="th text-end">Hours logged</th><th className="th">Status</th><th className="th"></th>
                </tr></thead>
                <tbody>
                  {events.data.rows.map((e: any) => (
                    <tr key={e.id} className="hover:bg-surface-sunken/60">
                      <td className="td font-mono text-[12px]">{e.date}</td>
                      <td className="td font-medium text-ink-primary max-w-xs truncate">{e.name}</td>
                      <td className="td">{e.initiative_name ?? '—'}</td>
                      <td className="td">{e.type}</td>
                      <td className="td text-end tabular-nums">{nf(e.attendee_count)}</td>
                      <td className="td text-end tabular-nums">{nf(e.linked_attendees)}</td>
                      <td className="td text-end tabular-nums">{nf(e.checked_in)}</td>
                      <td className="td text-end tabular-nums">{e.duration_hours}h</td>
                      <td className="td text-end tabular-nums font-semibold text-brand-primary">{hours(e.hours_logged)}</td>
                      <td className="td"><Badge tone={e.status === 'closed' ? 'good' : e.status === 'cancelled' ? 'critical' : 'neutral'}>{e.status}</Badge></td>
                      <td className="td"><button className="btn-quiet text-[12px]" onClick={() => setOpenEvent(e.id)}>{t.common.open}</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      <EventModal id={openEvent} onClose={() => setOpenEvent(null)} onChanged={() => { events.reload(); inits.reload(); }} />
      <NewEventModal open={creating} onClose={() => setCreating(false)} onSaved={() => { setCreating(false); events.reload(); }} />
    </>
  );
}

function NewEventModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const { boot } = useApp();
  const [f, setF] = useState<any>({ type: 'in-person', duration_hours: 2, status: 'planned', activity_type: 'event attendance' });
  const set = (k: string, v: any) => setF((s: any) => ({ ...s, [k]: v }));
  return (
    <Modal open={open} onClose={onClose} title="New event">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2"><label className="label">Name *</label>
          <input className="input" value={f.name ?? ''} onChange={e => set('name', e.target.value)} /></div>
        <div><label className="label">Date *</label>
          <input className="input" type="date" value={f.date ?? ''} onChange={e => set('date', e.target.value)} /></div>
        <div><label className="label">Initiative</label>
          <select className="input" value={f.initiative_id ?? ''} onChange={e => set('initiative_id', e.target.value ? Number(e.target.value) : null)}>
            <option value="">—</option>
            {(boot?.options?.initiatives ?? []).map((i: any) => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select></div>
        <div><label className="label">Format</label>
          <select className="input" value={f.type} onChange={e => set('type', e.target.value)}>
            <option>in-person</option><option>virtual</option><option>hybrid</option></select></div>
        <div><label className="label">Duration (hours)</label>
          <input className="input" type="number" step="0.25" value={f.duration_hours} onChange={e => set('duration_hours', Number(e.target.value))} /></div>
        <div><label className="label">Activity type</label>
          <select className="input" value={f.activity_type} onChange={e => set('activity_type', e.target.value)}>
            {(boot?.options?.activityTypes ?? []).map((a: string) => <option key={a}>{a}</option>)}</select></div>
        <div><label className="label">Location</label>
          <input className="input" value={f.location ?? ''} onChange={e => set('location', e.target.value)} /></div>
      </div>
      <p className="text-[12px] text-ink-muted mt-3 leading-relaxed">
        Duration and activity type drive the auto-calculated hours when you close the event.
      </p>
      <div className="flex justify-end gap-2 mt-4">
        <button className="btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn-primary" disabled={!f.name || !f.date}
                onClick={async () => { await api.post('/events', f); onSaved(); }}>Save</button>
      </div>
    </Modal>
  );
}

/** Event detail: attendance, QR check-in, hours posting and the recap card. */
function EventModal({ id, onClose, onChanged }: { id: number | null; onClose: () => void; onChanged: () => void }) {
  const { data, loading, reload } = useData<any>(id ? `/events/${id}` : null, [id]);
  const [tab, setTab] = useState('attendance');
  const [qr, setQr] = useState<any>(null);
  const [recap, setRecap] = useState<any>(null);
  const [quote, setQuote] = useState('');
  const [size, setSize] = useState('linkedin');

  const loadQr = async () => setQr(await api.get(`/events/${id}/qr`));
  const loadRecap = async () => {
    const r = await api.get<any>(`/events/${id}/recap`);
    setRecap(r); setQuote(r.suggestion?.quote ?? '');
  };

  return (
    <Modal open={!!id} onClose={onClose} title={data?.event?.name ?? 'Event'} wide>
      {loading || !data ? <Skeleton rows={4} height="h-16" /> : (
        <>
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <Badge tone="brand">{data.event.initiative_name ?? 'No initiative'}</Badge>
            <Badge tone="neutral">{data.event.date}</Badge>
            <Badge tone="neutral">{data.event.duration_hours}h · {data.event.activity_type}</Badge>
            <Badge tone={data.event.status === 'closed' ? 'good' : 'neutral'}>{data.event.status}</Badge>
            {data.event.status !== 'closed' && (
              <button className="btn-primary ms-auto" onClick={async () => { await api.post(`/events/${id}/close`); reload(); onChanged(); }}>
                Close event & post hours
              </button>
            )}
          </div>

          <Toggle value={tab} onChange={v => { setTab(v); if (v === 'qr' && !qr) void loadQr(); if (v === 'recap' && !recap) void loadRecap(); }}
                  options={[{ value: 'attendance', label: `Attendance (${data.attendance.length})` },
                            { value: 'hours', label: `Hours (${data.logs.length})` },
                            { value: 'qr', label: 'QR check-in' },
                            { value: 'recap', label: 'Recap card' }]} />

          <div className="mt-3">
            {tab === 'attendance' && (
              <div className="scroll-x max-h-96 overflow-y-auto">
                <table className="w-full border-collapse">
                  <thead className="sticky top-0 bg-surface-raised"><tr>
                    <th className="th">Member</th><th className="th">Role</th><th className="th">Checked in</th>
                    <th className="th">Checked out</th><th className="th">Source</th></tr></thead>
                  <tbody>
                    {data.attendance.map((a: any) => (
                      <tr key={a.id}>
                        <td className="td font-medium text-ink-primary">{a.name}<span className="block text-[11px] text-ink-muted font-mono">{a.member_code}</span></td>
                        <td className="td">{a.role}</td>
                        <td className="td font-mono text-[12px]">{a.checked_in_at ?? '—'}</td>
                        <td className="td font-mono text-[12px]">{a.checked_out_at ?? <span className="text-state-warning">no check-out</span>}</td>
                        <td className="td"><Badge tone={a.source === 'qr' ? 'good' : 'neutral'}>{a.source}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {tab === 'hours' && (
              <>
                <p className="text-[12px] text-ink-muted mb-2 leading-relaxed">
                  Hours below were generated by the engine, not entered by hand. A member with a check-in but no check-out
                  falls back to the event's scheduled duration — the note on each row says which basis was used.
                </p>
                <div className="scroll-x max-h-96 overflow-y-auto">
                  <table className="w-full border-collapse">
                    <thead className="sticky top-0 bg-surface-raised"><tr>
                      <th className="th">Member id</th><th className="th text-end">Hours</th><th className="th">Direction</th>
                      <th className="th">Source</th><th className="th">Basis</th></tr></thead>
                    <tbody>
                      {data.logs.map((l: any) => (
                        <tr key={l.id}>
                          <td className="td font-mono text-[12px]">{l.member_id}</td>
                          <td className="td text-end tabular-nums font-semibold">{hours(l.hours)}</td>
                          <td className="td">{l.direction}</td>
                          <td className="td"><Badge tone={l.source === 'qr' ? 'good' : 'brand'}>{l.source}</Badge></td>
                          <td className="td text-[12px] text-ink-muted">{l.notes}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {tab === 'qr' && (
              <div className="grid gap-4 sm:grid-cols-2 items-start">
                <div className="p-4 bg-white rounded-lg border border-line flex items-center justify-center"
                     dangerouslySetInnerHTML={{ __html: qr?.svg ?? '' }} />
                <div>
                  <p className="text-[13px] text-ink-secondary leading-relaxed">
                    Print this at the door. A member scans it with their phone's ordinary camera — no app, no scanner hardware —
                    identifies themselves with their member code, and arrival is stamped. Scanning again on the way out stamps
                    departure and the engine recomputes their hours from the real elapsed time.
                  </p>
                  <div className="mt-3 flex items-center gap-2">
                    <code className="text-[12px] font-mono bg-surface-sunken px-2 py-1 rounded flex-1 truncate">{qr?.url}</code>
                    {qr?.url && <CopyButton text={qr.url} />}
                  </div>
                  {qr?.url && <a className="btn-ghost mt-2 w-full" href={qr.url} target="_blank" rel="noreferrer">Open the check-in page ↗</a>}
                </div>
              </div>
            )}

            {tab === 'recap' && (
              <div className="grid gap-4 lg:grid-cols-2 items-start">
                <div>
                  <label className="label">Size</label>
                  <select className="input mb-3" value={size} onChange={e => setSize(e.target.value)}>
                    {Object.entries(recap?.sizes ?? {}).map(([k, v]: any) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                  <label className="label">Quote line</label>
                  <textarea className="input h-20 py-2" value={quote} onChange={e => setQuote(e.target.value)} />
                  <p className="text-[11px] text-ink-muted mt-1.5">
                    {recap?.suggestion?.ai ? 'Drafted by the AI from this event\'s real numbers.' : 'Add an Anthropic API key in Settings for an AI-drafted line.'}
                  </p>
                  <a className="btn-primary mt-3 w-full"
                     href={downloadUrl(`/events/${id}/recap.svg?size=${size}&quote=${encodeURIComponent(quote)}`)}
                     target="_blank" rel="noreferrer">Open the card ↗</a>
                  <p className="text-[11px] text-ink-muted mt-2 leading-relaxed">
                    The card is generated as SVG from the brand tokens. Open it and use your browser's "Save image as…"
                    for a PNG, or drop the SVG straight into Canva/Figma.
                  </p>
                </div>
                <div className="border border-line rounded-lg overflow-hidden bg-surface-sunken">
                  <img className="w-full" alt="Event recap card"
                       src={downloadUrl(`/events/${id}/recap.svg?size=${size}&quote=${encodeURIComponent(quote)}`)} />
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </Modal>
  );
}
