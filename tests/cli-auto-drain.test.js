// @doors: 1, 2, 4
// Door 3 N/A: no subprocess at this boundary (the resolvers are in-process file IO).
// Door 5 N/A: no message queue.
//
// Tests for v0.2 Phase 2 — auto-drain the review + conflict queues with the
// optimistic auto-resolvers (D-6: "i dont want to do anything, automatic").
// Review → auto-promote; conflict → keep-old (protect the higher-trust fact).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { autoDrainQueues } from '../packages/cli/src/auto-drain.mjs';
import { writeConflictEntry } from '../packages/cli/src/conflict-queue.mjs';
import { dailyDistill } from '../packages/cli/src/daily-distill.mjs';
import { weeklyCurate } from '../packages/cli/src/weekly-curate.mjs';

const mockBackend = { modelId: () => 'mock', async compress() { return { outputText: '' }; } };

let projectRoot;

beforeEach(() => {
  projectRoot = mkdtempSync(join(tmpdir(), 'cmk-autodrain-'));
  mkdirSync(join(projectRoot, 'context'), { recursive: true });
});
afterEach(() => rmSync(projectRoot, { recursive: true, force: true }));

function seedReviewQueue(entries) {
  const queueDir = join(projectRoot, 'context', 'queues');
  mkdirSync(queueDir, { recursive: true });
  const lines = [];
  for (const e of entries) {
    lines.push(`## ${e.ts} — auto-extract (medium-trust, pending review)`);
    lines.push(`- (${e.id}) ${e.text}`);
    lines.push(`  <!-- proposed_trust: medium, write: auto-extract, at: ${e.ts} -->`);
    lines.push('');
  }
  writeFileSync(join(queueDir, 'review.md'), lines.join('\n'), 'utf8');
}

function seedMemory(section = 'Active Threads') {
  writeFileSync(join(projectRoot, 'context', 'MEMORY.md'), `# Memory\n\n## ${section}\n`, 'utf8');
}

