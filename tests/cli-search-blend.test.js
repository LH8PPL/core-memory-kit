// @doors: 1, 2, 3
// Door 3: the live cold-open test spawns the REAL cmk bin (remember → search)
//         against a sandboxed project — the automated half of the Task-194
//         "dampened fact ranks below a healthy one" live gate.
// Door 4 N/A: no message-queue interaction.
// Door 5 N/A: the blend is pure ranking arithmetic — no NDJSON log of its own
//             (the recall-log entry search() writes is pinned in cli-recall-log
//             tests; the trust-signal increments feeding the gate are pinned in
//             cli-prune-queue.test.js Door 5).

// Task 194 — the confidence-gated SEARCH blend (ADR-0017 Phase 2; design §20.3
// amendment; D-252/D-309).
//
// The single edit that turns `trust_score` from decorative into load-bearing:
//   blended = bm25_rank × (1 + λ·(trust_score − NEUTRAL))   [facts scope only]
// applied ONLY when the fact carries enough OUTCOME EVIDENCE
// (signal_count ≥ BLEND_MIN_SIGNALS — the confidence gate), and NEVER to
// judgment files (type=judgment ⇒ source_file basename judgment_*.md).
//
// Precedent: Memoria's `final_score *= (1 + w·(useful − …)).clamp(0.5, 2.0)`
// (the 2026-07-01 failure-learning survey — the cleanest retrieval-integrated
// oracle-free template) adapted to FTS5's negative-better BM25 rank.
//
// The gate resolves ADR-0017's open seam: recurrence/restatement lives in the
// SEED (initTrustScore's capped recurrenceTerm), never in signal_count — so
// restatement can't buy ranking boosts the way an outcome signal does.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  search,
  blendTrustScore,
  BLEND_LAMBDA,
  BLEND_MIN_SIGNALS,
  BLEND_NEUTRAL,
} from '../packages/cli/src/search.mjs';
import { openIndexDb } from '../packages/cli/src/index-db.mjs';
import { applyTrustSignal } from '../packages/cli/src/trust-signal.mjs';
import { TRUST_SCORE_FLOOR } from '../packages/cli/src/trust-score.mjs';

let sandbox;
let db;

beforeEach(() => {
  sandbox = mkdtempSync(join(tmpdir(), 'cmk-blend-test-'));
  // context/ so applyTrustSignal's screen + logs have a home when used.
  mkdirSync(join(sandbox, 'context', '.locks'), { recursive: true });
  db = openIndexDb({ projectRoot: sandbox });
});

afterEach(() => {
  db?.close();
  rmSync(sandbox, { recursive: true, force: true });
});

