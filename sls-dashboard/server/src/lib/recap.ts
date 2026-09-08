/**
 * Auto-generated event recap cards.
 *
 * One click after an event produces an on-brand shareable graphic: attendee
 * count, hours logged, a quote and the initiative. Rendered server-side as SVG
 * from the brand tokens (so it restyles when the tokens change); the browser
 * rasterises it to PNG for LinkedIn/Instagram without any extra dependency.
 */
import { db } from '../db/index.js';
import { loadTokens } from './pdf.js';
import { complete, aiReady } from './ai.js';
import { getSetting } from './settings.js';

export const SIZES = {
  linkedin: { w: 1200, h: 627, label: 'LinkedIn (1200×627)' },
  square:   { w: 1080, h: 1080, label: 'Instagram square (1080×1080)' },
  story:    { w: 1080, h: 1920, label: 'Story (1080×1920)' },
} as const;
export type RecapSize = keyof typeof SIZES;

export function recapData(eventId: number) {
  const ev = db.prepare(`
    SELECT e.*, i.name initiative_name, i.pillar
    FROM events e LEFT JOIN initiatives i ON i.id=e.initiative_id WHERE e.id=?`).get(eventId) as any;
  if (!ev) throw new Error(`Event ${eventId} not found`);

  const stats = db.prepare(`
    SELECT (SELECT COUNT(*) FROM event_attendance a WHERE a.event_id=e.id AND a.no_show=0) linked_attendees,
           (SELECT COUNT(*) FROM event_attendance a WHERE a.event_id=e.id AND a.checked_in_at IS NOT NULL) checked_in,
           (SELECT ROUND(SUM(l.hours),1) FROM engagement_logs l WHERE l.related_event_id=e.id) hours_logged,
           (SELECT COUNT(DISTINCT l.member_id) FROM engagement_logs l WHERE l.related_event_id=e.id) members
    FROM events e WHERE e.id=?`).get(eventId) as any;

  const cohorts = db.prepare(`
    SELECT m.cohort_type, COUNT(*) c FROM event_attendance a
    JOIN members m ON m.id=a.member_id WHERE a.event_id=? AND a.no_show=0 GROUP BY m.cohort_type`).all(eventId) as any[];

  return { event: ev, stats, cohorts };
}

const esc = (s: string) => String(s ?? '').replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c]!));

/** Wrap text to a character budget per line — SVG has no text wrapping. */
function wrap(text: string, perLine: number, maxLines: number): string[] {
  const words = String(text ?? '').split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > perLine) { lines.push(cur.trim()); cur = w; }
    else cur = `${cur} ${w}`;
    if (lines.length === maxLines) break;
  }
  if (cur.trim() && lines.length < maxLines) lines.push(cur.trim());
  if (lines.length === maxLines && words.join(' ').length > lines.join(' ').length) {
    lines[maxLines - 1] = `${lines[maxLines - 1]!.slice(0, perLine - 1)}…`;
  }
  return lines;
}

