// @doors: 1, 2
// Door 2 is read-only state: search mutates nothing (covered by the shared
//   search suites); this file pins the RESULT SHAPE (Door 1) + the CLI line.
// Door 3 N/A: no subprocess, no LLM — keyword search over the local index.
// Door 4 N/A: no message-queue interaction.
// Door 5 N/A: search writes no NDJSON log on the read path.

// Tests for Task 227 — recall citation completeness (D-326): a good recall
// answer reads "here's what was said, here's WHEN, here's WHERE it lives".
// The kit was ~80% there (heading_path + path + line existed in the index);
// the DATE was never surfaced and fact hits didn't expose their heading.
// Plus the honesty path: nothing-found must say so plainly.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { install } from '../packages/cli/src/install.mjs';
import { openIndexDb } from '../packages/cli/src/index-db.mjs';
import { reindexBoot } from '../packages/cli/src/index-rebuild.mjs';
import { search, enrichFactCitations, enrichTranscriptDates } from '../packages/cli/src/search.mjs';
import { semanticRowPassesFilters } from '../packages/cli/src/semantic-backend.mjs';
import { rememberRich } from '../packages/cli/src/remember-core.mjs';

let sandbox;
let projectRoot;
let userDir;

function withDb(fn) {
  const db = openIndexDb({ projectRoot });
  try {
    reindexBoot({ projectRoot, userDir, db });
    return fn(db);
  } finally {
    db.close();
  }
}

beforeEach(() => {
  sandbox = mkdtempSync(join(tmpdir(), 'cmk-cite-'));
  projectRoot = join(sandbox, 'proj');
  userDir = join(sandbox, 'user-tier');
  mkdirSync(projectRoot, { recursive: true });
  install({ projectRoot, userTier: userDir, skipClaudeFiles: true, noHooks: true, noSemantic: true });
});

afterEach(() => {
  rmSync(sandbox, { recursive: true, force: true });
});

