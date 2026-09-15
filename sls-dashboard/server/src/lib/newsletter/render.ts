/**
 * Renders an issue to standalone HTML that reproduces the supplied template.
 *
 * One renderer serves three outputs, so they can never drift apart: the in-app
 * preview, the print-to-PDF, and the downloadable .html. Pages are real A4 boxes
 * with `@page { size: A4; margin: 0 }`, so the browser's "Save as PDF" produces
 * exactly six pages at the right size.
 *
 * Every colour comes from the template theme, so re-pointing the brand re-skins
 * the newsletter with no code change.
 */
import { THEME, type TemplateSpec } from './template.js';
import type { NewsletterDoc, StoryItem, ChapterBlock, MilestoneItem } from './compose.js';

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

/** A photo slot: the real image, or the template's own placeholder tile. */
function photo(src: string | null | undefined, label: string, cls = '') {
  if (src) return `<div class="ph ${cls}" style="background-image:url('${esc(src)}')"></div>`;
  return `<div class="ph ph-empty ${cls}"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.4">
    <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg><span>${esc(label)}</span></div>`;
}

const chip = (label: string, color: string) =>
  `<span class="chip" style="background:${color}1F;color:${color};border-color:${color}55">${esc(label)}</span>`;

function masthead() {
  return `<header class="mast">
    <div class="mast-misk">
      <svg viewBox="0 0 40 46" width="26" height="30" aria-hidden="true">
        <g fill="#fff">
          <circle cx="20" cy="9" r="3.4"/><circle cx="12" cy="13" r="2.8"/><circle cx="28" cy="13" r="2.8"/>
          <circle cx="7" cy="19" r="2.3"/><circle cx="33" cy="19" r="2.3"/><circle cx="20" cy="16.5" r="3"/>
          <circle cx="14" cy="21" r="2.4"/><circle cx="26" cy="21" r="2.4"/>
          <rect x="18.7" y="22" width="2.6" height="20" rx="1.3"/>
        </g>
      </svg>
      <div class="mast-misk-t">
        <span class="ar">أحـد مجتمعـات مؤسسـة مسك</span>
        <span class="en">A Community by Misk Foundation</span>
      </div>
    </div>
    <div class="mast-sls"><span>SAUDI</span><b>LEADERSHIP</b><span>SOCIETY</span></div>
  </header>`;
}

const footer = (doc: NewsletterDoc, n: number) =>
  `<footer class="foot"><span>${esc(doc.masthead.footerLabel)}</span><span>${String(n).padStart(2, '0')} / 06</span></footer>`;

const pageHead = (eyebrow: string, title: string, right = '') =>
  `<div class="phead">
     <p class="eyebrow">${esc(eyebrow)}</p>
     <div class="phead-row"><h1>${esc(title)}</h1>${right}</div>
     <div class="rule"></div>
   </div>`;

// ------------------------------------------------------------------- page 1 --

function storyCard(s: StoryItem, idx: number) {
  return `<article class="card" data-slot="also.${idx}">
    <div class="card-top" style="background:${s.pillarColor}"></div>
    ${photo(s.image, 'Activity photo', 'card-img')}
    <div class="card-meta">${chip(s.pillarLabel, s.pillarColor)}<span class="date">${esc(s.dateLabel)}</span></div>
    <h3>${esc(s.title.value)}</h3>
    <p>${esc(s.body.value)}</p>
  </article>`;
}

