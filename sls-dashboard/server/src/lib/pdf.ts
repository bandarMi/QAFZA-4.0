/**
 * Branded, print-ready PDF report generator.
 *
 * Colours, fonts and spacing come from design-tokens.json at request time, so
 * fixing the brand tokens fixes the exported report too — no rebuild.
 *
 * Charts are drawn as vectors directly by PDFKit (no headless browser), which
 * keeps the export dependency-light and the output crisp at print resolution.
 *
 * ARABIC: PDFKit's built-in fonts have no Arabic glyphs and it does not do
 * bidi/contextual shaping. Drop a TTF at assets/fonts/arabic.ttf and Arabic
 * headings will embed; without it the PDF stays English and says so. The in-app
 * Arabic UI is unaffected — it renders natively in the browser.
 */
import PDFDocument from 'pdfkit';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as A from './analytics.js';
import { recognitionSummary } from './recognition.js';
import { getSetting } from './settings.js';
import { describeFilters, type Filters } from './filters.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../..');
const ARABIC_FONT = path.join(ROOT, 'assets', 'fonts', 'arabic.ttf');

export function loadTokens(): any {
  return JSON.parse(fs.readFileSync(path.join(ROOT, 'design-tokens.json'), 'utf8'));
}

export type ReportSection =
  | 'kpis' | 'hours_trend' | 'pillar_split' | 'activity_mix' | 'initiatives'
  | 'leaderboard' | 'recognition' | 'startups' | 'social' | 'pinned';

export const ALL_SECTIONS: Array<{ id: ReportSection; label: string; label_ar: string }> = [
  { id: 'kpis',        label: 'Headline KPIs',                 label_ar: 'المؤشرات الرئيسية' },
  { id: 'hours_trend', label: 'Engagement hours over time',    label_ar: 'ساعات المشاركة عبر الزمن' },
  { id: 'pillar_split',label: 'Hours by pillar',               label_ar: 'الساعات حسب المحور' },
  { id: 'activity_mix',label: 'Hours by activity type',        label_ar: 'الساعات حسب نوع النشاط' },
  { id: 'initiatives', label: 'Initiative summaries',          label_ar: 'ملخص المبادرات' },
  { id: 'leaderboard', label: 'Engagement-hours leaderboard',  label_ar: 'لوحة صدارة الساعات' },
  { id: 'recognition', label: 'Recognition thresholds',        label_ar: 'حدود التكريم' },
  { id: 'startups',    label: 'Startups supported',            label_ar: 'الشركات الناشئة المدعومة' },
  { id: 'social',      label: 'Social listening highlights',   label_ar: 'أبرز الرصد الاجتماعي' },
  { id: 'pinned',      label: 'Pinned AI answers',             label_ar: 'إجابات الذكاء الاصطناعي المثبتة' },
];

const A4 = { w: 595.28, h: 841.89 };
const M = 48;                       // page margin
const BOTTOM = 26;                  // bottom margin — the footer must sit INSIDE it,
                                    // or PDFKit auto-inserts a phantom page for it.
const PAGE_OPTS = { size: 'A4' as const, margins: { top: M, bottom: BOTTOM, left: M, right: M } };
const CONTENT_W = A4.w - M * 2;

type Ctx = { doc: PDFKit.PDFDocument; t: any; hasArabic: boolean; page: number; title: string; subtitle: string };