function seedObservation(db, {
  id, body, tier = 'P', trust = 'high',
  heading_path = 'MEMORY.md > Active Threads',
  write_source = 'user-explicit',
  source_file = 'MEMORY.md',
  source_line = 1,
  created_at = Date.parse('2026-07-01T10:00:00Z'),
  trust_score = 0.5,
  signal_count = 0,
}) {
  db.prepare(`
    INSERT INTO observations
      (id, tier, source_file, source_line, source_sha1, heading_path, body,
       write_source, trust, trust_score, signal_count, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, tier, source_file, source_line, 'a'.repeat(40), heading_path, body,
    write_source, trust, trust_score, signal_count, created_at,
  );
}

describe('Task 194 — blendTrustScore (the pure arithmetic)', () => {
  it('gate CLOSED (signal_count < BLEND_MIN_SIGNALS): rank passes through unchanged', () => {
    // The confidence gate: a score with no outcome evidence NEVER moves rank —
    // at-cap/over-cap pair for the BLEND_MIN_SIGNALS budget (design §17.10).
    const rank = -3.2;
    expect(blendTrustScore({ score: rank, trustScore: 0.05, signalCount: 0 })).toBe(rank);
    expect(blendTrustScore({ score: rank, trustScore: 0.95, signalCount: BLEND_MIN_SIGNALS - 1 })).toBe(rank);
  });

  it('gate OPEN at exactly BLEND_MIN_SIGNALS (at-cap): the trust term applies', () => {
    const rank = -3.2;
    const blended = blendTrustScore({ score: rank, trustScore: 0.05, signalCount: BLEND_MIN_SIGNALS });
    expect(blended).not.toBe(rank);
    // Dampened (below neutral) → rank shrinks toward 0 → WORSE (FTS5 negative-better).
    expect(blended).toBeGreaterThan(rank);
  });

  it('dampened fact worsens, reinforced fact improves (sign-aware for negative-better BM25)', () => {
    const rank = -5;
    const dampened = blendTrustScore({ score: rank, trustScore: TRUST_SCORE_FLOOR, signalCount: 4 });
    const reinforced = blendTrustScore({ score: rank, trustScore: 0.95, signalCount: 4 });
    expect(dampened).toBeGreaterThan(rank); // toward 0 = worse
    expect(reinforced).toBeLessThan(rank); // more negative = better
  });

  it('neutral trust_score is a no-op even past the gate', () => {
    const rank = -2;
    expect(blendTrustScore({ score: rank, trustScore: BLEND_NEUTRAL, signalCount: 10 })).toBe(rank);
  });

  it('judgments NEVER rank: a judgment_*.md source_file is excluded even with full evidence', () => {
    // ADR-0017 Decision #1 — facts may enter a ranking blend; judgments never
    // auto-rank. Checkable via the writeFact filename convention (type_slug.md).
    const rank = -4;
    expect(
      blendTrustScore({
        score: rank,
        trustScore: 0.05,
        signalCount: 10,
        sourceFile: 'context/memory/judgment_prefer-vitest-over-jest.md',
      }),
    ).toBe(rank);
    // …and a plain fact file at the same evidence DOES blend (the contrast).
    expect(
      blendTrustScore({
        score: rank,
        trustScore: 0.05,
        signalCount: 10,
        sourceFile: 'context/memory/project_deploy-target.md',
      }),
    ).not.toBe(rank);
  });

  it('the multiplier is bounded: λ·(trust−neutral) stays within ±λ·0.45 (never lets junk leapfrog a strong match)', () => {
    // trust_score ∈ [0.05, 0.95] ⇒ max fractional adjustment = λ·0.45.
    const rank = -10;
    const maxBoost = blendTrustScore({ score: rank, trustScore: 0.95, signalCount: 5 });
    const maxPenalty = blendTrustScore({ score: rank, trustScore: 0.05, signalCount: 5 });
    const bound = Math.abs(rank) * BLEND_LAMBDA * 0.45 + 1e-9;
    expect(Math.abs(maxBoost - rank)).toBeLessThanOrEqual(bound);
    expect(Math.abs(maxPenalty - rank)).toBeLessThanOrEqual(bound);
  });
});

describe('Task 194 — search() integration (facts scope)', () => {
  it('a dampened-with-evidence fact ranks BELOW an equally-matching healthy fact', () => {
    // The Done-when cold-open shape: same query, equal BM25 signal, the fact
    // the loop dampened (3 outcome signals, floored score) sorts after the
    // healthy one.
    seedObservation(db, {
      id: 'P-DAMPNED2', body: 'deploy target is vercel for this project',
      trust_score: TRUST_SCORE_FLOOR, signal_count: 3,
    });
    seedObservation(db, {
      id: 'P-HEALTHY2', body: 'deploy target is hetzner for this project',
      trust_score: 0.5, signal_count: 0,
    });
    const r = search({ db, query: 'deploy target project' });
    expect(r.action).toBe('found');
    const ids = r.results.map((x) => x.id);
    expect(ids).toContain('P-DAMPNED2');
    expect(ids).toContain('P-HEALTHY2');
    expect(ids.indexOf('P-HEALTHY2')).toBeLessThan(ids.indexOf('P-DAMPNED2'));
  });

  it('WITHOUT evidence the same dampened score does NOT re-rank (the confidence gate, end-to-end)', () => {
    // Identical bodies modulo the discriminating word; equal BM25 profile.
    seedObservation(db, {
      id: 'P-NEVDNCE2', body: 'build tool choice alpha for the pipeline',
      trust_score: TRUST_SCORE_FLOOR, signal_count: BLEND_MIN_SIGNALS - 1,
      source_line: 1,
    });
    seedObservation(db, {
      id: 'P-NEVDNCB2', body: 'build tool choice beta for the pipeline',
      trust_score: 0.5, signal_count: 0,
      source_line: 2,
    });
    const r = search({ db, query: 'build tool choice pipeline' });
    // Gate closed for both → pure BM25. The two rows carry identical bodies
    // modulo one word → identical BM25 → identical returned scores: the
    // low-trust_score row's rank was NOT touched. (Score equality, not row
    // order — SQL tie order is not guaranteed.)
    const byId = Object.fromEntries(r.results.map((x) => [x.id, x.score]));
    expect(byId['P-NEVDNCE2']).toBe(byId['P-NEVDNCB2']);
  });

  it('a reinforced fact overtakes an equal-BM25 neutral fact', () => {
    seedObservation(db, {
      id: 'P-NEUTRAL7', body: 'linting uses config profile one here',
      trust_score: 0.5, signal_count: 0, source_line: 1,
    });
    seedObservation(db, {
      id: 'P-STRNGRR7', body: 'linting uses config profile two here',
      trust_score: 0.9, signal_count: 4, source_line: 2,
    });
    const r = search({ db, query: 'linting config profile' });
    expect(r.results.map((x) => x.id)).toEqual(['P-STRNGRR7', 'P-NEUTRAL7']);
  });

  it('a dampened judgment file does NOT re-rank (judgments never enter the blend)', () => {
    seedObservation(db, {
      id: 'P-JUDGMNT4', body: 'prefer approach gamma for migrations work',
      source_file: 'context/memory/judgment_prefer-gamma.md',
      trust_score: TRUST_SCORE_FLOOR, signal_count: 5, source_line: 1,
    });
    seedObservation(db, {
      id: 'P-FACTRWW4', body: 'prefer approach delta for migrations work',
      trust_score: 0.5, signal_count: 0, source_line: 2,
    });
    const r = search({ db, query: 'prefer approach migrations' });
    // The judgment's rank is untouched: identical BM25 bodies → its returned
    // score equals the unblended fact's (score equality, not row order).
    const byId = Object.fromEntries(r.results.map((x) => [x.id, x.score]));
    expect(byId['P-JUDGMNT4']).toBe(byId['P-FACTRWW4']);
  });

  it('blend survives the limit: a dampened row is re-ranked, not dropped (never-lose-memory)', () => {
    seedObservation(db, {
      id: 'P-DAMPNED3', body: 'cache layer sits on redis for sessions',
      trust_score: TRUST_SCORE_FLOOR, signal_count: 3, source_line: 1,
    });
    seedObservation(db, {
      id: 'P-HEALTHY3', body: 'cache layer sits on memcached for sessions',
      trust_score: 0.5, signal_count: 0, source_line: 2,
    });
    const r = search({ db, query: 'cache layer sessions', limit: 2 });
    expect(r.results).toHaveLength(2);
    expect(r.results.map((x) => x.id)).toContain('P-DAMPNED3');
  });
});

describe('Task 194 — signal_count (the feedback counter, SYSTEM-MAP §6)', () => {
  it('an APPLIED signal increments signal_count; the counter is the confidence-gate evidence', () => {
    seedObservation(db, { id: 'P-KAUNTED9', body: 'counter target fact' });
    db.close(); // applyTrustSignal opens its own handle on projectRoot
    for (let i = 0; i < 3; i++) {
      const r = applyTrustSignal({ projectRoot: sandbox, id: 'P-KAUNTED9', event: 'dampen' });
      expect(r.action).toBe('updated');
    }
    db = openIndexDb({ projectRoot: sandbox });
    const row = db.prepare('SELECT trust_score, signal_count FROM observations WHERE id = ?').get('P-KAUNTED9');
    expect(row.signal_count).toBe(3);
    expect(row.trust_score).toBeCloseTo(TRUST_SCORE_FLOOR, 5);
  });

  it('a not-found / skipped signal does NOT consume the counter (over-mutation guard)', () => {
    seedObservation(db, { id: 'P-UNTUCHD2', body: 'bystander fact stays at zero' });
    db.close();
    applyTrustSignal({ projectRoot: sandbox, id: 'P-MSSNG299', event: 'dampen' }); // not-found
    applyTrustSignal({ projectRoot: sandbox, id: 'P-UNTUCHD2', event: 'bogus' }); // skipped
    db = openIndexDb({ projectRoot: sandbox });
    const row = db.prepare('SELECT signal_count FROM observations WHERE id = ?').get('P-UNTUCHD2');
    expect(row.signal_count).toBe(0);
  });

  it('migration: a legacy DB without signal_count gets the column on open (rows intact)', () => {
    // Build a pre-194 shaped DB by hand, then reopen through openIndexDb.
    const legacyDir = mkdtempSync(join(tmpdir(), 'cmk-blend-legacy-'));
    try {
      const legacy = openIndexDb({ projectRoot: legacyDir });
      legacy.prepare('ALTER TABLE observations DROP COLUMN signal_count').run();
      legacy.prepare(`
        INSERT INTO observations
          (id, tier, source_file, source_line, source_sha1, heading_path, body,
           write_source, trust, created_at)
        VALUES ('P-LEGACYR2', 'P', 'MEMORY.md', 1, '${'b'.repeat(40)}', 'MEMORY.md > Active Threads',
                'a legacy row survives the migration', 'user-explicit', 'high', 1750000000000)
      `).run();
      legacy.close();
      const reopened = openIndexDb({ projectRoot: legacyDir });
      const row = reopened
        .prepare('SELECT signal_count, body FROM observations WHERE id = ?')
        .get('P-LEGACYR2');
      reopened.close();
      expect(row.signal_count).toBe(0);
      expect(row.body).toContain('legacy row survives');
    } finally {
      rmSync(legacyDir, { recursive: true, force: true });
    }
  });
});

describe('Task 194 — live cold-open (the REAL bin, end-to-end)', () => {
  // The Done-when live gate, automated (the D-313 live-test-parity posture):
  // real `cmk remember` writes through the real safe path, the loop's own
  // applyTrustSignal dampens one fact to the floor with evidence, and the
  // REAL `cmk search` bin — the exact surface an agent drives — returns the
  // healthy fact first. No manual command anywhere in the ranking path
  // (search's per-read reindexBoot picks the facts up; the automatic-path
  // criterion).
  it('a dampened fact ranks below a healthy one for the same query, via the real cmk bin', async () => {
    const { spawnSync } = await import('node:child_process');
    const { fileURLToPath } = await import('node:url');
    const { dirname } = await import('node:path');
    const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
    const CMK_BIN = join(REPO_ROOT, 'packages', 'cli', 'bin', 'cmk.mjs');
    const { install } = await import('../packages/cli/src/install.mjs');

    const projectRoot = mkdtempSync(join(tmpdir(), 'cmk-blend-live-'));
    const userDir = join(projectRoot, 'user-tier');
    try {
      install({ projectRoot, userDir, silent: true });
      const env = { ...process.env, MEMORY_KIT_USER_DIR: userDir };
      const run = (args) =>
        spawnSync(process.execPath, [CMK_BIN, ...args], {
          cwd: projectRoot,
          env,
          encoding: 'utf8',
          timeout: 60_000,
        });

      const r1 = run(['remember', 'deploy target is vercel for this project']);
      const r2 = run(['remember', 'deploy target is hetzner for this project']);
      expect(r1.status, r1.stderr).toBe(0);
      expect(r2.status, r2.stderr).toBe(0);

      // Warm the search DB via a real read — the CLI's per-read reindexBoot
      // (`cmk reindex` rebuilds the INDEX.md catalog, not the search DB) —
      // then dampen the vercel fact through the loop's own signal gate
      // (3 applied outcome signals = floored score + open gate).
      const warm = run(['search', 'deploy target project']);
      expect(warm.status, warm.stderr).toBe(0);
      const dbFind = openIndexDb({ projectRoot });
      const vercel = dbFind
        .prepare("SELECT id FROM observations WHERE body LIKE '%vercel%'")
        .get();
      dbFind.close();
      expect(vercel).toBeTruthy();
      for (let i = 0; i < 3; i++) {
        const s = applyTrustSignal({ projectRoot, id: vercel.id, event: 'dampen' });
        expect(s.action).toBe('updated');
      }

      const sr = run(['search', 'deploy target project']);
      expect(sr.status, sr.stderr).toBe(0);
      const hetznerAt = sr.stdout.indexOf('hetzner');
      const vercelAt = sr.stdout.indexOf('vercel');
      expect(hetznerAt).toBeGreaterThan(-1);
      expect(vercelAt).toBeGreaterThan(-1);
      expect(hetznerAt).toBeLessThan(vercelAt);
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  }, 120_000);
});

describe('Task 194 — inject hot path UNTOUCHED (the §20.3 regression pin)', () => {
  it('inject-context never imports the index-db / search / trust-score modules', async () => {
    // §20.3's actual concern: the 500ms SessionStart inject path must never
    // open the index DB or rank by score — enum-ordered, always. Structural
    // pin: the module's import graph carries none of the ranking machinery.
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(
      new URL('../packages/cli/src/inject-context.mjs', import.meta.url),
      'utf8',
    );
    expect(src).not.toMatch(/from '\.\/index-db\.mjs'/);
    expect(src).not.toMatch(/from '\.\/search\.mjs'/);
    expect(src).not.toMatch(/from '\.\/trust-score\.mjs'/);
    // (No raw `trust_score` string check — inject-context.mjs legitimately
    // MENTIONS it in the D-238 decision-trail comment explaining exactly why
    // the score stays off this path. The import graph is the structural pin.)
  });
});
