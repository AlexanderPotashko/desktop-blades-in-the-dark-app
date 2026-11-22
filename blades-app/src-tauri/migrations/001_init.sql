-- 001_init: initial schema (PLAN.md §5.1).
-- Run by the Rust migrator inside one transaction, only when PRAGMA user_version = 0.
-- Requires SQLite >= 3.43 (rusqlite `bundled`): ->> operator, STRICT, FTS5 contentless_delete.
-- Per connection, not here: PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL (cannot change inside a transaction).
-- Timestamps: ISO 8601 UTC text. JSON columns: TEXT checked with json_valid; shape validated by Zod before writing.

CREATE TABLE campaigns (
  id         TEXT PRIMARY KEY,                                   -- UUID
  name       TEXT NOT NULL,
  rules      TEXT NOT NULL CHECK (json_valid(rules)),            -- TableRules
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

CREATE TABLE characters (
  id             TEXT PRIMARY KEY,                               -- UUID, equals doc.id
  campaign_id    TEXT REFERENCES campaigns(id) ON DELETE SET NULL,
  doc            TEXT NOT NULL CHECK (json_valid(doc)),          -- Character document
  archived       INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)),
  updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  -- derived from the document: one source of truth, indexed for the library list
  schema_version INTEGER GENERATED ALWAYS AS (doc ->> '$.schemaVersion') VIRTUAL,
  name           TEXT    GENERATED ALWAYS AS (doc ->> '$.name') VIRTUAL,
  playbook       TEXT    GENERATED ALWAYS AS (doc ->> '$.playbookId') VIRTUAL
) STRICT;
CREATE INDEX characters_name     ON characters(name);
CREATE INDEX characters_playbook ON characters(playbook);
CREATE INDEX characters_campaign ON characters(campaign_id);

-- "As it was yesterday": snapshots of a character. Retention (last 50 + one per day) is enforced in Rust.
CREATE TABLE revisions (
  id           INTEGER PRIMARY KEY,
  character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  reason       TEXT NOT NULL,                                    -- autosave, import, agent, before-restore…
  doc          TEXT NOT NULL CHECK (json_valid(doc))
) STRICT;
CREATE INDEX revisions_character ON revisions(character_id, created_at);

-- GM rulings log, verbatim quotes.
CREATE TABLE rulings (
  id          TEXT PRIMARY KEY,                                  -- UUID
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  date        TEXT NOT NULL,                                     -- YYYY-MM-DD
  author      TEXT NOT NULL,
  quote       TEXT NOT NULL CHECK (quote <> ''),
  topic       TEXT
) STRICT;
CREATE INDEX rulings_campaign ON rulings(campaign_id, date);

-- Rulebooks imported by the user (never shipped, never exported).
CREATE TABLE rulebooks (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  imported_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  page_offset INTEGER NOT NULL DEFAULT 0                         -- PDF page − book page (5 in the Russian edition)
) STRICT;

-- Explicit INTEGER PRIMARY KEY: it is the rb_fts rowid, and implicit rowids may change on VACUUM.
CREATE TABLE rb_pages (
  id          INTEGER PRIMARY KEY,
  rulebook_id TEXT NOT NULL REFERENCES rulebooks(id) ON DELETE CASCADE,
  pdf         INTEGER NOT NULL,
  book        INTEGER NOT NULL,                                  -- may be <= 0 for front matter
  text        TEXT NOT NULL,
  UNIQUE (rulebook_id, pdf)
) STRICT;

CREATE TABLE rb_toc (
  rulebook_id TEXT NOT NULL REFERENCES rulebooks(id) ON DELETE CASCADE,
  ord         INTEGER NOT NULL,
  title       TEXT NOT NULL,
  page        INTEGER NOT NULL,                                  -- book page
  level       INTEGER NOT NULL,
  PRIMARY KEY (rulebook_id, ord)
) STRICT;

-- Stemmed words of each page (stemmed in Rust with rust-stemmers at import and query time).
-- Contentless: snippets/highlighting are built from rb_pages.text, not from this table.
-- rowid = rb_pages.id
CREATE VIRTUAL TABLE rb_fts USING fts5(
  stemmed,
  content = '',
  contentless_delete = 1,
  tokenize = 'unicode61 remove_diacritics 0'                     -- keep й≠и; ё→е is normalized before stemming
);
CREATE TRIGGER rb_pages_fts_delete AFTER DELETE ON rb_pages BEGIN
  DELETE FROM rb_fts WHERE rowid = old.id;
END;

CREATE TABLE bookmarks (
  id          TEXT PRIMARY KEY,
  rulebook_id TEXT NOT NULL REFERENCES rulebooks(id) ON DELETE CASCADE,
  page        INTEGER NOT NULL,                                  -- book page
  title       TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;
CREATE INDEX bookmarks_rulebook ON bookmarks(rulebook_id, page);

-- App settings: backup folder, theme, language, platform, last opened sheet, UI state.
CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL CHECK (json_valid(value))
) STRICT;

PRAGMA user_version = 1;
