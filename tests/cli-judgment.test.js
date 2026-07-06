// Task 191 — expectation pre-registration + judgment_*.md files (ADR-0017
// Phase 1b; D-252). The earned-judgment wedge: before acting on a recalled
// method, a one-line EXPECTED outcome is recorded; resolution (Task 192's
// signals) appends HIT/MISS/REVERSAL to the judgment's append-only evidence
// log. The memory written is the PREDICTION-ERROR — no oracle, no ritual.
//
// Honesty guards under test (the study's binding rules):
//   - vague expectations don't count (specificity gate)
//   - met predictions NUDGE, only misses LOCK
//   - a cycle (A>B, B>C, C>A) → contested, surfaced, never auto-picked
//   - a judgment EXPIRES (decays_after → the 66.1 expires machinery)
//
// Boundary: judgment.mjs (writeJudgment / appendJudgmentEvidence /
// readJudgments) + expectations.mjs (scanForPredictions / capturePredictions
// / readExpectations / resolveExpectation) + the captureTurn wire (the
// automatic path — no cmk command).
//
// @doors: 1, 2, 5
// Door 3 N/A: the captureTurn test stubs the auto-extract spawn (Task 23's surface).
// Door 4 N/A: no message queue.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, readFileSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  writeJudgment,
  appendJudgmentEvidence,
  readJudgments,
} from '../packages/cli/src/judgment.mjs';
import {
  scanForPredictions,
  capturePredictions,
  readExpectations,
  resolveExpectation,
  expectationsLogPath,
} from '../packages/cli/src/expectations.mjs';
import { captureTurn } from '../packages/cli/src/capture-turn.mjs';
import { parse } from '../packages/cli/src/frontmatter.mjs';

let sandbox;
let projectRoot;

beforeEach(() => {
  sandbox = mkdtempSync(join(tmpdir(), 'cmk-judgment-test-'));
  projectRoot = join(sandbox, 'proj');
  mkdirSync(join(projectRoot, 'context', 'memory'), { recursive: true });
});

afterEach(async () => {
  // The captureTurn test spawns a detached stub child that can briefly hold
  // the cwd on Windows (EPERM on immediate rm). Same drain-then-swallow
  // pattern as cli-capture-turn.test.js: give children a beat, and if the
  // handle persists, leave the tmp dir to the OS (fresh mkdtemp next test).
  await new Promise((res) => setTimeout(res, 300));
  try {
    rmSync(sandbox, { recursive: true, force: true });
  } catch {
    // background child still holds a handle — harmless
  }
});

function judgmentPath(slug) {
  return join(projectRoot, 'context', 'memory', `judgment_${slug}.md`);
}

function readFm(slug) {
  return parse(readFileSync(judgmentPath(slug), 'utf8'));
}

const BASE = {
  prefer: 'uv',
  over: 'pip',
  taskShape: 'python dependency install',
  confounds: ['time-drift'],
  outcomeHorizon: 'short',
  decaysAfter: '2027-01-01',
};

describe('Task 191 — writeJudgment (the safe-path judgment writer)', () => {
  it('writes judgment_<slug>.md with the study frontmatter via the writeFact path', () => {
    const r = writeJudgment({ projectRoot, ...BASE });
    expect(r.action).toBe('created');
    expect(r.path).toMatch(/judgment_/);

    const { frontmatter: fm, body } = readFm(r.slug);
    expect(fm.type).toBe('judgment');
    expect(fm.status).toBe('provisional');
    expect(fm.claim).toContain('uv');
    expect(fm.claim).toContain('pip');
    expect(fm.baseline).toBe('pip');
    expect(fm.prefer).toBe('uv');
    expect(fm.over).toBe('pip');
    expect(fm.n_episodes).toBe(1);
    expect(fm.direction_consistent).toBe(true);
    expect(fm.decays_after).toBe('2027-01-01');
    // decays_after RIDES the 66.1 expiry machinery — the mapping is the
    // "honored at search read" mechanism (hiding is 66's tested surface).
    expect(fm.expires_at).toBe('2027-01-01');
    expect(body).toContain('## Evidence');
    // INDEX updated by the shared writer (Door 2).
    const index = readFileSync(join(projectRoot, 'context', 'memory', 'INDEX.md'), 'utf8');
    expect(index).toContain('judgment');
  });

  it('screens through Poison_Guard — a secret in the claim never lands', () => {
    const r = writeJudgment({
      projectRoot,
      ...BASE,
      taskShape: 'deploys with AKIA' + 'IOSFODNN7EXAMPLE key',
    });
    expect(r.action).not.toBe('created');
    expect(existsSync(judgmentPath(r.slug ?? 'never'))).toBe(false);
  });
});

