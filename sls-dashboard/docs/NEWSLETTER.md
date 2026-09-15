# The monthly newsletter

One click turns a month of programme data into the six-page SLS newsletter, laid out
in the supplied template, ready to print.

**Dashboard → Newsletter.**

---

## How it works, and why it is built this way

Generation is **two separate steps**, and the order matters:

1. **Compose (always runs, no AI needed).** The composer reads that month's events,
   chapters, member milestones and forward calendar, ranks them, and fills every slot
   on all six pages. Every figure, name, date and place comes from a database row.
2. **Write up (only if an API key is configured).** Claude then *rewrites the wording*
   of the boxes the composer already filled, and offers up to three versions of each.

The AI never decides what goes in the newsletter, never adds a story and never supplies
a number. That separation is the whole reliability argument: if the AI is slow, fails,
or was never switched on, **you still get a complete and correct issue** — just in plainer
language. There is no state in which the button produces nothing.

## Using it

| Step | What happens |
|---|---|
| Pick a month | The list shows every month with activity, and how many events it has |
| **Generate** | All six pages fill. Takes about a second without AI, a few seconds with |
| Edit | Each box shows its alternatives as numbered chips — click `1` `2` `3` to switch, or type your own |
| Move stories | *Make lead*, `←` `→` to reorder the cover cards, *Remove* to bench a story, or promote anything from the bench to the lead slot or a specific card |
| Add photos | Upload against any photo slot; the file is stored in `assets/newsletter/<month>/` |
| **Print / PDF** | Opens the print dialog on the finished newsletter — "Save as PDF" gives exactly six A4 pages |
| **↓ HTML** | Downloads a standalone file you can email or open in any browser |

Edits save automatically about a second after you stop typing, and the preview refreshes.
Reopening a month restores exactly what you left — the wording you chose *and* the
options you did not take.

### The 1–3 options per box

Every text box the AI touches keeps its alternatives. The chips are not re-generations:
they were all produced in the same pass, from the same facts, deliberately differing in
angle — one might lead with the people, another with the outcome, another with the theme.
Your own edit becomes the value without destroying the options. **Rewrite copy** asks for
a fresh set.

Without an API key each box holds one deterministic version and the chips do not appear.

### Moving things between pages

The cover holds one lead story and three cards; everything else that happened that month
sits on the **bench** below the editor. Anything can move either way:

- `↑ Make lead` swaps a cover card with the lead story
- `←` `→` reorder the three cards
- `Remove` sends a card back to the bench
- From the bench: `→ Lead`, `→ Card 1`, `→ Card 2`, `→ Card 3`

A story displaced by a promotion returns to the bench rather than vanishing.

---

## Where each page gets its content

| Page | Section | Source |
|---|---|---|
| 1 | Lead story + Also this month | `events` for the month, ranked by attendance and satisfaction, spread across distinct initiatives |
| 2 | Chapter lead of the month | The chapter that ran the most activity that month, plus its `chapters.lead_member_id` |
| 2 | Their month in photos | That chapter's events |
| 3 | Local chapters | `chapters` where `kind = 'local'`, with their events |
| 4 | Global chapters | `chapters` where `kind = 'global'`, with their events |
| 5 | Member highlights | `member_milestones` for the month, by `kind` |
| 6 | Next three months | `events` scheduled in the following three months |
| 6 | Photo of the month | The month's first event carrying a photo |

**Page 5 is the one page with no other source in the dashboard.** Member appointments,
awards, programme acceptances and board seats are recorded under
**Newsletter → Member milestones**, or imported as CSV. If a month has none, the page
says so and the editor flags it under *Worth a look*.

### "Worth a look"

Rather than silently producing a thin issue, the composer reports what it could not fill —
no events that month, a chapter with no activity, nothing scheduled ahead. Fix the data
and regenerate, or edit around it.

---

## The template

The default is the supplied structure (`Copy of mapped Newsletter template structure`,
Canva, A4 × 6 pages), encoded as data in `server/src/lib/newsletter/template.ts` rather
than as markup — so one definition tells the composer what to fill, the AI what to write
and how long, and the renderer what to draw.

### Palette

Sampled from the supplied PDF rendered at 100 dpi, not guessed:

| Token | Value | Where |
|---|---|---|
| GROW | `#9B75F2` | Pillar chips, rules, accent bars |
| CONNECT | `#38B6FF` | " |
| IMPACT | `#00AEB8` | " and the year beside the month |
| Background base | `#01083F` | Deep navy behind every page |
| Blue wash | `#2E97DD` | Upper-left glow |
| Purple wash | `#8163D4` | Lower-right glow |
| Text | `#FFFFFF` / `#8891BA` | Primary / muted |
| Card surface | `#1B2359` | Photo placeholders, cards |

Change them in `template.ts` (`THEME`) and every page, chip and rule follows.

### Two things to know about the rendering

**Photos are elastic.** The template's images stretch to absorb whatever space the copy
leaves, so a quiet month still produces a full page rather than a half-empty one.

**The Misk lockup is a placeholder.** The masthead draws a simple mark rather than the
official Misk logo, which is a brand asset that should come from your own files. Drop the
real artwork in `assets/newsletter/` and swap it into `masthead()` in
`server/src/lib/newsletter/render.ts`.

---

## PDF export

**Print / PDF** opens the rendered newsletter and triggers the browser's print dialog;
choosing "Save as PDF" produces exactly six A4 pages, because the pages are real A4 boxes
under `@page { size: A4; margin: 0 }`.

This is deliberately the browser's PDF engine rather than a server-side one: the design
uses layered gradients, rounded cards and web fonts, which the browser renders exactly as
the preview shows. Make sure "Background graphics" is enabled in the print dialog —
without it the navy background is dropped.

> Fonts load from Google Fonts. Offline, the newsletter falls back to system fonts and the
> layout still holds; the type just looks different.

---

## Extending it

- **Another template** — add a spec to `TEMPLATES` in `template.ts` and a branch in the
  renderer; issues record which template they used.
- **Different story ranking** — `composeIssue` in `compose.ts` ranks by attendance then
  satisfaction; change that one sort.
- **More or fewer options per box** — `MAX_OPTIONS` in `enrich.ts`.
- **A different voice** — the `SYSTEM` prompt in `enrich.ts`. Its hard rules about never
  inventing facts should stay.
