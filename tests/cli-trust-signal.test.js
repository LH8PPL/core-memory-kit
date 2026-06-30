// @doors: 1, 2
// Door 3 N/A: in-process — better-sqlite3, no subprocess spawn.
// Door 4 N/A: best-effort overlay update; the SIGNAL events (recurrence /
//   persona-supersede / queued) already carry their own audit entries at the
//   call sites — this helper is a side-effect on the rebuildable index, not a
//   new auditable operation.
// Door 5 N/A: no message-queue interaction.
//
// Tests for Task 151.8 — applyTrustSignal: the EVENT -> trust_score side-effect
// (ADR-0016 §20.2). The three passive signals (contradiction / supersession /
// re-surface) move a fact's trust_score in the REBUILDABLE index via the pure
// 151.7 updateTrustScore. It is BEST-EFFORT — a trust nudge must never break the
// primary write — and a RUNTIME OVERLAY (the index is a regenerable read-cache;
// a full reindex reseeds from the committed enum; the deltas are local protection
// state, not portable data — the committed `trust` enum is the portable signal).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openIndexDb } from '../packages/cli/src/index-db.mjs';
import { applyTrustSignal } from '../packages/cli/src/trust-signal.mjs';
import {
  REINFORCE_DELTA,
  DAMPEN_DELTA,
  TRUST_SCORE_FLOOR,
} from '../packages/cli/src/trust-score.mjs';
import { install } from '../packages/cli/src/install.mjs';
import { writeFact } from '../packages/cli/src/write-fact.mjs';
import { memoryWrite } from '../packages/cli/src/memory-write.mjs';
import { reindexBoot } from '../packages/cli/src/index-rebuild.mjs';
import { mergeFacts } from '../packages/cli/src/merge-facts.mjs';

let sandbox;
let projectRoot;

// Seed one observation row with a known trust_score, return the row's id.
function seedObservation(db, { id, trust_score = 0.5 }) {
  db.prepare(
    `INSERT INTO observations
      (id, tier, source_file, source_line, source_sha1, heading_path, body,
       write_source, trust, trust_score, created_at, superseded_by, deleted_at)
     VALUES (@id,'P','context/memory/x.md',1,'abc','§','body','user-explicit','high',@ts,1000,NULL,NULL)`,
  ).run({ id, ts: trust_score });
  return id;
}

function scoreOf(db, id) {
  return db.prepare('SELECT trust_score FROM observations WHERE id = ?').get(id)?.trust_score;
}

beforeEach(() => {
  sandbox = mkdtempSync(join(tmpdir(), 'cmk-trust-signal-'));
  projectRoot = join(sandbox, 'proj');
});

afterEach(() => {
  // Best-effort cleanup: better-sqlite3 can briefly hold the .index/memory.db
  // handle on Windows after close(), so a single rmSync can EPERM. Retry once,
  // then leave it for the OS (a leaked temp dir can never fail the test verdict).
  try {
    rmSync(sandbox, { recursive: true, force: true });
  } catch {
    try {
      rmSync(sandbox, { recursive: true, force: true });
    } catch {
      // leave for the OS temp-dir cleanup
    }
  }
});

