// @doors: 1, 2, 4
// Door 3 N/A: the keyword + deterministic-agentic pipelines spawn nothing; the
//   optional Haiku reformulator is exercised by the real `npm run bench:recall`
//   runs (results recorded in the DECISION-LOG), and its fusion contract is
//   locked here via an injected fake reformulator instead of a live spawn.
// Door 4: the benchmark's observability artifact is the JSON report (the
//   .bench-logs/ run record) — asserted in the keyword e2e (written + round-trips).
// Door 5 N/A: no message-queue interaction.

// Tests for Task 99 — the recall benchmark harness (scripts/bench-recall.mjs).
// The harness gives Task 65's bake-off a number to beat (D-70/D-72): R@5 /
// R@10 / NDCG@10 with a per-question-type breakdown, raw-vs-reranked reported
// separately. Boundary discipline: test the exported metric functions + the
// runBench() public contract (given fixtures, what report comes back and what
// JSON lands on disk) — not the internal seeding helpers.

import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  recallAtK,
  ndcgAtK,
  aggregate,
  buildSubQueries,
  fuseRankings,
  runBench,
} from '../scripts/bench-recall.mjs';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = join(dirname(__filename), '..');
const CORPUS_PATH = join(REPO_ROOT, 'fixtures', 'recall-bench', 'corpus.json');
const QUERIES_PATH = join(REPO_ROOT, 'fixtures', 'recall-bench', 'queries.json');

describe('Task 99 — metric functions (Door 1)', () => {
  it('recallAtK: fraction of relevant ids found in the top k', () => {
    expect(recallAtK(['a', 'b', 'c'], new Set(['c']), 2)).toBe(0);
    expect(recallAtK(['a', 'b', 'c'], new Set(['c']), 3)).toBe(1);
    expect(recallAtK(['a', 'b', 'c'], new Set(['a', 'x']), 3)).toBe(0.5);
    expect(recallAtK([], new Set(['a']), 5)).toBe(0);
  });

  it('ndcgAtK: 1.0 for relevant-at-rank-1; discounted by log2 below; 0 on miss', () => {
    expect(ndcgAtK(['rel', 'b', 'c'], new Set(['rel']), 10)).toBe(1);
    const atRank2 = ndcgAtK(['b', 'rel', 'c'], new Set(['rel']), 10);
    expect(atRank2).toBeCloseTo(1 / Math.log2(3), 6);
    expect(ndcgAtK(['b', 'c'], new Set(['rel']), 10)).toBe(0);
    expect(ndcgAtK([], new Set(['rel']), 10)).toBe(0);
  });

  it('aggregate: overall means + per-qtype breakdown (the D-72 per-type split)', () => {
    const perQuery = [
      { id: 'q1', qtype: 'exact', metrics: { 'r@5': 1, 'ndcg@10': 1 } },
      { id: 'q2', qtype: 'paraphrase', metrics: { 'r@5': 0, 'ndcg@10': 0 } },
      { id: 'q3', qtype: 'paraphrase', metrics: { 'r@5': 1, 'ndcg@10': 0.5 } },
    ];
    const agg = aggregate(perQuery);
    expect(agg.overall['r@5']).toBeCloseTo(2 / 3, 6);
    expect(agg.overall['ndcg@10']).toBeCloseTo(0.5, 6);
    expect(agg.byQtype.exact['r@5']).toBe(1);
    expect(agg.byQtype.paraphrase['r@5']).toBe(0.5);
    expect(agg.byQtype.paraphrase.count).toBe(2);
  });
});

describe('Task 99 — agentic-keyword reformulation (rung 0b, deterministic)', () => {
  it('buildSubQueries: full query first, then content tokens, no stopwords, deduped', () => {
    const subs = buildSubQueries('which package manager do we use');
    expect(subs[0]).toBe('which package manager do we use');
    expect(subs).toContain('package');
    expect(subs).toContain('manager');
    expect(subs).not.toContain('which');
    expect(subs).not.toContain('we');
    expect(new Set(subs).size).toBe(subs.length);
  });

  it('fuseRankings: RRF across sub-query result lists — a doc hit by many sub-queries outranks a single-list hit', () => {
    const lists = [
      ['a', 'b'],
      ['c', 'a'],
      ['a'],
    ];
    const fused = fuseRankings(lists);
    expect(fused[0]).toBe('a'); // present in all three lists
    expect(fused).toContain('b');
    expect(fused).toContain('c');
  });
});

