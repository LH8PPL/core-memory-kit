// @doors: 1, 2
// Door 3 N/A: no subprocess spawn; better-sqlite3 is in-process.
// Door 4 N/A: no message-queue interaction.
// Door 5 N/A: schema/open module has no NDJSON log surface (callers in Tasks 29-31 own observability for reindex / search / mcp).

// Tests for Task 28 — SQLite + FTS5 schema + WAL config (T-024).
// Per tasks.md 28.5:
//   - Test `cmk reindex --boot` creates `memory.db` with all documented
//     tables/indexes (inspect via `sqlite_master`)
//   - Test FTS5 virtual table exists with documented columns
//   - Test PRAGMA `journal_mode` == `wal`; `synchronous` == `NORMAL`
//   - Test insert into `observations`: FTS5 mirror row created via trigger
//   - Test update on `observations.body`: FTS5 mirror updated via trigger
//   - Test delete from `observations`: FTS5 mirror row deleted via trigger
//
// The `cmk reindex --boot` integration is Task 29's surface; this test
// file exercises `openIndexDb()` directly (the deep boundary) and
// asserts that it produces the documented schema + pragma posture.
// Task 29 will compose on this and add the markdown-walking + diff logic.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  openIndexDb,
  getIndexDbPath,
  INDEX_DB_SCHEMA,
} from '../packages/cli/src/index-db.mjs';

let sandbox;
let projectRoot;

beforeEach(() => {
  sandbox = mkdtempSync(join(tmpdir(), 'cmk-index-db-test-'));
  projectRoot = join(sandbox, 'proj');
});

afterEach(() => {
  rmSync(sandbox, { recursive: true, force: true });
});

