# SLS Data Center

An AI-powered internal dashboard for the **Saudi Leadership Society** — a leadership community founded by the
Misk Foundation to advance Vision 2030 through personal growth, connection and collective impact.

It replaces manual reporting with automation: it ingests program data, visualises it on-brand, lets you
interrogate it conversationally, exports polished reports on demand, tracks member engagement hours
automatically, and surfaces member activity on LinkedIn.

---

## Quick start

```bash
cd sls-dashboard
npm install          # installs both workspaces
npm run db:reset     # creates and seeds the SQLite database
npm run dev          # API on :4317, UI on :5317
```

Open **<http://localhost:5317>**.

Then, to switch on the AI features, do the one thing below.

---

## Switching on the AI features

The AI needs an Anthropic API key. There are three ways to give it one, and they are interchangeable.

### 1. In the app (easiest)

**Settings → AI (Anthropic API key)** → paste the key → **Save & activate**.

- The key is **verified against the Anthropic API before it is saved**, so a mistyped key can never
  silently leave the AI switched off.
- It is stored **encrypted** (AES-256-GCM) in `server/data/secrets.local.json` under a locally generated
  master key, and is **never sent back to the browser** — only a masked preview like `sk-ant-api…J8xQ`.
- **Test connection** checks the current or a candidate key without saving.
- **Change key** replaces it; **Remove key** deletes it.
- The same card appears inside the AI chat drawer and on the AI Reports page, so wherever you hit the wall,
  the fix is one click away.

Get a key at <https://console.anthropic.com>.

### 2. From a terminal

```bash
npm run set-key                 # prompts, input hidden, verifies before saving
npm run set-key -- sk-ant-...   # set it directly
npm run set-key -- --status     # show what is configured
npm run set-key -- --remove     # clear the stored key
```

### 3. Environment variable

```bash
ANTHROPIC_API_KEY=sk-ant-... npm run dev
```

A key saved in the app takes precedence over the environment variable, and the Settings page always says
which source is live.

**Without a key, everything else works normally.** Only the four AI surfaces are gated, and each shows a
clear "add your API key" call-to-action instead of an error: the chat analyst, AI-drafted report paragraphs,
LinkedIn reshare captions, and recap-card quote lines.

---

## What's in it

| Section | What it does |
|---|---|
| **Overview** | Headline KPIs, momentum & anomaly alerts, engagement trends, initiative and member leaderboards, pinned AI answers |
| **Members** | Full roster with search and filters; per-member **journey timeline** (graduation → onboarding → initiatives → mentorship → hours → startups → recognition) and engagement ledger |
| **Engagement Hours** | Summary, the hour ledger with verification and override, the **activity-type → hours rules table**, and recognition thresholds |
| **Initiatives & Events** | Per-initiative performance and member reach; event management, **QR check-in**, and one-click **recap cards** |
| **Impact & Startups** | Startup trends by sector/stage/year, reported impact metrics with provenance, and the **Impact Challenge leaderboard** |
| **Social Listening** | LinkedIn social wall, paste-a-URL capture, AI triage, connector status, monthly highlights |
| **AI Reports** | Saved analyst conversations, report sections, and the guardrails the analyst runs under |
| **Exports** | Branded PDF report generator and the Power BI dataset export |
| **Data Ingestion** | CSV upload with column mapping, preview, upsert and error reporting |
| **Council Cockpit** | A per-role slice for each of the six council leads |
| **Settings** | API keys, brand tokens, social-listening config, anomaly thresholds, language |

Every page shares one **global filter bar** — date range, pillar, initiative, cohort, sector, council owner,
engagement-hours range — and that same filter drives the exports, so what you see is what you export.

**Bilingual EN/AR** with full RTL, toggled from the top bar. The interface chrome — navigation, filters,
KPI labels, the Overview page and every chart control — is translated, and charts keep correct LTR geometry
inside the RTL layout. Program *data* renders as entered, using the Arabic column where the record has one
(`initiatives.name_ar`, `council.role_ar`, `members.name_ar`); server-generated alert text is English.

---

## How engagement hours are actually calculated

