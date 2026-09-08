/**
 * LinkedIn social listening — three layers, honestly labelled.
 *
 * LinkedIn does not permit open scraping and its official API does not expose
 * public-post search for a use case like this. So rather than pretend, this ships:
 *
 *  Layer 2 (MVP, LIVE)      — paste a post URL. The server attempts an OG/oEmbed
 *                             metadata fetch; LinkedIn usually refuses anonymous
 *                             requests, so it degrades to the pasted snippet the
 *                             curator supplies. Always works, never lies.
 *  Layer 1 (PLUGGABLE STUB) — a connector interface for a licensed provider
 *                             (Phantombuster, a RapidAPI LinkedIn provider, Brandwatch…).
 *                             Registered and selectable, but inert until a key is
 *                             supplied; `poll()` reports exactly what is missing.
 *  Layer 3 (LIVE, needs AI key) — AI triage over whatever layers 1/2 captured:
 *                             relevance re-scoring, a drafted reshare caption,
 *                             and priority flagging.
 */
import { db } from '../db/index.js';
import { getSecret, getSetting } from './settings.js';
import { complete, aiReady } from './ai.js';

// ------------------------------------------------------------- relevance ----

export function scoreRelevance(text: string, keywords?: string[]): { score: number; matched: string[] } {
  const kws = keywords ?? (getSetting<string[]>('linkedin_keywords') ?? []);
  const hay = (text || '').toLowerCase();
  const matched = kws.filter(k => hay.includes(String(k).toLowerCase()));
  if (!matched.length) return { score: 0, matched: [] };
  // Exact program name is worth more than a bare "Misk".
  let score = 0;
  for (const m of matched) {
    const l = m.toLowerCase();
    score += l.includes('saudi leadership society') ? 45 : l.startsWith('#') ? 25 : l === 'sls' ? 30 : 18;
  }
  return { score: Math.min(100, Math.round(score)), matched };
}

// ----------------------------------------------- layer 2: paste a post URL ---

export type CaptureResult = {
  id: number; created: boolean;
  metadata: { title?: string; description?: string; author?: string; fetched: boolean; reason?: string };
  relevance: { score: number; matched: string[] };
};

/**
 * Try to read OpenGraph metadata for a URL. LinkedIn serves an auth wall to
 * anonymous clients, so this is expected to fail more often than not — the caller
 * falls back to the snippet the curator pasted. We never claim a fetch succeeded
 * when it did not.
 */
async function fetchOgMetadata(url: string, timeoutMs = 6000): Promise<{ title?: string; description?: string; author?: string; fetched: boolean; reason?: string }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; SLSDataCenter/1.0; +internal-dashboard)' },
    });
    if (!res.ok) return { fetched: false, reason: `LinkedIn returned HTTP ${res.status} to an anonymous request.` };
    const html = await res.text();
    const og = (p: string) => {
      const m = html.match(new RegExp(`<meta[^>]+property=["']og:${p}["'][^>]+content=["']([^"']+)["']`, 'i'))
             ?? html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:${p}["']`, 'i'));
      return m?.[1];
    };
    const title = og('title');
    const description = og('description');
    if (!title && !description) return { fetched: false, reason: 'No OpenGraph tags in the response (likely an auth wall).' };
    return { title, description, author: title?.split(' on LinkedIn')[0], fetched: true };
  } catch (err: any) {
    return { fetched: false, reason: err?.name === 'AbortError' ? 'Request timed out.' : `Fetch failed: ${err?.message ?? err}` };
  } finally {
    clearTimeout(timer);
  }
}