describe('autoDrainQueues() — Phase 2 optimistic auto-drain', () => {
  it('auto-promotes every pending review-queue entry into the scratchpad', async () => {
    seedMemory();
    seedReviewQueue([
      { id: 'P-WGQAZFVC', text: 'we bundle with Vite', ts: '2026-05-30T10:00:00Z' },
      { id: 'P-MKTXVWZP', text: 'tests run on vitest', ts: '2026-05-30T10:05:00Z' },
    ]);

    const r = await autoDrainQueues({ tier: 'P', projectRoot });

    // Door 1 — both promoted.
    expect(r.review.promoted).toBe(2);
    expect(r.review.discarded).toBe(0);
    // Door 2 — they landed in MEMORY.md.
    const memory = readFileSync(join(projectRoot, 'context', 'MEMORY.md'), 'utf8');
    expect(memory).toMatch(/bundle with Vite/);
    expect(memory).toMatch(/tests run on vitest/);
  });

  it('keep-old: a conflict entry resolves to protect the higher-trust fact (lower-trust contradiction discarded)', async () => {
    seedMemory();
    // A new medium-trust write contradicted an existing high-trust fact → queued.
    writeConflictEntry({
      tier: 'P',
      projectRoot,
      newId: 'P-NEWWXYZ2',
      newText: 'we standardized on Python 3.14',
      newTrust: 'medium',
      existingId: 'P-WGQAZFVC',
      existingText: 'we standardized on Python 3.13',
      existingTrust: 'high',
      similarity: 0.8,
      similarityBackend: 'substring',
      detectedAt: '2026-05-30T10:00:00Z',
    });

    const r = await autoDrainQueues({ tier: 'P', projectRoot });

    // Door 1 — resolved as keep-old.
    expect(r.conflict.kept_old).toBe(1);
    expect(r.conflict.kept_new).toBe(0);
    expect(r.conflict.merged).toBe(0);
  });

  it('is a safe no-op when neither queue exists', async () => {
    seedMemory();
    const r = await autoDrainQueues({ tier: 'P', projectRoot });
    expect(r.review.promoted).toBe(0);
    expect(r.review.errors).toEqual([]);
    expect(r.conflict.kept_old).toBe(0);
  });

  it('drains both queues in one call', async () => {
    seedMemory();
    seedReviewQueue([{ id: 'P-WGQAZFVC', text: 'prefer pnpm over npm', ts: '2026-05-30T10:00:00Z' }]);
    writeConflictEntry({
      tier: 'P', projectRoot,
      newId: 'P-NEWWXYZ2', newText: 'deploy on Fridays', newTrust: 'low',
      existingId: 'P-MKTXVWZP', existingText: 'never deploy on Fridays', existingTrust: 'high',
      similarity: 0.7, similarityBackend: 'substring', detectedAt: '2026-05-30T10:00:00Z',
    });

    const r = await autoDrainQueues({ tier: 'P', projectRoot });
    expect(r.review.promoted).toBe(1);
    expect(r.conflict.kept_old).toBe(1);
    expect(readFileSync(join(projectRoot, 'context', 'MEMORY.md'), 'utf8')).toMatch(/prefer pnpm/);
  });

  // D-154: the persona-review queue (medium-confidence cross-project candidates)
  // was ROUTED with the promise of an auto-drain that was never implemented — so
  // candidates stranded (the v0.3.1 cold-open found the user's architecture
  // philosophy stuck here, never reaching the persona). autoDrainQueues now drains
  // it optimistically, no manual command.
  it('auto-drains the persona-review queue: medium-confidence candidates promote to the user tier (D-154)', async () => {
    const userDir = mkdtempSync(join(tmpdir(), 'cmk-autodrain-user-'));
    try {
      // Seed a user-tier LESSONS.md with the target section + a persona-review queue
      // holding the kind of candidate that strands today (an architecture philosophy
      // graded medium because it was described, not declared as a universal rule).
      mkdirSync(join(userDir, 'queues'), { recursive: true });
      writeFileSync(join(userDir, 'LESSONS.md'), '# Lessons\n\n## Architecture Patterns\n', 'utf8');
      const queue = [
        '## 2026-06-14T11:51:49Z — persona-synthesis (pending review)',
        '- (U-FCNADLLP) [LESSONS.md § Architecture Patterns] Layered backend architecture (routes -> services -> repositories) worth the upfront structure cost',
        '  <!-- target: LESSONS.md, section: Architecture Patterns, confidence: medium, reason: confidence-medium, source: persona-synthesis, at: 2026-06-14T11:51:49Z -->',
        '',
      ].join('\n');
      writeFileSync(join(userDir, 'queues', 'persona-review.md'), queue, 'utf8');

      const r = await autoDrainQueues({ tier: 'P', projectRoot, userDir });

      // Door 1 — the persona candidate was drained + promoted.
      expect(r.persona.drained).toBe(1);
      expect(r.persona.promoted).toBe(1);
      // Door 2 — it landed in the user-tier LESSONS.md.
      expect(readFileSync(join(userDir, 'LESSONS.md'), 'utf8')).toMatch(/Layered backend architecture/);
      // Door 2 — the queue is cleared (no longer stranding the candidate).
      const drainedQueue = readFileSync(join(userDir, 'queues', 'persona-review.md'), 'utf8');
      expect(drainedQueue).not.toMatch(/U-FCNADLLP/);
      expect(drainedQueue).toMatch(/auto-drained/);
    } finally {
      rmSync(userDir, { recursive: true, force: true });
    }
  });

  it('persona drain is a safe no-op when no userDir / no persona queue', async () => {
    seedMemory();
    const r = await autoDrainQueues({ tier: 'P', projectRoot }); // no userDir
    expect(r.persona.drained).toBe(0);
    expect(r.persona.promoted).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Wired into the maintenance passes — the drain runs automatically
// ---------------------------------------------------------------------------

describe('auto-drain wired into daily-distill + weekly-curate', () => {
  it('dailyDistill drains the project queue even on the no-input path', async () => {
    mkdirSync(join(projectRoot, 'context', 'sessions'), { recursive: true }); // context exists, but no today-*.md → no-input
    seedMemory();
    seedReviewQueue([{ id: 'P-WGQAZFVC', text: 'we use esbuild', ts: '2026-05-30T10:00:00Z' }]);

    const r = await dailyDistill({ projectRoot, backend: mockBackend, now: '2026-05-30T12:00:00Z' });

    expect(r.action).toBe('skipped');
    expect(r.reason).toBe('no-input');
    // The drain still ran (it's before the no-input return).
    expect(r.drained.review.promoted).toBe(1);
    expect(readFileSync(join(projectRoot, 'context', 'MEMORY.md'), 'utf8')).toMatch(/we use esbuild/);
  });

  it('weeklyCurate drains project + user tiers as part of the weekly pass', async () => {
    const userDir = join(projectRoot, '..', `user-${Date.now()}`);
    mkdirSync(join(projectRoot, 'context', 'sessions'), { recursive: true });
    writeFileSync(join(projectRoot, 'context', 'sessions', 'today-2026-05-30.md'), '- today\n', 'utf8'); // current → no-old-files
    seedMemory();
    seedReviewQueue([{ id: 'P-WGQAZFVC', text: 'we run CI on push', ts: '2026-05-30T10:00:00Z' }]);

    const r = await weeklyCurate({ projectRoot, userDir, backend: mockBackend, now: '2026-05-30T12:00:00Z' });

    expect(r.drained.P.review.promoted).toBe(1);
    expect(r.drained.U).toBeTruthy(); // user-tier drain ran (empty queues → zero counts, no error)
    expect(readFileSync(join(projectRoot, 'context', 'MEMORY.md'), 'utf8')).toMatch(/we run CI on push/);
    rmSync(userDir, { recursive: true, force: true });
  });

  // INTEGRATION (D-154): prove the REAL caller path — weeklyCurate → autoDrainQueues({tier:'U'})
  // → resolvePersonaReviewQueue → promoted to the persona. The unit test above
  // calls autoDrainQueues directly; this pins that the maintenance pass actually
  // invokes it WITH userDir so a stranded persona candidate genuinely drains in
  // production (the composition the cold-open exposed as never wired).
  it('weeklyCurate auto-drains a stranded persona candidate into the user tier (full integration)', async () => {
    const userDir = join(projectRoot, '..', `user-persona-${Date.now()}`);
    mkdirSync(join(userDir, 'queues'), { recursive: true });
    writeFileSync(join(userDir, 'LESSONS.md'), '# Lessons\n\n## Architecture Patterns\n', 'utf8');
    writeFileSync(
      join(userDir, 'queues', 'persona-review.md'),
      [
        '## 2026-05-30T11:00:00Z — persona-synthesis (pending review)',
        '- (U-FCNADLLP) [LESSONS.md § Architecture Patterns] Layered backend architecture worth the upfront structure cost',
        '  <!-- target: LESSONS.md, section: Architecture Patterns, confidence: medium, reason: confidence-medium, source: persona-synthesis, at: 2026-05-30T11:00:00Z -->',
        '',
      ].join('\n'),
      'utf8',
    );
    mkdirSync(join(projectRoot, 'context', 'sessions'), { recursive: true });
    writeFileSync(join(projectRoot, 'context', 'sessions', 'today-2026-05-30.md'), '- today\n', 'utf8');
    seedMemory();

    const r = await weeklyCurate({ projectRoot, userDir, backend: mockBackend, now: '2026-05-30T12:00:00Z' });

    // The user-tier drain promoted the stranded persona candidate.
    expect(r.drained.U.persona.promoted).toBe(1);
    expect(readFileSync(join(userDir, 'LESSONS.md'), 'utf8')).toMatch(/Layered backend architecture/);
    rmSync(userDir, { recursive: true, force: true });
  });
});
