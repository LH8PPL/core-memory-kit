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

  it('promote that conflicts with existing high-trust → re-routed to conflict-queue (code-review IMP-1)', async () => {
    // Seed MEMORY.md with an existing HIGH-trust bullet that conflicts.
    const existing = '- (P-EXISTNG2) we standardized on Python 3.13';
    const existingProv = '<!-- source: user-explicit, at: 2026-05-26T10:00:00Z, trust: high -->';
    writeFileSync(
      join(projectRoot, 'context', 'MEMORY.md'),
      `# MEMORY.md\n\n## Active Threads\n\n${existing}\n${existingProv}\n\n`,
      'utf8',
    );
    // Seed review.md with a MEDIUM-trust candidate that conflicts.
    seedReviewQueue(projectRoot, [
      {
        ts: '2026-05-27T10:00:00Z',
        id: 'P-REVIEW22',
        text: 'we standardized on Python 3.14',
      },
    ]);
    await resolveReviewQueue({
      tier: 'P',
      projectRoot,
      prompter: () => 'promote',
    });
    // The promoted entry should NOT have landed in MEMORY.md
    // (conflict-queue intercepted because trust:high + similar to existing).
    const memoryText = readFileSync(join(projectRoot, 'context', 'MEMORY.md'), 'utf8');
    expect(memoryText).not.toContain('Python 3.14');
    // It should be in conflicts.md instead.
    const conflictsPath = join(projectRoot, 'context', 'queues', 'conflicts.md');
    expect(existsSync(conflictsPath)).toBe(true);
    expect(readFileSync(conflictsPath, 'utf8')).toContain('Python 3.14');
    // Review.md entry removed (promotion succeeded structurally).
    const reviewText = readFileSync(join(projectRoot, 'context', 'queues', 'review.md'), 'utf8');
    expect(reviewText).not.toContain('P-REVIEW22');
    // Audit-log entry includes the rerouted_to marker.
    const auditPath = join(projectRoot, 'context', '.locks', 'audit.log');
    const auditLines = readFileSync(auditPath, 'utf8').trim().split('\n').map(JSON.parse);
    const promoteEntry = auditLines.find((e) => e.reasonCode === 'review-promoted');
    expect(promoteEntry).toBeDefined();
    expect(promoteEntry.extra.rerouted_to).toBe('conflicts');
    expect(promoteEntry.extra.conflicts_with).toBe('P-EXISTNG2');
  });
});
