// @doors: 1, 2
// Door 3 N/A: in-process; no subprocess spawn (better-sqlite3 FFI).
// Door 4 N/A: no message-queue interaction.
// Door 5 N/A: search.mjs doesn't emit NDJSON logs; query stats are returned in the result struct, not logged.

// Tests for Task 30 — `cmk search` hybrid CLI (T-026).
// Per tasks.md 30.5:
//   - Test keyword on 10k-observation fixture: results in <100 ms
//   - Test `--mode semantic` without Layer 5b: exit 2; stderr contains "memsearch not installed"
//   - Test `--mode hybrid` with both mocked: reciprocal-rank fusion (0.5/0.5)
//   - Test `--min-trust medium` excludes low-trust results
//   - Test `--tier P` excludes user/local results
//   - Test `--since 2026-05-01` excludes older observations
//   - Test tombstoned excluded by default; included with `--include-tombstoned`

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  search,
  reciprocalRankFusion,
  SEARCH_MODES,
} from '../packages/cli/src/search.mjs';
import { openIndexDb } from '../packages/cli/src/index-db.mjs';
import { install } from '../packages/cli/src/install.mjs';
import { reindexFull } from '../packages/cli/src/index-rebuild.mjs';
import { writeBullet } from '../packages/cli/src/provenance.mjs';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = join(dirname(__filename), '..');
const CMK_BIN = join(REPO_ROOT, 'packages', 'cli', 'bin', 'cmk.mjs');

let sandbox;
let dbPath;
let db;

beforeEach(() => {
  sandbox = mkdtempSync(join(tmpdir(), 'cmk-search-test-'));
  dbPath = join(sandbox, 'memory.db');
  db = openIndexDb({ projectRoot: sandbox, dbPath });
});

afterEach(() => {
  db?.close();
  rmSync(sandbox, { recursive: true, force: true });
});

