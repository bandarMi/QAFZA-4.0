# Data dictionary

Every table and field in the SLS Data Center, plus the engagement-hours rules table.
A live, always-current version is at `GET /api/data-dictionary` (Settings → Data dictionary → View as JSON).

Conventions: dates are ISO `yyyy-mm-dd`; timestamps are `yyyy-mm-ddThh:mm:ss`; booleans are `0`/`1`;
`tags`-style fields hold a JSON array as text.

---

## Reference

### `pillars`
| Field | Type | Notes |
|---|---|---|
| `name` | TEXT PK | `Grow to Great`, `Connect to Create`, `Lead with Impact` |
| `description` | TEXT | |
| `sort_order` | INTEGER | Display order |

### `values_ref`
The four program values: Authenticity, Collaboration, Ownership, Impact. Same shape as `pillars`.

---

## People

### `members`
| Field | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | |
| `member_code` | TEXT UNIQUE | **The code a member types at QR check-in.** Auto-generated on import if blank. |
| `name`, `name_ar` | TEXT | Arabic name used by the RTL interface where present |
| `cohort_type` | TEXT | `2030 Leader` \| `Misk Fellow` — enforced by a CHECK constraint |
| `cohort_year` | INTEGER | Year of the originating program |
| `join_date` | TEXT | SLS onboarding date. Drives the "members onboarded" period metric. |
| `graduation_date` | TEXT | 2030 Leaders / Fellowship graduation — the first node of the journey timeline |
| `sector`, `company`, `title`, `email`, `region` | TEXT | |
| `linkedin_url` | TEXT | Used by the social-listening connector as the profile to poll |
| `status` | TEXT | `active` \| `inactive` \| `alumni` \| `paused` |
| `mentor_id` | INTEGER FK → members | Self-referencing mentor pairing |
| `tags` | TEXT | JSON array |

### `council`
| Field | Type | Notes |
|---|---|---|
| `member_id` | INTEGER FK → members | Optional link to the member record |
| `name` | TEXT | |
| `role`, `role_ar` | TEXT | One of the six council roles. Joins to `initiatives.owner_council_role`. |
| `term_start`, `term_end` | TEXT | |
| `active` | INTEGER | |

---

## Program

### `initiatives`
| Field | Type | Notes |
|---|---|---|
| `name` | TEXT UNIQUE | The natural key used by CSV import |
| `name_ar` | TEXT | |
| `pillar` | TEXT FK → pillars | |
| `owner_council_role` | TEXT | Drives the Council Cockpit slice |
| `recurring_flag` | INTEGER | |
| `cadence` | TEXT | e.g. `monthly`, `quarterly`, `annual` |
| `active` | INTEGER | |

### `events`
| Field | Type | Notes |
|---|---|---|
| `initiative_id` | INTEGER FK | |
| `name`, `name_ar`, `date` | TEXT | `name` + `date` is the natural key for import |
| `attendee_count` | INTEGER | Headline headcount, which may exceed the linked members (external guests) |
| `location` | TEXT | |
| `type` | TEXT | `in-person` \| `virtual` \| `hybrid` |
| `satisfaction_score` | REAL | 0–5 |
| **`duration_hours`** | REAL | **Drives auto-calculated engagement hours.** |
| **`activity_type`** | TEXT | **Selects the row in `engagement_rules`.** |
| `status` | TEXT | `planned` \| `open` \| `closed` \| `cancelled`. Closing posts hours. |
| `checkin_token` | TEXT UNIQUE | Opaque token behind the QR code |
| `hours_posted_at` | TEXT | Set when the hours engine last ran for this event |

### `event_attendance`
One row per member per event. `UNIQUE (event_id, member_id)`.

| Field | Type | Notes |
|---|---|---|
| `checked_in_at`, `checked_out_at` | TEXT | QR scan stamps. The pair is what makes hours real rather than assumed. |
| `role` | TEXT | `attendee` \| `speaker` \| `mentor` \| `mentee` \| `organiser` \| `volunteer` \| `judge`. Selects the role multiplier. |
| `source` | TEXT | `manual` \| `qr` \| `imported` \| `api` |
| `no_show` | INTEGER | A no-show generates no hours |

---

## The engagement-hours engine

### `engagement_rules` — the rules table
**This is the table the brief asks to be configurable without code**, and it is editable at
Engagement Hours → *Rules & automation*.

| Field | Type | Notes |
|---|---|---|
| `activity_type` | TEXT PK | Matched against `events.activity_type` |
| `default_hours` | REAL | Used when the event carries no duration of its own |
| `role_multiplier` | TEXT | JSON, e.g. `{"speaker":1.5,"organiser":2}` — a speaker invests more than an attendee |
| `counts_toward_recognition` | INTEGER | Whether these hours count toward milestone thresholds |
| `description` | TEXT | |

Seeded defaults:

| Activity type | Default hours | Role multipliers |
|---|---|---|
| `event attendance` | 2.0 | speaker ×1.5, organiser ×2, judge ×1.25 |
| `topic club` | 1.5 | organiser ×1.5 |
| `mentorship session` | 1.0 | — (logged twice: `given` for the mentor, `received` for the mentee) |
| `volunteering` | 3.0 | organiser ×1.25 |
| `council duty` | 2.0 | — |
| `content contribution` | 1.5 | — |

### How a number of hours is actually decided