This is the core of the "data center", so it is worth being precise. **Nobody logs hours by hand.**

When an event is closed, the engine derives hours for every attendee, in this priority:

1. **A plausible QR check-in/check-out pair on the same day** → the real elapsed time, capped at twice the
   scheduled duration so a forgotten exit scan cannot inflate a ledger.
2. **A missing, next-day, reversed, or implausibly short check-out** (a double-scan at the door) → the event's
   `duration_hours`, with the log recording *why* the scan pair was rejected.
3. **No event duration** → the `default_hours` from the rules table for that activity type.

A role multiplier then applies (a speaker or organiser invests more than an attendee), and the result rounds
to the nearest quarter hour. Mentorship is double-entry: `given` for the mentor, `received` for the mentee.

In the seeded demo dataset, **99% of hours are machine-derived**.

**Configuring it needs no code.** Engagement Hours → *Rules & automation* → edit `default_hours`, the role
multipliers, or add a new activity type. **Recalculate all closed events** reapplies the rules to history —
except to entries a human has overridden or verified, which are never silently recalculated.

**Provenance is kept, always.** Every entry carries its source (`auto-calculated` / `qr` / `manual` /
`imported`) and a verified flag; overrides preserve the original machine value; and an append-only audit
table records every change with its actor.

---

## QR check-in

Open any event → **QR check-in** → print the code, or open the URL on a phone.

The QR encodes a plain URL, so **a phone's ordinary camera app opens it** — no scanner app, no hardware, no
kiosk. The member types their member code (on their membership card), arrival is stamped, and scanning again
on the way out stamps departure and recomputes their hours from the time they actually spent there.

---

## Ingesting your own data

**Data Ingestion** → pick a target table → upload a CSV → the column mapping is auto-suggested from your
headers → review the preview → import.

- Eight target tables: members, initiatives, events, event attendance, engagement hours, startups,
  impact metrics, LinkedIn mentions.
- Rows **upsert on a natural key**, so re-uploading a corrected file fixes rows instead of duplicating them.
- Row-level errors are reported with line numbers; good rows still import.
- Importing attendance **re-runs the hours engine automatically**.
- Blank templates are downloadable per table.
- `npm run db:reset` rebuilds the demo dataset at any time.

---

## Configuration

### Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `4317` | API port |
| `ANTHROPIC_API_KEY` | — | AI features (or set it in the UI) |
| `LINKEDIN_CONNECTOR_KEY` | — | Layer-1 scheduled social listening |
| `POWERBI_CLIENT_ID` / `_SECRET` / `_TENANT_ID` | — | Power BI push-dataset integration |
| `SLS_DATA_DIR` | `server/data` | Where the database and secret store live |
| `SLS_MASTER_KEY` | auto-generated | Encryption key for the secret store. Set this for a shared deployment. |
| `SLS_PUBLIC_URL` | derived from the request | The public base URL, used in QR codes and Power BI scripts |

Every API key can also be set in **Settings**, which is usually easier.

### Brand tokens

`design-tokens.json` at the repo root is the single source of colour, type, spacing, radius and shadow.
It is loaded **at runtime** and pushed onto `:root` as CSS custom properties, and the PDF generator re-reads
it per request — so changing it restyles the entire app, every chart and every export **with no rebuild**.

Edit it at **Settings → Brand tokens**, or edit the file directly.

> **Important:** the values shipped here were **not** extracted from the live SLS site — every Misk domain is
> blocked by this build environment's network egress policy. They are a validated placeholder system, clearly
> marked as inferred inside the file. See [`docs/DESIGN_TOKENS_REPORT.md`](docs/DESIGN_TOKENS_REPORT.md) for
> exactly what was blocked and how to put the real values in.

---

## Scripts

```bash
npm run dev          # API + UI with hot reload
npm run build        # production build of both
npm start            # serve the built app from the API on :4317
npm test             # unit tests (hours derivation, AI SQL guardrail)
npm run typecheck    # TypeScript across both workspaces
npm run db:reset     # rebuild and reseed the database
npm run set-key      # set the Anthropic API key from a terminal
```

---

## Architecture