describe('the full citation shape on a facts hit (id + date + heading + path)', () => {
  it('a fact hit carries an ISO date (from created_at) and its heading_path', () => {
    const w = rememberRich(
      'The gateway retries idempotent calls three times',
      { type: 'project', title: 'Gateway retry policy' },
      { projectRoot },
    );
    expect(w.id).toBeTruthy();

    withDb((db) => {
      const r = search({ db, query: 'gateway retries idempotent', projectRoot });
      expect(r.results.length).toBeGreaterThan(0);
      const hit = r.results.find((x) => x.id === w.id);
      expect(hit).toBeTruthy();
      // WHEN: the date, ISO yyyy-mm-dd, derived from the fact's created_at.
      expect(hit.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      // WHERE: the heading (fact rows expose their heading_path now —
      // `<basename> > <type>` per the index contract, index-rebuild.mjs).
      expect(hit.heading).toContain('gateway-retry-policy');
      expect(hit.heading).toContain('> project');
      // The pre-existing citation halves stay intact.
      expect(hit.source_file).toContain('memory/');
      expect(hit.source_line).toBeGreaterThan(0);
    });
  });

  it('a transcript-scope hit derives its date from the day-file name; undated files carry null', () => {
    const sess = join(projectRoot, 'context', 'sessions');
    writeFileSync(join(sess, 'today-2026-06-07.md'), '## Decisions\n- DATED-HIT decided here\n', 'utf8');
    writeFileSync(join(sess, 'recent.md'), '## 2026-06-01\n- UNDATED-FILE-HIT consolidated\n', 'utf8');

    withDb((db) => {
      const dated = search({ db, query: 'DATED-HIT decided', scope: 'transcripts', projectRoot });
      const dHit = dated.results.find((x) => String(x.source_file).includes('today-2026-06-07'));
      expect(dHit).toBeTruthy();
      expect(dHit.date).toBe('2026-06-07');

      const undated = search({ db, query: 'UNDATED-FILE-HIT consolidated', scope: 'transcripts', projectRoot });
      const uHit = undated.results.find((x) => String(x.source_file).includes('recent.md'));
      expect(uHit).toBeTruthy();
      expect(uHit.date).toBeNull();
    });
  });
});

describe('enrichFactCitations — the semantic/hybrid seam (the live-test "—" bug)', () => {
  it('stamps date + heading onto rows that arrived WITHOUT them (the semantic-backend row shape)', () => {
    const w = rememberRich(
      'Hybrid rows must carry citations too',
      { type: 'project', title: 'Hybrid citation coverage' },
      { projectRoot },
    );
    withDb((db) => {
      // Simulate what reciprocalRankFusion hands back when the SEMANTIC
      // backend surfaced the row: no date, no heading (the first cut only
      // mapped the keyword path and every hybrid hit printed "—" live).
      const bare = [{ id: w.id, snippet: 'x', source_file: 'context/memory/whatever.md', source_line: 1, tier: 'P', trust: 'high', score: -1 }];
      enrichFactCitations(db, bare);
      expect(bare[0].date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(bare[0].heading).toContain('hybrid-citation-coverage');
      // A defensive unknown id keeps nulls, never throws.
      const unknown = [{ id: 'P-QQQQQQQQ', snippet: 'y', score: -1 }];
      enrichFactCitations(db, unknown);
      expect(unknown[0].date).toBeNull();
      expect(unknown[0].heading).toBeNull();
    });
  });
});

describe('enrichTranscriptDates — the transcripts-scope semantic seam (skill-review I1)', () => {
  it('stamps the day-file date onto semantic-shaped transcript rows; keyword-stamped rows untouched', () => {
    const rows = [
      // The semantic transcript backend's shape — no date field.
      { id: 'T:context/sessions/today-2026-06-09.md:3', snippet: 'x', source_file: 'context/sessions/today-2026-06-09.md', source_line: 3, heading: '## Decisions', score: 0.9 },
      // A keyword-side row that already carries its date — must not change.
      { id: 'T:context/sessions/recent.md:2', snippet: 'y', source_file: 'context/sessions/recent.md', source_line: 2, heading: '## 2026-06-01', date: null, score: 0.8 },
    ];
    enrichTranscriptDates(rows);
    expect(rows[0].date).toBe('2026-06-09');
    expect(rows[1].date).toBeNull();
  });
});

describe('semanticRowPassesFilters — the since filter actually filters (pre-existing ×1000 bug)', () => {
  it('a row older than --since is excluded in semantic mode (created_at is epoch MS, not seconds)', () => {
    const old = { created_at: Date.parse('2026-01-05T00:00:00Z'), deleted_at: null, expires_at: null, tier: 'P', trust: 'high' };
    const fresh = { created_at: Date.parse('2026-07-01T00:00:00Z'), deleted_at: null, expires_at: null, tier: 'P', trust: 'high' };
    const opts = { since: '2026-06-01' };
    // The old `created_at * 1000` made every row pass; ms-to-ms compares now.
    expect(semanticRowPassesFilters(old, opts)).toBe(false);
    expect(semanticRowPassesFilters(fresh, opts)).toBe(true);
    // The neighboring filters keep their semantics.
    expect(semanticRowPassesFilters({ ...fresh, deleted_at: 123 }, {})).toBe(false);
    expect(semanticRowPassesFilters({ ...fresh, tier: 'U' }, { tier: 'P' })).toBe(false);
    expect(semanticRowPassesFilters({ ...fresh, trust: 'low' }, { minTrust: 'high' })).toBe(false);
  });
});

describe('the nothing-found honesty path', () => {
  it('an empty result set returns found-nothing cleanly (no throw, no fabricated rows)', () => {
    withDb((db) => {
      const r = search({ db, query: 'zxqv-nonexistent-topic-qvxz', projectRoot });
      expect(r.results).toEqual([]);
    });
  });
});