In priority order (`deriveHours` in `server/src/lib/engagement.ts`, covered by `npm test`):

1. **Check-in *and* check-out on the same day, and the gap is plausible** → the real elapsed time,
   capped at twice the scheduled duration so a forgotten exit scan cannot inflate a ledger.
   Basis: `checkin-checkout`.
2. **Check-out missing, on a later day, before the check-in, or less than 25% of the scheduled duration**
   (a double-scan at the door) → the event's `duration_hours`. Basis: `event-duration`,
   and the log's `notes` records *why* the scan pair was rejected.
3. **No event duration** → `engagement_rules.default_hours`. Basis: `rule-default`.

The result is multiplied by the role multiplier and rounded to the nearest quarter hour.

### `engagement_logs`
| Field | Type | Notes |
|---|---|---|
| `member_id` | INTEGER FK | |
| `activity_type` | TEXT | → `engagement_rules` |
| `related_initiative_id`, `related_event_id` | INTEGER FK | |
| `date` | TEXT | The event's date, not the date the row was written |
| `hours` | REAL | |
| `direction` | TEXT | `participated` \| `given` \| `received` — mentorship is double-entry |
| **`source`** | TEXT | `auto-calculated` \| `qr` \| `manual` \| `imported` — **the provenance of every hour** |
| **`verified_flag`** | INTEGER | Council spot-check. Unverified hours are counted but flagged. |
| `verified_by`, `verified_at` | TEXT | |
| `override_of_hours` | REAL | The original machine value, preserved when a human overrides. A row with this set, or with `verified_flag = 1`, is **never** silently recalculated. |
| `notes` | TEXT | Human-readable basis, e.g. `Auto: event-duration (check-out scanned too soon — likely a double scan) × 1.5 (speaker)` |

`UNIQUE (member_id, related_event_id, activity_type, direction)` makes reposting idempotent.

### `engagement_audit`
Append-only. One row per `auto_created` / `manual_created` / `recalculated` / `overridden` / `verified` action,
with the actor and a JSON detail blob. Visible per row in the Hour ledger.

### `recognition_rules` / `recognition_flags`
| Field | Notes |
|---|---|
| `threshold_hours` | e.g. 50 |
| `period` | `calendar_year` \| `rolling_12m` \| `all_time` |
| `cohort_filter` | NULL = all cohorts |
| `recognition_flags.status` | `flagged` → `confirmed` → `recognised`, or `dismissed` |

Re-evaluated whenever hours change. This is what feeds the "members recognised" reporting metric.

---

## Impact

### `startups`
`member_id` (founder), `name` (natural key), `sector`, `funding_stage`, `support_type`,
`outcome_metric`, `outcome_value`, `support_year`.

### `impact_metrics`
`UNIQUE (period, metric_name)`. `period` is `"2026"`, `"2026-Q1"` or `"all-time"`.
**`source`** is `manual` \| `import` \| `api` \| `impact-report` \| `computed` — a reported headline and a
computed figure are deliberately distinguishable and are never blended in the UI or by the AI.

### `challenge_submissions` / `challenge_scores`
Annual Impact Challenge. Scores are per criterion with a weight; the leaderboard shows
`SUM(score × weight) / SUM(weight)` alongside the lead member's logged hours for that year.

---

## Social listening

### `linkedin_mentions`
| Field | Notes |
|---|---|
| `post_url` | UNIQUE — the natural key |
| `sls_relevance_score` | 0–100, from keyword matching (exact program name > hashtag > bare "Misk") |
| `matched_keywords` | JSON array |
| `status` | `new` \| `reviewed` \| `shared` \| `ignored` |
| `capture_source` | `manual` (layer 2) \| `connector` (layer 1) \| `api` |
| `ai_caption` | AI-drafted reshare caption (layer 3) |
| `priority_flag` | Set by triage on high engagement or high relevance |

---

## Application

| Table | Purpose |
|---|---|
| `app_settings` | Non-secret settings. **Secrets are NOT here** — see below. |
| `pinned_widgets` | AI answers pinned to the dashboard or added to the report. `spec` is the chart JSON. |
| `ai_conversations` / `ai_messages` | Saved analyst conversations |
| `import_jobs` | One row per CSV import, with its mapping and row-level errors |
| `alerts` | Anomaly/momentum detections. `UNIQUE (kind, entity_type, entity_id, status)` — re-detection updates rather than duplicates, which is why `entity_id` uses `0` as its "no entity" sentinel (SQLite treats NULLs as distinct in a unique index). |

### The SQLite driver
The app talks to SQLite through `node:sqlite`, which ships inside Node 24, via a thin
better-sqlite3-shaped adapter at `server/src/db/sqlite.ts`. That removes the project's
only native dependency, which is what makes a no-install, no-admin Windows build possible.
The adapter covers three real API differences (extra named parameters, `undefined` binding,
and `transaction()`/`pragma()`); each is pinned by a test in `sqlite.test.ts`.

### Secrets are not in the database
API keys live in `server/data/secrets.local.json`, encrypted with AES-256-GCM under a locally
generated master key (`server/data/.masterkey`, mode 0600). Both paths are gitignored. A stored secret
is never returned to the browser — only a masked preview (`sk-ant-api…J8xQ`) and a status.
`app_settings` and the secret store are both excluded from the AI's readable-table allow-list.
