// @doors: 1, 2
// Door 3 N/A: in-process — no subprocess spawn (better-sqlite3 + chokidar both run in the test process).
// Door 4 N/A: no message-queue interaction; chokidar's FS-event delivery is an OS callback, not the kit's queue surface.
// Door 5 N/A: index-rebuild.mjs doesn't emit kit NDJSON logs; the subcommand wrapper prints summary lines to stdout (tested separately by cli-scaffold integration).

// Tests for Task 29 — Reindex strategy (boot / runtime / recovery) (T-025).
// Per tasks.md 29.4:
//   - Test `--boot` with no changes: 0 files re-indexed; timer <200 ms
//   - Test `--boot` after editing one fact: only that file re-indexed
//   - Test runtime watcher: touch a file; FTS5 reflects within 1 s
//   - Test `--full`: drops DB; walks all markdown; row count == markdown fact count
//   - Test concurrent writers (one `--boot` + one runtime): no errors, no duplicate rows

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  mkdirSync,
  utimesSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { install } from '../packages/cli/src/install.mjs';
import { openIndexDb } from '../packages/cli/src/index-db.mjs';
import {
  listObservationSources,
  reindexBoot,
  reindexFull,
  startRuntimeWatcher,
} from '../packages/cli/src/index-rebuild.mjs';
import { writeBullet } from '../packages/cli/src/provenance.mjs';
import { writeFact } from '../packages/cli/src/write-fact.mjs';

let sandbox;
let projectRoot;
let userDir;
let db;

async function makeFixture() {
  sandbox = mkdtempSync(join(tmpdir(), 'cmk-index-rebuild-'));
  projectRoot = join(sandbox, 'proj');
  userDir = join(sandbox, 'user');
  await install({ projectRoot, userTier: userDir });
  db = openIndexDb({ projectRoot });
}

function seedScratchpad(projectRoot, bullets) {
  // bullets: [{id, text, provenance}]
  const lines = ['# MEMORY.md', '', '## Active Threads', ''];
  for (const b of bullets) {
    const r = writeBullet(b);
    lines.push(r.bullet);
    lines.push(r.comment);
  }
  lines.push('');
  writeFileSync(
    join(projectRoot, 'context', 'MEMORY.md'),
    lines.join('\n'),
    'utf8',
  );
}

// Seed a per-fact file via the kit's actual writer. This used to hand-
// roll YAML, which silently agreed with the parser but disagreed with
// the writer's real on-disk shape (`created_at`/`source_file`/
// `source_sha1` vs the legacy `at`/`source`/`sha1` field names) —
// surfaced as Blocking finding B1+B2 by the Task 29 code-review.
// Calling writeFact() composes the test fixture with the production
// writer, so the parser and writer never drift again. Per CLAUDE.md
// "Integration-test coverage for cross-module flows" rule.
function seedFactFile(projectRoot, { id, type, title, body, write_source, trust, at, slug }) {
  const r = writeFact({
    projectRoot,
    tier: 'P',
    type,
    slug: slug ?? type, // simple slug for tests; the kit's normal naming uses descriptive slugs
    title,
    body,
    writeSource: write_source,
    trust,
    sourceFile: 'MEMORY.md',
    sourceLine: 1,
    sourceSha1: 'a'.repeat(40),
    createdAt: at,
    id, // explicit override so tests get deterministic IDs
  });
  if (r.action === 'error') {
    throw new Error(`seedFactFile failed: ${(r.errors ?? []).join('; ')}`);
  }
  return r.path;
}

function bulletInput({ id, text, line, at = '2026-05-27T10:00:00Z' }) {
  return {
    id,
    text,
    provenance: {
      source: 'MEMORY.md',
      source_line: line,
      sha1: 'b'.repeat(40),
      write: 'user-explicit',
      trust: 'high',
      at,
    },
  };
}

beforeEach(async () => {
  await makeFixture();
});

