/**
 * The AI pass.
 *
 * It does exactly one job: rewrite text that the composer has already produced,
 * and offer up to three versions of it. It never decides what goes in the
 * newsletter, never adds a story, and never supplies a figure — the composer has
 * already done all of that from the database. That separation is what makes the
 * feature reliable: if this pass fails, is slow, or has no API key, the issue is
 * still complete and still correct; it is just written in plainer language.
 *
 * Every item is sent with the record it came from, and the model is told to use
 * only those facts. Each returned option is length-checked and trimmed against
 * the template's own limits before it reaches the document.
 */
import Anthropic from '@anthropic-ai/sdk';
import { getSecret, getSetting } from '../settings.js';
import { MissingApiKeyError } from '../ai.js';
import type { NewsletterDoc, Field } from './compose.js';

export const MAX_OPTIONS = 3;

type CopyRequest = {
  id: string;
  kind: 'headline' | 'story' | 'quote' | 'message' | 'milestone' | 'callout';
  maxChars: number;
  current: string;
  facts: Record<string, unknown>;
};

const SYSTEM = `You write the monthly newsletter of the Saudi Leadership Society, a leadership community founded by the Misk Foundation to advance Vision 2030.

Voice: warm, factual, and proud without boasting. British spelling. Plain sentences. Never marketing hype, never exclamation marks, no emoji.

ABSOLUTE RULES — these are not style preferences:
1. Use ONLY the facts given with each item. Every number, name, date, place and organisation must appear in those facts.
2. NEVER invent a detail to make a sentence flow better — not an attendance figure, not a quote, not an outcome, not a person's title. If a fact is absent, write around it.
3. Stay within each item's character limit.
4. Each of the options you return for one item must be genuinely different in angle or structure — not the same sentence reworded. One might lead with the people, another with the outcome, another with the theme.
5. Headlines are titles, not sentences: no full stop, and keep any proper name exactly as given.

The society's three pillars are Grow to Great, Connect to Create and Lead with Impact, shown as GROW, CONNECT and IMPACT.`;

const TOOL = {
  name: 'submit_copy',
  description: 'Return the rewritten options for every item you were given. Include every id exactly once.',
  input_schema: {
    type: 'object' as const,
    properties: {
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'The item id you were given.' },
            options: {
              type: 'array',
              description: `Between 1 and ${MAX_OPTIONS} genuinely different versions, best first.`,
              items: { type: 'string' },
              minItems: 1,
              maxItems: MAX_OPTIONS,
            },
          },
          required: ['id', 'options'],
        },
      },
    },
    required: ['items'],
  },
};

function client(): Anthropic {
  const apiKey = getSecret('ANTHROPIC_API_KEY');
  if (!apiKey) throw new MissingApiKeyError();
  return new Anthropic({ apiKey });
}

/** Trim to the limit on a word boundary rather than mid-word. Exported for tests. */
export function clamp(text: string, maxChars: number): string {
  const t = String(text ?? '').trim();
  if (t.length <= maxChars) return t;
  const cut = t.slice(0, maxChars);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > maxChars * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[,;:\s]+$/, '') + '…';
}