export function renderRecapSvg(eventId: number, size: RecapSize = 'linkedin', quote?: string): string {
  const t = loadTokens();
  const { event, stats, cohorts } = recapData(eventId);
  const { w, h } = SIZES[size];
  const pad = Math.round(w * 0.065);
  const isTall = h > w * 1.2;

  const pillarColor = t.color.pillar[event.pillar] ?? t.color.brand.secondary;
  const metrics = [
    { v: String(event.attendee_count ?? 0), l: 'attendees' },
    { v: String(stats.hours_logged ?? 0), l: 'hours logged' },
    { v: String(stats.members ?? 0), l: 'members engaged' },
  ];
  if (event.satisfaction_score) metrics.push({ v: `${event.satisfaction_score}/5`, l: 'satisfaction' });

  const titleSize = Math.round(w * (isTall ? 0.062 : 0.055));
  const metricSize = Math.round(w * (isTall ? 0.075 : 0.062));
  const titleLines = wrap(event.initiative_name ?? event.name, isTall ? 20 : 26, 2);
  const quoteLines = quote ? wrap(quote, isTall ? 34 : 52, 3) : [];

  const metricsY = isTall ? h * 0.5 : h * 0.52;
  const colW = (w - pad * 2) / metrics.length;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" font-family="Inter, 'Segoe UI', Helvetica, Arial, sans-serif">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${t.color.brand.primary}"/>
      <stop offset="100%" stop-color="${t.color.brand.primaryActive}"/>
    </linearGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#bg)"/>
  <circle cx="${w * 0.92}" cy="${h * 0.12}" r="${w * 0.22}" fill="${pillarColor}" opacity="0.16"/>
  <circle cx="${w * 0.08}" cy="${h * 0.94}" r="${w * 0.16}" fill="${t.color.brand.accent}" opacity="0.12"/>
  <rect x="0" y="0" width="${w}" height="${Math.max(6, w * 0.008)}" fill="${t.color.brand.accent}"/>

  <text x="${pad}" y="${pad + w * 0.03}" fill="${t.color.brand.accent}" font-size="${Math.round(w * 0.021)}" font-weight="700" letter-spacing="${w * 0.004}">${esc(String(getSetting('organisation_name')).toUpperCase())}</text>
  <text x="${pad}" y="${pad + w * 0.062}" fill="#BBD6CF" font-size="${Math.round(w * 0.019)}">${esc(event.pillar ?? '')} &#183; ${esc(event.date ?? '')}</text>

  ${titleLines.map((l, i) => `<text x="${pad}" y="${h * (isTall ? 0.3 : 0.33) + i * titleSize * 1.18}" fill="#FFFFFF" font-size="${titleSize}" font-weight="700">${esc(l)}</text>`).join('\n  ')}

  <rect x="${pad}" y="${metricsY - w * 0.055}" width="${w - pad * 2}" height="2" fill="#FFFFFF" opacity="0.18"/>
  ${metrics.map((m, i) => `
  <text x="${pad + i * colW}" y="${metricsY + metricSize * 0.4}" fill="#FFFFFF" font-size="${metricSize}" font-weight="700">${esc(m.v)}</text>
  <text x="${pad + i * colW}" y="${metricsY + metricSize * 1.1}" fill="#9FC9BF" font-size="${Math.round(w * 0.019)}" letter-spacing="${w * 0.002}">${esc(m.l.toUpperCase())}</text>`).join('')}

  ${quoteLines.length ? `
  <rect x="${pad}" y="${h * (isTall ? 0.68 : 0.7)}" width="${Math.max(4, w * 0.005)}" height="${quoteLines.length * w * 0.032 + w * 0.01}" fill="${t.color.brand.accent}"/>
  ${quoteLines.map((l, i) => `<text x="${pad + w * 0.028}" y="${h * (isTall ? 0.68 : 0.7) + w * 0.028 + i * w * 0.032}" fill="#E6F2EF" font-size="${Math.round(w * 0.024)}" font-style="italic">${esc(l)}</text>`).join('\n  ')}` : ''}

  ${cohorts.length ? `<text x="${pad}" y="${h - pad}" fill="#7FB0A4" font-size="${Math.round(w * 0.018)}">${esc(cohorts.map(c => `${c.c} ${c.cohort_type}${c.c === 1 ? '' : 's'}`).join('  ·  '))}</text>` : ''}
  <text x="${w - pad}" y="${h - pad}" fill="#7FB0A4" font-size="${Math.round(w * 0.018)}" text-anchor="end">Grow to Great &#183; Connect to Create &#183; Lead with Impact</text>
</svg>`;
}

/** Ask the AI for a short quote/caption line grounded in the event's real numbers. */
export async function suggestRecapQuote(eventId: number): Promise<{ quote: string; ai: boolean }> {
  const { event, stats } = recapData(eventId);
  if (!aiReady()) {
    return {
      quote: `${event.attendee_count ?? 0} leaders came together for ${event.initiative_name ?? event.name}.`,
      ai: false,
    };
  }
  const quote = await complete(
    `Write ONE sentence (max 22 words) for a Saudi Leadership Society event recap card. Use only these facts:\n` +
    `Initiative: ${event.initiative_name ?? event.name}\nPillar: ${event.pillar ?? 'n/a'}\nDate: ${event.date}\n` +
    `Attendees: ${event.attendee_count}\nEngagement hours logged: ${stats.hours_logged ?? 0}\n` +
    `Members engaged: ${stats.members ?? 0}\nSatisfaction: ${event.satisfaction_score ?? 'n/a'}/5\n\n` +
    `Warm and factual. No hashtags, no emoji, no invented details. Return only the sentence.`,
    undefined, 120,
  );
  return { quote: quote.replace(/^["“]|["”]$/g, ''), ai: true };
}