describe('Task 191 — appendJudgmentEvidence (the earned part)', () => {
  it('HIT appends an evidence line + bumps n_episodes; a SECOND judgment is untouched (over-mutation)', () => {
    const a = writeJudgment({ projectRoot, ...BASE });
    const b = writeJudgment({
      projectRoot, prefer: 'vitest', over: 'jest', taskShape: 'unit tests',
      decaysAfter: '2027-01-01',
    });

    const r = appendJudgmentEvidence({
      projectRoot,
      id: a.id,
      verdict: 'HIT',
      predicted: 'install completes < 5s',
      observed: 'completed in 2s',
      now: '2026-07-07T00:00:00Z',
    });
    expect(r.action).toBe('appended');

    const { frontmatter: fmA, body: bodyA } = readFm(a.slug);
    expect(fmA.n_episodes).toBe(2);
    expect(bodyA).toContain('HIT');
    expect(bodyA).toContain('install completes < 5s');

    const { frontmatter: fmB } = readFm(b.slug);
    expect(fmB.n_episodes).toBe(1); // untouched
  });

  it('three consistent episodes → corroborated (replication, not reinforcement)', () => {
    const a = writeJudgment({ projectRoot, ...BASE });
    appendJudgmentEvidence({ projectRoot, id: a.id, verdict: 'HIT', predicted: 'p1 specific enough', observed: 'o1' });
    expect(readFm(a.slug).frontmatter.status).toBe('provisional'); // 2 episodes — not yet
    appendJudgmentEvidence({ projectRoot, id: a.id, verdict: 'HIT', predicted: 'p2 specific enough', observed: 'o2' });
    expect(readFm(a.slug).frontmatter.status).toBe('corroborated'); // 3rd episode, all consistent
  });

  it('a MISS LOCKS: status → contested, direction_consistent false, and later HITs cannot re-promote', () => {
    const a = writeJudgment({ projectRoot, ...BASE });
    appendJudgmentEvidence({ projectRoot, id: a.id, verdict: 'MISS', predicted: 'p specific enough', observed: 'failed' });
    let fm = readFm(a.slug).frontmatter;
    expect(fm.status).toBe('contested');
    expect(fm.direction_consistent).toBe(false);

    appendJudgmentEvidence({ projectRoot, id: a.id, verdict: 'HIT', predicted: 'p2 specific enough', observed: 'ok' });
    appendJudgmentEvidence({ projectRoot, id: a.id, verdict: 'HIT', predicted: 'p3 specific enough', observed: 'ok' });
    fm = readFm(a.slug).frontmatter;
    expect(fm.status).toBe('contested'); // misses lock; hits only nudge
  });

  it('a REVERSAL (the strongest oracle-free negative) → contested immediately', () => {
    const a = writeJudgment({ projectRoot, ...BASE });
    appendJudgmentEvidence({ projectRoot, id: a.id, verdict: 'REVERSAL', observed: 'user reverted to pip next turn' });
    expect(readFm(a.slug).frontmatter.status).toBe('contested');
  });

  it('WEAK-POSITIVE (silent success) appends evidence but bumps NOTHING (nudge only, never a replication)', () => {
    const a = writeJudgment({ projectRoot, ...BASE });
    appendJudgmentEvidence({ projectRoot, id: a.id, verdict: 'WEAK-POSITIVE', observed: 'recalled + used, nothing fired' });
    const { frontmatter: fm, body } = readFm(a.slug);
    expect(fm.n_episodes).toBe(1); // unchanged
    expect(fm.status).toBe('provisional');
    expect(body).toContain('WEAK-POSITIVE');
  });

  it('a preference CYCLE (A>B, B>C, C>A) marks every judgment in the cycle contested — never auto-picked', () => {
    writeJudgment({ projectRoot, prefer: 'A', over: 'B', taskShape: 'shape-t', decaysAfter: '2027-01-01' });
    writeJudgment({ projectRoot, prefer: 'B', over: 'C', taskShape: 'shape-t', decaysAfter: '2027-01-01' });
    const c = writeJudgment({ projectRoot, prefer: 'C', over: 'A', taskShape: 'shape-t', decaysAfter: '2027-01-01' });
    expect(c.cycle).toBe(true);

    const all = readJudgments({ projectRoot });
    const inCycle = all.filter((j) => ['A', 'B', 'C'].includes(j.frontmatter.prefer));
    expect(inCycle).toHaveLength(3);
    for (const j of inCycle) expect(j.frontmatter.status).toBe('contested');
  });
});

