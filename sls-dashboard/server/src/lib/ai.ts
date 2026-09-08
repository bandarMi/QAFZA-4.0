/**
 * The AI chat engine: an Anthropic tool-use loop over the tools in ai-tools.ts.
 *
 * The whole feature is gated on one thing — an API key. If none is configured the
 * engine returns a structured `needs_api_key` result rather than throwing, so the
 * UI can show a "Add your API key" call to action instead of an error.
 */
import Anthropic from '@anthropic-ai/sdk';
import { TOOLS, runTool } from './ai-tools.js';
import { getSecret, getSetting } from './settings.js';
import { db } from '../db/index.js';

export class MissingApiKeyError extends Error {
  code = 'needs_api_key' as const;
  constructor() { super('No Anthropic API key is configured. Add one in Settings → AI to switch on the AI features.'); }
}

export function aiReady(): boolean {
  return !!getSecret('ANTHROPIC_API_KEY');
}

function client(): Anthropic {
  const apiKey = getSecret('ANTHROPIC_API_KEY');
  if (!apiKey) throw new MissingApiKeyError();
  return new Anthropic({ apiKey });
}

const SYSTEM_PROMPT = `You are the analyst for the Saudi Leadership Society (SLS) Data Center — the internal dashboard of a leadership community founded by the Misk Foundation to advance Vision 2030.

Program context:
- Members belong to one of two cohorts: "2030 Leader" or "Misk Fellow".
- Three pillars: Grow to Great (personal growth), Connect to Create (connection), Lead with Impact (collective impact).
- Values: Authenticity, Collaboration, Ownership, Impact.
- Eleven initiatives are tracked as distinct program lines, each owned by one of six council roles.
- "Engagement hours" are mostly auto-derived from attendance and QR check-ins, not hand-logged.

HARD RULES — these are not stylistic preferences:
1. Answer ONLY from data you retrieved with a tool in this conversation. Never estimate, extrapolate, or fall back on general knowledge for a figure.
2. If the tools do not return enough data to answer, say so plainly and name what is missing. "I don't have that" is a correct answer. Never fabricate a number to fill a gap.
3. Cite your source. End any answer containing figures with a short line naming the tables and filters you used — the tool results give you this in their \`provenance\` field.
4. Whenever your answer contains numbers, ALSO call render_chart with the actual rows you retrieved, so the user sees the chart and can pin it. Pick the form from the data's job: change over time → line/area; comparing categories → bar; part-to-whole with ≤5 parts → donut; anything more detailed → table.
5. Distinguish reported figures from computed ones. impact_metrics rows carry a \`source\`; a row sourced 'impact-report' is a reported headline, which may differ from what the transactional tables compute. If they differ, say so rather than silently picking one.
6. Be concise and useful — a program director is reading this, not an engineer. Lead with the answer, then the supporting detail. Do not describe which tools you called unless asked.

When asked to draft narrative text (a board update, a summary paragraph), still ground every figure in a tool result, and keep the tone factual and warm — the program's own voice.`;

export type ChatChart = {
  kind: string; title: string; xKey?: string;
  series?: Array<{ key: string; label?: string }>;
  rows: any[]; unit?: string; note?: string;
};

export type ChatResult = {
  text: string;
  charts: ChatChart[];
  toolCalls: Array<{ name: string; input: unknown; ok: boolean; error?: string; rowCount?: number }>;
  model: string;
  stopReason: string | null;
};

/** Run one turn of the tool-use loop. `history` is prior {role, text} messages. */
export async function chat(
  userMessage: string,
  history: Array<{ role: 'user' | 'assistant'; text: string }> = [],
  opts: { maxTurns?: number } = {},
): Promise<ChatResult> {
  const anthropic = client();
  const model = String(getSetting('ai_model') || 'claude-sonnet-5');
  const maxTokens = Number(getSetting('ai_max_tokens')) || 4096;
  const maxTurns = opts.maxTurns ?? 8;

  const messages: Anthropic.MessageParam[] = [
    ...history.map(h => ({ role: h.role, content: h.text })),
    { role: 'user' as const, content: userMessage },
  ];

  const charts: ChatChart[] = [];
  const toolCalls: ChatResult['toolCalls'] = [];
  let finalText = '';
  let stopReason: string | null = null;

  for (let turn = 0; turn < maxTurns; turn++) {
    const res = await anthropic.messages.create({
      model, max_tokens: maxTokens, system: SYSTEM_PROMPT, tools: TOOLS as any, messages,
    });
    stopReason = res.stop_reason;

    const text = res.content.filter(c => c.type === 'text').map(c => (c as any).text).join('\n').trim();
    if (text) finalText = text;

    const toolUses = res.content.filter(c => c.type === 'tool_use') as any[];
    if (!toolUses.length) break;

    messages.push({ role: 'assistant', content: res.content });

    const results: any[] = [];
    for (const tu of toolUses) {
      const out = runTool(tu.name, tu.input);
      if (tu.name === 'render_chart' && out.ok) {
        charts.push({
          kind: tu.input.kind, title: tu.input.title, xKey: tu.input.xKey,
          series: tu.input.series, rows: tu.input.rows, unit: tu.input.unit, note: tu.input.note,
        });
      }
      toolCalls.push({
        name: tu.name, input: tu.input, ok: out.ok,
        error: out.ok ? undefined : out.error,
        rowCount: out.ok ? countRows((out as any).data) : undefined,
      });
      results.push({
        type: 'tool_result', tool_use_id: tu.id,
        is_error: !out.ok,
        content: JSON.stringify(out.ok ? (out as any).data : { error: (out as any).error }).slice(0, 120_000),
      });
    }
    messages.push({ role: 'user', content: results });
  }

  return { text: finalText || '(no answer produced)', charts, toolCalls, model, stopReason };
}