function page1(doc: NewsletterDoc) {
  const h = doc.hero;
  const legend = Object.values(THEME.pillar)
    .map(p => `<span class="lg"><i style="background:${p.color}"></i>${p.label}</span>`).join('');
  return `<section class="page" id="page-1">
    ${masthead()}
    <p class="eyebrow issue">${esc(doc.masthead.issueLabel)}</p>
    <h1 class="month">${esc(doc.masthead.monthLabel)} <span>${esc(doc.masthead.yearLabel)}</span></h1>
    <div class="legend">${legend}<div class="legend-rule"></div><span class="led">LED BY SLS</span></div>
    ${h ? `<div class="hero" data-slot="hero">
      ${photo(h.image, 'Lead story photo', 'hero-img')}
      <div class="hero-t">
        <div class="card-meta">${chip(h.pillarLabel, h.pillarColor)}<span class="date">${esc(h.dateLabel)}</span></div>
        <h2>${esc(h.title.value)}</h2>
        <p>${esc(h.body.value)}</p>
      </div>
    </div>` : `<div class="empty-note">No lead story for this month yet.</div>`}
    ${doc.also.length ? `<div class="sec-label">ALSO THIS MONTH<div class="sec-rule"></div></div>
    <div class="grid3 grow">${doc.also.map(storyCard).join('')}</div>` : ''}
    ${footer(doc, 1)}
  </section>`;
}

// ------------------------------------------------------------------- page 2 --

function page2(doc: NewsletterDoc) {
  const cl = doc.chapterLead;
  if (!cl) return `<section class="page" id="page-2">${masthead()}${pageHead('CHAPTER LEAD OF THE MONTH', 'Chapter lead')}<div class="empty-note">No chapter lead on record for this month.</div>${footer(doc, 2)}</section>`;
  return `<section class="page" id="page-2">
    ${masthead()}
    <div class="phead">
      <p class="eyebrow">CHAPTER LEAD OF THE MONTH</p>
      <div class="phead-row">
        <h1>${esc(cl.name)}</h1>
        <div class="phead-right"><div>${esc(cl.role)}</div><div>${esc(doc.masthead.monthLabel)} ${esc(doc.masthead.yearLabel)}</div></div>
      </div>
      <div class="rule"></div>
    </div>
    <div class="lead-grid">
      <div class="portrait-wrap">${photo(cl.portrait, 'Portrait', 'portrait')}<div class="portrait-rule"></div></div>
      <div>
        <blockquote>“${esc(cl.quote.value)}”</blockquote>
        <div class="msg-label"><span class="msg-rule"></span>MESSAGE TO THE SOCIETY</div>
        <p class="msg">${esc(cl.message.value)}</p>
      </div>
    </div>
    <div class="sec-label">THEIR MONTH IN PHOTOS<div class="sec-rule"></div><span class="sec-right">${esc(cl.chapterName)}</span></div>
    <div class="grid3 grow">
      ${cl.photos.map(p => `<div class="pcard">
        ${photo(p.image, 'Activity photo', 'pcard-img')}
        <h4>${esc(p.caption)}</h4>
        <p class="pmeta">${esc(p.dateLabel)} · <span style="color:${p.pillarColor}">${esc(p.pillarLabel)}</span></p>
      </div>`).join('')}
    </div>
    ${footer(doc, 2)}
  </section>`;
}

// --------------------------------------------------------------- pages 3 & 4 --

function chapterPage(doc: NewsletterDoc, blocks: ChapterBlock[], n: number, eyebrow: string, title: string, statA: string, statB: string) {
  return `<section class="page" id="page-${n}">
    ${masthead()}
    ${pageHead(eyebrow, title, `<div class="phead-right"><div>${esc(statA)}</div><div>${esc(statB)}</div></div>`)}
    ${blocks.length ? `<div class="grid3 chapters grow">
      ${blocks.map(c => `<div class="chapter">
        <div class="chapter-top" style="background:${c.activities[0]?.pillarColor ?? THEME.text.accent}"></div>
        <h3>${esc(c.name)}</h3>
        ${photo(c.images[0], 'Chapter photo', 'chapter-img')}
        <div class="chapter-thumbs">${photo(c.images[1], '', 'thumb')}${photo(c.images[2], '', 'thumb')}</div>
        <div class="acts">
          ${c.activities.map(a => `<div class="act">
            <h5>${esc(a.title)}</h5>
            <p>${esc(a.dateLabel)} · <span style="color:${a.pillarColor}">${esc(a.pillarLabel)}</span></p>
          </div>`).join('')}
        </div>
      </div>`).join('')}
    </div>` : `<div class="empty-note">No activity recorded for these chapters this month.</div>`}
    ${footer(doc, n)}
  </section>`;
}