describe('Task 191 — skill-review regression pins (B1/B2)', () => {
  it('B1: a CORRUPT judgment file (merge-conflict markers) is skipped — writes + evidence still work', () => {
    // parse() returns {frontmatter:null} on YAML failure; the reader must skip.
    writeFileSync(
      judgmentPath('corrupted'),
      ['---', '<<<<<<< HEAD', 'type: judgment', '=======', '>>>>>>> theirs', '---', 'body', ''].join('\n'),
      'utf8',
    );
    const r = writeJudgment({ projectRoot, ...BASE });
    expect(r.action).toBe('created'); // no TypeError from the null frontmatter
    const ev = appendJudgmentEvidence({ projectRoot, id: r.id, verdict: 'HIT', predicted: 'p specific enough', observed: 'o' });
    expect(ev.action).toBe('appended');
    expect(readJudgments({ projectRoot }).every((j) => j.frontmatter)).toBe(true);
  });

  it('B2: resolving the SAME expectation twice is a no-op — replication cannot be faked', () => {
    const a = writeJudgment({ projectRoot, ...BASE });
    capturePredictions(projectRoot, { text: 'PREDICTION: the install completes in under five seconds' });
    const [exp] = readExpectations(projectRoot, { pendingOnly: true });

    const r1 = resolveExpectation(projectRoot, { id: exp.id, verdict: 'HIT', judgmentId: a.id });
    expect(r1.action).toBe('resolved');
    const r2 = resolveExpectation(projectRoot, { id: exp.id, verdict: 'HIT', judgmentId: a.id });
    expect(r2.action).toBe('already-resolved');

    const fm = readFm(a.slug).frontmatter;
    expect(fm.n_episodes).toBe(2); // ONE real episode counted once, not inflated
    expect(fm.status).toBe('provisional'); // corroborated NOT faked
  });

  it('M4: prefer === over is rejected upfront', () => {
    const r = writeJudgment({ projectRoot, prefer: 'X', over: 'X', taskShape: 't', decaysAfter: '2027-01-01' });
    expect(r.action).toBe('error');
  });

  it('M2: a PREDICTION inside a fenced code block does NOT register', () => {
    const fenced = ['Here is the test:', '```js', '// PREDICTION: this fenced line must not count at all', '```', 'done'].join('\n');
    expect(scanForPredictions(fenced)).toHaveLength(0);
  });
});

describe('Task 191 — expectation pre-registration (the PREDICTION: pattern)', () => {
  it('scanForPredictions extracts specific predictions and REJECTS vague ones (the honesty gate)', () => {
    const text = [
      'Working on the refactor now.',
      'PREDICTION: the test suite completes in under 90 seconds after this change',
      'PREDICTION: works', // vague — must not count
      'PREDICTION: better', // vague
    ].join('\n');
    const found = scanForPredictions(text);
    expect(found).toHaveLength(1);
    expect(found[0]).toContain('90 seconds');
  });

  it('capturePredictions appends pending entries; readExpectations returns them; resolve marks WITHOUT touching others (over-mutation)', () => {
    capturePredictions(projectRoot, {
      text: 'PREDICTION: the build passes on the first try after the fix\nPREDICTION: memory usage stays below 100 MB during import',
      session: 'sess-1',
    });
    const pending = readExpectations(projectRoot, { pendingOnly: true });
    expect(pending).toHaveLength(2);

    const r = resolveExpectation(projectRoot, { id: pending[0].id, verdict: 'HIT' });
    expect(r.action).toBe('resolved');

    const after = readExpectations(projectRoot, { pendingOnly: true });
    expect(after).toHaveLength(1); // the other entry untouched
    expect(after[0].id).toBe(pending[1].id);
  });

  it('AUTOMATIC PATH: captureTurn captures a turn-embedded PREDICTION with no cmk command (hooks only)', () => {
    // Stub auto-extract so no real spawn leaves the sandbox.
    const stubPath = join(sandbox, 'stub.mjs');
    writeFileSync(stubPath, 'process.exit(0);\n', 'utf8');

    captureTurn({
      payload: {
        stop_hook_active: false,
        session_id: 'sess-hook-42',
        assistant_message:
          'Refactor done. PREDICTION: the nightly pipeline finishes without the OOM error tomorrow',
      },
      projectRoot,
      autoExtractPath: stubPath,
      now: '2026-07-07T01:00:00Z',
    });

    const pending = readExpectations(projectRoot, { pendingOnly: true });
    expect(pending).toHaveLength(1);
    expect(pending[0].text).toContain('OOM');
    // M3 (skill-review): assert the REAL session attribution, not a vacuous
    // null-passes check — the Stop payload's session_id must ride through.
    expect(pending[0].session).toBe('sess-hook-42');
  });

  it('capture never scaffolds a non-kit project (the M8 class) and never throws on a broken root', () => {
    const bare = join(sandbox, 'bare');
    mkdirSync(bare, { recursive: true });
    expect(() => {
      capturePredictions(bare, { text: 'PREDICTION: something specific happens with numbers 42' });
    }).not.toThrow();
    expect(existsSync(join(bare, 'context'))).toBe(false);
  });
});
