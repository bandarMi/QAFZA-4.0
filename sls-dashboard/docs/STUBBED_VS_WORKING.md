# What's fully working vs. what's stubbed

Deliverable #5 of the brief: *"be explicit about anything that needs a paid API key, physical device,
or manual approval before it's fully live, rather than silently faking it."*

Three honest categories.

---

## ✅ Fully working, right now, with no key and no external service

| Feature | Notes |
|---|---|
| **The whole data model** | 20 tables, seeded with 974 members, 11 initiatives, 360 events, ~7,500 attendance records and ~7,100 engagement-hour entries. |
| **Engagement-hours automation** | Closing an event generates hours for every attendee from the rules table. 99% of the seeded hours were produced by the engine, not entered. Covered by unit tests (`npm test`). |
| **Activity-type → hours rules table** | Editable in the UI. No code change to add an activity type or change a default. |
| **QR check-in** | End-to-end and genuinely working. See the caveat below about hardware. |
| **Per-member ledger & journey timeline** | Hours by category and direction, running total, year-over-year. |
| **Recognition thresholds** | Configurable rules, auto-flagging, status workflow. |
| **Verification & audit trail** | Every hour keeps its source; overrides preserve the original; append-only audit log. |
| **Global filter bar** | Drives Overview, Engagement, Initiatives, Impact, Council **and every export**. |
| **PDF report export** | Branded, print-ready, section-selectable, charts drawn as vectors. Reads the live brand tokens. |
| **Power BI dataset export** | 8-table star schema as CSV or JSON, plus a generated Power Query script. |
| **CSV ingestion** | 8 target tables, auto-suggested column mapping, preview, upsert-on-natural-key, row-level error reporting, import history. Attendance imports re-run the hours engine automatically. |
| **Anomaly & momentum alerts** | Four detectors plus a verification-backlog check, thresholds configurable. |
| **Council cockpit** | Per-role slice of initiatives, hours, KPIs and alerts. |
| **Impact Challenge leaderboard** | Weighted judging scores alongside each lead member's logged hours. |
| **Event recap cards** | On-brand SVG at LinkedIn / square / story sizes, generated from the tokens. |
| **Social listening layer 2** | Paste a post URL → captured, keyword-scored, tagged to a member. |
| **Bilingual EN/AR with RTL** | The full interface, including layout direction. |
| **Runtime-swappable brand tokens** | Edit in the UI; the app, charts and PDFs follow with no rebuild. |
| **Portable Windows build** | One folder, one `.exe`, its own Node runtime. No installer, no admin rights, nothing written outside the folder. Verified end-to-end: the real `node.exe` and the real launcher were run against the real bundle, cold, with no database. |

---

## 🔑 Working, but needs *your* API key

| Feature | Needs | How to switch it on |
|---|---|---|
| **AI chat with tool use** | An Anthropic API key | Settings → *AI (Anthropic API key)*. Or `npm run set-key`. Or the `ANTHROPIC_API_KEY` env var. |
| **AI-drafted board paragraphs** | Same key | Same |
| **AI reshare captions (layer 3 triage)** | Same key | Same |
| **AI recap-card quote lines** | Same key | Same |

The code paths are complete — tool definitions, the tool-use loop, guardrails, chart rendering,
pin-to-dashboard, conversation history. Nothing is mocked. The key is the only missing input, the
app verifies it against the API before storing it, and every AI surface degrades to a clear
"add your API key" call-to-action rather than an error.

Without a key, everything else in the app works normally.

---

## 🔧 Deliberately stubbed — and why

### 1. LinkedIn scheduled polling (social listening layer 1)

**Status:** connector interface implemented and selectable; `poll()` is intentionally not wired to a vendor endpoint.

**Why:** LinkedIn does not permit open scraping, and its official API does not expose public-post search
for this use case. The compliant route is a licensed provider (Phantombuster, a RapidAPI LinkedIn
provider, or an enterprise tool like Brandwatch/Meltwater/Talkwalker) — and *which* provider, on *which*
plan, determines the request shape, the response schema and the rate limits. Writing to a guessed endpoint
would produce code that cannot work and cannot be tested.

**What exists:** the `LinkedInConnector` interface, three registered providers with their docs links, key
storage, and a `poll()` that reports exactly what is missing rather than pretending to run. When you pick
a provider, implement its `poll()` in `server/src/lib/linkedin.ts` — it receives every member profile URL
and the keyword list, and calls the existing `capturePost()` for each hit.