// ------------------------------------------------------------------- page 5 --

const memberRow = (m: MilestoneItem, round = false) => `<div class="mrow">
  ${photo(m.image, 'Photo', round ? 'mphoto round' : 'mphoto')}
  <div><h4>${esc(m.name)}</h4><p>${esc(m.detail.value)}</p></div>
</div>`;

function page5(doc: NewsletterDoc) {
  const m = doc.members;
  const box = (label: string, color: string, inner: string) =>
    `<div class="mbox"><div class="mbox-top" style="background:${color}"></div><p class="mlabel">${esc(label)}</p>${inner}</div>`;
  const prog = m.programs[0];
  return `<section class="page" id="page-5">
    ${masthead()}
    ${pageHead('CELEBRATING OUR MEMBERS', 'Member Highlights', `<div class="phead-right"><div>${esc(doc.masthead.monthLabel)} ${esc(doc.masthead.yearLabel)}</div></div>`)}
    <div class="grid2 grow">
      ${box('NEW APPOINTMENTS', THEME.pillar['Connect to Create']!.color, m.appointments.map(x => memberRow(x)).join('') || '<p class="none">Nothing recorded this month.</p>')}
      ${box('AWARDS & RECOGNITION', THEME.pillar['Lead with Impact']!.color, m.awards.map(x => memberRow(x, true)).join('') || '<p class="none">Nothing recorded this month.</p>')}
    </div>
    ${prog ? `<div class="mwide">
      <div class="mwide-bar" style="background:${THEME.pillar['Grow to Great']!.color}"></div>
      <div class="mwide-t">
        <p class="mlabel">PROGRAM ACCEPTANCES</p>
        <h3>${esc(prog.title.value)}</h3>
        <p class="mnames">${esc(prog.names)}</p>
      </div>
      ${photo(prog.image, 'Photo', 'mwide-img')}
    </div>` : ''}
    ${m.boards.length ? `<div class="mbox wide">
      <div class="mbox-top" style="background:${THEME.pillar['Connect to Create']!.color}"></div>
      <p class="mlabel">BOARD &amp; COMMITTEE SEATS</p>
      <div class="grid2 tight">${m.boards.map(x => memberRow(x, true)).join('')}</div>
    </div>` : ''}
    <footer class="foot"><span>Have something to celebrate? Tell your Chapter Lead or Deputy.</span><span>05 / 06</span></footer>
  </section>`;
}

// ------------------------------------------------------------------- page 6 --

function page6(doc: NewsletterDoc) {
  const legend = Object.values(THEME.pillar)
    .map(p => `<span class="lg"><i style="background:${p.color}"></i>${p.label}</span>`).join('');
  return `<section class="page" id="page-6">
    ${masthead()}
    ${pageHead("WHAT'S AHEAD", 'Next Three Months', `<div class="legend-stack">${legend}</div>`)}
    <div class="grid3 ahead">
      ${doc.upcoming.map(mo => `<div class="mo">
        <h3>${esc(mo.monthLabel)} <span>${esc(mo.yearLabel)}</span></h3>
        <div class="mo-rule"></div>
        ${mo.entries.length ? mo.entries.map(e => `<div class="ent" style="border-left-color:${e.pillarColor}">
          <p class="ent-m"><span style="color:${e.pillarColor}">${esc(e.pillarLabel)}</span> · ${esc(e.dateLabel)}</p>
          <h5>${esc(e.title)}</h5>
        </div>`).join('') : '<p class="none">Nothing scheduled yet.</p>'}
      </div>`).join('')}
    </div>
    <div class="sec-label">PHOTO OF THE MONTH<div class="sec-rule"></div><span class="sec-right">${esc(doc.photoOfMonth.location)}</span></div>
    <div class="potm"><div class="potm-bar" style="background:${THEME.pillar['Lead with Impact']!.color}"></div>${photo(doc.photoOfMonth.image, 'Closing photo', 'potm-img')}</div>
    <div class="callout"><div class="callout-bar" style="background:${THEME.pillar['Lead with Impact']!.color}"></div>
      <h4>${esc(doc.callout.title.value)}</h4><p>${esc(doc.callout.body.value)}</p></div>
    ${footer(doc, 6)}
  </section>`;
}