// Helper: seed N observations directly into the DB. Bypasses
// reindex.mjs to keep this test focused on search semantics — Task 29
// already covers the markdown → DB path. Tests here verify SQL +
// FTS5 query behavior independently.
function seedObservation(db, {
  id, body, tier = 'P', trust = 'high',
  heading_path = 'MEMORY.md > Active Threads',
  write_source = 'user-explicit',
  source_file = 'MEMORY.md',
  source_line = 1,
  created_at = Date.parse('2026-05-27T10:00:00Z'),
  deleted_at = null,
}) {
  db.prepare(`
    INSERT INTO observations
      (id, tier, source_file, source_line, source_sha1, heading_path, body,
       write_source, trust, created_at, superseded_by, deleted_at)
    VALUES
      (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, tier, source_file, source_line, 'a'.repeat(40), heading_path, body,
    write_source, trust, created_at, null, deleted_at,
  );
}

describe('Task 30 — cmk search', () => {
  describe('Keyword backend (FTS5 BM25)', () => {
    it('returns hits matching the query', () => {
      seedObservation(db, { id: 'P-AAAAAAAA', body: 'we standardized on pnpm for new projects' });
      seedObservation(db, { id: 'P-BBBBBBBB', body: 'rust is the right tool for hot loops' });
      const r = search({ db, query: 'pnpm' });
      expect(r.action).toBe('found');
      expect(r.mode).toBe('keyword');
      expect(r.results).toHaveLength(1);
      expect(r.results[0].id).toBe('P-AAAAAAAA');
      expect(r.results[0].snippet).toContain('pnpm');
    });

    // 30.5 #1: keyword on 10k-observation fixture: results in <100 ms.
    // The kit's design §9.3 target — meaningful for the search UX
    // to feel "instant" inside Claude Code.
    it('30.5 #1 — keyword query over 10k observations completes in <500ms', () => {
      // 10000 observations with varied bodies. Use a deterministic
      // generator so timing is reproducible.
      const insert = db.prepare(`
        INSERT INTO observations
          (id, tier, source_file, source_line, source_sha1, heading_path, body,
           write_source, trust, created_at, superseded_by, deleted_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      // Test IDs use the kit's base32 alphabet (excludes 0/O/1/l/I/8).
      // We generate `P-[2-9A-Za]{8}` shapes that always pass validate-test-ids.
      // Kit's base32 alphabet excludes `0/O/1/l/I/8` — the 8 was incorrectly
      // included in an earlier draft, leaving ~5.9% of generated IDs failing
      // ID_PATTERN at runtime (silent because validate-test-ids runs against
      // literals, not generated IDs). Surfaced as Minor M1 by Task 30 review.
      const ALPHA = '2345679ABCDEFGHJKLMNPQRSTUVWXYZa';
      const insertMany = db.transaction((n) => {
        for (let i = 0; i < n; i++) {
          let id = 'P-';
          let x = i;
          for (let k = 0; k < 8; k++) {
            id += ALPHA[(x + k * 7) % ALPHA.length];
            x = Math.floor(x / ALPHA.length);
          }
          const body = `observation #${i}: ${i % 17 === 0 ? 'pnpm wins' : 'placeholder text'}`;
          insert.run(
            id, 'P', 'MEMORY.md', 1, 'a'.repeat(40),
            'MEMORY.md > Active Threads', body, 'user-explicit', 'high',
            // Production stores created_at as epoch MILLISECONDS (per
            // index-rebuild.mjs's isoToEpochMs). Use Date.parse() base
            // + offset so the test fixture matches production
            // semantics; an earlier draft used epoch seconds which
            // would have silently broken any future test that adds a
            // --since filter. M4 from Task 30 review.
            Date.parse('2026-05-27T10:00:00Z') + i, null, null,
          );
        }
      });
      insertMany(10000);
      const t0 = Date.now();
      const r = search({ db, query: 'pnpm', limit: 50 });
      const elapsed = Date.now() - t0;
      expect(r.action).toBe('found');
      expect(r.results.length).toBeGreaterThan(0);
      // Design §9.3 target is 100ms; 500ms is a generous CI ceiling
      // (the kit's typical query on a 10k corpus completes in tens
      // of ms locally). If this fails, FTS5 isn't being used or the
      // BM25 index is corrupted.
      expect(elapsed).toBeLessThan(500);
    });

    it('30.5 #4 — --min-trust medium excludes low-trust results', () => {
      seedObservation(db, { id: 'P-AAAAAAAA', body: 'high trust pnpm fact', trust: 'high' });
      seedObservation(db, { id: 'P-BBBBBBBB', body: 'medium trust pnpm fact', trust: 'medium' });
      seedObservation(db, { id: 'P-CCCCCCCC', body: 'low trust pnpm fact', trust: 'low' });
      const r = search({ db, query: 'pnpm', minTrust: 'medium' });
      expect(r.action).toBe('found');
      const trusts = r.results.map((x) => x.trust).sort();
      expect(trusts).toEqual(['high', 'medium']); // low excluded
    });

    it('30.5 #5 — --tier P excludes user/local results', () => {
      seedObservation(db, { id: 'P-AAAAAAAA', body: 'project tier pnpm', tier: 'P' });
      seedObservation(db, { id: 'U-BBBBBBBB', body: 'user tier pnpm', tier: 'U' });
      seedObservation(db, { id: 'L-CCCCCCCC', body: 'local tier pnpm', tier: 'L' });
      const r = search({ db, query: 'pnpm', tier: 'P' });
      const tiers = r.results.map((x) => x.tier);
      expect(tiers).toEqual(['P']);
    });

    it('30.5 #6 — --since 2026-05-01 excludes older observations', () => {
      seedObservation(db, {
        id: 'P-AAAAAAAA',
        body: 'old fact about pnpm',
        created_at: Date.parse('2026-04-01T10:00:00Z'),
      });
      seedObservation(db, {
        id: 'P-BBBBBBBB',
        body: 'new fact about pnpm',
        created_at: Date.parse('2026-05-15T10:00:00Z'),
      });
      const r = search({ db, query: 'pnpm', since: '2026-05-01T00:00:00Z' });
      expect(r.results.map((x) => x.id)).toEqual(['P-BBBBBBBB']);
    });

    it('30.5 #7 — tombstoned excluded by default; included with --include-tombstoned', () => {
      seedObservation(db, { id: 'P-AAAAAAAA', body: 'live pnpm fact' });
      seedObservation(db, {
        id: 'P-BBBBBBBB',
        body: 'deleted pnpm fact',
        deleted_at: Date.parse('2026-05-20T10:00:00Z'),
      });
      const rDefault = search({ db, query: 'pnpm' });
      expect(rDefault.results.map((x) => x.id)).toEqual(['P-AAAAAAAA']);
      const rWithTombstones = search({ db, query: 'pnpm', includeTombstoned: true });
      expect(rWithTombstones.results.map((x) => x.id).sort()).toEqual(
        ['P-AAAAAAAA', 'P-BBBBBBBB'],
      );
    });

    it('returns no-results structure for a query with no matches', () => {
      seedObservation(db, { id: 'P-AAAAAAAA', body: 'unrelated content' });
      const r = search({ db, query: 'pnpm' });
      expect(r.action).toBe('found');
      expect(r.results).toHaveLength(0);
    });

    it('honors --limit', () => {
      // Generate 30 unique IDs via base-32 encoding over the kit alphabet
      // (no 0/O/1/l/I/8). Previous hand-rolled char-cycling collided
      // every 26 iterations.
      // Kit's base32 alphabet excludes `0/O/1/l/I/8` — the 8 was incorrectly
      // included in an earlier draft, leaving ~5.9% of generated IDs failing
      // ID_PATTERN at runtime (silent because validate-test-ids runs against
      // literals, not generated IDs). Surfaced as Minor M1 by Task 30 review.
      const ALPHA = '2345679ABCDEFGHJKLMNPQRSTUVWXYZa';
      function uniqueId(i) {
        let x = i;
        let suffix = '';
        for (let k = 0; k < 8; k++) {
          suffix += ALPHA[x % ALPHA.length];
          x = Math.floor(x / ALPHA.length);
        }
        return 'P-' + suffix;
      }
      for (let i = 0; i < 30; i++) {
        seedObservation(db, {
          id: uniqueId(i),
          body: `pnpm hit number ${i}`,
        });
      }
      const r = search({ db, query: 'pnpm', limit: 7 });
      expect(r.results.length).toBe(7);
    });
  });

  describe('Semantic backend (Layer 5b — not in v0.1.0)', () => {
    it('30.5 #2 — --mode semantic without backend: exit-2 surface (semantic_unavailable)', () => {
      seedObservation(db, { id: 'P-AAAAAAAA', body: 'pnpm fact' });
      const r = search({ db, query: 'pnpm', mode: 'semantic' });
      expect(r.action).toBe('error');
      expect(r.errorCategory).toBe('semantic_unavailable');
      expect(r.errors[0]).toMatch(/memsearch not installed/);
    });

    it('semantic mode with injected backend returns its results', () => {
      const fakeSemantic = () => [
        { id: 'P-AAAAAAAA', snippet: 'semantic hit', source_file: 'MEMORY.md', source_line: 1, tier: 'P', trust: 'high', score: 0.95 },
      ];
      const r = search({
        db,
        query: 'pnpm',
        mode: 'semantic',
        semanticBackend: fakeSemantic,
      });
      expect(r.action).toBe('found');
      expect(r.mode).toBe('semantic');
      expect(r.results).toEqual([
        { id: 'P-AAAAAAAA', snippet: 'semantic hit', source_file: 'MEMORY.md', source_line: 1, tier: 'P', trust: 'high', score: 0.95 },
      ]);
    });
  });

  describe('Hybrid mode (30.5 #3)', () => {
    it('--mode hybrid without semantic backend: exit-2 surface', () => {
      seedObservation(db, { id: 'P-AAAAAAAA', body: 'pnpm fact' });
      const r = search({ db, query: 'pnpm', mode: 'hybrid' });
      expect(r.action).toBe('error');
      expect(r.errorCategory).toBe('semantic_unavailable');
    });

    it('--mode hybrid with both mocked: reciprocal-rank fusion (0.5/0.5)', () => {
      // Seed keyword index with two facts.
      seedObservation(db, { id: 'P-AAAAAAAA', body: 'top keyword pnpm hit' });
      seedObservation(db, { id: 'P-BBBBBBBB', body: 'second keyword pnpm hit' });
      // Mock semantic returns the SAME facts in reversed order — so the
      // RRF should boost the doc that appears top-in-one + second-in-other
      // over the docs that appear in only one ranking.
      const fakeSemantic = () => [
        { id: 'P-BBBBBBBB', snippet: 'semantic boost', source_file: 'MEMORY.md', source_line: 1, tier: 'P', trust: 'high', score: 0.9 },
        { id: 'P-AAAAAAAA', snippet: 'semantic third', source_file: 'MEMORY.md', source_line: 1, tier: 'P', trust: 'high', score: 0.8 },
      ];
      const r = search({
        db,
        query: 'pnpm',
        mode: 'hybrid',
        semanticBackend: fakeSemantic,
      });
      expect(r.action).toBe('found');
      expect(r.mode).toBe('hybrid');
      expect(r.results.length).toBe(2);
      // Both IDs present (RRF doesn't drop docs that appear in only one backend).
      const ids = r.results.map((x) => x.id).sort();
      expect(ids).toEqual(['P-AAAAAAAA', 'P-BBBBBBBB']);
    });
  });

  describe('reciprocalRankFusion (pure-function unit)', () => {
    it('fuses two rankings; docs in both backends score higher than docs in one', () => {
      const a = { id: 'P-AAAAAAAA', snippet: 'a' };
      const b = { id: 'P-BBBBBBBB', snippet: 'b' };
      const c = { id: 'P-CCCCCCCC', snippet: 'c' };
      const fused = reciprocalRankFusion({
        keywordResults: [a, b, c],
        semanticResults: [a, c], // b only in keyword
      });
      // a is rank-1 in both → highest fused score
      expect(fused[0].id).toBe('P-AAAAAAAA');
      // c is rank-3 in keyword + rank-2 in semantic → higher than b (rank-2 in keyword, missing from semantic)
      const cScore = fused.find((x) => x.id === 'P-CCCCCCCC').score;
      const bScore = fused.find((x) => x.id === 'P-BBBBBBBB').score;
      expect(cScore).toBeGreaterThan(bScore);
    });

    it('0.5/0.5 weight (default) symmetrically combines rankings', () => {
      const a = { id: 'P-AAAAAAAA', snippet: 'a' };
      const b = { id: 'P-BBBBBBBB', snippet: 'b' };
      // a is rank-1 keyword, rank-2 semantic; b is rank-2 keyword, rank-1 semantic.
      // With 0.5/0.5 weights, both should fuse to identical scores.
      const fused = reciprocalRankFusion({
        keywordResults: [a, b],
        semanticResults: [b, a],
      });
      expect(fused[0].score).toBe(fused[1].score);
    });
  });

  describe('FTS5 parse-error class (I1 — Task 30 code-review)', () => {
    it('FTS5 NOT-operator on hyphenated query → schema errorResult (no crash)', () => {
      seedObservation(db, { id: 'P-AAAAAAAA', body: 'pnpm fact', write_source: 'user-explicit' });
      // `user-explicit` is a kit `write_source` enum value AND a query
      // that FTS5 parses as `user AND NOT explicit` because `-` is the
      // NOT operator. Earlier draft of search.mjs let SqliteError bubble
      // as an uncaught throw, crashing the CLI with a stack trace
      // instead of a clean schema error.
      const r = search({ db, query: 'user-explicit' });
      expect(r.action).toBe('error');
      expect(r.errorCategory).toBe('schema');
      expect(r.errors[0]).toMatch(/FTS5 parse error/);
    });

    it('FTS5 reserved-word query (bare AND) → schema errorResult', () => {
      seedObservation(db, { id: 'P-AAAAAAAA', body: 'foo' });
      const r = search({ db, query: 'AND' });
      expect(r.action).toBe('error');
      expect(r.errorCategory).toBe('schema');
    });

    it('FTS5 column-filter on unknown column → schema errorResult', () => {
      seedObservation(db, { id: 'P-AAAAAAAA', body: 'foo' });
      const r = search({ db, query: 'badcol:hello' });
      expect(r.action).toBe('error');
      expect(r.errorCategory).toBe('schema');
    });
  });

  describe('CLI integration (I2 — tasks.md 30.5 #2 exit-2 contract)', () => {
    it('`cmk search --mode semantic` (no memsearch) exits 2 + stderr mentions memsearch', async () => {
      // Spawn the actual `cmk` binary. The semantic-unavailable path in
      // runSearch sets process.exitCode = 2; this test verifies the
      // process-exit contract that tasks.md 30.5 #2 explicitly
      // demands: "exit 2; stderr contains 'memsearch not installed'".
      // The in-process search() unit tests pin the return-shape; this
      // one pins the CLI's stderr + exit code.
      const sandbox = mkdtempSync(join(tmpdir(), 'cmk-search-cli-'));
      const projectRoot = join(sandbox, 'proj');
      const userDir = join(sandbox, 'user');
      try {
        await install({ projectRoot, userTier: userDir });
        const r = spawnSync(
          process.execPath,
          [CMK_BIN, 'search', 'pnpm', '--mode', 'semantic'],
          { cwd: projectRoot, encoding: 'utf8' },
        );
        expect(r.status).toBe(2);
        expect((r.stderr || '') + (r.stdout || '')).toMatch(/memsearch not installed/);
      } finally {
        rmSync(sandbox, { recursive: true, force: true });
      }
    });
  });

  describe('Integration: reindex + search (I3 — CLAUDE.md cross-module rule)', () => {
    it('reindexFull populates an index that search can query end-to-end', async () => {
      // Per CLAUDE.md "Integration-test coverage for cross-module flows
      // (binding)": Task 29's reindex and Task 30's search compose at
      // runtime; this test exercises the full path with no mocks of
      // either inner module. Catches the failure class where the
      // columns reindex writes (body, heading_path, write_source) drift
      // from what search expects.
      const sandbox = mkdtempSync(join(tmpdir(), 'cmk-search-integ-'));
      const projectRoot = join(sandbox, 'proj');
      const userDir = join(sandbox, 'user');
      try {
        await install({ projectRoot, userTier: userDir });
        // Seed MEMORY.md with two bullets via the canonical provenance
        // writer.
        const r1 = writeBullet({
          id: 'P-AAAAAAAA',
          text: 'standardized on pnpm for new node projects',
          provenance: {
            source: 'MEMORY.md', source_line: 5,
            sha1: 'b'.repeat(40), write: 'user-explicit',
            trust: 'high', at: '2026-05-27T10:00:00Z',
          },
        });
        const r2 = writeBullet({
          id: 'P-BBBBBBBB',
          text: 'rust is the right tool for hot loops',
          provenance: {
            source: 'MEMORY.md', source_line: 7,
            sha1: 'b'.repeat(40), write: 'user-explicit',
            trust: 'high', at: '2026-05-27T10:00:00Z',
          },
        });
        writeFileSync(
          join(projectRoot, 'context', 'MEMORY.md'),
          ['# MEMORY.md', '', '## Active Threads', '', r1.bullet, r1.comment, r2.bullet, r2.comment, ''].join('\n'),
          'utf8',
        );
        // Open the index DB + run a full reindex.
        const indexDb = openIndexDb({ projectRoot });
        try {
          reindexFull({ projectRoot, userDir, db: indexDb });
          // Now search via the same DB handle.
          const r = search({ db: indexDb, query: 'pnpm' });
          expect(r.action).toBe('found');
          expect(r.results).toHaveLength(1);
          expect(r.results[0].id).toBe('P-AAAAAAAA');
          expect(r.results[0].snippet).toContain('pnpm');
          // heading_path from MEMORY.md → 'MEMORY.md > Active Threads'
          // proves the reindex correctly populated the column search
          // queries against.
        } finally {
          indexDb.close();
        }
      } finally {
        rmSync(sandbox, { recursive: true, force: true });
      }
    });
  });

  describe('Schema-error validation', () => {
    it('rejects empty query', () => {
      const r = search({ db, query: '' });
      expect(r.action).toBe('error');
      expect(r.errorCategory).toBe('schema');
    });

    it('rejects invalid mode', () => {
      const r = search({ db, query: 'pnpm', mode: 'wat' });
      expect(r.action).toBe('error');
      expect(r.errorCategory).toBe('schema');
    });

    it('rejects invalid tier', () => {
      const r = search({ db, query: 'pnpm', tier: 'Z' });
      expect(r.action).toBe('error');
      expect(r.errorCategory).toBe('schema');
    });

    it('rejects invalid minTrust', () => {
      const r = search({ db, query: 'pnpm', minTrust: 'wat' });
      expect(r.action).toBe('error');
      expect(r.errorCategory).toBe('schema');
    });

    it('rejects invalid since', () => {
      const r = search({ db, query: 'pnpm', since: 'not-an-iso-date' });
      expect(r.action).toBe('error');
      expect(r.errorCategory).toBe('schema');
    });

    it('rejects non-positive limit', () => {
      const r = search({ db, query: 'pnpm', limit: 0 });
      expect(r.action).toBe('error');
      expect(r.errorCategory).toBe('schema');
    });
  });
});