**Also honest:** the layer-2 OpenGraph fetch usually **fails** — LinkedIn serves an auth wall to anonymous
requests. The capture dialog reports whether the fetch succeeded or exactly why it didn't, and falls back
to the text you paste. It never claims to have read a post it couldn't.

### 2. The Windows `.exe` is not code-signed

**Status:** the launcher is a real, working Windows executable. It is **unsigned**.

**Why:** code signing requires a certificate bought from a certificate authority — a
purchasing decision, not something that can be produced in a build.

**What it means in practice:** on first run Windows SmartScreen shows
"Windows protected your PC". *More info* → *Run anyway* proceeds. If your environment
blocks unsigned executables outright, `START HERE.txt` documents a fallback that needs
no `.exe` at all: `.\runtime\node.exe .\app\server\dist\index.js` from PowerShell.

### 3. QR check-in — software complete, one physical caveat

**Status:** fully working end-to-end. Verified in a browser: a scan created the attendance row, a second
scan stamped the check-out, and the engine recomputed the hours.

**The caveat:** the QR encodes a URL, so **a phone's ordinary camera app opens it** — no scanner app, no
scanner hardware, no kiosk. That was a deliberate choice to avoid a hardware dependency. What it means in
practice: members need a phone and a network connection at the venue, and they identify themselves by typing
their member code. If you want a *staffed* kiosk that scans member badges instead, that needs a scanner
device and a different flow — not built.

### 4. Power BI: a Power Query script, not a binary `.pbit`

**Status:** dataset export and Power Query script fully working. A binary `.pbit` template is **not** generated.

**Why:** a valid `.pbit` is a packed Power BI Desktop artifact. One generated blind — in an environment with
no Power BI to open it — could not be verified, and shipping a template that may simply fail to open is worse
than shipping a script that provably works. `docs/POWERBI_SETUP.md` walks through pasting the generated script
and saving it as a `.pbit` yourself; it takes about two minutes and you get a template you know opens.

### 5. Power BI live push-dataset refresh

**Status:** the dataset definition and row shaping are implemented (`pushDatasetDefinition()`, `buildTable()`).
The OAuth token exchange and the row-push calls are not.

**Why:** it needs your Azure AD app registration, tenant, client secret and a workspace ID, and cannot be
tested without them. The UI reports precisely which credentials are missing. Setup steps are in
`docs/POWERBI_SETUP.md`.

### 6. Scheduled imports (CRM / Airtable / Google Sheets sync)

**Status:** the contract exists and is documented in the UI (Data Ingestion → *Scheduled imports*); no source is wired.

**Why:** each source needs its own credentials and field mapping. The endpoint a scheduler should POST to
(`/api/ingest/import`) is live and is the same one the CSV uploader uses — so a cron job with a fetch script
is a small piece of work, not a rebuild.

### 7. Arabic **PDF** rendering

**Status:** the in-app Arabic interface is fully working, including RTL layout. Arabic **PDF export** is not.

**Why:** PDFKit's built-in fonts contain no Arabic glyphs and it does not perform bidi or contextual shaping.
Drop an Arabic TTF at `assets/fonts/arabic.ttf` and it will be embedded. Without one, requesting an Arabic PDF
produces an **English** PDF with a line on the cover page saying so — rather than a page of empty boxes.

---

## ⚠️ One thing that is not a stub but you must know about

**No brand token in this build came from the live SLS site.** Every Misk-owned domain is blocked by this
build environment's network egress policy (HTTP 403 at the proxy). The colours and fonts are a validated
placeholder system, clearly marked as inferred inside `design-tokens.json`, and replaceable in about two
minutes with no rebuild.

The same block prevented parsing the Impact Report PDF, so its headline figures were seeded **from the brief**
and are labelled `source = 'impact-report'` with a note saying they were not re-verified.

Full detail, including how to unblock it: `docs/DESIGN_TOKENS_REPORT.md`.

---

## And one honest note about the seed data

Every **person-level** row — names, companies, titles, emails, LinkedIn URLs, individual events, individual
startups, individual posts — is **synthetic demo data**, generated so the dashboard is clickable end to end.
It is *sized and shaped* to match the real headline totals (974 = 611 + 363 members, 331 onboarded, 186 startups,
13,150 event attendees), so the dashboard reads realistically, but no real person's data is in this repository.

Replace it with real data through Data Ingestion, or run `npm run db:reset` to rebuild the demo set.
