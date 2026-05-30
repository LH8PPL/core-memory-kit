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
});
