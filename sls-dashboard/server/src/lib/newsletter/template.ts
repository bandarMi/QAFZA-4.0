/**
 * The SLS monthly newsletter template.
 *
 * This is the structure of the template supplied by the programme owner
 * ("mapped Newsletter template structure", Canva, A4 × 6 pages), encoded as data
 * rather than as markup, so three things follow from one definition: the composer
 * knows what to fill and from where, the AI knows what to write and how long, and
 * the renderer knows what to draw.
 *
 * The palette was sampled from the supplied PDF rather than guessed — see
 * docs/NEWSLETTER.md for the extraction.
 */

export type SlotKind = 'text' | 'longtext' | 'image' | 'date' | 'chip' | 'number';

export type Slot = {
  key: string;
  label: string;
  kind: SlotKind;
  /** Soft cap used both to steer the AI and to warn in the editor. */
  maxChars?: number;
  placeholder?: string;
  /** Slots the editor may move an item to — this is what "push it to page two" means. */
  movableTo?: string[];
};

export type Section = {
  key: string;
  label: string;
  /** Where the composer gets the rows for this section. */
  source: 'events' | 'chapters' | 'milestones' | 'upcoming' | 'chapter_lead' | 'static' | 'photo';
  /** A repeating section: `items` describes one entry, `count` how many the layout holds. */
  repeat?: { min: number; max: number };
  slots: Slot[];
  note?: string;
};

export type Page = {
  number: number;
  key: string;
  eyebrow: string;
  title: string;
  sections: Section[];
};

export type TemplateSpec = {
  key: string;
  name: string;
  description: string;
  pageSize: { width: number; height: number; unit: 'pt' };
  pages: Page[];
  /** Palette and type, extracted from the supplied file. Overridable per deployment. */
  theme: typeof THEME;
};

/** Sampled from the supplied PDF at 100dpi. */
export const THEME = {
  background: {
    base: '#01083F',
    glowBlue: '#2E97DD',      // upper-left wash
    glowPurple: '#8163D4',    // lower-right wash
  },
  pillar: {
    'Grow to Great':     { label: 'GROW',    color: '#9B75F2' },
    'Connect to Create': { label: 'CONNECT', color: '#38B6FF' },
    'Lead with Impact':  { label: 'IMPACT',  color: '#00AEB8' },
  } as Record<string, { label: string; color: string }>,
  text: {
    primary: '#FFFFFF',
    muted: '#8891BA',
    accent: '#00AEB8',
  },
  surface: {
    card: '#1B2359',
    panel: '#08103F',
    hairline: 'rgba(255,255,255,0.14)',
  },
  font: {
    display: "'Poppins', 'Inter', 'Segoe UI', sans-serif",
    body: "'Inter', 'Segoe UI', sans-serif",
    quote: "'Playfair Display', Georgia, serif",
    arabic: "'IBM Plex Sans Arabic', 'Noto Sans Arabic', sans-serif",
  },
};

/** Pillar label ("GROW") for a pillar name, with a safe fallback. */
export const pillarOf = (pillar?: string | null) =>
  THEME.pillar[pillar ?? ''] ?? { label: 'SLS', color: THEME.text.accent };

const storySlots = (movableTo: string[]): Slot[] => [
  { key: 'pillar',   label: 'Pillar',    kind: 'chip' },
  { key: 'date',     label: 'Date',      kind: 'date' },
  { key: 'title',    label: 'Headline',  kind: 'text', maxChars: 70, movableTo },
  { key: 'body',     label: 'Story',     kind: 'longtext', maxChars: 520, movableTo },
  { key: 'image',    label: 'Photo',     kind: 'image' },
];