export async function capturePost(args: {
  url: string; memberId?: number | null; snippet?: string; authorName?: string;
  postDate?: string; engagementCount?: number;
}): Promise<CaptureResult> {
  const meta = await fetchOgMetadata(args.url);
  const snippet = args.snippet?.trim() || meta.description || meta.title || '';
  const author = args.authorName?.trim() || meta.author || null;
  const rel = scoreRelevance(`${snippet} ${author ?? ''}`);

  const existing = db.prepare('SELECT id FROM linkedin_mentions WHERE post_url=?').get(args.url) as any;
  if (existing) {
    db.prepare(`UPDATE linkedin_mentions SET member_id=COALESCE(?,member_id), author_name=COALESCE(?,author_name),
      post_date=COALESCE(?,post_date), content_snippet=?, engagement_count=?, sls_relevance_score=?, matched_keywords=?
      WHERE id=?`)
      .run(args.memberId ?? null, author, args.postDate ?? null, snippet,
           args.engagementCount ?? 0, rel.score, JSON.stringify(rel.matched), existing.id);
    return { id: existing.id, created: false, metadata: meta, relevance: rel };
  }

  const r = db.prepare(`INSERT INTO linkedin_mentions
    (member_id,author_name,post_url,post_date,content_snippet,engagement_count,sls_relevance_score,matched_keywords,status,capture_source)
    VALUES (?,?,?,?,?,?,?,?,'new','manual')`)
    .run(args.memberId ?? null, author, args.url, args.postDate ?? new Date().toISOString().slice(0, 10),
         snippet, args.engagementCount ?? 0, rel.score, JSON.stringify(rel.matched));
  return { id: Number(r.lastInsertRowid), created: true, metadata: meta, relevance: rel };
}

// ------------------------------------------- layer 1: pluggable connectors ---

export type ConnectorStatus = {
  name: string; label: string; kind: 'licensed-api' | 'aggregator' | 'none';
  configured: boolean; ready: boolean; notes: string; docsUrl?: string;
};

export interface LinkedInConnector {
  name: string;
  label: string;
  kind: ConnectorStatus['kind'];
  notes: string;
  docsUrl?: string;
  /** Returns captured posts, or an explanation of what is missing. */
  poll(profiles: Array<{ memberId: number; url: string }>, keywords: string[]):
    Promise<{ ok: boolean; captured: number; message: string }>;
}

/** No-op default so the module is always in a defined state. */
const noneConnector: LinkedInConnector = {
  name: 'none', label: 'Not connected', kind: 'none',
  notes: 'Scheduled polling is off. Capture posts manually on the Social Listening page (layer 2).',
  async poll() { return { ok: false, captured: 0, message: 'No connector selected. Choose one in Settings → Social listening.' }; },
};

/**
 * Generic connector for a licensed provider. Deliberately NOT wired to a specific
 * vendor endpoint: the provider, its URL shape and its response schema are a
 * commercial choice the program owner makes. `poll()` states exactly what it needs.
 */
function makeStubConnector(name: string, label: string, kind: ConnectorStatus['kind'], notes: string, docsUrl?: string): LinkedInConnector {
  return {
    name, label, kind, notes, docsUrl,
    async poll(profiles, keywords) {
      const key = getSecret('LINKEDIN_CONNECTOR_KEY');
      if (!key) {
        return { ok: false, captured: 0, message: `${label} is selected but no connector API key is stored. Add LINKEDIN_CONNECTOR_KEY in Settings → API keys.` };
      }
      return {
        ok: false, captured: 0,
        message:
          `${label} has a key stored, but its request/response mapping is intentionally not implemented: the endpoint shape is vendor- and plan-specific. ` +
          `Implement \`poll()\` for this connector in server/src/lib/linkedin.ts — it receives ${profiles.length} member profile URLs and ${keywords.length} keywords, ` +
          `and should call capturePost() for each hit. Until then, use layer 2 (paste a URL) or a CSV import.`,
      };
    },
  };
}

export const CONNECTORS: Record<string, LinkedInConnector> = {
  none: noneConnector,
  phantombuster: makeStubConnector('phantombuster', 'Phantombuster', 'aggregator',
    'Runs a "LinkedIn Post Search / Profile Activity Extractor" phantom on a schedule and returns a result JSON per launch.',
    'https://phantombuster.com/automations'),
  rapidapi: makeStubConnector('rapidapi', 'RapidAPI LinkedIn data provider', 'aggregator',
    'Several RapidAPI marketplace providers expose profile-post endpoints. Per-provider request shape; check the provider’s own terms against LinkedIn’s.',
    'https://rapidapi.com/search/linkedin'),
  brandwatch: makeStubConnector('brandwatch', 'Licensed monitoring tool (Brandwatch / Meltwater / Talkwalker)', 'licensed-api',
    'The compliant enterprise route. Query saved searches for the program keywords and pull mentions on a schedule.',
    'https://www.brandwatch.com/'),
};

