// @doors: 1, 2, 5
// Door 3 N/A: review-queue is in-process file IO + delegated memoryWrite calls; no subprocess spawn.
// Door 4 N/A: no message-queue interaction.
//
// Tests for Task 26 — Review queue + cmk queue review resolver (T-023).
//
// Per design §6.2 the review queue holds medium-trust auto-extract
// candidates awaiting blessing. routeMedium (in auto-extract.mjs)
// writes them; resolveReviewQueue (this module) walks them and
// applies promote / discard / skip decisions.
//
// Companion to Task 25's conflict-queue. Same shape (interactive
// walker), different routing concern.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  mkdirSync,
  readFileSync,
  existsSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  parseReviewQueue,
  resolveReviewQueue,
} from '../packages/cli/src/review-queue.mjs';
import { runQueueReview } from '../packages/cli/src/subcommands.mjs';

function makeFixture() {
  const sandbox = mkdtempSync(join(tmpdir(), 'cmk-review-queue-test-'));
  const projectRoot = join(sandbox, 'proj');
  mkdirSync(join(projectRoot, 'context'), { recursive: true });
  // Seed MEMORY.md so memoryWrite (invoked by promote) has somewhere to write.
  writeFileSync(
    join(projectRoot, 'context', 'MEMORY.md'),
    '# MEMORY.md\n\n## Active Threads\n\n## Environment Notes\n\n',
    'utf8',
  );
  return { sandbox, projectRoot };
}

function seedReviewQueue(projectRoot, entries) {
  const queueDir = join(projectRoot, 'context', 'queues');
  mkdirSync(queueDir, { recursive: true });
  const queuePath = join(queueDir, 'review.md');
  const lines = [];
  for (const e of entries) {
    lines.push(`## ${e.ts} — auto-extract (medium-trust, pending review)`);
    lines.push(`- (${e.id}) ${e.text}`);
    lines.push(`  <!-- proposed_trust: medium, write: auto-extract, at: ${e.ts} -->`);
    lines.push('');
  }
  writeFileSync(queuePath, lines.join('\n'), 'utf8');
  return queuePath;
}

describe('parseReviewQueue()', () => {
  it('returns empty entries on empty input', () => {
    expect(parseReviewQueue('')).toEqual({ entries: [], preamble: [''] });
  });

  it('parses a single well-formed entry', () => {
    const text = [
      '## 2026-05-27T10:00:00Z — auto-extract (medium-trust, pending review)',
      '- (P-AAAAAAAA) the candidate text',
      '  <!-- proposed_trust: medium, write: auto-extract, at: 2026-05-27T10:00:00Z -->',
      '',
    ].join('\n');
    const r = parseReviewQueue(text);
    expect(r.entries).toHaveLength(1);
    expect(r.entries[0]).toMatchObject({
      ts: '2026-05-27T10:00:00Z',
      id: 'P-AAAAAAAA',
      text: 'the candidate text',
    });
    expect(r.entries[0].provenance).toContain('proposed_trust: medium');
  });

  it('parses multiple sequential entries', () => {
    const text = [
      '## 2026-05-27T10:00:00Z — auto-extract (medium-trust, pending review)',
      '- (P-AAAAAAAA) first',
      '  <!-- proposed_trust: medium, write: auto-extract, at: 2026-05-27T10:00:00Z -->',
      '',
      '## 2026-05-27T10:01:00Z — auto-extract (medium-trust, pending review)',
      '- (P-BBBBBBBB) second',
      '  <!-- proposed_trust: medium, write: auto-extract, at: 2026-05-27T10:01:00Z -->',
      '',
    ].join('\n');
    const r = parseReviewQueue(text);
    expect(r.entries).toHaveLength(2);
    expect(r.entries[0].id).toBe('P-AAAAAAAA');
    expect(r.entries[1].id).toBe('P-BBBBBBBB');
  });

  it('ignores malformed sections (no heading match)', () => {
    const text = '# Some random markdown\n\nNo entries here.\n';
    const r = parseReviewQueue(text);
    expect(r.entries).toHaveLength(0);
  });
});