function fmt(n: number | null | undefined, digits = 0): string {
  if (n == null) return '—';
  return n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function header(ctx: Ctx, title: string, subtitle: string) {
  const { doc, t } = ctx;
  doc.rect(0, 0, A4.w, 96).fill(t.color.brand.primary);
  doc.rect(0, 96, A4.w, 4).fill(t.color.brand.accent);
  doc.fillColor(t.color.brand.onPrimary).font('Helvetica-Bold').fontSize(19).text(title, M, 32, { width: CONTENT_W });
  doc.font('Helvetica').fontSize(9.5).fillColor('#CFE4DE').text(subtitle, M, 60, { width: CONTENT_W });
}

function footer(ctx: Ctx) {
  const { doc, t } = ctx;
  const y = A4.h - BOTTOM - 16;
  doc.moveTo(M, y - 8).lineTo(A4.w - M, y - 8).lineWidth(0.5).strokeColor(t.color.border.default).stroke();
  doc.font('Helvetica').fontSize(7.5).fillColor(t.color.ink.muted)
     .text(String(getSetting('report_footer') ?? 'Saudi Leadership Society'), M, y, { width: CONTENT_W - 60 })
     .text(String(ctx.page), A4.w - M - 40, y, { width: 40, align: 'right' });
}

const BODY_BOTTOM = A4.h - BOTTOM - 34;   // last y a drawing may occupy

function newPage(ctx: Ctx) {
  ctx.doc.addPage(PAGE_OPTS);
  ctx.page++;
  header(ctx, ctx.title, ctx.subtitle);
  footer(ctx);
  return 124;
}

/** Return y, moving to a fresh page first if `h` would not fit below it. */
function fit(ctx: Ctx, y: number, h: number): number {
  return y + h > BODY_BOTTOM ? newPage(ctx) : y;
}

/** Section heading with the brand accent rule. */
function sectionTitle(ctx: Ctx, y: number, text: string): number {
  const { doc, t } = ctx;
  y = fit(ctx, y, 60);
  doc.font('Helvetica-Bold').fontSize(13).fillColor(t.color.ink.primary).text(text, M, y);
  const h = doc.heightOfString(text, { width: CONTENT_W });
  doc.rect(M, y + h + 5, 34, 2.5).fill(t.color.brand.accent);
  return y + h + 18;
}

function kpiGrid(ctx: Ctx, y: number, items: Array<{ label: string; value: string; sub?: string }>): number {
  const { doc, t } = ctx;
  const cols = 3, gap = 12;
  const w = (CONTENT_W - gap * (cols - 1)) / cols;
  const h = 62;
  y = fit(ctx, y, Math.ceil(items.length / cols) * (h + gap) + 6);
  items.forEach((it, i) => {
    const col = i % cols, row = Math.floor(i / cols);
    const x = M + col * (w + gap), yy = y + row * (h + gap);
    doc.roundedRect(x, yy, w, h, 8).fillAndStroke(t.color.brand.primarySofter, t.color.border.subtle);
    doc.font('Helvetica').fontSize(7.5).fillColor(t.color.ink.muted)
       .text(it.label.toUpperCase(), x + 12, yy + 11, { width: w - 24, characterSpacing: 0.4 });
    doc.font('Helvetica-Bold').fontSize(17).fillColor(t.color.brand.primary)
       .text(it.value, x + 12, yy + 25, { width: w - 24 });
    if (it.sub) {
      doc.font('Helvetica').fontSize(7).fillColor(t.color.ink.muted).text(it.sub, x + 12, yy + 47, { width: w - 24 });
    }
  });
  return y + Math.ceil(items.length / cols) * (h + gap) + 6;
}

/** Horizontal bar chart with direct value labels (the contrast relief rule). */
function barChart(ctx: Ctx, y: number, rows: Array<{ label: string; value: number; color?: string }>, unit: string): number {
  const { doc, t } = ctx;
  y = fit(ctx, y, rows.length * 20 + 10);
  if (!rows.length) { doc.font('Helvetica-Oblique').fontSize(9).fillColor(t.color.ink.muted).text('No data for the selected filters.', M, y); return y + 20; }
  const max = Math.max(...rows.map(r => r.value), 1);
  const labelW = 150, valueW = 74;
  const trackW = CONTENT_W - labelW - valueW;
  const rowH = 20;
  rows.forEach((r, i) => {
    const yy = y + i * rowH;
    doc.font('Helvetica').fontSize(8.5).fillColor(t.color.ink.secondary)
       .text(r.label, M, yy + 4, { width: labelW - 8, ellipsis: true, lineBreak: false });
    doc.roundedRect(M + labelW, yy + 3, trackW, 11, 3).fill(t.color.surface.sunken);
    const w = Math.max(2, (r.value / max) * trackW);
    doc.roundedRect(M + labelW, yy + 3, w, 11, 3).fill(r.color ?? t.color.chart.categorical[i % t.color.chart.categorical.length]);
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor(t.color.ink.primary)
       .text(`${fmt(r.value, r.value % 1 ? 1 : 0)}${unit ? ` ${unit}` : ''}`, M + labelW + trackW + 8, yy + 4, { width: valueW - 8 });
  });
  return y + rows.length * rowH + 10;
}

/** Sparkline-style line chart for a time series. */
function lineChart(ctx: Ctx, y: number, rows: Array<{ x: string; v: number }>, unit: string): number {
  const { doc, t } = ctx;
  y = fit(ctx, y, 148);
  if (rows.length < 2) { doc.font('Helvetica-Oblique').fontSize(9).fillColor(t.color.ink.muted).text('Not enough periods to plot a trend.', M, y); return y + 20; }
  const h = 128, pad = 10;
  const max = Math.max(...rows.map(r => r.v)) * 1.08 || 1;
  const stepX = (CONTENT_W - pad * 2) / (rows.length - 1);

  doc.roundedRect(M, y, CONTENT_W, h, 8).fillAndStroke('#FFFFFF', t.color.border.subtle);
  // Recessive gridlines + axis labels.
  for (let g = 0; g <= 3; g++) {
    const gy = y + pad + ((h - pad * 2) * g) / 3;
    doc.moveTo(M + pad, gy).lineTo(M + CONTENT_W - pad, gy).lineWidth(0.4).strokeColor(t.color.chart.grid).stroke();
    doc.font('Helvetica').fontSize(6.5).fillColor(t.color.chart.axisLabel)
       .text(fmt(max * (1 - g / 3)), M + CONTENT_W - pad - 40, gy - 4, { width: 40, align: 'right' });
  }
  const pt = (i: number, v: number) => ({ x: M + pad + i * stepX, y: y + pad + (h - pad * 2) * (1 - v / max) });

  // Area under the line, then the 2px line on top.
  doc.moveTo(pt(0, rows[0]!.v).x, y + h - pad);
  rows.forEach((r, i) => { const p = pt(i, r.v); doc.lineTo(p.x, p.y); });
  doc.lineTo(pt(rows.length - 1, 0).x, y + h - pad).fillOpacity(0.13).fill(t.color.brand.secondary).fillOpacity(1);

  rows.forEach((r, i) => { const p = pt(i, r.v); i === 0 ? doc.moveTo(p.x, p.y) : doc.lineTo(p.x, p.y); });
  doc.lineWidth(2).strokeColor(t.color.brand.secondary).stroke();

  // Label only the first, last and peak points — never every point.
  const peak = rows.reduce((a, r, i) => (r.v > rows[a]!.v ? i : a), 0);
  for (const i of new Set([0, peak, rows.length - 1])) {
    const p = pt(i, rows[i]!.v);
    doc.circle(p.x, p.y, 3).fillAndStroke(t.color.brand.secondary, '#FFFFFF');
    doc.font('Helvetica-Bold').fontSize(6.5).fillColor(t.color.ink.primary)
       .text(fmt(rows[i]!.v), p.x - 20, p.y - 13, { width: 40, align: 'center' });
  }
  doc.font('Helvetica').fontSize(6.5).fillColor(t.color.chart.axisLabel)
     .text(rows[0]!.x, M + pad, y + h + 3)
     .text(rows[rows.length - 1]!.x, M + CONTENT_W - pad - 60, y + h + 3, { width: 60, align: 'right' });
  if (unit) doc.text(unit, M + pad, y + h + 3, { width: CONTENT_W - pad * 2, align: 'center' });
  return y + h + 20;
}

function table(ctx: Ctx, y: number, cols: Array<{ key: string; label: string; w: number; align?: 'left' | 'right' }>, rows: any[], maxRows = 18): number {
  const { doc, t } = ctx;
  const rowH = 17;
  const shown = rows.slice(0, maxRows);

  const drawHead = (yy: number) => {
    doc.rect(M, yy, CONTENT_W, rowH).fill(t.color.brand.primarySoft);
    let x = M;
    for (const c of cols) {
      doc.font('Helvetica-Bold').fontSize(7.5).fillColor(t.color.brand.primary)
         .text(c.label.toUpperCase(), x + 6, yy + 5, { width: c.w - 12, align: c.align ?? 'left', lineBreak: false });
      x += c.w;
    }
    return yy + rowH;
  };

  y = fit(ctx, y, rowH * 3);
  y = drawHead(y);

  shown.forEach((r, i) => {
    if (y + rowH > BODY_BOTTOM) {          // continue the table on the next page
      y = newPage(ctx);
      y = drawHead(y);
    }
    if (i % 2) doc.rect(M, y, CONTENT_W, rowH).fill(t.color.surface.canvas);
    let cx = M;
    for (const c of cols) {
      const raw = r[c.key];
      const v = typeof raw === 'number' ? fmt(raw, raw % 1 ? 1 : 0) : String(raw ?? '—');
      doc.font('Helvetica').fontSize(8).fillColor(t.color.ink.secondary)
         .text(v, cx + 6, y + 5, { width: c.w - 12, align: c.align ?? 'left', ellipsis: true, lineBreak: false });
      cx += c.w;
    }
    y += rowH;
  });

  if (rows.length > maxRows) {
    y = fit(ctx, y, 20);
    doc.font('Helvetica-Oblique').fontSize(7.5).fillColor(t.color.ink.muted)
       .text(`+ ${rows.length - maxRows} more rows — see the CSV / Power BI export for the full set.`, M, y + 4, { lineBreak: false });
    y += 18;
  }
  return y + 10;
}

export function buildReport(opts: { filters: Filters; sections: ReportSection[]; title?: string; lang?: 'en' | 'ar' }): PDFKit.PDFDocument {
  const t = loadTokens();
  const doc = new PDFDocument({ ...PAGE_OPTS, autoFirstPage: false, info: { Title: opts.title ?? 'SLS Impact Report', Author: 'SLS Data Center' } });
  const hasArabic = fs.existsSync(ARABIC_FONT);
  if (hasArabic) { try { doc.registerFont('Arabic', ARABIC_FONT); } catch { /* unusable font file */ } }
  const filterLineEarly = describeFilters(opts.filters);
  const ctxTitle = opts.title ?? `${getSetting('organisation_name')} — Impact Report`;
  const ctx: Ctx = { doc, t, hasArabic, page: 0, title: ctxTitle, subtitle: `${filterLineEarly}  ·  generated ${new Date().toISOString().slice(0, 10)}` };

  const f = opts.filters;
  const filterLine = filterLineEarly;
  const title = ctx.title;

  // ------------------------------------------------------------- cover page --
  doc.addPage(PAGE_OPTS); ctx.page = 1;
  doc.rect(0, 0, A4.w, A4.h).fill(t.color.brand.primary);
  doc.rect(0, 300, A4.w, 6).fill(t.color.brand.accent);
  doc.font('Helvetica-Bold').fontSize(34).fillColor('#FFFFFF').text(String(getSetting('organisation_name')), M, 180, { width: CONTENT_W });
  doc.font('Helvetica').fontSize(15).fillColor('#BBD6CF').text(opts.title ?? 'Impact & Engagement Report', M, 232, { width: CONTENT_W });
  doc.fontSize(10).fillColor('#8FBDB2').text(filterLine, M, 330, { width: CONTENT_W });
  doc.fontSize(9).text(`Generated ${new Date().toISOString().slice(0, 19).replace('T', ' ')} from the SLS Data Center`, M, 352, { width: CONTENT_W });
  doc.fontSize(8.5).fillColor('#7FB0A4').text('Three pillars: Grow to Great · Connect to Create · Lead with Impact', M, A4.h - 120, { width: CONTENT_W });
  doc.text('Values: Authenticity · Collaboration · Ownership · Impact', M, A4.h - 104, { width: CONTENT_W });
  if (opts.lang === 'ar' && !hasArabic) {
    doc.fontSize(7.5).fillColor('#7FB0A4')
       .text('Arabic PDF rendering needs an Arabic TTF at assets/fonts/arabic.ttf — this export was produced in English.', M, A4.h - 80, { width: CONTENT_W });
  }

  let y = newPage(ctx);
  const need = (h: number) => { y = fit(ctx, y, h); };

  for (const section of opts.sections) {
    switch (section) {
      case 'kpis': {
        const { kpis } = A.overviewKpis(f);
        need(240);
        y = sectionTitle(ctx, y, 'Headline KPIs');
        y = kpiGrid(ctx, y, [
          { label: 'Total members', value: fmt(kpis.totalMembers), sub: `${fmt(kpis.leaders2030)} 2030 Leaders · ${fmt(kpis.miskFellows)} Misk Fellows` },
          { label: 'Members onboarded', value: fmt(kpis.membersOnboarded), sub: 'in the selected period' },
          { label: 'Engagement hours', value: fmt(kpis.totalHours), sub: `${kpis.autoHoursShare}% auto-captured` },
          { label: 'Avg hours / member', value: fmt(kpis.avgHoursPerMember, 1), sub: `${fmt(kpis.avgHoursPerEngagedMember, 1)} per engaged member` },
          { label: 'Events held', value: fmt(kpis.events), sub: `${fmt(kpis.eventAttendees)} attendees` },
          { label: 'Avg satisfaction', value: kpis.avgSatisfaction != null ? `${fmt(kpis.avgSatisfaction, 2)} / 5` : '—', sub: 'across closed events' },
          { label: 'Startups supported', value: fmt(kpis.startupsSupported) },
          { label: 'Members recognised', value: fmt(kpis.membersRecognised), sub: 'met a recognition threshold' },
          { label: 'Hours verified', value: `${kpis.verifiedHoursShare}%`, sub: `${fmt(kpis.unverifiedEntries)} entries awaiting sign-off` },
        ]);
        break;
      }
      case 'hours_trend': {
        const rows = A.hoursByMonth(f).rows;
        need(190);
        y = sectionTitle(ctx, y, 'Engagement hours over time');
        y = lineChart(ctx, y, rows.map((r: any) => ({ x: r.month, v: r.hours })), 'hours per month');
        break;
      }
      case 'pillar_split': {
        const rows = A.hoursByPillar(f).rows;
        need(130);
        y = sectionTitle(ctx, y, 'Hours by pillar');
        y = barChart(ctx, y, rows.map((r: any) => ({ label: r.pillar, value: r.hours, color: t.color.pillar[r.pillar] })), 'h');
        break;
      }
      case 'activity_mix': {
        const rows = A.hoursByActivity(f).rows;
        need(160);
        y = sectionTitle(ctx, y, 'Hours by activity type');
        y = barChart(ctx, y, rows.map((r: any) => ({ label: r.activity_type, value: r.hours })), 'h');
        break;
      }
      case 'initiatives': {
        const rows = A.initiativePerformance(f).rows;
        need(200);
        y = sectionTitle(ctx, y, 'Initiative summaries');
        y = table(ctx, y, [
          { key: 'name', label: 'Initiative', w: 150 },
          { key: 'pillar', label: 'Pillar', w: 108 },
          { key: 'events', label: 'Events', w: 48, align: 'right' },
          { key: 'attendees', label: 'Attendees', w: 62, align: 'right' },
          { key: 'hours', label: 'Hours', w: 60, align: 'right' },
          { key: 'member_reach_pct', label: 'Reach %', w: 71, align: 'right' },
        ], rows, 14);
        break;
      }
      case 'leaderboard': {
        const rows = A.engagementLeaderboard(f, 20).rows;
        need(200);
        y = sectionTitle(ctx, y, 'Engagement-hours leaderboard');
        y = table(ctx, y, [
          { key: 'name', label: 'Member', w: 140 },
          { key: 'cohort_type', label: 'Cohort', w: 92 },
          { key: 'sector', label: 'Sector', w: 108 },
          { key: 'hours', label: 'Hours', w: 58, align: 'right' },
          { key: 'hours_given', label: 'Given', w: 50, align: 'right' },
          { key: 'entries', label: 'Entries', w: 51, align: 'right' },
        ], rows, 16);
        break;
      }
      case 'recognition': {
        const rec = recognitionSummary();
        need(140);
        y = sectionTitle(ctx, y, 'Recognition thresholds');
        y = table(ctx, y, [
          { key: 'name', label: 'Rule', w: 250 },
          { key: 'threshold_hours', label: 'Threshold (h)', w: 92, align: 'right' },
          { key: 'period', label: 'Period', w: 95 },
          { key: 'flagged', label: 'Flagged', w: 60, align: 'right' },
        ], rec.byRule as any[], 10);
        doc.font('Helvetica').fontSize(8.5).fillColor(t.color.ink.secondary)
           .text(`${rec.distinctMembersFlagged} distinct members have met at least one recognition threshold.`, M, y);
        y += 22;
        break;
      }
      case 'startups': {
        const s = A.startupTrends(f);
        need(180);
        y = sectionTitle(ctx, y, 'Startups supported');
        const bySector: Record<string, number> = {};
        for (const r of s.bySector as any[]) bySector[r.sector] = (bySector[r.sector] ?? 0) + r.startups;
        y = barChart(ctx, y, Object.entries(bySector).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([label, value]) => ({ label, value })), '');
        need(90);
        y = table(ctx, y, [
          { key: 'funding_stage', label: 'Funding stage', w: 250 },
          { key: 'startups', label: 'Startups', w: 249, align: 'right' },
        ], s.byStage as any[], 8);
        break;
      }
      case 'social': {
        const rows: any[] = (require_mentions() as any[]);
        need(160);
        y = sectionTitle(ctx, y, 'Social listening highlights');
        y = table(ctx, y, [
          { key: 'member_name', label: 'Member', w: 120 },
          { key: 'post_date', label: 'Date', w: 66 },
          { key: 'content_snippet', label: 'Snippet', w: 245 },
          { key: 'engagement_count', label: 'Engagement', w: 68, align: 'right' },
        ], rows, 12);
        break;
      }
      case 'pinned': {
        const pins = pinnedForReport();
        if (!pins.length) break;
        need(120);
        y = sectionTitle(ctx, y, 'Pinned AI answers');
        for (const p of pins) {
          const spec = JSON.parse(p.spec);
          need(110);
          doc.font('Helvetica-Bold').fontSize(10).fillColor(t.color.ink.primary).text(p.title, M, y, { width: CONTENT_W });
          y += 16;
          if (spec.note) {
            doc.font('Helvetica-Oblique').fontSize(7.5).fillColor(t.color.ink.muted).text(spec.note, M, y, { width: CONTENT_W });
            y += 14;
          }
          const rows: any[] = Array.isArray(spec.rows) ? spec.rows : [];
          if (rows.length) {
            const keys = Object.keys(rows[0]).slice(0, 5);
            const w = CONTENT_W / keys.length;
            y = table(ctx, y, keys.map(k => ({ key: k, label: k.replace(/_/g, ' '), w, align: (typeof rows[0][k] === 'number' ? 'right' : 'left') as any })), rows, 10);
          }
          y += 6;
        }
        break;
      }
    }
    y += 6;
  }

  // ------------------------------------------------------- provenance page --
  y = newPage(ctx);
  y = sectionTitle(ctx, y, 'How these numbers were produced');
  const notes = [
    `Filters applied: ${filterLine}.`,
    'Engagement hours are derived automatically from attendance and QR check-in/out records by the engagement-hours engine, using the activity-type rules table. Where a check-out was not scanned, the event’s scheduled duration is used — those entries are marked as such in the ledger.',
    'A figure is only as good as its verification state: the KPI block reports what share of hours a council lead has verified. Unverified hours are included in totals but flagged.',
    'Reported headline metrics (impact_metrics) may differ from the transactional tables — the former are what was published, the latter what the system currently holds.',
    'All person-level data in this deployment is synthetic demo data unless it has been replaced through the ingestion layer.',
  ];
  for (const nte of notes) {
    doc.font('Helvetica').fontSize(8.5).fillColor(t.color.ink.secondary).text(`•  ${nte}`, M, y, { width: CONTENT_W, align: 'left' });
    y += doc.heightOfString(`•  ${nte}`, { width: CONTENT_W }) + 8;
  }

  doc.end();
  return doc;
}

// Small local helpers kept out of the main flow for readability.
import { db } from '../db/index.js';
function require_mentions() {
  return db.prepare(`
    SELECT COALESCE(m.name, lm.author_name) member_name, lm.post_date,
           substr(COALESCE(lm.content_snippet,''),1,90) content_snippet, lm.engagement_count
    FROM linkedin_mentions lm LEFT JOIN members m ON m.id=lm.member_id
    ORDER BY lm.priority_flag DESC, lm.engagement_count DESC LIMIT 40`).all();
}
function pinnedForReport(): any[] {
  return db.prepare("SELECT * FROM pinned_widgets WHERE target='report' ORDER BY sort_order, id").all() as any[];
}