function countRows(data: any): number | undefined {
  if (!data) return undefined;
  if (Array.isArray(data.rows)) return data.rows.length;
  if (data.provenance?.rowCount != null) return data.provenance.rowCount;
  return undefined;
}

/** A single-shot completion with no tools — used for captions and short drafts. */
export async function complete(prompt: string, system?: string, maxTokens = 700): Promise<string> {
  const anthropic = client();
  const model = String(getSetting('ai_model') || 'claude-sonnet-5');
  const res = await anthropic.messages.create({
    model, max_tokens: maxTokens,
    system: system ?? 'You write for the Saudi Leadership Society, a Misk Foundation leadership community. Warm, factual, never boastful. No emoji unless asked.',
    messages: [{ role: 'user', content: prompt }],
  });
  return res.content.filter(c => c.type === 'text').map(c => (c as any).text).join('\n').trim();
}

/** Verify a key works, without storing it. Used by the "Test" button in Settings. */
export async function testApiKey(apiKey: string, model?: string): Promise<{ ok: boolean; message: string; model?: string }> {
  try {
    const a = new Anthropic({ apiKey });
    const m = model || String(getSetting('ai_model') || 'claude-sonnet-5');
    const res = await a.messages.create({ model: m, max_tokens: 16, messages: [{ role: 'user', content: 'Reply with the single word: ready' }] });
    const text = res.content.filter(c => c.type === 'text').map(c => (c as any).text).join('').trim();
    return { ok: true, message: `Connected. ${m} replied "${text || 'ok'}".`, model: m };
  } catch (err: any) {
    const status = err?.status;
    const msg =
      status === 401 ? 'That key was rejected (401). Check you pasted the whole key and that it is active.'
      : status === 403 ? 'That key is not permitted to use this model (403). Try a different model, or check the key\'s workspace permissions.'
      : status === 404 ? `Model not found (404). The selected model may not be available to this key.`
      : status === 429 ? 'Rate limited (429). The key works but is currently throttled — try again in a moment.'
      : err?.message?.includes('ENOTFOUND') || err?.message?.includes('ECONNREFUSED')
        ? 'Could not reach api.anthropic.com. Check this machine\'s network or proxy settings.'
      : `Connection failed: ${err?.message ?? String(err)}`;
    return { ok: false, message: msg };
  }
}

// ------------------------------------------------------- conversation store --

export function saveMessage(conversationId: number, role: 'user' | 'assistant', content: unknown) {
  db.prepare('INSERT INTO ai_messages (conversation_id, role, content) VALUES (?,?,?)')
    .run(conversationId, role, JSON.stringify(content));
}

export function ensureConversation(id?: number, title?: string): number {
  if (id) {
    const row = db.prepare('SELECT id FROM ai_conversations WHERE id=?').get(id);
    if (row) return id;
  }
  const r = db.prepare('INSERT INTO ai_conversations (title) VALUES (?)').run(title?.slice(0, 80) || 'New conversation');
  return Number(r.lastInsertRowid);
}

export function conversationHistory(conversationId: number): Array<{ role: 'user' | 'assistant'; text: string }> {
  const rows = db.prepare('SELECT role, content FROM ai_messages WHERE conversation_id=? ORDER BY id').all(conversationId) as any[];
  return rows.map(r => {
    let text = '';
    try { const c = JSON.parse(r.content); text = typeof c === 'string' ? c : (c.text ?? ''); } catch { text = r.content; }
    return { role: r.role, text };
  }).filter(m => m.text);
}