describe('Task 151.8 — applyTrustSignal (event -> trust_score overlay)', () => {
  it('REINFORCE raises the cited fact\'s trust_score by +0.1 (re-surface signal)', () => {
    const db = openIndexDb({ projectRoot });
    seedObservation(db, { id: 'P-AAAAAAAA', trust_score: 0.5 });
    db.close();

    const r = applyTrustSignal({ projectRoot, id: 'P-AAAAAAAA', event: 'reinforce' });
    expect(r.action).toBe('updated');

    const db2 = openIndexDb({ projectRoot });
    expect(scoreOf(db2, 'P-AAAAAAAA')).toBeCloseTo(0.5 + REINFORCE_DELTA, 10);
    db2.close();
  });

  it('DAMPEN lowers the cited fact\'s trust_score by -0.15 (contradiction / supersession signal)', () => {
    const db = openIndexDb({ projectRoot });
    seedObservation(db, { id: 'P-BBBBBBBB', trust_score: 0.5 });
    db.close();

    applyTrustSignal({ projectRoot, id: 'P-BBBBBBBB', event: 'dampen' });

    const db2 = openIndexDb({ projectRoot });
    expect(scoreOf(db2, 'P-BBBBBBBB')).toBeCloseTo(0.5 + DAMPEN_DELTA, 10);
    db2.close();
  });

  it('over-mutation guard: only the targeted row moves; siblings are untouched', () => {
    const db = openIndexDb({ projectRoot });
    seedObservation(db, { id: 'P-AAAAAAAA', trust_score: 0.5 });
    seedObservation(db, { id: 'P-BBBBBBBB', trust_score: 0.5 });
    seedObservation(db, { id: 'P-CCCCCCCC', trust_score: 0.5 });
    db.close();

    applyTrustSignal({ projectRoot, id: 'P-BBBBBBBB', event: 'dampen' });

    const db2 = openIndexDb({ projectRoot });
    expect(scoreOf(db2, 'P-AAAAAAAA')).toBe(0.5); // untouched
    expect(scoreOf(db2, 'P-CCCCCCCC')).toBe(0.5); // untouched
    expect(scoreOf(db2, 'P-BBBBBBBB')).toBeLessThan(0.5); // moved
    db2.close();
  });

  it('the floor holds through the helper — repeated dampens never reach zero', () => {
    const db = openIndexDb({ projectRoot });
    seedObservation(db, { id: 'P-AAAAAAAA', trust_score: 0.2 });
    db.close();

    for (let i = 0; i < 10; i++) applyTrustSignal({ projectRoot, id: 'P-AAAAAAAA', event: 'dampen' });

    const db2 = openIndexDb({ projectRoot });
    expect(scoreOf(db2, 'P-AAAAAAAA')).toBe(TRUST_SCORE_FLOOR);
    db2.close();
  });

  it('a NON-EXISTENT id is a clean no-op (not-found), never throws', () => {
    const db = openIndexDb({ projectRoot });
    db.close();
    const r = applyTrustSignal({ projectRoot, id: 'P-ZZZZZZZZ', event: 'dampen' });
    expect(r.action).toBe('not-found');
  });

  it('BEST-EFFORT: a missing projectRoot / bad input returns skipped, never throws (a trust nudge must never break the primary write)', () => {
    expect(() => applyTrustSignal({ id: 'P-AAAAAAAA', event: 'dampen' })).not.toThrow();
    const r = applyTrustSignal({ id: 'P-AAAAAAAA', event: 'dampen' });
    expect(r.action).toBe('skipped');
  });

  it('an unknown event leaves the score unchanged (no-op via updateTrustScore)', () => {
    const db = openIndexDb({ projectRoot });
    seedObservation(db, { id: 'P-AAAAAAAA', trust_score: 0.5 });
    db.close();

    applyTrustSignal({ projectRoot, id: 'P-AAAAAAAA', event: 'nonsense' });

    const db2 = openIndexDb({ projectRoot });
    expect(scoreOf(db2, 'P-AAAAAAAA')).toBe(0.5); // unchanged
    db2.close();
  });
});