async function runBatch(reqs: CopyRequest[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (!reqs.length) return out;

  const anthropic = client();
  const model = String(getSetting('ai_model') || 'claude-sonnet-5');

  const payload = reqs.map(r => ({
    id: r.id,
    what: r.kind,
    limit_characters: r.maxChars,
    current_draft: r.current,
    facts: r.facts,
  }));

  const res = await anthropic.messages.create({
    model,
    max_tokens: 8000,
    system: SYSTEM,
    tools: [TOOL as any],
    tool_choice: { type: 'tool', name: 'submit_copy' },
    messages: [{
      role: 'user',
      content:
        `Rewrite each item below for the newsletter, returning up to ${MAX_OPTIONS} genuinely different options for each.\n\n` +
        `The "current_draft" is a plain, machine-generated version — accurate but flat. Improve the writing; keep every fact.\n\n` +
        JSON.stringify(payload, null, 2),
    }],
  });

  const call = res.content.find(c => c.type === 'tool_use') as any;
  const items: Array<{ id: string; options: string[] }> = call?.input?.items ?? [];
  const byId = new Map(reqs.map(r => [r.id, r]));

  for (const item of items) {
    const req = byId.get(item.id);
    if (!req || !Array.isArray(item.options)) continue;
    const cleaned = item.options
      .filter(o => typeof o === 'string' && o.trim().length > 0)
      .map(o => clamp(o, req.maxChars))
      .filter((o, i, a) => a.indexOf(o) === i)      // drop near-identical repeats
      .slice(0, MAX_OPTIONS);
    if (cleaned.length) out.set(item.id, cleaned);
  }
  return out;
}

/** Put the winning option first and keep the deterministic draft as a fallback option. */
function applyField(f: Field, opts: string[] | undefined) {
  if (!opts?.length) return;
  const all = [...opts, f.value].filter((v, i, a) => a.indexOf(v) === i).slice(0, MAX_OPTIONS + 1);
  f.value = all[0]!;
  f.options = all;
}

export type EnrichResult = { doc: NewsletterDoc; rewritten: number; batches: number; error?: string };

/**
 * Rewrite the writable text of an issue in place. Returns the same document so a
 * partial failure still yields a usable newsletter.
 */
export async function enrichIssue(doc: NewsletterDoc): Promise<EnrichResult> {
  const reqs: CopyRequest[] = [];
  const bind: Array<{ id: string; field: Field }> = [];

  const add = (id: string, kind: CopyRequest['kind'], field: Field, maxChars: number, facts: Record<string, unknown>) => {
    reqs.push({ id, kind, maxChars, current: String(field.value ?? ''), facts });
    bind.push({ id, field });
  };

  // ---- cover stories --------------------------------------------------------
  const stories = [
    ...(doc.hero ? [{ key: 'hero', s: doc.hero }] : []),
    ...doc.also.map((s, i) => ({ key: `also.${i}`, s })),
  ];
  for (const { key, s } of stories) {
    add(`${key}.title`, 'headline', s.title, 70, s.facts);
    add(`${key}.body`, 'story', s.body, 520, s.facts);
  }

  // ---- chapter lead ---------------------------------------------------------
  if (doc.chapterLead) {
    const facts = {
      chapter: doc.chapterLead.chapterName,
      lead: doc.chapterLead.name,
      role: doc.chapterLead.role,
      activitiesThisMonth: doc.chapterLead.photos.map(p => p.caption),
      month: `${doc.masthead.monthLabel} ${doc.masthead.yearLabel}`,
    };
    add('lead.quote', 'quote', doc.chapterLead.quote, 300, facts);
    add('lead.message', 'message', doc.chapterLead.message, 420, facts);
  }

  // ---- member milestones ----------------------------------------------------
  for (const [group, list] of [['appointments', doc.members.appointments], ['awards', doc.members.awards], ['boards', doc.members.boards]] as const) {
    list.forEach((m, i) => add(`${group}.${i}.detail`, 'milestone', m.detail, 160, { member: m.name, milestone: m.detail.value }));
  }
  doc.members.programs.forEach((p, i) =>
    add(`programs.${i}.title`, 'headline', p.title, 80, { headline: p.title.value, members: p.names }));

  // ---- closing callout ------------------------------------------------------
  add('callout.body', 'callout', doc.callout.body, 300, { purpose: 'invite members to propose activities', current: doc.callout.body.value });

  // Batch so one oversized request cannot fail the whole run, and so a failure
  // costs only its own batch.
  const BATCH = 8;
  const batches: CopyRequest[][] = [];
  for (let i = 0; i < reqs.length; i += BATCH) batches.push(reqs.slice(i, i + BATCH));

  let rewritten = 0;
  let error: string | undefined;
  const results = await Promise.allSettled(batches.map(runBatch));

  const merged = new Map<string, string[]>();
  for (const r of results) {
    if (r.status === 'fulfilled') for (const [k, v] of r.value) merged.set(k, v);
    else if (!error) error = r.reason?.message ?? String(r.reason);
  }

  for (const { id, field } of bind) {
    const opts = merged.get(id);
    if (opts?.length) { applyField(field, opts); rewritten++; }
  }

  doc.generatedWith = rewritten > 0 ? 'ai' : doc.generatedWith;
  return { doc, rewritten, batches: batches.length, error };
}
