# Design tokens — extraction report

**Deliverable #2 of the build brief: "a `design-tokens` extraction report showing exactly which colors/fonts you pulled from the live site."**

This report has to open with the thing you most need to know.

---

## The live site could not be read from this build environment

Every attempt to reach a Misk-owned host was refused at the network layer, before any request reached Misk:

| Host | Purpose | Result |
|---|---|---|
| `hub.misk.org.sa` | Reference link #1 — the SLS program page | `HTTP 403` at the egress proxy (`connect_rejected`) |
| `content.cdnhub.misk.org.sa` | Reference link #2 — the SLS Impact Report PDF | `HTTP 403` at the egress proxy |
| `brand.misk.org.sa` | Misk Foundation brand guidelines portal | `HTTP 403` at the egress proxy |
| `misk.org.sa` | Foundation site | `HTTP 403` at the egress proxy |

This is the **environment's own network policy**, not a Misk block and not a transient failure. Claude Code on the web runs in a sandbox whose outbound access is governed by the network policy chosen when the environment was created (see <https://code.claude.com/docs/en/claude-code-on-the-web>). Two independent routes were tried — a direct `curl` and the sandbox's own fetch tool — and both were refused by the proxy with the same 403.

**So no colour, font, radius or shadow in `design-tokens.json` was extracted from the live site.** Saying otherwise would be the single most damaging thing this report could do, because every downstream artefact — the UI, every chart, the PDF export, the recap cards — reads from that file.

## What the values actually are

They are a **coherent, accessibility-validated placeholder system**, designed to be plausible for a Misk/Vision-2030 context (deep teal-green primary, gold accent, warm neutral surfaces) and, more importantly, designed to be **replaced in one step**.

Every token is marked in `design-tokens.json` under `$meta.provenance`:

```json
"verified": [],
"inferred": ["color.*", "font.*", "radius.*", "shadow.*", "space.*"]
```

## How to put the real values in — 2 minutes, no rebuild

The tokens are loaded at **runtime** and pushed onto `:root` as CSS custom properties (`web/src/lib/tokens.ts`). Tailwind's config references those variables rather than literal hex values, and the PDF generator re-reads the file per request. So:

**Option A — in the app.** Settings → *Brand tokens* → **Edit tokens** → paste the corrected JSON → **Save tokens**. The previous file is backed up to `design-tokens.backup.json`. Refresh; the whole app, every chart and every future PDF export use the new values.

**Option B — edit the file.** Change `design-tokens.json` at the repo root and refresh the browser.

Neither option requires a rebuild, a restart, or a code change.

### Where to get the real values

1. Open <https://hub.misk.org.sa/sls/> in a normal browser.
2. DevTools → Elements → select the header, a primary button, and a body paragraph.
3. From the Computed panel, read off: `background-color`, `color`, `font-family`, `border-radius`, `box-shadow`.
4. Also check `:root` in the Styles panel — HubSpot-built pages (which `hub.misk.org.sa` is) usually expose the theme palette as CSS custom properties, which is the fastest complete source.
5. Map them onto the keys below.

### The keys that matter most

| Token | Current (inferred) | What to replace it with |
|---|---|---|
| `color.brand.primary` | `#0F5C4D` | The dominant brand colour — sidebar, headers, primary buttons |
| `color.brand.accent` | `#C98500` | The secondary/CTA colour |
| `color.brand.secondary` | `#12A085` | The lighter brand tone used for data marks |
| `color.pillar.*` | teal / gold / blue | One colour per pillar, if the brand defines them |
| `font.sansEn` | `Inter` stack | The real Latin font stack |
| `font.sansAr` | `IBM Plex Sans Arabic` stack | The real Arabic font stack |
| `radius.md` | `10px` | The button/card radius from the live buttons |
| `shadow.sm` / `shadow.md` | soft neutral shadows | The real elevation style |

---

## What *is* verified: the chart palette

The data-visualisation palette was not guessed. It was derived from the brand tokens and then **run through a colourblind-safety and contrast validator**, and the values reported below are measured, not asserted.

**Categorical palette (6 slots, light surface), fixed order:**

| Slot | Hue | Hex |
|---|---|---|
| 1 | teal (brand) | `#12A085` |
| 2 | gold (brand accent) | `#C98500` |
| 3 | blue | `#2A78D6` |
| 4 | orange | `#EB6834` |
| 5 | violet | `#4A3AA7` |
| 6 | magenta | `#E87BA4` |

Validator result on the adjacent pairlist (bars, stacks, lines):

```
[PASS] Lightness band       all 6 inside L 0.43–0.77
[PASS] Chroma floor         all 6 >= 0.1
[PASS] CVD separation       worst adjacent #C98500↔#12A085 ΔE 11.3 (protan)
[PASS] Normal-vision floor  worst adjacent #C98500↔#12A085 ΔE 20.5
[WARN] Contrast vs surface  below 3:1: #C98500 (2.99), #E87BA4 (2.62)
```

**Pillar palette** (`#12A085`, `#C98500`, `#2A78D6`) additionally passes on the *all-pairs* list, because all three pillars appear together in one chart.

### The contrast WARN, and why it is discharged rather than ignored

Gold and magenta sit just under 3:1 against a light surface. The rule for that is "relief required — visible labels or a table view", and the app ships all of it:

- every chart with ≥ 2 series renders a legend, so identity is never colour-alone;
- charts with ≤ 4 series and ≤ 14 rows also carry direct value labels;
- **every chart has a Table toggle** in its header;
- stacked and adjacent fills carry a 2px surface gap so boundaries read without relying on hue contrast.

### Rules encoded in code, not left to the caller

- Categorical hues are assigned in **fixed slot order and never cycled**. A 7th series folds into a neutral **"Other"** (`foldToCap` in `web/src/lib/tokens.ts`) rather than reusing slot 1, which would make two different entities the same colour.
- Colour follows the **entity**, not its rank, so changing a filter never repaints the surviving series.
- **No dual-axis charts anywhere.** Two measures of different scale get two charts.
- Sequential ramps are one hue light→dark; the diverging ramp is two hues with a neutral grey midpoint.
- Status colours (good / warning / serious / critical) are **reserved** and never reused as a series colour.

If you replace the brand hexes, re-run the validator against your new values before shipping — a brand colour that is beautiful in a logo is often too dark or too grey to work as a data mark. (`#0F5C4D`, the primary, is exactly that case: it fails the lightness and chroma floors as a chart colour, which is why `#12A085` carries it into charts and `#0F5C4D` stays on chrome.)

---

## The other missing input: the Impact Report PDF

Brief item: *"Extract every quantifiable metric from the Impact Report PDF into structured data."*

The PDF is on `content.cdnhub.misk.org.sa`, blocked by the same policy, so it could not be parsed. Instead:

- The headline figures **supplied in the brief itself** (974 / 611 / 363 members, 331 onboarded, 180+ startups, 13,000+ attendees, 29+ recognised) are seeded into `impact_metrics` with `source = 'impact-report'` and a note stating plainly that they came from the brief and were **not** re-verified against the PDF.
- The Impact & Startups page renders that `source` column, so a reported headline is never silently blended with a computed figure.
- To load the real metrics: Data Ingestion → **Impact metrics** → upload a CSV of `period, metric_name, value, unit, notes`. They will land with `source = 'import'`.

## Unblocking the extraction

Any one of these fixes it:

1. **Allow the domains in the environment's network policy** and re-run the extraction — the fastest path if you control the Claude Code environment settings.
2. **Paste the values in yourself** via Settings → Brand tokens (Option A above).
3. **Send the brand guidelines PDF** into a session; it can be read locally without any network access.