// --------------------------------------------------------------------- CSS ---

function css(t = THEME) {
  return `
:root{--bg:${t.background.base};--glowA:${t.background.glowBlue};--glowB:${t.background.glowPurple};
--ink:${t.text.primary};--muted:${t.text.muted};--accent:${t.text.accent};
--card:${t.surface.card};--panel:${t.surface.panel};--hair:${t.surface.hairline};}
*{box-sizing:border-box;margin:0;padding:0}
body{background:#12141c;font-family:${t.font.body};-webkit-font-smoothing:antialiased;
  font-feature-settings:"liga" 1;}
.page{position:relative;width:595.5pt;height:842.25pt;padding:30pt 30pt 24pt;overflow:hidden;
  background:
    radial-gradient(56% 42% at -6% 22%, var(--glowA) 0%, transparent 62%),
    radial-gradient(52% 40% at 106% 78%, var(--glowB) 0%, transparent 60%),
    var(--bg);
  color:var(--ink);display:flex;flex-direction:column;margin:0 auto 16px;}
@media print{body{background:#fff}.page{margin:0;break-after:page;page-break-after:always}.page:last-child{break-after:auto;page-break-after:auto}}
@page{size:A4;margin:0}

.mast{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16pt}
.mast-misk{display:flex;gap:7pt;align-items:center}
.mast-misk-t{display:flex;flex-direction:column;line-height:1.15}
.mast-misk-t .ar{font-family:${t.font.arabic};font-size:8.5pt;letter-spacing:.02em}
.mast-misk-t .en{font-size:7pt;font-weight:600;letter-spacing:.01em}
.mast-sls{display:flex;flex-direction:column;align-items:flex-end;line-height:1.3;font-size:8pt;letter-spacing:.22em}
.mast-sls b{font-weight:700;letter-spacing:.17em}

.eyebrow{font-size:7.5pt;letter-spacing:.22em;color:var(--muted);font-weight:600}
.issue{margin-bottom:6pt}
.month{font-family:${t.font.display};font-size:34pt;font-weight:700;line-height:1;letter-spacing:-.01em}
.month span{color:var(--accent);font-weight:500;font-size:22pt}
.legend{display:flex;align-items:center;gap:12pt;margin:12pt 0 14pt}
.lg{display:inline-flex;align-items:center;gap:4pt;font-size:7.5pt;letter-spacing:.14em;font-weight:600}
.lg i{width:5pt;height:5pt;border-radius:50%;display:inline-block}
.legend-rule{flex:1;height:1px;background:var(--hair)}
.led{font-size:7.5pt;letter-spacing:.14em;color:var(--muted)}
.legend-stack{display:flex;flex-direction:column;gap:4pt;align-items:flex-start}

.phead{margin-bottom:14pt}
.phead-row{display:flex;justify-content:space-between;align-items:flex-end;gap:12pt}
.phead h1{font-family:${t.font.display};font-size:26pt;font-weight:700;line-height:1.1;margin-top:2pt}
.phead-right{text-align:right;font-size:7.5pt;color:var(--muted);line-height:1.6}
.rule{height:1px;background:var(--hair);margin-top:10pt}

.hero{display:grid;grid-template-columns:1fr 1.05fr;gap:14pt;margin-bottom:14pt}
.hero-img{aspect-ratio:4/3;border-radius:2pt}
.hero-t h2{font-family:${t.font.display};font-size:17pt;font-weight:700;line-height:1.18;margin:6pt 0 7pt}
.hero-t p{font-size:8.2pt;line-height:1.62;color:#DCE3F5}

.card-meta{display:flex;align-items:center;gap:6pt}
.chip{font-size:6.5pt;font-weight:700;letter-spacing:.1em;padding:2.5pt 6pt;border-radius:99pt;border:1px solid}
.date{font-size:7.5pt;color:var(--muted)}

.sec-label{display:flex;align-items:center;gap:10pt;font-size:7.5pt;letter-spacing:.2em;font-weight:600;margin:6pt 0 9pt}
.sec-rule{flex:1;height:1px;background:var(--hair)}
.sec-right{color:var(--muted);letter-spacing:.04em;font-weight:400}

.grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:11pt}
.grid2{display:grid;grid-template-columns:repeat(2,1fr);gap:11pt}
/* The template's photos are elastic: they take up whatever the copy leaves, so a
   quiet month still produces a full page instead of a half-empty one. */
.grow{flex:1;min-height:0}
.card,.pcard,.chapter,.mbox{display:flex;flex-direction:column;min-height:0}
.card .card-img,.pcard .pcard-img,.chapter .chapter-img{flex:1;min-height:64pt;aspect-ratio:auto}
.hero{flex:0 0 auto}
.hero-img{min-height:150pt}
.grid2.tight{gap:8pt;margin-top:4pt}
.card-top{height:2pt;border-radius:2pt;margin-bottom:7pt}
.card-img{aspect-ratio:16/10;border-radius:2pt;margin-bottom:7pt}
.card p{margin-bottom:auto}
.card h3{font-family:${t.font.display};font-size:10pt;font-weight:700;line-height:1.25;margin:6pt 0 5pt}
.card p{font-size:7.2pt;line-height:1.58;color:#C7D0E8}

.ph{background-size:cover;background-position:center;background-color:var(--card);border-radius:2pt}
.ph-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5pt;
  color:#6B78A8;font-size:7.5pt;background:var(--card)}

.lead-grid{display:grid;grid-template-columns:.62fr 1fr;gap:18pt;margin-bottom:18pt}
.portrait-wrap{display:flex;flex-direction:column}
.portrait{flex:1;min-height:170pt}
.portrait-rule{height:2pt;background:linear-gradient(90deg,${t.pillar['Connect to Create']!.color},${t.pillar['Grow to Great']!.color});margin-top:2pt}
blockquote{font-family:${t.font.quote};font-style:italic;font-size:13.5pt;line-height:1.42}
.msg-label{display:flex;align-items:center;gap:8pt;font-size:7pt;letter-spacing:.2em;color:var(--muted);margin:14pt 0 8pt}
.msg-rule{width:28pt;height:1.5pt;background:${t.pillar['Grow to Great']!.color}}
.msg{font-size:8pt;line-height:1.7;color:#C7D0E8}
.pcard-img{aspect-ratio:1/1.05;border-radius:2pt;margin-bottom:6pt}
.pcard h4{margin-top:auto}
.pcard h4{font-size:8pt;font-weight:700;line-height:1.3}
.pmeta{font-size:7pt;color:var(--muted);margin-top:3pt}

.chapters .chapter-top{height:2pt;border-radius:2pt;margin-bottom:7pt}
.chapter h3{font-family:${t.font.display};font-size:11pt;font-weight:700;margin-bottom:7pt}
.chapter-img{aspect-ratio:1/1.25;border-radius:2pt}
.chapter-thumbs{display:grid;grid-template-columns:1fr 1fr;gap:6pt;margin-top:6pt}
.chapter-thumbs .thumb{aspect-ratio:1/.72;border-radius:2pt}
.acts{margin-top:9pt;display:flex;flex-direction:column;gap:8pt}
.act h5{font-size:7.8pt;font-weight:700;line-height:1.3}
.act p{font-size:7pt;color:var(--muted);margin-top:2pt}

.mbox{position:relative;background:rgba(8,16,63,.72);border-radius:3pt;padding:14pt 13pt;overflow:hidden}
.mbox.wide{margin-top:11pt}
.mbox-top{position:absolute;inset:0 0 auto 0;height:2pt}
.mlabel{font-size:7pt;letter-spacing:.2em;font-weight:700;color:#A9B6DD;margin-bottom:10pt}
.mrow{display:flex;gap:10pt;align-items:flex-start;margin-bottom:11pt}
.mrow:last-child{margin-bottom:0}
.mphoto{width:52pt;height:52pt;flex:0 0 52pt;border-radius:2pt}
.mphoto.round{border-radius:50%}
.mrow h4{font-size:8.5pt;font-weight:700;margin-bottom:3pt}
.mrow p{font-size:7.2pt;line-height:1.55;color:#C7D0E8}
.none{font-size:7.5pt;color:var(--muted)}
.mwide{position:relative;flex:0 0 auto;display:grid;grid-template-columns:1fr .78fr;gap:14pt;align-items:center;
  background:rgba(8,16,63,.72);border-radius:3pt;padding:16pt;margin-top:11pt;overflow:hidden}
.mwide-bar{position:absolute;inset:0 auto 0 0;width:2.5pt}
.mwide-t h3{font-family:${t.font.display};font-size:12pt;font-weight:700;margin-bottom:6pt}
.mnames{font-size:7.5pt;color:#C7D0E8}
.mwide-img{aspect-ratio:16/10;border-radius:2pt}

.ahead .mo h3{font-family:${t.font.display};font-size:13pt;font-weight:700}
.ahead .mo h3 span{font-size:8pt;color:var(--muted);font-weight:500}
.mo-rule{height:1.5pt;background:${t.pillar['Connect to Create']!.color};margin:7pt 0 10pt}
.ent{border-left:2.5pt solid;padding:0 0 0 8pt;margin-bottom:12pt}
.ent-m{font-size:6.8pt;letter-spacing:.12em;font-weight:700;color:var(--muted);margin-bottom:3pt}
.ent h5{font-size:8.2pt;font-weight:700;line-height:1.35}
.potm{position:relative;margin-bottom:11pt;flex:1;min-height:120pt;display:flex}
.potm-bar{position:absolute;inset:0 auto 0 0;width:2.5pt;z-index:1}
.potm-img{flex:1;border-radius:2pt}
.callout{position:relative;background:rgba(8,16,63,.72);border-radius:3pt;padding:14pt 16pt;overflow:hidden}
.callout-bar{position:absolute;inset:0 auto 0 0;width:2.5pt}
.callout h4{font-family:${t.font.display};font-size:10.5pt;font-weight:700;margin-bottom:5pt}
.callout p{font-size:7.5pt;line-height:1.6;color:#C7D0E8}

.empty-note{flex:1;display:flex;align-items:center;justify-content:center;color:var(--muted);font-size:9pt}
.foot{margin-top:auto;padding-top:12pt;display:flex;justify-content:space-between;font-size:7pt;color:var(--muted)}
`;
}

export function renderIssueHtml(doc: NewsletterDoc, _spec?: TemplateSpec): string {
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>SLS Newsletter — ${esc(doc.masthead.monthLabel)} ${esc(doc.masthead.yearLabel)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Poppins:wght@500;600;700&family=Playfair+Display:ital@1&family=IBM+Plex+Sans+Arabic:wght@400;600&display=swap" rel="stylesheet">
<style>${css()}</style>
</head><body>
${page1(doc)}
${page2(doc)}
${chapterPage(doc, doc.localChapters, 3, 'ACROSS THE KINGDOM', 'Local Chapters', `${doc.stats.localActivities} activities`, `${doc.stats.localRegions} regions`)}
${chapterPage(doc, doc.globalChapters, 4, 'SLS AROUND THE WORLD', 'Global Chapters', `${doc.stats.globalActivities} activities`, `${doc.stats.globalCountries} countries`)}
${page5(doc)}
${page6(doc)}
</body></html>`;
}