describe('resolveReviewQueue() — interactive walker (Task 26.2-26.4)', () => {
  let sandbox, projectRoot;
  beforeEach(() => {
    ({ sandbox, projectRoot } = makeFixture());
  });
  afterEach(() => {
    rmSync(sandbox, { recursive: true, force: true });
  });

  it('returns zero counts when the queue file does not exist', async () => {
    const r = await resolveReviewQueue({
      tier: 'P',
      projectRoot,
      prompter: () => 'promote',
    });
    expect(r).toMatchObject({ promoted: 0, discarded: 0, skipped: 0 });
  });

  it('promotes a pending entry to MEMORY.md at trust:high', async () => {
    seedReviewQueue(projectRoot, [
      { ts: '2026-05-27T10:00:00Z', id: 'P-AAAAAAAA', text: 'durable fact one' },
    ]);
    const r = await resolveReviewQueue({
      tier: 'P',
      projectRoot,
      prompter: () => 'promote',
    });
    expect(r.promoted).toBe(1);
    expect(r.discarded).toBe(0);
    // MEMORY.md should have the new bullet.
    const memoryText = readFileSync(join(projectRoot, 'context', 'MEMORY.md'), 'utf8');
    expect(memoryText).toContain('durable fact one');
    // Provenance should record trust: high.
    expect(memoryText).toMatch(/trust:\s*high/);
    // Review queue should no longer have the promoted entry.
    const queueText = readFileSync(join(projectRoot, 'context', 'queues', 'review.md'), 'utf8');
    expect(queueText).not.toContain('P-AAAAAAAA');
  });

  it('discards an entry without writing to MEMORY.md', async () => {
    seedReviewQueue(projectRoot, [
      { ts: '2026-05-27T10:00:00Z', id: 'P-AAAAAAAA', text: 'noise candidate' },
    ]);
    const r = await resolveReviewQueue({
      tier: 'P',
      projectRoot,
      prompter: () => 'discard',
    });
    expect(r.discarded).toBe(1);
    expect(r.promoted).toBe(0);
    const memoryText = readFileSync(join(projectRoot, 'context', 'MEMORY.md'), 'utf8');
    expect(memoryText).not.toContain('noise candidate');
    const queueText = readFileSync(join(projectRoot, 'context', 'queues', 'review.md'), 'utf8');
    expect(queueText).not.toContain('P-AAAAAAAA');
  });

  it('skip leaves entries pending; no audit-log entry', async () => {
    seedReviewQueue(projectRoot, [
      { ts: '2026-05-27T10:00:00Z', id: 'P-AAAAAAAA', text: 'first' },
      { ts: '2026-05-27T10:01:00Z', id: 'P-BBBBBBBB', text: 'second' },
    ]);
    const r = await resolveReviewQueue({
      tier: 'P',
      projectRoot,
      prompter: () => 'skip',
    });
    expect(r.skipped).toBe(2);
    const queueText = readFileSync(join(projectRoot, 'context', 'queues', 'review.md'), 'utf8');
    expect(queueText).toContain('P-AAAAAAAA');
    expect(queueText).toContain('P-BBBBBBBB');
  });

  it('writes audit-log entries with reasonCode REVIEW_PROMOTED / REVIEW_DISCARDED', async () => {
    seedReviewQueue(projectRoot, [
      { ts: '2026-05-27T10:00:00Z', id: 'P-AAAAAAAA', text: 'promote me please durable fact' },
      { ts: '2026-05-27T10:01:00Z', id: 'P-BBBBBBBB', text: 'discard me noise' },
    ]);
    const decisions = ['promote', 'discard'];
    let i = 0;
    await resolveReviewQueue({
      tier: 'P',
      projectRoot,
      prompter: () => decisions[i++],
    });
    const auditPath = join(projectRoot, 'context', '.locks', 'audit.log');
    expect(existsSync(auditPath)).toBe(true);
    const lines = readFileSync(auditPath, 'utf8').trim().split('\n');
    const reasons = lines.map((l) => JSON.parse(l).reasonCode);
    expect(reasons).toContain('review-promoted');
    expect(reasons).toContain('review-discarded');
  });

  it('is idempotent — resolved entries stay removed on re-runs', async () => {
    seedReviewQueue(projectRoot, [
      { ts: '2026-05-27T10:00:00Z', id: 'P-AAAAAAAA', text: 'first durable fact' },
    ]);
    await resolveReviewQueue({
      tier: 'P',
      projectRoot,
      prompter: () => 'promote',
    });
    // Second pass: queue should have no entries.
    const r2 = await resolveReviewQueue({
      tier: 'P',
      projectRoot,
      prompter: () => {
        throw new Error('prompter should not be called — no pending entries remain');
      },
    });
    expect(r2.promoted).toBe(0);
    expect(r2.skipped).toBe(0);
  });

  it('mixed decisions: promote + discard + skip in one pass', async () => {
    seedReviewQueue(projectRoot, [
      { ts: '2026-05-27T10:00:00Z', id: 'P-AAAAAAAA', text: 'promote this fact about pytest' },
      { ts: '2026-05-27T10:01:00Z', id: 'P-BBBBBBBB', text: 'discard this noise' },
      { ts: '2026-05-27T10:02:00Z', id: 'P-CCCCCCCC', text: 'skip this for now' },
    ]);
    const decisions = ['promote', 'discard', 'skip'];
    let i = 0;
    const r = await resolveReviewQueue({
      tier: 'P',
      projectRoot,
      prompter: () => decisions[i++],
    });
    expect(r.promoted).toBe(1);
    expect(r.discarded).toBe(1);
    expect(r.skipped).toBe(1);
    const queueText = readFileSync(join(projectRoot, 'context', 'queues', 'review.md'), 'utf8');
    expect(queueText).not.toContain('promote this fact');
    expect(queueText).not.toContain('discard this noise');
    expect(queueText).toContain('skip this for now');
  });

  it('errors on missing prompter', async () => {
    const r = await resolveReviewQueue({ tier: 'P', projectRoot });
    expect(r.action).toBe('error');
    expect(r.errorCategory).toBe('schema');
  });

  it('promote that conflicts with existing high-trust → falls through to normal append (v0.1.0 supersede semantics)', async () => {
    // CONTRACT LOCK FOR v0.1.0:
    // promote sets trust:'high'. If the candidate is similar to an existing
    // high-trust bullet, memory-write.doAdd's detectConflicts returns
    // action: 'supersede' (since new.trust >= existing.trust, NOT < existing).
    // The queue-route only fires for action: 'queue' (new.trust < existing.trust).
    // Auto-mutation of the existing bullet's superseded_by: provenance is
    // deferred to v0.1.x (per memory-write.mjs comments around the conflict
    // check). v0.1.0 behavior: BOTH bullets coexist in MEMORY.md.
    //
    // review-queue.mjs's `rerouted_to: 'conflicts'` audit-log marker stays
    // as defensive future-compat for v0.1.x routing changes — when
    // memoryWrite starts returning action: 'queued' for the supersede case,
    // this test will fail loudly and force the v0.1.x semantics decision.
    const existing = '- (P-EXSTNGCC) we standardized on Python 3.13';
    const existingProv = '<!-- source: user-explicit, at: 2026-05-26T10:00:00Z, trust: high -->';
    writeFileSync(
      join(projectRoot, 'context', 'MEMORY.md'),
      `# MEMORY.md\n\n## Active Threads\n\n${existing}\n${existingProv}\n\n`,
      'utf8',
    );
    seedReviewQueue(projectRoot, [
      {
        ts: '2026-05-27T10:00:00Z',
        id: 'P-REVEWDDD',
        text: 'we standardized on Python 3.14',
      },
    ]);
    await resolveReviewQueue({
      tier: 'P',
      projectRoot,
      prompter: () => 'promote',
    });
    // Both bullets coexist in MEMORY.md (no conflict-queue intercept).
    const memoryText = readFileSync(join(projectRoot, 'context', 'MEMORY.md'), 'utf8');
    expect(memoryText).toContain('Python 3.13');
    expect(memoryText).toContain('Python 3.14');
    // conflicts.md is NOT created.
    const conflictsPath = join(projectRoot, 'context', 'queues', 'conflicts.md');
    expect(existsSync(conflictsPath)).toBe(false);
    // Review.md entry removed (promotion succeeded).
    const reviewText = readFileSync(join(projectRoot, 'context', 'queues', 'review.md'), 'utf8');
    expect(reviewText).not.toContain('P-REVEWDDD');
    // Audit-log: review-promoted entry exists, WITHOUT the rerouted_to marker
    // (defensive code stayed dormant because the queue-route didn't fire).
    const auditPath = join(projectRoot, 'context', '.locks', 'audit.log');
    const auditLines = readFileSync(auditPath, 'utf8').trim().split('\n').map(JSON.parse);
    const promoteEntry = auditLines.find((e) => e.reasonCode === 'review-promoted');
    expect(promoteEntry).toBeDefined();
    expect(promoteEntry.extra.rerouted_to).toBeUndefined();
    expect(promoteEntry.extra.conflicts_with).toBeUndefined();
  });
});