export function connectorStatuses(): ConnectorStatus[] {
  const selected = String(getSetting('linkedin_connector') || 'none');
  const hasKey = !!getSecret('LINKEDIN_CONNECTOR_KEY');
  return Object.values(CONNECTORS).map(c => ({
    name: c.name, label: c.label, kind: c.kind,
    configured: c.name === selected,
    ready: c.name === 'none' ? true : c.name === selected && hasKey,
    notes: c.notes, docsUrl: c.docsUrl,
  }));
}

export async function runConnectorPoll(): Promise<{ ok: boolean; captured: number; message: string; connector: string }> {
  const selected = String(getSetting('linkedin_connector') || 'none');
  const connector = CONNECTORS[selected] ?? noneConnector;
  const profiles = (db.prepare('SELECT id memberId, linkedin_url url FROM members WHERE linkedin_url IS NOT NULL').all() as any[])
    .map(r => ({ memberId: r.memberId, url: r.url }));
  const keywords = getSetting<string[]>('linkedin_keywords') ?? [];
  const res = await connector.poll(profiles, keywords);
  return { ...res, connector: connector.label };
}

// ------------------------------------------------------- layer 3: AI triage --

export async function triageMention(id: number): Promise<{ id: number; caption: string; priority: boolean; relevance: number }> {
  const m = db.prepare(`SELECT lm.*, mem.name member_name, mem.cohort_type
                        FROM linkedin_mentions lm LEFT JOIN members mem ON mem.id=lm.member_id
                        WHERE lm.id=?`).get(id) as any;
  if (!m) throw new Error(`Mention ${id} not found`);

  const rel = scoreRelevance(m.content_snippet ?? '');
  // High engagement OR strong keyword relevance earns priority for resharing.
  const priority = m.engagement_count >= 200 || rel.score >= 70;

  let caption = '';
  if (aiReady()) {
    caption = await complete(
      `Draft a short LinkedIn reshare caption (max 45 words) for the Saudi Leadership Society account, resharing this member post.\n\n` +
      `Member: ${m.member_name ?? m.author_name ?? 'an SLS member'}${m.cohort_type ? ` (${m.cohort_type})` : ''}\n` +
      `Post: "${(m.content_snippet ?? '').slice(0, 600)}"\n\n` +
      `Celebrate the member, connect it to the SLS community, and do not invent facts that are not in the post. No hashtags beyond #SaudiLeadershipSociety.`,
    );
  } else {
    caption = `Proud to see ${m.member_name ?? m.author_name ?? 'our member'} sharing this. #SaudiLeadershipSociety` +
              `\n\n[Draft written without AI — add an Anthropic API key in Settings for an AI-drafted caption.]`;
  }

  db.prepare('UPDATE linkedin_mentions SET ai_caption=?, priority_flag=?, sls_relevance_score=?, matched_keywords=?, status=CASE WHEN status=\'new\' THEN \'reviewed\' ELSE status END WHERE id=?')
    .run(caption, priority ? 1 : 0, rel.score || m.sls_relevance_score, JSON.stringify(rel.matched), id);

  return { id, caption, priority, relevance: rel.score || m.sls_relevance_score };
}

/** Monthly highlights reel data — the exportable "social wall" digest. */
export function monthlyHighlights(month?: string) {
  const m = month ?? new Date().toISOString().slice(0, 7);
  const rows = db.prepare(`
    SELECT lm.*, mem.name member_name, mem.cohort_type, mem.company
    FROM linkedin_mentions lm LEFT JOIN members mem ON mem.id=lm.member_id
    WHERE substr(lm.post_date,1,7)=? ORDER BY lm.priority_flag DESC, lm.engagement_count DESC`).all(m) as any[];
  const totals = db.prepare(`
    SELECT COUNT(*) posts, COALESCE(SUM(engagement_count),0) engagement,
           COUNT(DISTINCT member_id) members, ROUND(AVG(sls_relevance_score),1) avg_relevance
    FROM linkedin_mentions WHERE substr(post_date,1,7)=?`).get(m) as any;
  return { month: m, totals, rows };
}