// -- Integration: the 3 signals fire through the REAL write paths (151.8b) ----
// Per CLAUDE.md "integration-test coverage for cross-module flows": the per-
// module unit tests above verify applyTrustSignal in isolation; these exercise
// the actual call chains (writeFact / memoryWrite) so a wiring break is caught.
describe('Task 151.8 — passive signals fire through the real write paths', () => {
  let userDir;

  beforeEach(async () => {
    userDir = join(sandbox, 'user');
    await install({ projectRoot, userTier: userDir });
  });

  function factOpts(overrides = {}) {
    return {
      projectRoot, userDir, tier: 'P', type: 'feedback',
      slug: 'sample', title: 'Sample', body: 'a durable fact body',
      writeSource: 'user-explicit', trust: 'high',
      sourceFile: 'context/transcripts/x.md', sourceLine: 1,
      sourceSha1: 'd'.repeat(40),
      ...overrides,
    };
  }

  it('RE-SURFACE (writeFact a duplicate) raises trust_score DURABLY — survives the reindex the bump triggers (the 151.8 fix)', () => {
    // The reinforce is NOT a fragile overlay: bumping recurrence_count rewrites
    // the file, and initTrustScore folds a capped recurrence term, so the next
    // reindexBoot reconstructs a HIGHER seed from the durable count. This is the
    // regression test for the review's Blocking finding (an overlay delta here was
    // reseeded away by the very reindex the bump triggered).
    const opts = factOpts({ body: 'we always run black before committing', trust: 'medium', writeSource: 'auto-extract' });
    const w = writeFact(opts);
    expect(w.action).toBe('created');
    const db = openIndexDb({ projectRoot });
    reindexBoot({ projectRoot, userDir, db });
    const seed = scoreOf(db, w.id);
    db.close();
    expect(seed).toBeLessThan(0.85); // headroom

    // Re-surface 3× → recurrence_count climbs → the COMMITTED count drives a higher seed.
    writeFact(opts);
    writeFact(opts);
    const again = writeFact(opts);
    expect(again.action).toBe('skipped');
    expect(again.recurrenceCount).toBeGreaterThan(1);

    // THE DURABILITY ASSERT: reindex (the bump already changed the file) → the
    // higher score SURVIVES because it's reconstructed from recurrence_count.
    const db2 = openIndexDb({ projectRoot });
    reindexBoot({ projectRoot, userDir, db: db2 });
    const after = scoreOf(db2, w.id);
    db2.close();
    expect(after).toBeGreaterThan(seed); // restatement durably raised trust
  });

  it('SUPERSESSION (memoryWrite replace) DAMPENS the OLD fact trust_score in the index', () => {
    // Seed an existing bullet, index it, capture its seed score.
    const add = memoryWrite({
      action: 'add', tier: 'P', scratchpad: 'MEMORY.md', section: 'Active Threads',
      text: 'deploy target is staging', trust: 'high', source: 'user-explicit',
      projectRoot, userDir, now: '2026-05-27T10:00:00Z',
    });
    expect(add.action).toBe('appended');
    const db = openIndexDb({ projectRoot });
    reindexBoot({ projectRoot, userDir, db });
    const seed = scoreOf(db, add.id);
    db.close();
    expect(typeof seed).toBe('number');

    // Replace it → supersession → DAMPEN the old id.
    const rep = memoryWrite({
      action: 'replace', tier: 'P', scratchpad: 'MEMORY.md', section: 'Active Threads',
      oldText: 'deploy target is staging', text: 'deploy target is production',
      trust: 'high', source: 'user-explicit', projectRoot, userDir, now: '2026-05-27T11:00:00Z',
    });
    expect(rep.action).toBe('replaced');
    expect(rep.oldId).toBe(add.id);

    const db2 = openIndexDb({ projectRoot });
    expect(scoreOf(db2, add.id)).toBeCloseTo(seed + DAMPEN_DELTA, 10);
    db2.close();
  });

  it('151.12: a MERGE supersedes its originals → dampens them (best-effort), and never breaks the merge', () => {
    // The merge-path supersession dampen 151.8 deferred. mergeFacts moves the
    // originals to archive/superseded/ (mark-not-delete) + dampens their trust.
    // The dampen is BEST-EFFORT (a superseded row may be pruned by the merge's own
    // reindex — the fact is leaving the index anyway); the load-bearing assertion
    // is that the wiring NEVER breaks the merge.
    const fo = (slug, body) => writeFact(factOpts({ slug, body }));
    const a = fo('mergea', 'we use pnpm for installs');
    const b = fo('mergeb', 'pnpm is our package manager of choice');
    const db = openIndexDb({ projectRoot });
    reindexBoot({ projectRoot, userDir, db });
    db.close();

    const m = mergeFacts({
      idA: a.id, idB: b.id,
      mergedBody: 'pnpm is the package manager; use it for every install',
      mergedTitle: 'pnpm everywhere',
      mergedSlug: 'pnpm-everywhere',
      writeSource: 'user-explicit',
      projectRoot, userDir, tier: 'P',
    });

    // Door 1 — the merge SUCCEEDS with the dampen wired (best-effort never breaks it).
    expect(m.action).toBe('merged');
    // Door 2 — mark-not-delete: the originals are preserved in archive/superseded/.
    expect(existsSync(join(projectRoot, 'context', 'memory', 'archive', 'superseded', `${a.id}.md`))).toBe(true);
    expect(existsSync(join(projectRoot, 'context', 'memory', 'archive', 'superseded', `${b.id}.md`))).toBe(true);
  });
});