export const DEFAULT_TEMPLATE: TemplateSpec = {
  key: 'sls-monthly-v1',
  name: 'SLS Monthly Newsletter',
  description:
    'The six-page A4 monthly newsletter: cover highlights, chapter lead of the month, local chapters, ' +
    'global chapters, member highlights, and what is ahead.',
  pageSize: { width: 595.5, height: 842.25, unit: 'pt' },
  theme: THEME,
  pages: [
    {
      number: 1, key: 'cover', eyebrow: 'MONTHLY NEWSLETTER', title: 'Cover & highlights',
      sections: [
        {
          key: 'masthead', label: 'Masthead', source: 'static',
          slots: [
            { key: 'issueNumber', label: 'Issue number', kind: 'number' },
            { key: 'monthLabel',  label: 'Month',        kind: 'text' },
            { key: 'yearLabel',   label: 'Year',         kind: 'text' },
          ],
        },
        {
          key: 'hero', label: 'Lead story', source: 'events',
          note: 'The month’s headline activity. One story, given the largest space on the cover.',
          slots: storySlots(['also.0', 'also.1', 'also.2']),
        },
        {
          key: 'also', label: 'Also this month', source: 'events',
          repeat: { min: 0, max: 3 },
          note: 'Three supporting stories. Any of them can be swapped with the lead story.',
          slots: storySlots(['hero']),
        },
      ],
    },
    {
      number: 2, key: 'chapter-lead', eyebrow: 'CHAPTER LEAD OF THE MONTH', title: 'Chapter lead',
      sections: [
        {
          key: 'lead', label: 'Chapter lead', source: 'chapter_lead',
          slots: [
            { key: 'name',     label: 'Name',            kind: 'text', maxChars: 40 },
            { key: 'role',     label: 'Role',            kind: 'text', maxChars: 40 },
            { key: 'portrait', label: 'Portrait',        kind: 'image' },
            { key: 'quote',    label: 'Pull quote',      kind: 'longtext', maxChars: 300 },
            { key: 'message',  label: 'Message to the society', kind: 'longtext', maxChars: 420 },
          ],
        },
        {
          key: 'leadPhotos', label: 'Their month in photos', source: 'events',
          repeat: { min: 0, max: 3 },
          slots: [
            { key: 'image',   label: 'Photo',   kind: 'image' },
            { key: 'caption', label: 'Caption', kind: 'text', maxChars: 60 },
            { key: 'date',    label: 'Date',    kind: 'date' },
            { key: 'pillar',  label: 'Pillar',  kind: 'chip' },
          ],
        },
      ],
    },
    {
      number: 3, key: 'local-chapters', eyebrow: 'ACROSS THE KINGDOM', title: 'Local Chapters',
      sections: [
        {
          key: 'localChapters', label: 'Local chapters', source: 'chapters',
          repeat: { min: 0, max: 3 },
          note: 'One column per region, each with its activities for the month.',
          slots: [
            { key: 'name',       label: 'Region',      kind: 'text', maxChars: 30 },
            { key: 'image',      label: 'Main photo',  kind: 'image' },
            { key: 'imageA',     label: 'Photo 2',     kind: 'image' },
            { key: 'imageB',     label: 'Photo 3',     kind: 'image' },
            { key: 'activities', label: 'Activities',  kind: 'longtext' },
          ],
        },
      ],
    },
    {
      number: 4, key: 'global-chapters', eyebrow: 'SLS AROUND THE WORLD', title: 'Global Chapters',
      sections: [
        {
          key: 'globalChapters', label: 'Global chapters', source: 'chapters',
          repeat: { min: 0, max: 3 },
          slots: [
            { key: 'name',       label: 'Country',     kind: 'text', maxChars: 30 },
            { key: 'image',      label: 'Main photo',  kind: 'image' },
            { key: 'imageA',     label: 'Photo 2',     kind: 'image' },
            { key: 'imageB',     label: 'Photo 3',     kind: 'image' },
            { key: 'activities', label: 'Activities',  kind: 'longtext' },
          ],
        },
      ],
    },
    {
      number: 5, key: 'members', eyebrow: 'CELEBRATING OUR MEMBERS', title: 'Member Highlights',
      sections: [
        {
          key: 'appointments', label: 'New appointments', source: 'milestones',
          repeat: { min: 0, max: 2 },
          slots: [
            { key: 'name',   label: 'Member', kind: 'text', maxChars: 40 },
            { key: 'detail', label: 'Detail', kind: 'longtext', maxChars: 160 },
            { key: 'image',  label: 'Photo',  kind: 'image' },
          ],
        },
        {
          key: 'awards', label: 'Awards & recognition', source: 'milestones',
          repeat: { min: 0, max: 2 },
          slots: [
            { key: 'name',   label: 'Member', kind: 'text', maxChars: 40 },
            { key: 'detail', label: 'Detail', kind: 'longtext', maxChars: 160 },
            { key: 'image',  label: 'Photo',  kind: 'image' },
          ],
        },
        {
          key: 'programs', label: 'Program acceptances', source: 'milestones',
          repeat: { min: 0, max: 1 },
          slots: [
            { key: 'title',  label: 'Headline', kind: 'text', maxChars: 80 },
            { key: 'names',  label: 'Members',  kind: 'longtext', maxChars: 200 },
            { key: 'image',  label: 'Photo',    kind: 'image' },
          ],
        },
        {
          key: 'boards', label: 'Board & committee seats', source: 'milestones',
          repeat: { min: 0, max: 2 },
          slots: [
            { key: 'name',   label: 'Member', kind: 'text', maxChars: 40 },
            { key: 'detail', label: 'Detail', kind: 'longtext', maxChars: 160 },
            { key: 'image',  label: 'Photo',  kind: 'image' },
          ],
        },
      ],
    },
    {
      number: 6, key: 'ahead', eyebrow: "WHAT'S AHEAD", title: 'Next Three Months',
      sections: [
        {
          key: 'upcoming', label: 'Next three months', source: 'upcoming',
          repeat: { min: 0, max: 3 },
          note: 'One column per month, up to three entries each.',
          slots: [
            { key: 'monthLabel', label: 'Month',   kind: 'text' },
            { key: 'entries',    label: 'Entries', kind: 'longtext' },
          ],
        },
        {
          key: 'photoOfMonth', label: 'Photo of the month', source: 'photo',
          slots: [
            { key: 'image',    label: 'Photo',    kind: 'image' },
            { key: 'location', label: 'Location', kind: 'text', maxChars: 40 },
          ],
        },
        {
          key: 'callout', label: 'Closing callout', source: 'static',
          slots: [
            { key: 'title', label: 'Heading', kind: 'text', maxChars: 60 },
            { key: 'body',  label: 'Body',    kind: 'longtext', maxChars: 300 },
          ],
        },
      ],
    },
  ],
};

/** Every template the app knows about. The default is the supplied one. */
export const TEMPLATES: Record<string, TemplateSpec> = {
  [DEFAULT_TEMPLATE.key]: DEFAULT_TEMPLATE,
};

export const DEFAULT_TEMPLATE_KEY = DEFAULT_TEMPLATE.key;
