-- user-visible, replicated ------------------------------------------------
CREATE TABLE items (
  id            TEXT PRIMARY KEY,      -- uuid v7 (time-ordered); ids are never reused
  type          TEXT NOT NULL,         -- note|link|article|image|video|pdf|quote|product|book|recipe|tweet|repo|file
  url TEXT, domain TEXT, title TEXT,
  body          TEXT,                  -- note text / readability text / quote. Whole-field LWW.
  summary       TEXT,                  -- AI
  ocr_text      TEXT,
  meta          TEXT,                  -- JSON, per-type scalars (price, author, duration, stars…). Whole-field LWW, accepted.
  colors        TEXT,                  -- JSON ["#1a2b3c", ...]
  embedding     BLOB,                  -- Float32 little-endian; dim in embedding_dim
  embedding_dim INTEGER, embedding_model TEXT,
  pinned_at     INTEGER,               -- Pin; UI enforces max 5 (oldest pin is released)
  opened_at     INTEGER, open_count INTEGER NOT NULL DEFAULT 0,
  resurfaced_at INTEGER,               -- last time Resurface showed it
  let_go_at     INTEGER,               -- user chose "Let go" in Resurface (suppress 90 d)
  deleted_at    INTEGER,               -- "Let go" from the card = trash; purged via tombstone GC after 30 d
  created_at    INTEGER NOT NULL, updated_at INTEGER NOT NULL,
  created_by    TEXT NOT NULL          -- device id that created/imported it → the single enricher
);
CREATE TABLE files (
  hash TEXT PRIMARY KEY,               -- plaintext BLAKE3; the FileStore key
  item_id TEXT NOT NULL, role TEXT NOT NULL,  -- original|thumb|reader_html|poster
  mime TEXT, bytes INTEGER, w INTEGER, h INTEGER, blurhash TEXT,
  deleted_at INTEGER
);
CREATE TABLE tags (
  item_id TEXT NOT NULL, tag TEXT NOT NULL,
  source TEXT NOT NULL,                -- user|ai|import
  deleted_at INTEGER,
  PRIMARY KEY (item_id, tag)
);
CREATE TABLE spaces (id TEXT PRIMARY KEY, name TEXT NOT NULL, query TEXT, sort INTEGER, deleted_at INTEGER);
CREATE TABLE space_items (space_id TEXT, item_id TEXT, added_at INTEGER, deleted_at INTEGER, PRIMARY KEY (space_id, item_id));

-- local only, never replicated ----------------------------------------------
CREATE TABLE jobs (
  id TEXT PRIMARY KEY, item_id TEXT, kind TEXT NOT NULL,      -- extract|colors|ocr|classify|embed|describe_image|thumb
  status TEXT NOT NULL DEFAULT 'pending',                      -- pending|running|done|failed|skipped
  attempts INTEGER NOT NULL DEFAULT 0, error TEXT, run_after INTEGER, created_at INTEGER NOT NULL
);
CREATE TABLE ops (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  hlc TEXT NOT NULL,                   -- "wallms-counter-deviceid", lexically sortable
  device_id TEXT NOT NULL, tbl TEXT NOT NULL, row_id TEXT NOT NULL, col TEXT NOT NULL,
  value BLOB,                          -- JSON (UTF-8)
  schema_version INTEGER NOT NULL,
  pushed INTEGER NOT NULL DEFAULT 0,   -- 1 once in a pushed batch
  applied INTEGER NOT NULL DEFAULT 1   -- 0 = unknown column for this client version; re-applied after migrate
);
CREATE TABLE cell_clock   (tbl TEXT, row_id TEXT, col TEXT, hlc TEXT NOT NULL, PRIMARY KEY (tbl,row_id,col));
CREATE TABLE cell_history (tbl TEXT, row_id TEXT, col TEXT, hlc TEXT, device_id TEXT, value BLOB, lost_at INTEGER); -- 90 d
CREATE TABLE blob_index   (hash TEXT PRIMARY KEY, remote_key TEXT, bytes INTEGER, state TEXT NOT NULL);        -- local|remote|both
CREATE TABLE sync_cursor  (device_id TEXT PRIMARY KEY, last_key TEXT, last_hlc TEXT, last_seen INTEGER, stale INTEGER DEFAULT 0);
CREATE TABLE sync_errors  (key TEXT PRIMARY KEY, device_id TEXT, reason TEXT, first_seen INTEGER, resolved INTEGER DEFAULT 0);
CREATE TABLE migrations   (version INTEGER PRIMARY KEY, applied_at INTEGER);

-- search ----------------------------------------------------------------------
CREATE VIRTUAL TABLE items_fts USING fts5(
  title, body, summary, ocr_text, tags, domain,
  content='', tokenize='unicode61 remove_diacritics 2'      -- external content: we write rows ourselves
);

-- indexes ---------------------------------------------------------------------
CREATE INDEX items_updated_at ON items(updated_at);
CREATE INDEX items_deleted_at ON items(deleted_at);
CREATE INDEX items_type ON items(type);
CREATE INDEX tags_tag ON tags(tag);
CREATE INDEX ops_pushed ON ops(pushed);
CREATE INDEX ops_hlc ON ops(hlc);
CREATE INDEX jobs_status_run_after ON jobs(status, run_after);
