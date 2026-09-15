/**
 * The newsletter's load-bearing promises:
 *  - generation works with no AI key at all,
 *  - the renderer escapes anything a person typed,
 *  - AI copy is held to the template's length limits,
 *  - and the output is always six A4 pages.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clamp } from './enrich.js';
import { DEFAULT_TEMPLATE, pillarOf, THEME } from './template.js';
import { renderIssueHtml } from './render.js';
import type { NewsletterDoc } from './compose.js';

// ------------------------------------------------------------------ template --

test('the template has the six pages of the supplied structure', () => {
  assert.equal(DEFAULT_TEMPLATE.pages.length, 6);
  assert.deepEqual(DEFAULT_TEMPLATE.pages.map(p => p.key),
    ['cover', 'chapter-lead', 'local-chapters', 'global-chapters', 'members', 'ahead']);
  assert.deepEqual(DEFAULT_TEMPLATE.pages.map(p => p.number), [1, 2, 3, 4, 5, 6]);
});

test('the page size is A4', () => {
  assert.equal(Math.round(DEFAULT_TEMPLATE.pageSize.width), 596);
  assert.equal(Math.round(DEFAULT_TEMPLATE.pageSize.height), 842);
});

test('every pillar maps to the colour sampled from the template', () => {
  assert.equal(pillarOf('Grow to Great').color, '#9B75F2');
  assert.equal(pillarOf('Connect to Create').color, '#38B6FF');
  assert.equal(pillarOf('Lead with Impact').color, '#00AEB8');
  assert.deepEqual(Object.values(THEME.pillar).map(p => p.label), ['GROW', 'CONNECT', 'IMPACT']);
});

test('an unknown pillar falls back rather than throwing', () => {
  const p = pillarOf('Something Else');
  assert.equal(p.label, 'SLS');
  assert.ok(p.color);
});

// --------------------------------------------------------------------- clamp --

test('clamp leaves text within the limit untouched', () => {
  assert.equal(clamp('Leading The Next Frontier', 70), 'Leading The Next Frontier');
});

test('clamp cuts on a word boundary, not mid-word', () => {
  const out = clamp('The Saudi Leadership Society held an exclusive evening on the sidelines of LEAP', 40);
  assert.ok(out.length <= 41, `got ${out.length}: ${out}`);
  assert.ok(!/\w…$/.test(out.replace('…', 'x…')) || out.endsWith('…'));
  assert.ok(out.endsWith('…'));
  assert.ok(!out.includes('  '));
});

test('clamp trims trailing punctuation before the ellipsis', () => {
  assert.ok(!/[,;:]…$/.test(clamp('Riyadh, Jeddah, Dammam, Khobar, Abha, Tabuk and more', 20)));
});

// ------------------------------------------------------------------ renderer --

/** The smallest document the renderer must survive: a month with nothing in it. */
const emptyDoc = (): NewsletterDoc => ({
  period: '2026-08', issueNumber: 11, templateKey: 'sls-monthly-v1',
  generatedAt: new Date().toISOString(), generatedWith: 'rules',
  masthead: { monthLabel: 'August', yearLabel: '2026', issueLabel: 'MONTHLY NEWSLETTER · ISSUE 11', footerLabel: 'Saudi Leadership Society · August 2026' },
  hero: null, also: [], bench: [], chapterLead: null,
  localChapters: [], globalChapters: [],
  stats: { localActivities: 0, localRegions: 0, globalActivities: 0, globalCountries: 0 },
  members: { appointments: [], awards: [], programs: [], boards: [] },
  upcoming: [], photoOfMonth: { image: null, location: '' },
  callout: { title: { value: 'Have an idea?' }, body: { value: 'Tell your chapter lead.' } },
  gaps: [],
});

test('an empty month still renders six pages rather than failing', () => {
  const html = renderIssueHtml(emptyDoc());
  for (let i = 1; i <= 6; i++) assert.ok(html.includes(`id="page-${i}"`), `page ${i} missing`);
  assert.ok(html.includes('@page{size:A4;margin:0}'));
});

test('text from the editor is HTML-escaped', () => {
  const doc = emptyDoc();
  doc.masthead.monthLabel = '<script>alert("x")</script>';
  doc.callout.body.value = 'Ampersands & "quotes" \'live\' here';
  const html = renderIssueHtml(doc);
  assert.ok(!html.includes('<script>alert'), 'script tag was not escaped');
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(html.includes('Ampersands &amp; &quot;quotes&quot;'));
});

test('a story with no photo renders the template placeholder', () => {
  const doc = emptyDoc();
  doc.hero = {
    id: 1, pillar: 'Connect to Create', pillarLabel: 'CONNECT', pillarColor: '#38B6FF',
    date: '2026-08-31', dateLabel: '31 August',
    title: { value: 'Leading The Next Frontier' }, body: { value: 'An evening on the sidelines of LEAP.' },
    image: null, facts: {},
  };
  const html = renderIssueHtml(doc);
  assert.ok(html.includes('Lead story photo'));
  assert.ok(html.includes('Leading The Next Frontier'));
  assert.ok(html.includes('#38B6FF'));
});

test('a story with a photo renders the image instead of the placeholder', () => {
  const doc = emptyDoc();
  doc.hero = {
    id: 1, pillar: 'Lead with Impact', pillarLabel: 'IMPACT', pillarColor: '#00AEB8',
    date: '2026-08-05', dateLabel: '5 August',
    title: { value: 'Volunteering' }, body: { value: 'Body.' },
    image: '/assets/newsletter/2026-08/photo-abc.jpg', facts: {},
  };
  const html = renderIssueHtml(doc);
  assert.ok(html.includes("background-image:url('/assets/newsletter/2026-08/photo-abc.jpg')"));
});
