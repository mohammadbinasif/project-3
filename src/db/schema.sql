-- ============================================================
-- PROJECT 3 · PILLAR 1 — THE BLUEPRINT (Schema & Design)
-- Digital Vault · SQLite dialect (SQL, relational, ACID)
-- Run: npm run db:migrate   (idempotent — safe to re-run)
-- ============================================================

PRAGMA foreign_keys = ON;

-- ------------------------------------------------------------
-- 1) USERS — the vault owners
--    PK: user_id (unique row ID)
--    Constraints: NOT NULL, UNIQUE, CHECK  (Pillar 4)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  user_id    INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL,
  email      TEXT    NOT NULL UNIQUE,
  age        INTEGER NOT NULL CHECK (age >= 18),
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ------------------------------------------------------------
-- 2) PROFILES — ONE-TO-ONE with users
--    The UNIQUE constraint on user_id is what makes it 1:1:
--    a user can appear at most once in this table.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS profiles (
  profile_id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL UNIQUE,
  bio        TEXT,
  avatar_url TEXT,
  CONSTRAINT fk_profiles_user
    FOREIGN KEY (user_id) REFERENCES users (user_id)
    ON DELETE CASCADE          -- deleting a user removes their profile
);

-- ------------------------------------------------------------
-- 3) VAULT ENTRIES — ONE-TO-MANY with users
--    One user -> many entries. Many entries -> one user.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vault_entries (
  entry_id   INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL,
  title      TEXT    NOT NULL CHECK (length(title) >= 3),
  content    TEXT    NOT NULL DEFAULT '',
  size_kb    INTEGER NOT NULL DEFAULT 0 CHECK (size_kb >= 0),
  created_at TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT    NOT NULL DEFAULT (datetime('now')),
  CONSTRAINT fk_entries_user
    FOREIGN KEY (user_id) REFERENCES users (user_id)
    ON DELETE CASCADE
);

-- ------------------------------------------------------------
-- 4) TAGS + ENTRY_TAGS — MANY-TO-MANY (junction table)
--    entries *----* tags, resolved by entry_tags.
--    Composite PRIMARY KEY (entry_id, tag_id) forbids
--    duplicate links between the same pair.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tags (
  tag_id INTEGER PRIMARY KEY AUTOINCREMENT,
  name   TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS entry_tags (
  entry_id INTEGER NOT NULL,
  tag_id   INTEGER NOT NULL,
  PRIMARY KEY (entry_id, tag_id),
  FOREIGN KEY (entry_id) REFERENCES vault_entries (entry_id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id)   REFERENCES tags (tag_id)            ON DELETE CASCADE
);

-- ------------------------------------------------------------
-- INDEXES — the "extra experiment" (Pillar extras)
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_entries_user_id ON vault_entries (user_id);
CREATE INDEX IF NOT EXISTS idx_entries_title    ON vault_entries (title);
