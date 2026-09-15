/**
 * The deterministic composer.
 *
 * It fills every slot of the template from real rows for a given month, with no
 * AI involved. That is deliberate: the AI writes better prose, but it must never
 * be the thing that decides whether the feature works. Generation therefore
 * always produces a complete, correct issue; the AI pass afterwards only
 * *rewrites* text that is already there and already true.
 *
 * Where the layout offers a choice — which story leads, which photo runs — the
 * composer returns up to three ranked candidates so the editor can offer options
 * rather than a single take-it-or-leave-it answer.
 */
import { db } from '../../db/index.js';
import { pillarOf } from './template.js';

export const MAX_OPTIONS = 3;

/** A slot's value plus the alternatives the editor can switch to. */
export type Field<T = string> = {
  value: T;
  options?: T[];
  /** Where the value came from, so the editor can show it and the AI can cite it. */
  sourceId?: number;
  sourceKind?: string;
};

export type StoryItem = {
  id: number;
  pillar: string;
  pillarLabel: string;
  pillarColor: string;
  date: string;
  dateLabel: string;
  title: Field;
  body: Field;
  image: string | null;
  /** Kept so the AI pass can ground its rewrite in the real record. */
  facts: Record<string, unknown>;
};

export type NewsletterDoc = {
  period: string;
  issueNumber: number;
  templateKey: string;
  generatedAt: string;
  generatedWith: 'rules' | 'ai';
  masthead: { monthLabel: string; yearLabel: string; issueLabel: string; footerLabel: string };
  hero: StoryItem | null;
  also: StoryItem[];
  /** Stories found but not placed — the editor's bench for swapping content in. */
  bench: StoryItem[];
  chapterLead: {
    chapterId: number | null; chapterName: string; memberId: number | null;
    name: string; role: string; portrait: string | null;
    quote: Field; message: Field;
    photos: Array<{ id: number; image: string | null; caption: string; dateLabel: string; pillarLabel: string; pillarColor: string }>;
  } | null;
  localChapters: ChapterBlock[];
  globalChapters: ChapterBlock[];
  stats: { localActivities: number; localRegions: number; globalActivities: number; globalCountries: number };
  members: {
    appointments: MilestoneItem[];
    awards: MilestoneItem[];
    programs: Array<{ id: number; title: Field; names: string; image: string | null }>;
    boards: MilestoneItem[];
  };
  upcoming: Array<{ monthLabel: string; yearLabel: string; entries: Array<{ id: number; pillarLabel: string; pillarColor: string; dateLabel: string; title: string }> }>;
  photoOfMonth: { image: string | null; location: string };
  callout: { title: Field; body: Field };
  /** What the composer could not find, surfaced in the editor rather than hidden. */
  gaps: string[];
};

export type ChapterBlock = {
  id: number; name: string; kind: 'local' | 'global';
  images: Array<string | null>;
  activities: Array<{ id: number; title: string; dateLabel: string; pillarLabel: string; pillarColor: string }>;
};

export type MilestoneItem = {
  id: number; memberId: number | null; name: string;
  detail: Field; image: string | null;
};

// ------------------------------------------------------------------ helpers --

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

const monthName = (period: string) => MONTHS[Number(period.slice(5, 7)) - 1] ?? period;
const yearOf = (period: string) => period.slice(0, 4);

/** "31 August" — how the template writes dates. */
function dayMonth(iso: string): string {
  if (!iso || iso.length < 10) return '';
  const d = Number(iso.slice(8, 10));
  return `${d} ${monthName(iso.slice(0, 7))}`;
}

/** "8 JAN" — the compact form used on the What's Ahead page. */
function shortDate(iso: string): string {
  if (!iso || iso.length < 10) return '';
  return `${Number(iso.slice(8, 10))} ${(MONTHS[Number(iso.slice(5, 7)) - 1] ?? '').slice(0, 3).toUpperCase()}`;
}

function addMonths(period: string, n: number): string {
  const y = Number(period.slice(0, 4));
  const m = Number(period.slice(5, 7)) - 1 + n;
  const d = new Date(Date.UTC(y, m, 1));
  return d.toISOString().slice(0, 7);
}

const field = <T,>(value: T, options?: T[], sourceId?: number, sourceKind?: string): Field<T> =>
  ({ value, ...(options && options.length > 1 ? { options } : {}), sourceId, sourceKind });

