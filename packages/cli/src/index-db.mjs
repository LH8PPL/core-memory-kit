// SQLite index-DB schema + open function (Task 28, T-024).
//
// The kit's search layer (Layer 5, design §9) is a regenerable
// read-cache at `<projectRoot>/context/.index/memory.db`. Source of
// truth is always the markdown files under `context/`, `context.local/`,
// and the user-tier directory — the DB is rebuilt from those any time
// it diverges (T1 architectural rule).
//
// Schema follows design §9.1 verbatim:
//   - `observations` table mirrors every fact bullet from the markdown
//     tier files (id, tier, source_file, source_line, source_sha1,
//     heading_path, body, write_source, trust, created_at, superseded_by,
//     deleted_at).
//   - `observations_fts` FTS5 virtual table provides BM25 keyword search
//     over the body / heading_path / write_source columns. Three sync
//     triggers (after insert / update / delete) keep the FTS5 mirror
//     consistent with the base table without requiring the caller to
//     manage two write paths.
//   - `files` checkpoint table tracks markdown file mtime + sha1, used
//     by Task 29's reindex strategy (boot-time diff, runtime watcher)
//     to skip files that haven't changed since the last index pass.
//
// Pragma posture:
//   - `journal_mode=WAL` enables many readers + one writer concurrently
//     (the kit reads from the index during `cmk search` while auto-extract
//     or `cmk reindex` may be writing).
//   - `synchronous=NORMAL` is the sqlite-recommended tradeoff for WAL
//     mode — durability is preserved across checkpoint events but a
//     crash between checkpoints can lose the last few transactions.
//     For a regenerable read-cache this is correct: the user can always
//     `cmk reindex --full` to rebuild.
//
// Public boundary (this module):
//   - openIndexDb({projectRoot}) → Database
//   - getIndexDbPath(projectRoot) → string
//   - INDEX_DB_SCHEMA (exported for tests / migration tooling)
//
// Not yet in this task:
//   - reindex orchestration (Task 29)
//   - `cmk search` CLI (Task 30)
//   - MCP server (Task 31)
//
// Task 28 ships ONLY the schema + open function. Callers in Tasks 29-31
// will compose on top.

import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

const INDEX_DB_RELATIVE = ['context', '.index', 'memory.db'];

/**
 * Full DDL applied at open time. Idempotent — every CREATE has
 * `IF NOT EXISTS` so reopening an existing DB is a no-op.
 *
 * Kept as a single export so tests can assert that the production
 * open path applied the documented schema (no drift between code
 * and design §9.1).
 */
export const INDEX_DB_SCHEMA = `
CREATE TABLE IF NOT EXISTS observations (
  id TEXT PRIMARY KEY,
  tier TEXT NOT NULL CHECK(tier IN ('U','P','L')),
  source_file TEXT NOT NULL,
  source_line INTEGER NOT NULL,
  source_sha1 TEXT NOT NULL,
  heading_path TEXT,
  body TEXT NOT NULL,
  write_source TEXT NOT NULL,
  trust TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  superseded_by TEXT REFERENCES observations(id),
  deleted_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_observations_tier ON observations(tier);
CREATE INDEX IF NOT EXISTS idx_observations_trust ON observations(trust);
CREATE INDEX IF NOT EXISTS idx_observations_created_at ON observations(created_at);
CREATE INDEX IF NOT EXISTS idx_observations_deleted ON observations(deleted_at) WHERE deleted_at IS NOT NULL;

CREATE VIRTUAL TABLE IF NOT EXISTS observations_fts USING fts5(
  body, heading_path, write_source,
  content='observations',
  content_rowid='rowid',
  tokenize='porter unicode61'
);

-- FTS5 external-content sync triggers (sqlite.org/fts5 §4.4.3).
-- The standard "DELETE FROM fts WHERE rowid = old.rowid" trigger pattern
-- does NOT work for external-content FTS5 (content='observations') —
-- FTS5 needs to read the deleted content to remove it from the index,
-- but the row is gone by the time an AFTER DELETE trigger runs. The
-- documented escape hatch is the 'delete' / 'delete-all' command — a
-- sentinel INSERT into the FTS5 table that takes rowid + column values
-- so FTS5 can compute the delete without re-reading the source row.
CREATE TRIGGER IF NOT EXISTS obs_after_insert AFTER INSERT ON observations BEGIN
  INSERT INTO observations_fts(rowid, body, heading_path, write_source)
  VALUES (new.rowid, new.body, new.heading_path, new.write_source);
END;

CREATE TRIGGER IF NOT EXISTS obs_after_update AFTER UPDATE ON observations BEGIN
  INSERT INTO observations_fts(observations_fts, rowid, body, heading_path, write_source)
  VALUES ('delete', old.rowid, old.body, old.heading_path, old.write_source);
  INSERT INTO observations_fts(rowid, body, heading_path, write_source)
  VALUES (new.rowid, new.body, new.heading_path, new.write_source);
END;

CREATE TRIGGER IF NOT EXISTS obs_after_delete AFTER DELETE ON observations BEGIN
  INSERT INTO observations_fts(observations_fts, rowid, body, heading_path, write_source)
  VALUES ('delete', old.rowid, old.body, old.heading_path, old.write_source);
END;

CREATE TABLE IF NOT EXISTS files (
  path TEXT PRIMARY KEY,
  mtime INTEGER NOT NULL,
  sha1 TEXT NOT NULL,
  indexed_at INTEGER NOT NULL
);
`;

/**
 * @param {string} projectRoot
 * @returns {string} absolute path to the kit's index DB for the given project
 */
export function getIndexDbPath(projectRoot) {
  return join(projectRoot, ...INDEX_DB_RELATIVE);
}

/**
 * Opens (or creates) the index DB for the given project, applies the
 * schema, and sets the documented PRAGMA posture. Idempotent — calling
 * twice against the same projectRoot returns a second handle to the
 * same on-disk database; the schema CREATE IF NOT EXISTS statements
 * are no-ops on the second call.
 *
 * @param {object} opts
 * @param {string} opts.projectRoot
 * @param {string} [opts.dbPath]  override path (test fixture injection)
 * @returns {import('better-sqlite3').Database}
 */
export function openIndexDb({ projectRoot, dbPath } = {}) {
  const path = dbPath ?? getIndexDbPath(projectRoot);
  mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  // WAL + NORMAL synchronous: design §9.1 posture. WAL allows many
  // readers + one writer concurrently; NORMAL trades a small durability
  // window (between WAL checkpoints) for write throughput, acceptable
  // for a regenerable read-cache.
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  // Apply schema (idempotent CREATE IF NOT EXISTS).
  db.exec(INDEX_DB_SCHEMA);
  return db;
}