describe('Task 99 — fixture integrity', () => {
  const corpus = JSON.parse(readFileSync(CORPUS_PATH, 'utf8'));
  const queries = JSON.parse(readFileSync(QUERIES_PATH, 'utf8'));

  it('corpus keys are unique and entries carry the seeding fields', () => {
    const keys = corpus.entries.map((e) => e.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const e of corpus.entries) {
      expect(['fact', 'bullet']).toContain(e.kind);
      expect(['P', 'U', 'L']).toContain(e.tier);
      if (e.kind === 'fact') {
        expect(e.title?.length).toBeGreaterThan(0);
        expect(e.body?.length).toBeGreaterThan(0);
      } else {
        expect(e.text?.length).toBeGreaterThan(0);
        expect(e.scratchpad?.length).toBeGreaterThan(0);
      }
    }
  });

  it('every query references existing corpus keys and has a qtype', () => {
    const keys = new Set(corpus.entries.map((e) => e.key));
    const ids = queries.queries.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const q of queries.queries) {
      expect(['paraphrase', 'exact', 'temporal', 'preference']).toContain(q.qtype);
      expect(q.relevant.length).toBeGreaterThan(0);
      for (const key of q.relevant) {
        expect(keys.has(key), `query ${q.id} references unknown corpus key ${key}`).toBe(true);
      }
    }
  });
});

describe('Task 99 — runBench() end-to-end (real seeding + FTS5, Doors 1+2)', () => {
  it('rejects an unknown pipeline with the available list (Door 1 error path)', async () => {
    await expect(runBench({ pipeline: 'nope', quiet: true })).rejects.toThrow(
      /unknown pipeline 'nope'.*keyword/,
    );
  });

  it('keyword pipeline: seeds the corpus, runs the queries, reports the documented shape; exact queries hit; JSON report written', async () => {
    const sandbox = mkdtempSync(join(tmpdir(), 'cmk-bench-'));
    try {
      const outPath = join(sandbox, 'report.json');
      const report = await runBench({
        corpusPath: CORPUS_PATH,
        queriesPath: QUERIES_PATH,
        pipeline: 'keyword',
        sandboxRoot: sandbox,
        outPath,
        quiet: true,
      });
      // Door 1 — report shape.
      expect(report.pipeline).toBe('keyword');
      expect(report.overall).toHaveProperty('r@5');
      expect(report.overall).toHaveProperty('r@10');
      expect(report.overall).toHaveProperty('ndcg@10');
      expect(report.byQtype).toHaveProperty('paraphrase');
      expect(report.perQuery.length).toBeGreaterThan(10);
      expect(report.corpusSize).toBeGreaterThan(30);
      // The exact-match floor: FTS5 must find single-keyword queries.
      const exact = report.byQtype.exact;
      expect(exact['r@5']).toBe(1);
      // Door 2 — the JSON report landed and round-trips.
      expect(existsSync(outPath)).toBe(true);
      const onDisk = JSON.parse(readFileSync(outPath, 'utf8'));
      expect(onDisk.overall['r@5']).toBe(report.overall['r@5']);
    } finally {
      rmSync(sandbox, { recursive: true, force: true });
    }
  }, 120_000);

  it('agentic pipeline (injected fake reformulator) fuses sub-query results — the rung-0b contract', async () => {
    const sandbox = mkdtempSync(join(tmpdir(), 'cmk-bench-ag-'));
    try {
      const report = await runBench({
        corpusPath: CORPUS_PATH,
        queriesPath: QUERIES_PATH,
        pipeline: 'agentic',
        // Injected reformulator (Door-3 contract lock without a live spawn):
        // emulate an LLM adding a synonym sub-query for the pnpm case.
        reformulate: (q) =>
          q === 'which package manager do we use' ? ['pnpm workspace installs'] : [],
        sandboxRoot: sandbox,
        quiet: true,
      });
      expect(report.pipeline).toBe('agentic');
      const pkg = report.perQuery.find((p) => p.id === 'q-pkg');
      // With the synonym sub-query fused in, the pnpm fact must be found.
      expect(pkg.metrics['r@5']).toBe(1);
      // Agentic must never score below plain keyword on the exact floor.
      expect(report.byQtype.exact['r@5']).toBe(1);
    } finally {
      rmSync(sandbox, { recursive: true, force: true });
    }
  }, 120_000);
});
