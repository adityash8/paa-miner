-- PAA Dominator Database Schema
-- Cloudflare D1 (SQLite)

-- Projects group keywords for a user
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  webflow_site_id TEXT,
  webflow_api_token TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Keywords being tracked
CREATE TABLE IF NOT EXISTS tracked_keywords (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  keyword TEXT NOT NULL,
  region TEXT DEFAULT 'us',
  check_interval_hours INTEGER DEFAULT 24,
  last_checked_at DATETIME,
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- Full snapshots of PAA results (for history/debugging)
CREATE TABLE IF NOT EXISTS paa_snapshots (
  id TEXT PRIMARY KEY,
  keyword_id TEXT NOT NULL,
  captured_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  questions_json TEXT NOT NULL,
  FOREIGN KEY (keyword_id) REFERENCES tracked_keywords(id) ON DELETE CASCADE
);

-- Individual questions (deduplicated, tracked over time)
CREATE TABLE IF NOT EXISTS paa_questions (
  id TEXT PRIMARY KEY,
  keyword_id TEXT NOT NULL,
  question TEXT NOT NULL,
  question_hash TEXT NOT NULL,
  question_type TEXT,
  first_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  times_seen INTEGER DEFAULT 1,
  avg_position REAL,
  is_current INTEGER DEFAULT 1,
  parent_question_hash TEXT,
  FOREIGN KEY (keyword_id) REFERENCES tracked_keywords(id) ON DELETE CASCADE
);

-- Change log for tracking additions/removals/movements
CREATE TABLE IF NOT EXISTS paa_changes (
  id TEXT PRIMARY KEY,
  keyword_id TEXT NOT NULL,
  change_type TEXT NOT NULL,
  question TEXT NOT NULL,
  question_hash TEXT NOT NULL,
  old_position INTEGER,
  new_position INTEGER,
  detected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  notified INTEGER DEFAULT 0,
  FOREIGN KEY (keyword_id) REFERENCES tracked_keywords(id) ON DELETE CASCADE
);

-- Generated content for questions
CREATE TABLE IF NOT EXISTS generated_content (
  id TEXT PRIMARY KEY,
  question_id TEXT NOT NULL,
  answer_text TEXT NOT NULL,
  answer_html TEXT,
  answer_format TEXT,
  schema_json TEXT,
  published_to TEXT,
  webflow_item_id TEXT,
  published_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (question_id) REFERENCES paa_questions(id) ON DELETE CASCADE
);

-- User settings and preferences
CREATE TABLE IF NOT EXISTS user_settings (
  user_id TEXT PRIMARY KEY,
  email TEXT,
  email_notifications INTEGER DEFAULT 1,
  webhook_url TEXT,
  default_region TEXT DEFAULT 'us',
  tier TEXT DEFAULT 'free',
  api_calls_this_month INTEGER DEFAULT 0,
  api_calls_reset_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_keywords_project ON tracked_keywords(project_id);
CREATE INDEX IF NOT EXISTS idx_keywords_active ON tracked_keywords(is_active, last_checked_at);
CREATE INDEX IF NOT EXISTS idx_questions_keyword ON paa_questions(keyword_id);
CREATE INDEX IF NOT EXISTS idx_questions_hash ON paa_questions(question_hash);
CREATE INDEX IF NOT EXISTS idx_questions_current ON paa_questions(keyword_id, is_current);
CREATE INDEX IF NOT EXISTS idx_changes_keyword_date ON paa_changes(keyword_id, detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_changes_notified ON paa_changes(notified, detected_at);
CREATE INDEX IF NOT EXISTS idx_content_question ON generated_content(question_id);
CREATE INDEX IF NOT EXISTS idx_snapshots_keyword_date ON paa_snapshots(keyword_id, captured_at DESC);
