-- =============================================================================
-- SLS Data Center — schema
-- Normalised program data model. Every table that carries a number that can end
-- up in an official report also carries provenance (source) and a verified flag.
-- =============================================================================

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------- reference --
CREATE TABLE IF NOT EXISTS pillars (
  name        TEXT PRIMARY KEY,          -- Grow to Great | Connect to Create | Lead with Impact
  description TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS values_ref (
  name        TEXT PRIMARY KEY,          -- Authenticity | Collaboration | Ownership | Impact
  description TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0
);

-- ------------------------------------------------------------------ members --
CREATE TABLE IF NOT EXISTS members (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  member_code   TEXT UNIQUE,                       -- short code used at QR check-in
  name          TEXT NOT NULL,
  name_ar       TEXT,
  cohort_type   TEXT NOT NULL CHECK (cohort_type IN ('2030 Leader','Misk Fellow')),
  cohort_year   INTEGER,
  join_date     TEXT,                              -- ISO yyyy-mm-dd (SLS onboarding date)
  graduation_date TEXT,                            -- 2030 Leaders / Fellowship graduation
  sector        TEXT,
  company       TEXT,
  title         TEXT,
  email         TEXT,
  region        TEXT,
  linkedin_url  TEXT,
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','alumni','paused')),
  mentor_id     INTEGER REFERENCES members(id) ON DELETE SET NULL,
  tags          TEXT NOT NULL DEFAULT '[]',        -- JSON array of strings
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_members_cohort ON members(cohort_type);
CREATE INDEX IF NOT EXISTS idx_members_sector ON members(sector);
CREATE INDEX IF NOT EXISTS idx_members_status ON members(status);

-- -------------------------------------------------------------- initiatives --
CREATE TABLE IF NOT EXISTS initiatives (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  name                TEXT NOT NULL UNIQUE,
  name_ar             TEXT,
  pillar              TEXT NOT NULL REFERENCES pillars(name),
  description         TEXT,
  owner_council_role  TEXT,                        -- FK-ish to council.role
  recurring_flag      INTEGER NOT NULL DEFAULT 0,  -- 0/1
  cadence             TEXT,                        -- e.g. monthly / quarterly / annual
  active              INTEGER NOT NULL DEFAULT 1,
  created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_initiatives_pillar ON initiatives(pillar);

-- ------------------------------------------------------------------- events --
CREATE TABLE IF NOT EXISTS events (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  initiative_id     INTEGER REFERENCES initiatives(id) ON DELETE SET NULL,
  name              TEXT NOT NULL,
  name_ar           TEXT,
  date              TEXT NOT NULL,                 -- ISO yyyy-mm-dd
  attendee_count    INTEGER NOT NULL DEFAULT 0,    -- headline count (may exceed linked members)
  location          TEXT,
  type              TEXT NOT NULL DEFAULT 'in-person' CHECK (type IN ('in-person','virtual','hybrid')),
  satisfaction_score REAL,                         -- 0..5
  duration_hours    REAL NOT NULL DEFAULT 2,
  activity_type     TEXT NOT NULL DEFAULT 'event attendance',
  status            TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','open','closed','cancelled')),
  checkin_token     TEXT UNIQUE,                   -- opaque token behind the QR code
  hours_posted_at   TEXT,                          -- set when the hours engine has run for this event
  notes             TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_events_date ON events(date);
CREATE INDEX IF NOT EXISTS idx_events_initiative ON events(initiative_id);
CREATE INDEX IF NOT EXISTS idx_events_status ON events(status);

-- Per-member attendance, incl. QR check-in / check-out stamps.
CREATE TABLE IF NOT EXISTS event_attendance (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id      INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  member_id     INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  registered_at TEXT,
  checked_in_at TEXT,                              -- ISO datetime
  checked_out_at TEXT,
  role          TEXT NOT NULL DEFAULT 'attendee'   -- attendee | speaker | mentor | organiser | volunteer
             CHECK (role IN ('attendee','speaker','mentor','mentee','organiser','volunteer','judge')),
  source        TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','qr','imported','api')),
  no_show       INTEGER NOT NULL DEFAULT 0,
  UNIQUE (event_id, member_id)
);
CREATE INDEX IF NOT EXISTS idx_att_event ON event_attendance(event_id);
CREATE INDEX IF NOT EXISTS idx_att_member ON event_attendance(member_id);

-- --------------------------------------------------- engagement hours engine --
-- Rules table: activity type -> default hours. Editable in Settings, no code change.
CREATE TABLE IF NOT EXISTS engagement_rules (
  activity_type   TEXT PRIMARY KEY,
  default_hours   REAL NOT NULL,
  role_multiplier TEXT NOT NULL DEFAULT '{}',      -- JSON {"speaker":1.5,"organiser":2}
  counts_toward_recognition INTEGER NOT NULL DEFAULT 1,
  description     TEXT,
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS engagement_logs (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id            INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  activity_type        TEXT NOT NULL,              -- references engagement_rules.activity_type
  related_initiative_id INTEGER REFERENCES initiatives(id) ON DELETE SET NULL,
  related_event_id     INTEGER REFERENCES events(id) ON DELETE CASCADE,
  date                 TEXT NOT NULL,              -- ISO yyyy-mm-dd
  hours                REAL NOT NULL,
  direction            TEXT NOT NULL DEFAULT 'participated'
                       CHECK (direction IN ('participated','given','received')),
  source               TEXT NOT NULL DEFAULT 'manual'
                       CHECK (source IN ('auto-calculated','manual','imported','qr')),
  verified_flag        INTEGER NOT NULL DEFAULT 0,
  verified_by          TEXT,
  verified_at          TEXT,
  override_of_hours    REAL,                       -- original auto value when a human overrode it
  notes                TEXT,
  created_at           TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (member_id, related_event_id, activity_type, direction)
);
CREATE INDEX IF NOT EXISTS idx_logs_member ON engagement_logs(member_id);
CREATE INDEX IF NOT EXISTS idx_logs_date ON engagement_logs(date);
CREATE INDEX IF NOT EXISTS idx_logs_activity ON engagement_logs(activity_type);
CREATE INDEX IF NOT EXISTS idx_logs_initiative ON engagement_logs(related_initiative_id);

-- Append-only audit trail for anything that changes an hour value.
CREATE TABLE IF NOT EXISTS engagement_audit (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  log_id      INTEGER,
  action      TEXT NOT NULL,                       -- auto_created | manual_created | overridden | verified | deleted | recalculated
  actor       TEXT NOT NULL DEFAULT 'system',
  detail      TEXT,                                -- JSON
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_audit_log ON engagement_audit(log_id);

-- Milestone rules, e.g. "50+ hours in a rolling year -> flag for recognition".
CREATE TABLE IF NOT EXISTS recognition_rules (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  name_ar       TEXT,
  threshold_hours REAL NOT NULL,
  period        TEXT NOT NULL DEFAULT 'calendar_year' CHECK (period IN ('calendar_year','rolling_12m','all_time')),
  cohort_filter TEXT,                              -- NULL = all cohorts
  active        INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS recognition_flags (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id   INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  rule_id     INTEGER NOT NULL REFERENCES recognition_rules(id) ON DELETE CASCADE,
  period_label TEXT NOT NULL,                      -- e.g. "2026"
  hours_at_flag REAL NOT NULL,
  status      TEXT NOT NULL DEFAULT 'flagged' CHECK (status IN ('flagged','confirmed','recognised','dismissed')),
  flagged_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (member_id, rule_id, period_label)
);

-- ----------------------------------------------------------------- startups --
CREATE TABLE IF NOT EXISTS startups (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id      INTEGER REFERENCES members(id) ON DELETE SET NULL,
  name           TEXT NOT NULL,
  sector         TEXT,
  funding_stage  TEXT,                             -- idea | pre-seed | seed | series-a | growth
  support_type   TEXT,                             -- mentorship | funding | market access | training
  outcome_metric TEXT,
  outcome_value  REAL,
  support_year   INTEGER,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_startups_sector ON startups(sector);

-- ------------------------------------------------------------ impact metrics --
CREATE TABLE IF NOT EXISTS impact_metrics (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  period      TEXT NOT NULL,                       -- "2025", "2026-Q1", "all-time"
  metric_name TEXT NOT NULL,
  value       REAL NOT NULL,
  unit        TEXT,
  source      TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','import','api','impact-report','computed')),
  notes       TEXT,
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (period, metric_name)
);

-- ------------------------------------------------------------------ council --
CREATE TABLE IF NOT EXISTS council (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id    INTEGER REFERENCES members(id) ON DELETE SET NULL,
  name         TEXT NOT NULL,
  role         TEXT NOT NULL,
  role_ar      TEXT,
  term_start   TEXT,
  term_end     TEXT,
  linkedin_url TEXT,
  active       INTEGER NOT NULL DEFAULT 1
);

-- -------------------------------------------------------- linkedin listening --
CREATE TABLE IF NOT EXISTS linkedin_mentions (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id           INTEGER REFERENCES members(id) ON DELETE SET NULL,
  author_name         TEXT,
  post_url            TEXT NOT NULL UNIQUE,
  post_date           TEXT,
  content_snippet     TEXT,
  engagement_count    INTEGER NOT NULL DEFAULT 0,
  sls_relevance_score REAL NOT NULL DEFAULT 0,     -- 0..100
  matched_keywords    TEXT NOT NULL DEFAULT '[]',  -- JSON array
  status              TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','reviewed','shared','ignored')),
  capture_source      TEXT NOT NULL DEFAULT 'manual' CHECK (capture_source IN ('manual','connector','api')),
  connector_name      TEXT,
  ai_caption          TEXT,
  priority_flag       INTEGER NOT NULL DEFAULT 0,
  created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_mentions_status ON linkedin_mentions(status);
CREATE INDEX IF NOT EXISTS idx_mentions_date ON linkedin_mentions(post_date);

-- ------------------------------------------------------- impact challenge ----
CREATE TABLE IF NOT EXISTS challenge_submissions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  year          INTEGER NOT NULL,
  member_id     INTEGER REFERENCES members(id) ON DELETE SET NULL,
  team_name     TEXT NOT NULL,
  project_title TEXT NOT NULL,
  summary       TEXT,
  pillar        TEXT REFERENCES pillars(name),
  status        TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','shortlisted','finalist','winner','withdrawn')),
  submitted_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS challenge_scores (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  submission_id INTEGER NOT NULL REFERENCES challenge_submissions(id) ON DELETE CASCADE,
  criterion     TEXT NOT NULL,                     -- Impact | Feasibility | Innovation | Alignment
  score         REAL NOT NULL,                     -- 0..10
  weight        REAL NOT NULL DEFAULT 1,
  judge         TEXT
);

-- ------------------------------------------------------------ app machinery --
CREATE TABLE IF NOT EXISTS app_settings (
  key         TEXT PRIMARY KEY,
  value       TEXT,                                -- plaintext JSON for non-secrets
  is_secret   INTEGER NOT NULL DEFAULT 0,
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS pinned_widgets (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT NOT NULL,
  target      TEXT NOT NULL DEFAULT 'dashboard' CHECK (target IN ('dashboard','report')),
  spec        TEXT NOT NULL,                       -- JSON {kind, data, columns, question, sql, provenance}
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ai_conversations (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  title      TEXT NOT NULL DEFAULT 'New conversation',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ai_messages (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
  role            TEXT NOT NULL CHECK (role IN ('user','assistant')),
  content         TEXT NOT NULL,                   -- JSON {text, charts[], provenance[]}
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS import_jobs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  target_table  TEXT NOT NULL,
  filename      TEXT,
  row_count     INTEGER NOT NULL DEFAULT 0,
  inserted      INTEGER NOT NULL DEFAULT 0,
  updated       INTEGER NOT NULL DEFAULT 0,
  skipped       INTEGER NOT NULL DEFAULT 0,
  errors        TEXT NOT NULL DEFAULT '[]',
  mapping       TEXT NOT NULL DEFAULT '{}',
  status        TEXT NOT NULL DEFAULT 'completed',
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS alerts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  kind        TEXT NOT NULL,                       -- initiative_decline | cohort_underrepresented | member_stall | mention_spike | unverified_backlog
  severity    TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info','warning','serious','critical')),
  title       TEXT NOT NULL,
  detail      TEXT,
  entity_type TEXT,
  entity_id   INTEGER,
  metric      REAL,
  status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','acknowledged','resolved')),
  detected_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (kind, entity_type, entity_id, status)
);