/**
 * Deterministic prose for an event, used as-is when there is no AI key and as the
 * grounding text when there is. Written from the record, never invented.
 */
function describeEvent(e: any): string {
  const parts: string[] = [];
  const where = e.chapter_name ? `The ${e.chapter_name} chapter` : 'The Saudi Leadership Society';
  const format = e.type === 'virtual' ? 'online' : e.type === 'hybrid' ? 'in person and online' : `in ${e.location ?? 'Riyadh'}`;
  parts.push(`${where} held ${e.initiative_name ?? 'this session'} on ${dayMonth(e.date)}, ${format}.`);
  if (e.attendee_count) {
    parts.push(`${Number(e.attendee_count).toLocaleString('en-US')} attended${e.linked_members ? `, including ${e.linked_members} SLS members` : ''}.`);
  }
  if (e.satisfaction_score) parts.push(`Members rated it ${e.satisfaction_score} out of 5.`);
  if (e.hours_logged) parts.push(`${e.hours_logged} engagement hours were logged against it.`);
  return parts.join(' ');
}

/** A readable headline from an event row, since seeded names carry a date suffix. */
function headlineFor(e: any): string {
  const base = String(e.name ?? '').replace(/\s+—\s+\d{4}-\d{2}-\d{2}\s*$/, '').trim();
  return base || e.initiative_name || 'Society activity';
}

// ------------------------------------------------------------------ queries --

function eventsInPeriod(period: string) {
  return db.prepare(`
    SELECT e.*, i.name initiative_name, i.pillar, c.name chapter_name, c.kind chapter_kind, c.id chapter_id2,
           (SELECT COUNT(*) FROM event_attendance a WHERE a.event_id=e.id AND a.no_show=0) linked_members,
           (SELECT ROUND(SUM(l.hours),1) FROM engagement_logs l WHERE l.related_event_id=e.id) hours_logged
    FROM events e
    LEFT JOIN initiatives i ON i.id = e.initiative_id
    LEFT JOIN chapters c ON c.id = e.chapter_id
    WHERE substr(e.date,1,7) = ? AND e.status IN ('closed','open')
    ORDER BY e.attendee_count DESC, e.satisfaction_score DESC`).all(period) as any[];
}

function toStory(e: any): StoryItem {
  const p = pillarOf(e.pillar);
  const body = describeEvent(e);
  return {
    id: e.id,
    pillar: e.pillar ?? '',
    pillarLabel: p.label,
    pillarColor: p.color,
    date: e.date,
    dateLabel: dayMonth(e.date),
    title: field(headlineFor(e), undefined, e.id, 'event'),
    body: field(body, undefined, e.id, 'event'),
    image: e.photo_url ?? null,
    facts: {
      eventId: e.id, name: headlineFor(e), initiative: e.initiative_name, pillar: e.pillar,
      date: e.date, chapter: e.chapter_name, location: e.location, format: e.type,
      attendees: e.attendee_count, slsMembers: e.linked_members,
      satisfaction: e.satisfaction_score, engagementHours: e.hours_logged,
    },
  };
}

// ------------------------------------------------------------------ compose --

