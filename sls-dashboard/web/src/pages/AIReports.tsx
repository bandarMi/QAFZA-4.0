import { useState } from 'react';
import { useApp, useData } from '../state';
import { useI18n } from '../i18n';
import { Card, Badge, Skeleton, Empty } from '../components/ui';
import { ApiKeyCard, AiOffNotice } from '../components/ApiKeyCard';
import { Chart } from '../components/Chart';
import { api } from '../lib/api';
import { nf } from '../lib/format';

export function AIReports({ onOpenChat }: { onOpenChat: () => void }) {
  const { aiReady } = useApp();
  const { t } = useI18n();
  const convos = useData<any[]>('/ai/conversations');
  const [openId, setOpenId] = useState<number | null>(null);
  const detail = useData<any>(openId ? `/ai/conversations/${openId}` : null, [openId]);
  const pins = useData<any[]>('/pins?target=report');

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="lg:col-span-2 space-y-4">
        {!aiReady ? (
          <>
            <AiOffNotice onAddKey={onOpenChat} />
            <ApiKeyCard />
          </>
        ) : (
          <Card title={t.ai.title} subtitle="Answers come from real queries against this database — never from the model's memory.">
            <p className="text-[13px] text-ink-secondary leading-relaxed mb-3">
              The analyst has tools for KPIs, engagement breakdowns, leaderboards, initiative performance, startup trends,
              member ledgers, the Impact Challenge and social mentions — plus a guarded read-only SQL escape hatch for anything
              those don't cover. It is instructed to cite the tables and filters behind every figure, and to say "I don't have that"
              rather than estimate.
            </p>
            <button className="btn-primary" onClick={onOpenChat}>Open the chat panel →</button>
          </Card>
        )}

        <Card title="Saved conversations" pad={false}>
          {convos.loading ? <div className="p-4"><Skeleton rows={3} height="h-8" /></div> : !convos.data?.length ? (
            <Empty title="No conversations yet" body="Every question you ask the analyst is saved here." />
          ) : (
            <ul className="divide-y divide-line-subtle">
              {convos.data.map(c => (
                <li key={c.id} className="flex items-center gap-3 px-4 py-2.5">
                  <button className="min-w-0 flex-1 text-start" onClick={() => setOpenId(openId === c.id ? null : c.id)}>
                    <p className="text-[13px] font-medium text-ink-primary truncate">{c.title}</p>
                    <p className="text-[11px] text-ink-muted font-mono">{c.created_at}</p>
                  </button>
                  <button className="btn-quiet" onClick={async () => { await api.del(`/ai/conversations/${c.id}`); convos.reload(); if (openId === c.id) setOpenId(null); }}>✕</button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {openId && detail.data && (
          <Card title={detail.data.conversation?.title ?? 'Conversation'}>
            <div className="space-y-3">
              {detail.data.messages.map((m: any) => (
                <div key={m.id}>
                  <Badge tone={m.role === 'user' ? 'brand' : 'neutral'}>{m.role}</Badge>
                  <p className="text-[13px] text-ink-secondary mt-1.5 whitespace-pre-wrap leading-relaxed">
                    {typeof m.content === 'string' ? m.content : m.content.text}
                  </p>
                  {(m.content?.charts ?? []).map((c: any, i: number) => (
                    <div key={i} className="mt-2">
                      <Chart kind={c.kind} title={c.title} rows={c.rows ?? []} height={200}
                             xKey={c.xKey ?? Object.keys(c.rows?.[0] ?? {})[0] ?? 'x'}
                             series={c.series ?? [{ key: Object.keys(c.rows?.[0] ?? {})[1] ?? 'value' }]}
                             unit={c.unit} note={c.note} />
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>

      <div className="space-y-4">
        <Card title="Report sections from AI" subtitle="Charts you added to the report appear in the PDF export." pad={false}>
          {!pins.data?.length ? (
            <p className="p-4 text-[13px] text-ink-muted">Nothing added yet. Use “Add to report” on any chart the analyst returns.</p>
          ) : (
            <ul className="divide-y divide-line-subtle">
              {pins.data.map(p => {
                const spec = JSON.parse(p.spec);
                return (
                  <li key={p.id} className="px-4 py-2.5 flex items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-medium text-ink-primary truncate">{p.title}</p>
                      <p className="text-[11px] text-ink-muted">{spec.kind} · {nf(spec.rows?.length)} rows</p>
                    </div>
                    <button className="btn-quiet" onClick={async () => { await api.del(`/pins/${p.id}`); pins.reload(); }}>✕</button>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card title="Guardrails">
          <ul className="space-y-2 text-[13px] text-ink-secondary leading-relaxed">
            <li>· Answers only from tool results retrieved in that conversation — never from training data.</li>
            <li>· Every figure is followed by the tables and filters behind it.</li>
            <li>· "Not enough data" is an accepted answer; fabricating a number is not.</li>
            <li>· Ad-hoc SQL is read-only, single-statement, allow-listed by table and forced to a LIMIT.</li>
            <li>· Reported headline metrics and computed figures are distinguished, not blended.</li>
          </ul>
        </Card>
      </div>
    </div>
  );
}