// Task 113 (F-9): the cut-gate sweep ran `cmk queue review` on an EMPTY queue —
// proving only that the walker doesn't crash on nothing, NOT that the CLI command
// actually promotes/discards on real items. The resolver (resolveReviewQueue) is
// covered above; THIS drives the CLI wrapper (runQueueReview, now dep-injectable)
// on real seeded items + asserts the end-to-end effects.
describe('Task 113 (F-9) — runQueueReview CLI path on REAL queued items', () => {
  it('promotes a real pending entry end-to-end (MEMORY.md written, queue drained, count reported)', async () => {
    const { sandbox, projectRoot } = makeFixture();
    try {
      seedReviewQueue(projectRoot, [
        { ts: '2026-05-27T10:00:00Z', id: 'P-AAAAAAAA', text: 'always run the linter before committing' },
      ]);
      const out = [];
      const r = await runQueueReview({
        projectRoot,
        prompter: () => 'promote',
        log: (m) => out.push(String(m)),
        logError: (m) => out.push(String(m)),
      });
      // Door 1 (Response): the CLI wrapper returns the resolver result + reports the count.
      expect(r.promoted).toBe(1);
      expect(out.join('\n')).toContain('1 promoted');
      // Door 2 (State): the promoted text actually landed in MEMORY.md + the queue drained.
      expect(readFileSync(join(projectRoot, 'context', 'MEMORY.md'), 'utf8')).toContain('always run the linter');
      expect(readFileSync(join(projectRoot, 'context', 'queues', 'review.md'), 'utf8')).not.toContain('P-AAAAAAAA');
    } finally {
      rmSync(sandbox, { recursive: true, force: true });
    }
  });

  it('discards a real pending entry end-to-end (not promoted, removed from queue)', async () => {
    const { sandbox, projectRoot } = makeFixture();
    try {
      seedReviewQueue(projectRoot, [
        { ts: '2026-05-27T10:00:00Z', id: 'P-BBBBBBBB', text: 'a low-value note to discard' },
      ]);
      const out = [];
      const r = await runQueueReview({
        projectRoot,
        prompter: () => 'discard',
        log: (m) => out.push(String(m)),
        logError: () => {},
      });
      expect(r.discarded).toBe(1);
      expect(r.promoted).toBe(0);
      expect(readFileSync(join(projectRoot, 'context', 'MEMORY.md'), 'utf8')).not.toContain('a low-value note to discard');
      expect(readFileSync(join(projectRoot, 'context', 'queues', 'review.md'), 'utf8')).not.toContain('P-BBBBBBBB');
    } finally {
      rmSync(sandbox, { recursive: true, force: true });
    }
  });
});