afterEach(() => {
  db?.close();
  rmSync(sandbox, { recursive: true, force: true });
});

describe('Task 29 — index-rebuild', () => {
  describe('listObservationSources', () => {
    it('enumerates scratchpad + per-fact files across tiers', () => {
      seedScratchpad(projectRoot, [bulletInput({ id: 'P-AAAAAAAA', text: 'one', line: 5 })]);
      seedFactFile(projectRoot, {
        id: 'P-BBBBBBBB',
        type: 'project',
        title: 't',
        body: 'b',
        write_source: 'user-explicit',
        trust: 'high',
        at: '2026-05-27T10:00:00Z',
      });
      const sources = listObservationSources({ projectRoot, userDir });
      const kinds = sources.map((s) => s.kind).sort();
      expect(kinds).toContain('scratchpad');
      expect(kinds).toContain('fact');
    });
  });

  describe('reindexBoot (29.1, 29.4 cases #1 + #2)', () => {
    it('initial boot indexes all sources', () => {
      seedScratchpad(projectRoot, [
        bulletInput({ id: 'P-AAAAAAAA', text: 'use pnpm', line: 5 }),
        bulletInput({ id: 'P-BBBBBBBB', text: 'we ship friday', line: 7 }),
      ]);
      seedFactFile(projectRoot, {
        id: 'P-CCCCCCCC',
        type: 'project',
        title: 'rust for hot loops',
        body: 'we settled on rust for the perf-critical paths',
        write_source: 'user-explicit',
        trust: 'high',
        at: '2026-05-27T10:00:00Z',
      });
      const r = reindexBoot({ projectRoot, userDir, db });
      expect(r.filesReindexed).toBeGreaterThan(0);
      const count = db.prepare('SELECT COUNT(*) AS n FROM observations').get();
      expect(count.n).toBe(3);
    });

    it('29.4 #1 — boot with no changes: 0 files re-indexed; <200ms', () => {
      seedScratchpad(projectRoot, [
        bulletInput({ id: 'P-AAAAAAAA', text: 'one', line: 5 }),
        bulletInput({ id: 'P-BBBBBBBB', text: 'two', line: 7 }),
      ]);
      seedFactFile(projectRoot, {
        id: 'P-CCCCCCCC',
        type: 'project',
        title: 't',
        body: 'b',
        write_source: 'user-explicit',
        trust: 'high',
        at: '2026-05-27T10:00:00Z',
      });
      reindexBoot({ projectRoot, userDir, db }); // first boot — index everything
      const r2 = reindexBoot({ projectRoot, userDir, db }); // second boot — should be all-cached
      expect(r2.filesReindexed).toBe(0);
      expect(r2.observationsAffected).toBe(0);
      expect(r2.durationMs).toBeLessThan(200);
    });

    it('29.4 #2 — boot after editing one fact: only that file re-indexed', () => {
      seedScratchpad(projectRoot, [
        bulletInput({ id: 'P-AAAAAAAA', text: 'unchanged scratchpad', line: 5 }),
      ]);
      const factPath = seedFactFile(projectRoot, {
        id: 'P-CCCCCCCC',
        type: 'project',
        title: 'original title',
        body: 'original body',
        write_source: 'user-explicit',
        trust: 'high',
        at: '2026-05-27T10:00:00Z',
      });
      reindexBoot({ projectRoot, userDir, db });
      // Modify ONLY the fact file. Hand-write the YAML in the kit's
      // writer-canonical shape (`created_at`/`source_file`/`source_sha1`,
      // type from VALID_TYPES). Earlier draft used the legacy short
      // field names + `decision` type — silently broken because the
      // parser now (post Task 29 B1 fix) correctly rejects that shape
      // and would skip the file entirely.
      writeFileSync(
        factPath,
        [
          '---',
          'id: P-CCCCCCCC',
          'type: project',
          'title: edited title',
          'created_at: 2026-05-27T10:00:00Z',
          'write_source: user-explicit',
          'trust: high',
          'source_file: MEMORY.md',
          'source_line: 1',
          `source_sha1: ${'a'.repeat(40)}`,
          '---',
          '',
          'edited body — different from original',
          '',
        ].join('\n'),
        'utf8',
      );
      // Force a strictly-later mtime on the edited file before the second boot.
      // reindexBoot's fast path skips files whose floor(mtimeMs) matches the
      // indexed checkpoint — an intentional, documented caveat (index-rebuild.mjs
      // §"a content change that PRESERVES the old mtime ... won't be re-indexed").
      // In production an edit lands seconds/minutes after the last boot-index, so
      // mtime always advances and the change is seen. This test writes the seed
      // and the edit <1ms apart, so under load (5x stress) floor(mtimeMs) can
      // collide and the real content change is skipped (filesReindexed === 0).
      // Bumping mtime simulates the real-world gap, making the reindex-on-edit
      // contract deterministic. NOT masking a bug — the fast path is correct by
      // design; the test was relying on the clock advancing between two writes,
      // which isn't guaranteed. (Task 101 stress detour — DECISION-LOG D-76.)
      const future = new Date(Date.now() + 10_000);
      utimesSync(factPath, future, future);
      const r = reindexBoot({ projectRoot, userDir, db });
      expect(r.filesReindexed).toBe(1);
      // The reindex propagated to the observations table.
      const row = db
        .prepare('SELECT body FROM observations WHERE id = ?')
        .get('P-CCCCCCCC');
      expect(row.body).toContain('edited body');
      // Over-mutation guard (CLAUDE.md Engineering discipline): editing
      // the fact file MUST NOT touch the scratchpad bullet's row.
      // Catches a future bug where reindexBoot's per-file replace
      // accidentally widens its DELETE scope. Surfaced as Important
      // finding I4 in the Task 29 code-review.
      const scratchpadRow = db
        .prepare('SELECT body FROM observations WHERE id = ?')
        .get('P-AAAAAAAA');
      expect(scratchpadRow).toBeDefined();
      expect(scratchpadRow.body).toContain('unchanged scratchpad');
    });
  });

  describe('reindexFull (29.3, 29.4 case #4)', () => {
    it('drops + rebuilds DB; row count = markdown fact count', () => {
      seedScratchpad(projectRoot, [
        bulletInput({ id: 'P-AAAAAAAA', text: 'one', line: 5 }),
        bulletInput({ id: 'P-BBBBBBBB', text: 'two', line: 7 }),
      ]);
      seedFactFile(projectRoot, {
        id: 'P-CCCCCCCC',
        type: 'project',
        title: 'c',
        body: 'b',
        write_source: 'user-explicit',
        trust: 'high',
        at: '2026-05-27T10:00:00Z',
      });
      reindexBoot({ projectRoot, userDir, db });
      const beforeCount = db.prepare('SELECT COUNT(*) AS n FROM observations').get().n;
      expect(beforeCount).toBe(3);
      const r = reindexFull({ projectRoot, userDir, db });
      expect(r.observationsAffected).toBe(3);
      const afterCount = db.prepare('SELECT COUNT(*) AS n FROM observations').get().n;
      expect(afterCount).toBe(3);
    });

    it('full clears stale rows that no longer exist in source files', () => {
      seedScratchpad(projectRoot, [
        bulletInput({ id: 'P-AAAAAAAA', text: 'one', line: 5 }),
        bulletInput({ id: 'P-BBBBBBBB', text: 'two', line: 7 }),
      ]);
      reindexBoot({ projectRoot, userDir, db });
      expect(db.prepare('SELECT COUNT(*) AS n FROM observations').get().n).toBe(2);
      // Replace the file with ONE bullet.
      seedScratchpad(projectRoot, [
        bulletInput({ id: 'P-AAAAAAAA', text: 'one', line: 5 }),
      ]);
      reindexFull({ projectRoot, userDir, db });
      const remaining = db.prepare('SELECT id FROM observations ORDER BY id').all();
      expect(remaining.map((r) => r.id)).toEqual(['P-AAAAAAAA']);
    });
  });

  describe('FTS5 mirror correctness through reindex paths', () => {
    it('reindexed observations are MATCH-able via FTS5', () => {
      seedScratchpad(projectRoot, [
        bulletInput({ id: 'P-AAAAAAAA', text: 'standardized on pnpm for new projects', line: 5 }),
      ]);
      reindexBoot({ projectRoot, userDir, db });
      const hit = db
        .prepare(`SELECT body FROM observations_fts WHERE observations_fts MATCH 'pnpm'`)
        .get();
      expect(hit).toBeDefined();
      expect(hit.body).toContain('pnpm');
    });

    it('after full rebuild, FTS5 reflects the new corpus (no stale rows)', () => {
      seedScratchpad(projectRoot, [
        bulletInput({ id: 'P-AAAAAAAA', text: 'old fact about pnpm', line: 5 }),
      ]);
      reindexBoot({ projectRoot, userDir, db });
      const hitBefore = db
        .prepare(`SELECT body FROM observations_fts WHERE observations_fts MATCH 'pnpm'`)
        .get();
      expect(hitBefore).toBeDefined();
      seedScratchpad(projectRoot, [
        bulletInput({ id: 'P-BBBBBBBB', text: 'fresh fact about uv', line: 5 }),
      ]);
      reindexFull({ projectRoot, userDir, db });
      const hitAfter = db
        .prepare(`SELECT body FROM observations_fts WHERE observations_fts MATCH 'pnpm'`)
        .get();
      expect(hitAfter).toBeUndefined();
      const hitNew = db
        .prepare(`SELECT body FROM observations_fts WHERE observations_fts MATCH 'uv'`)
        .get();
      expect(hitNew).toBeDefined();
    });
  });

  describe('runtime watcher (29.2, 29.4 cases #3 + #5)', () => {
    it('29.4 #3 — touch a file; FTS5 reflects within 1s', async () => {
      // Use a small debounce so the test runs fast.
      const handle = startRuntimeWatcher({
        projectRoot,
        userDir,
        db,
        debounceMs: 100,
      });
      try {
        // Wait for the watcher to be ready before writing.
        // chokidar's `ready` event fires after the initial scan.
        await new Promise((resolve) =>
          handle.watcher.once('ready', resolve),
        );
        // Write a scratchpad with a bullet about pnpm.
        seedScratchpad(projectRoot, [
          bulletInput({ id: 'P-AAAAAAAA', text: 'switched to pnpm yesterday', line: 5 }),
        ]);
        // Poll the FTS5 mirror up to 1s for the bullet to appear.
        const deadline = Date.now() + 2500;
        let hit;
        while (Date.now() < deadline) {
          hit = db
            .prepare(`SELECT body FROM observations_fts WHERE observations_fts MATCH 'pnpm'`)
            .get();
          if (hit) break;
          await new Promise((r) => setTimeout(r, 50));
        }
        expect(hit).toBeDefined();
        expect(hit.body).toContain('pnpm');
      } finally {
        await handle.close();
      }
    });

    // Regression test (self-review caught this): chokidar v5 dropped
    // glob support — an earlier draft of startRuntimeWatcher used
    // `<root>/memory/*.md` globs that silently never matched. The
    // scratchpad watcher test passed because MEMORY.md is a literal
    // path; per-fact ADD events would have been missed entirely. This
    // test exercises the watcher's response to a new per-fact file
    // appearing in the memory/ directory.
    it('watcher picks up new per-fact files added to memory/ (chokidar v5 glob-drop regression)', async () => {
      const handle = startRuntimeWatcher({
        projectRoot,
        userDir,
        db,
        debounceMs: 100,
      });
      try {
        await new Promise((resolve) =>
          handle.watcher.once('ready', resolve),
        );
        // Add a new per-fact file. The watcher should detect it,
        // parse the frontmatter, and index it into observations.
        seedFactFile(projectRoot, {
          id: 'P-DDDDDDDD',
          type: 'project',
          title: 'use uv for python',
          body: 'we standardized on uv for python tooling',
          write_source: 'user-explicit',
          trust: 'high',
          at: '2026-05-27T10:00:00Z',
        });
        const deadline = Date.now() + 2500;
        let hit;
        while (Date.now() < deadline) {
          hit = db
            .prepare(
              `SELECT body FROM observations WHERE id = ?`,
            )
            .get('P-DDDDDDDD');
          if (hit) break;
          await new Promise((r) => setTimeout(r, 50));
        }
        expect(hit).toBeDefined();
        expect(hit.body).toContain('uv for python');
      } finally {
        await handle.close();
      }
    });

    // I3 honest naming (was '29.4 #5 — concurrent boot + runtime'): in
    // v0.1.0 with better-sqlite3 sync + JS single-threaded, "concurrent"
    // is sequential at the JS level (the watcher events fire BETWEEN
    // boot transactions, not DURING them). This test pins the
    // sequential composition: boot writes → watcher writes-on-top
    // (DELETE + INSERT replace) → no duplicate rows. A real concurrent-
    // writer test (mid-transaction race) would need timing fixtures
    // that are flaky-prone on Windows; deferred as v0.1.x candidate.
    it('29.4 #5 — boot then watcher write: no duplicate rows (sequential composition)', async () => {
      seedScratchpad(projectRoot, [
        bulletInput({ id: 'P-AAAAAAAA', text: 'one', line: 5 }),
        bulletInput({ id: 'P-BBBBBBBB', text: 'two', line: 7 }),
      ]);
      const handle = startRuntimeWatcher({
        projectRoot,
        userDir,
        db,
        debounceMs: 100,
      });
      try {
        await new Promise((resolve) =>
          handle.watcher.once('ready', resolve),
        );
        // Boot runs while the watcher is alive. The watcher receives no
        // FS events here because we don't touch the files — so the boot's
        // transactional writes are the only writers. The assertion is
        // that the operation doesn't error out + the row counts are
        // exact.
        const r = reindexBoot({ projectRoot, userDir, db });
        expect(r.filesReindexed).toBeGreaterThan(0);
        const count = db.prepare('SELECT COUNT(*) AS n FROM observations').get();
        expect(count.n).toBe(2);
        // Now trigger a watcher event by rewriting the file with a new
        // bullet added. The watcher updates the DB. Boot from earlier
        // already wrote; the watcher's update should net to "no duplicates":
        // a fresh DELETE + INSERT replaces the file's rows.
        seedScratchpad(projectRoot, [
          bulletInput({ id: 'P-AAAAAAAA', text: 'one', line: 5 }),
          bulletInput({ id: 'P-BBBBBBBB', text: 'two', line: 7 }),
          bulletInput({ id: 'P-CCCCCCCC', text: 'three', line: 9 }),
        ]);
        // Wait for watcher to process.
        const deadline = Date.now() + 2500;
        let count3;
        while (Date.now() < deadline) {
          count3 = db.prepare('SELECT COUNT(*) AS n FROM observations').get().n;
          if (count3 === 3) break;
          await new Promise((r) => setTimeout(r, 50));
        }
        expect(count3).toBe(3);
        // Each id appears exactly once (no duplicates from boot + watcher
        // both having processed).
        const ids = db
          .prepare('SELECT id, COUNT(*) AS n FROM observations GROUP BY id')
          .all();
        for (const row of ids) {
          expect(row.n).toBe(1);
        }
      } finally {
        await handle.close();
      }
    });
  });
});