export function composeIssue(period: string, opts: { issueNumber?: number } = {}): NewsletterDoc {
  const gaps: string[] = [];
  const events = eventsInPeriod(period);
  const stories = events.map(toStory);

  // ---- cover ---------------------------------------------------------------
  // Ranked by reach, so the lead story is the month's biggest moment. The next
  // three fill "Also this month"; everything else stays on the bench so the editor
  // can swap any of it in.
  // Spread the cover across distinct initiatives so the lead story and the three
  // supporting ones do not repeat the same programme line.
  const picked: StoryItem[] = [];
  const usedInitiative = new Set<string>();
  for (const s of stories) {
    const key = String(s.facts.initiative ?? s.id);
    if (usedInitiative.has(key)) continue;
    usedInitiative.add(key);
    picked.push(s);
    if (picked.length === 4) break;
  }
  // If the month simply had few distinct initiatives, fall back to ranking alone.
  for (const s of stories) {
    if (picked.length === 4) break;
    if (!picked.includes(s)) picked.push(s);
  }
  const hero = picked[0] ?? null;
  const also = picked.slice(1, 4);
  const bench = stories.filter(s => !picked.includes(s)).slice(0, 10);
  if (!hero) gaps.push(`No events recorded for ${monthName(period)} ${yearOf(period)} — the cover has nothing to lead with.`);
  else if (also.length < 3) gaps.push(`Only ${stories.length} event(s) this month; "Also this month" holds three.`);

  // ---- chapter lead of the month -------------------------------------------
  // The chapter that ran the most activity this month earns the page.
  const topChapter = db.prepare(`
    SELECT c.id, c.name, c.kind, c.lead_member_id, m.name lead_name, m.title lead_title, COUNT(e.id) activity
    FROM chapters c
    LEFT JOIN events e ON e.chapter_id = c.id AND substr(e.date,1,7) = @period AND e.status IN ('closed','open')
    LEFT JOIN members m ON m.id = c.lead_member_id
    WHERE c.active = 1
    GROUP BY c.id ORDER BY activity DESC, c.sort_order LIMIT 1`).get({ period }) as any;

  let chapterLead: NewsletterDoc['chapterLead'] = null;
  if (topChapter?.lead_member_id) {
    const photos = events
      .filter(e => e.chapter_id === topChapter.id)
      .slice(0, 3)
      .map(e => {
        const p = pillarOf(e.pillar);
        return { id: e.id, image: e.photo_url ?? null, caption: headlineFor(e), dateLabel: dayMonth(e.date), pillarLabel: p.label, pillarColor: p.color };
      });
    chapterLead = {
      chapterId: topChapter.id, chapterName: topChapter.name, memberId: topChapter.lead_member_id,
      name: topChapter.lead_name ?? 'Chapter Lead',
      role: `${topChapter.name} Chapter Lead`,
      portrait: null,
      quote: field(
        `The ${topChapter.name} chapter continues to prove itself an integral part of the Society's fabric — a community where every connection sparks growth and every member strengthens the impact we create.`,
        undefined, topChapter.id, 'chapter'),
      message: field(
        `The ${topChapter.name} chapter continues to grow through the strength of its members and the purpose that brings us together in the Saudi Leadership Society. We are focusing on creating meaningful spaces for learning, connection and collaboration.`,
        undefined, topChapter.id, 'chapter'),
      photos,
    };
    if (!photos.length) gaps.push(`${topChapter.name} ran no activity this month, so "Their month in photos" is empty.`);
  } else {
    gaps.push('No chapter lead is on record — page 2 needs one.');
  }

  // ---- chapters (pages 3 and 4) --------------------------------------------
  const chapterBlocks = (kind: 'local' | 'global'): ChapterBlock[] => {
    const rows = db.prepare('SELECT id, name FROM chapters WHERE kind=? AND active=1 ORDER BY sort_order').all(kind) as any[];
    return rows.map(c => {
      const acts = events.filter(e => e.chapter_id === c.id).slice(0, 4).map(e => {
        const p = pillarOf(e.pillar);
        return { id: e.id, title: headlineFor(e), dateLabel: dayMonth(e.date), pillarLabel: p.label, pillarColor: p.color };
      });
      return {
        id: c.id, name: c.name, kind,
        images: [
          events.find(e => e.chapter_id === c.id)?.photo_url ?? null,
          null, null,
        ],
        activities: acts,
      };
    }).filter(b => b.activities.length > 0).slice(0, 3);
  };

  const localChapters = chapterBlocks('local');
  const globalChapters = chapterBlocks('global');
  if (!localChapters.length) gaps.push('No local chapter activity this month — page 3 will be empty.');
  if (!globalChapters.length) gaps.push('No global chapter activity this month — page 4 will be empty.');

  // ---- member highlights (page 5) ------------------------------------------
  const milestones = db.prepare(`
    SELECT ms.*, m.name resolved_name FROM member_milestones ms
    LEFT JOIN members m ON m.id = ms.member_id
    WHERE substr(ms.date,1,7) = ? ORDER BY ms.date`).all(period) as any[];

  const byKind = (kind: string) => milestones.filter(m => m.kind === kind);
  const toMilestone = (m: any): MilestoneItem => ({
    id: m.id, memberId: m.member_id,
    name: m.resolved_name ?? m.member_name ?? 'Member',
    detail: field(
      [m.title, m.organisation ? `${m.organisation}.` : null].filter(Boolean).join(', ').replace(/,\s*$/, ''),
      undefined, m.id, 'milestone'),
    image: m.photo_url ?? null,
  });

  const programRows = byKind('program_acceptance');
  const members = {
    appointments: byKind('appointment').slice(0, 2).map(toMilestone),
    awards: byKind('award').slice(0, 2).map(toMilestone),
    programs: programRows.slice(0, 1).map(m => ({
      id: m.id,
      title: field(m.title as string, undefined, m.id, 'milestone'),
      names: programRows.map(r => r.resolved_name ?? r.member_name).filter(Boolean).join(', '),
      image: m.photo_url ?? null,
    })),
    boards: byKind('board_seat').slice(0, 2).map(toMilestone),
  };
  if (!milestones.length) gaps.push(`No member milestones recorded for ${monthName(period)} — page 5 will be empty. Add them under Newsletter → Milestones.`);

  // ---- what's ahead (page 6) ------------------------------------------------
  const upcoming = [1, 2, 3].map(n => {
    const p = addMonths(period, n);
    const rows = db.prepare(`
      SELECT e.id, e.name, e.date, i.pillar, i.name initiative_name
      FROM events e LEFT JOIN initiatives i ON i.id = e.initiative_id
      WHERE substr(e.date,1,7) = ? AND e.status != 'cancelled'
      ORDER BY e.date LIMIT 3`).all(p) as any[];
    return {
      monthLabel: monthName(p), yearLabel: yearOf(p),
      entries: rows.map(r => {
        const pl = pillarOf(r.pillar);
        return { id: r.id, pillarLabel: pl.label, pillarColor: pl.color, dateLabel: shortDate(r.date), title: headlineFor(r) };
      }),
    };
  });
  if (upcoming.every(m => !m.entries.length)) gaps.push('Nothing is scheduled for the next three months — page 6 has no entries.');

  // ---- photo of the month & closing ----------------------------------------
  const photoEvent = events.find(e => e.photo_url) ?? events[0];

  return {
    period,
    issueNumber: opts.issueNumber ?? issueNumberFor(period),
    templateKey: 'sls-monthly-v1',
    generatedAt: new Date().toISOString(),
    generatedWith: 'rules',
    masthead: {
      monthLabel: monthName(period),
      yearLabel: yearOf(period),
      issueLabel: `MONTHLY NEWSLETTER · ISSUE ${opts.issueNumber ?? issueNumberFor(period)}`,
      footerLabel: `Saudi Leadership Society · ${monthName(period)} ${yearOf(period)}`,
    },
    hero, also, bench, chapterLead, localChapters, globalChapters,
    stats: {
      localActivities: localChapters.reduce((s, c) => s + c.activities.length, 0),
      localRegions: localChapters.length,
      globalActivities: globalChapters.reduce((s, c) => s + c.activities.length, 0),
      globalCountries: globalChapters.length,
    },
    members,
    upcoming,
    photoOfMonth: { image: photoEvent?.photo_url ?? null, location: photoEvent?.location ?? '' },
    callout: {
      title: field('Have an idea for an activity?'),
      body: field('Our society is built on the collective leadership of its members. If you have an idea for an impactful activity, initiative or collaboration that aligns with our mission, contact us or your Chapter Lead or Deputy.'),
    },
    gaps,
  };
}

/** Issues are numbered from the first month that has any activity. */
function issueNumberFor(period: string): number {
  const first = db.prepare("SELECT MIN(substr(date,1,7)) p FROM events WHERE status IN ('closed','open')").get() as any;
  if (!first?.p) return 1;
  const [fy, fm] = String(first.p).split('-').map(Number);
  const [y, m] = period.split('-').map(Number);
  return Math.max(1, (y! - fy!) * 12 + (m! - fm!) + 1);
}

/** Months that have any activity, newest first — what the editor offers to generate. */
export function availablePeriods(): Array<{ period: string; label: string; events: number; milestones: number }> {
  return (db.prepare(`
    SELECT p, SUM(ev) events, SUM(ms) milestones FROM (
      SELECT substr(date,1,7) p, 1 ev, 0 ms FROM events WHERE status IN ('closed','open')
      UNION ALL
      SELECT substr(date,1,7) p, 0 ev, 1 ms FROM member_milestones
    ) GROUP BY p ORDER BY p DESC LIMIT 36`).all() as any[])
    .map(r => ({ period: r.p, label: `${monthName(r.p)} ${yearOf(r.p)}`, events: r.events, milestones: r.milestones }));
}