describe('Task 28 — index-db schema + open', () => {
  describe('Schema constant', () => {
    it('INDEX_DB_SCHEMA is a non-empty string with the documented surface', () => {
      expect(typeof INDEX_DB_SCHEMA).toBe('string');
      expect(INDEX_DB_SCHEMA.length).toBeGreaterThan(0);
      // Spot-check that the schema references the documented surface.
      // Tests below verify behavior end-to-end; this is a fast-fail
      // sanity check on the constant itself.
      for (const symbol of [
        'observations',
        'observations_fts',
        'files',
        'obs_after_insert',
        'obs_after_update',
        'obs_after_delete',
      ]) {
        expect(INDEX_DB_SCHEMA).toContain(symbol);
      }
    });
  });

  describe('getIndexDbPath', () => {
    it('resolves to context/.index/memory.db under the project root', () => {
      const p = getIndexDbPath(projectRoot);
      expect(p).toContain('context');
      expect(p).toContain('.index');
      expect(p).toContain('memory.db');
      // No leading separator issues + ends with the file name.
      expect(p.endsWith('memory.db')).toBe(true);
    });
  });

  describe('openIndexDb() — first open creates the DB + applies schema', () => {
    it('creates context/.index/memory.db on disk (28.5 #1)', () => {
      const db = openIndexDb({ projectRoot });
      try {
        expect(existsSync(getIndexDbPath(projectRoot))).toBe(true);
      } finally {
        db.close();
      }
    });

    it('the documented tables, indexes, and triggers exist via sqlite_master (28.5 #1)', () => {
      const db = openIndexDb({ projectRoot });
      try {
        const objects = db
          .prepare("SELECT type, name FROM sqlite_master ORDER BY type, name")
          .all();
        const names = new Set(objects.map((o) => o.name));
        // Tables
        expect(names.has('observations')).toBe(true);
        expect(names.has('files')).toBe(true);
        // FTS5 virtual table (sqlite_master records the virtual table
        // PLUS its shadow tables; the primary name is `observations_fts`).
        expect(names.has('observations_fts')).toBe(true);
        // Indexes
        expect(names.has('idx_observations_tier')).toBe(true);
        expect(names.has('idx_observations_trust')).toBe(true);
        expect(names.has('idx_observations_created_at')).toBe(true);
        expect(names.has('idx_observations_deleted')).toBe(true);
        // Triggers
        expect(names.has('obs_after_insert')).toBe(true);
        expect(names.has('obs_after_update')).toBe(true);
        expect(names.has('obs_after_delete')).toBe(true);
      } finally {
        db.close();
      }
    });

    it('FTS5 virtual table exists with the documented column shape (28.5 #2)', () => {
      const db = openIndexDb({ projectRoot });
      try {
        // FTS5 virtual tables don't expose columns via standard
        // PRAGMA table_info on every SQLite build; the most portable
        // assertion is that an FTS-shaped query succeeds.
        // Insert a row + assert FTS5 can MATCH the body column.
        db.prepare(
          `INSERT INTO observations (id, tier, source_file, source_line, source_sha1, heading_path, body, write_source, trust, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          'P-AAAAAAAB',
          'P',
          'context/MEMORY.md',
          1,
          'a'.repeat(40),
          'MEMORY.md > Active Threads',
          'fts5 column shape check body',
          'user-explicit',
          'high',
          1716638400,
        );
        const row = db
          .prepare(
            `SELECT body FROM observations_fts WHERE observations_fts MATCH 'shape'`,
          )
          .get();
        expect(row).toBeDefined();
        expect(row.body).toContain('shape');
        // heading_path + write_source are also FTS5-indexed columns
        // per design §9.1; assert MATCH against them works too.
        const headingHit = db
          .prepare(
            `SELECT body FROM observations_fts WHERE observations_fts MATCH 'heading_path : Active'`,
          )
          .all();
        expect(headingHit.length).toBeGreaterThanOrEqual(1);
        // FTS5 treats `-` as a NOT operator inside MATCH expressions,
        // so write_source values like `user-explicit` must be phrase-
        // quoted (`"..."`) to match as a literal token sequence.
        const sourceHit = db
          .prepare(
            `SELECT body FROM observations_fts WHERE observations_fts MATCH 'write_source : "user-explicit"'`,
          )
          .all();
        expect(sourceHit.length).toBeGreaterThanOrEqual(1);
      } finally {
        db.close();
      }
    });

    it('PRAGMA journal_mode == "wal" and synchronous == "NORMAL" (1) (28.5 #3)', () => {
      const db = openIndexDb({ projectRoot });
      try {
        // SQLite returns mode as the lowercase string for journal_mode
        // and a numeric for synchronous (0=OFF, 1=NORMAL, 2=FULL, 3=EXTRA).
        const journal = db.pragma('journal_mode', { simple: true });
        expect(journal).toBe('wal');
        const sync = db.pragma('synchronous', { simple: true });
        expect(sync).toBe(1); // 1 == NORMAL
      } finally {
        db.close();
      }
    });
  });

  describe('FTS5 sync triggers (28.5 #4, #5, #6)', () => {
    it('insert into observations creates the FTS5 mirror row (28.5 #4)', () => {
      const db = openIndexDb({ projectRoot });
      try {
        db.prepare(
          `INSERT INTO observations (id, tier, source_file, source_line, source_sha1, heading_path, body, write_source, trust, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          'P-BBBBBBBC',
          'P',
          'context/MEMORY.md',
          1,
          'b'.repeat(40),
          'MEMORY.md > Decisions',
          'we decided to use pnpm for new node projects',
          'user-explicit',
          'high',
          1716638400,
        );
        const row = db
          .prepare(
            `SELECT body, heading_path, write_source FROM observations_fts WHERE observations_fts MATCH 'pnpm'`,
          )
          .get();
        expect(row).toBeDefined();
        expect(row.body).toContain('pnpm');
        expect(row.heading_path).toBe('MEMORY.md > Decisions');
        expect(row.write_source).toBe('user-explicit');
      } finally {
        db.close();
      }
    });

    it('update of observations.body updates the FTS5 mirror (28.5 #5)', () => {
      const db = openIndexDb({ projectRoot });
      try {
        db.prepare(
          `INSERT INTO observations (id, tier, source_file, source_line, source_sha1, heading_path, body, write_source, trust, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          'P-CCCCCCCD',
          'P',
          'context/MEMORY.md',
          5,
          'c'.repeat(40),
          'MEMORY.md > Decisions',
          'original body before update',
          'user-explicit',
          'high',
          1716638400,
        );
        // Verify pre-update FTS5 state.
        const preUpdate = db
          .prepare(
            `SELECT body FROM observations_fts WHERE observations_fts MATCH 'original'`,
          )
          .get();
        expect(preUpdate).toBeDefined();
        // Update the row.
        db.prepare(
          `UPDATE observations SET body = ? WHERE id = ?`,
        ).run('rewritten body after update', 'P-CCCCCCCD');
        // Old text no longer matches; new text matches.
        const stillMatchesOriginal = db
          .prepare(
            `SELECT body FROM observations_fts WHERE observations_fts MATCH 'original'`,
          )
          .get();
        expect(stillMatchesOriginal).toBeUndefined();
        const newMatch = db
          .prepare(
            `SELECT body FROM observations_fts WHERE observations_fts MATCH 'rewritten'`,
          )
          .get();
        expect(newMatch).toBeDefined();
        expect(newMatch.body).toContain('rewritten');
      } finally {
        db.close();
      }
    });

    it('delete of observations row deletes the FTS5 mirror (28.5 #6)', () => {
      const db = openIndexDb({ projectRoot });
      try {
        db.prepare(
          `INSERT INTO observations (id, tier, source_file, source_line, source_sha1, heading_path, body, write_source, trust, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          'P-DDDDDDDE',
          'P',
          'context/MEMORY.md',
          7,
          'd'.repeat(40),
          'MEMORY.md > Active Threads',
          'deletable body fixture',
          'user-explicit',
          'high',
          1716638400,
        );
        // Pre-delete state.
        const preDelete = db
          .prepare(
            `SELECT body FROM observations_fts WHERE observations_fts MATCH 'deletable'`,
          )
          .get();
        expect(preDelete).toBeDefined();
        // Delete.
        db.prepare(`DELETE FROM observations WHERE id = ?`).run('P-DDDDDDDE');
        const postDelete = db
          .prepare(
            `SELECT body FROM observations_fts WHERE observations_fts MATCH 'deletable'`,
          )
          .get();
        expect(postDelete).toBeUndefined();
      } finally {
        db.close();
      }
    });

    // Over-mutation guard per CLAUDE.md Engineering discipline:
    // mutating one row must NOT touch sibling rows in the FTS5 mirror.
    it('over-mutation guard: delete one row leaves siblings intact', () => {
      const db = openIndexDb({ projectRoot });
      try {
        const insert = db.prepare(
          `INSERT INTO observations (id, tier, source_file, source_line, source_sha1, heading_path, body, write_source, trust, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        );
        insert.run('P-EEEEEEEC', 'P', 'context/MEMORY.md', 1, 'e'.repeat(40), 'A', 'sibling alpha keep', 'user-explicit', 'high', 1716638400);
        insert.run('P-FFFFFFFC', 'P', 'context/MEMORY.md', 2, 'f'.repeat(40), 'A', 'sibling beta keep', 'user-explicit', 'high', 1716638401);
        insert.run('P-GGGGGGGC', 'P', 'context/MEMORY.md', 3, 'g'.repeat(40), 'A', 'sibling gamma delete', 'user-explicit', 'high', 1716638402);
        // Delete the gamma row only.
        db.prepare(`DELETE FROM observations WHERE id = ?`).run('P-GGGGGGGC');
        // Alpha and beta should still be in the FTS5 mirror.
        const alpha = db
          .prepare(
            `SELECT body FROM observations_fts WHERE observations_fts MATCH 'alpha'`,
          )
          .get();
        expect(alpha).toBeDefined();
        const beta = db
          .prepare(
            `SELECT body FROM observations_fts WHERE observations_fts MATCH 'beta'`,
          )
          .get();
        expect(beta).toBeDefined();
        // Gamma should be gone.
        const gamma = db
          .prepare(
            `SELECT body FROM observations_fts WHERE observations_fts MATCH 'gamma'`,
          )
          .get();
        expect(gamma).toBeUndefined();
      } finally {
        db.close();
      }
    });
  });

  describe('Reopen safety', () => {
    it('reopening an existing DB is idempotent — schema CREATE IF NOT EXISTS', () => {
      // Open, close, reopen — the second open should not throw on
      // CREATE collisions because every CREATE in the schema uses
      // IF NOT EXISTS.
      const dbA = openIndexDb({ projectRoot });
      dbA.prepare(
        `INSERT INTO observations (id, tier, source_file, source_line, source_sha1, heading_path, body, write_source, trust, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        'P-HHHHHHCC',
        'P',
        'context/MEMORY.md',
        1,
        'h'.repeat(40),
        'A',
        'persisted across reopen',
        'user-explicit',
        'high',
        1716638400,
      );
      dbA.close();
      const dbB = openIndexDb({ projectRoot });
      try {
        // The row inserted into dbA is visible in dbB.
        const row = dbB
          .prepare(`SELECT body FROM observations WHERE id = ?`)
          .get('P-HHHHHHCC');
        expect(row).toBeDefined();
        expect(row.body).toContain('reopen');
      } finally {
        dbB.close();
      }
    });
  });
});