```
sls-dashboard/
├── design-tokens.json          ← the whole design system, runtime-swappable
├── server/                     Node + Express + TypeScript + SQLite
│   └── src/
│       ├── db/                 schema.sql, seed, reset
│       ├── lib/
│       │   ├── engagement.ts   the hours engine  (+ .test.ts)
│       │   ├── recognition.ts  milestone thresholds
│       │   ├── analytics.ts    the single query layer every surface shares
│       │   ├── filters.ts      one filter model for UI, exports and AI
│       │   ├── ai.ts           Anthropic tool-use loop
│       │   ├── ai-tools.ts     tool definitions + read-only SQL guard (+ .test.ts)
│       │   ├── settings.ts     encrypted secret store
│       │   ├── ingest.ts       CSV import with column mapping
│       │   ├── linkedin.ts     three-layer social listening
│       │   ├── pdf.ts          branded PDF generator
│       │   ├── powerbi.ts      star-schema export + Power Query
│       │   ├── recap.ts        SVG recap cards
│       │   ├── checkin.ts      QR check-in
│       │   └── alerts.ts       anomaly & momentum detection
│       └── routes/             the REST API
└── web/                        React + TypeScript + Tailwind + Recharts
    └── src/
        ├── i18n.tsx            EN/AR dictionary + RTL
        ├── state.tsx           filter state + data hooks
        ├── components/         shell, filter bar, charts, chat drawer, API-key card
        └── pages/
```

**Why one analytics layer matters:** REST endpoints, the PDF/Power BI exports and the AI's tools all call the
same functions in `analytics.ts` with the same filter model. The dashboard, the export and the chat answer
therefore cannot disagree about a number.

---

## The AI analyst, and its guardrails

The chat panel is **tool use against the live database**, not RAG over a summary. The model runs real queries
and answers from the rows that come back.

Tools: KPIs, engagement breakdowns (month / pillar / activity / cohort / cohort-by-initiative), the
leaderboard, initiative performance, startup trends, a member's ledger, member lookup, impact metrics, the
Impact Challenge, LinkedIn mentions, chart rendering — plus a guarded read-only SQL escape hatch.

Guardrails:

- Answers come **only** from tool results retrieved in that conversation. Never from training data.
- Every figure is followed by the tables and filters behind it (each tool returns a `provenance` block).
- "I don't have enough data for that" is an accepted answer; inventing a number is not.
- The SQL escape hatch is **single-statement, SELECT-only, allow-listed by table** and forced to a `LIMIT`.
  `app_settings` and the secret store are excluded. Covered by tests.
- Reported headline metrics (`source = 'impact-report'`) and computed figures are distinguished, not blended.

Any answer containing numbers also renders a chart from the actual rows, which you can **pin to the
dashboard** or **add to the report** — that's how an ad-hoc question becomes a permanent widget.

---

## Documentation

| Document | What's in it |
|---|---|
| [`docs/DESIGN_TOKENS_REPORT.md`](docs/DESIGN_TOKENS_REPORT.md) | What was and wasn't extracted, the validated chart palette, how to put the real brand values in |
| [`docs/DATA_DICTIONARY.md`](docs/DATA_DICTIONARY.md) | Every table and field, including the engagement-hours rules |
| [`docs/STUBBED_VS_WORKING.md`](docs/STUBBED_VS_WORKING.md) | Exactly what works, what needs your key, and what is deliberately stubbed |
| [`docs/POWERBI_SETUP.md`](docs/POWERBI_SETUP.md) | Both Power BI routes, with the DAX measures |

---

## About the seed data

Every **person-level** row is **synthetic demo data** — names, companies, emails, LinkedIn URLs, individual
events, individual startups, individual posts. It is sized and shaped to match the real program totals
(974 members = 611 2030 Leaders + 363 Misk Fellows, 331 onboarded, 186 startups, 13,150 event attendees) so
the dashboard reads realistically, but **no real person's data is in this repository**.

The headline figures came from the program brief and could **not** be re-verified against the SLS Impact
Report PDF, because that host is blocked by this environment's network policy. They are stored with
`source = 'impact-report'` and a note saying exactly that.
