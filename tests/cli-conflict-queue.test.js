// @doors: 1, 2, 5
// Door 3 N/A: conflict-queue is in-process file IO + similarity computation; no subprocess spawn.
// Door 4 N/A: no message-queue interaction.
//
// Tests for Task 25 — Conflict queue + cmk queue conflicts resolver (T-022).
//
// Per design §6.8:
//   - The review queue (§6.2) handles medium-trust new writes
//     awaiting blessing.
//   - The conflict queue (this module) handles writes that CONTRADICT
//     an existing high-trust fact on the same heading_path.
//
// Three actions:
//   - detectConflicts({...}) — pre-write check; returns
//     {conflict: false} OR {conflict: true, action: 'supersede'|'queue', ...}
//   - writeConflictEntry({...}) — appends to <tierRoot>/queues/conflicts.md
//     when new.trust < existing.trust
//   - resolveConflictQueue({...}) — interactive walker for `cmk queue
//     conflicts` (keep-old / keep-new / merge-both / skip)

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
  detectConflicts,
  writeConflictEntry,
  resolveConflictQueue,
  tokenJaccardSimilarity,
} from '../packages/cli/src/conflict-queue.mjs';

function makeFixture() {
  const sandbox = mkdtempSync(join(tmpdir(), 'cmk-conflict-queue-test-'));
  const projectRoot = join(sandbox, 'proj');
  mkdirSync(join(projectRoot, 'context'), { recursive: true });
  return { sandbox, projectRoot };
}

function seedScratchpad(projectRoot, name, bullets) {
  const path = join(projectRoot, 'context', name);
  mkdirSync(join(projectRoot, 'context'), { recursive: true });
  const lines = ['# Test scratchpad', ''];
  for (const b of bullets) {
    lines.push(`## ${b.section}`);
    lines.push('');
    lines.push(`- (${b.id}) ${b.text}`);
    lines.push(`<!-- source: ${b.source ?? 'test'}, at: 2026-05-27T10:00:00Z, trust: ${b.trust} -->`);
    lines.push('');
  }
  writeFileSync(path, lines.join('\n'), 'utf8');
  return path;
}

describe('tokenJaccardSimilarity()', () => {
  it('returns 1.0 for identical strings', () => {
    expect(tokenJaccardSimilarity('foo bar baz', 'foo bar baz')).toBe(1);
  });

  it('returns 0 for completely different strings', () => {
    expect(tokenJaccardSimilarity('foo bar', 'xyz qux')).toBe(0);
  });

  it('returns a fraction for partial overlap', () => {
    const sim = tokenJaccardSimilarity('foo bar baz', 'foo bar qux');
    expect(sim).toBeGreaterThan(0.4);
    expect(sim).toBeLessThan(0.8);
  });

  it('is case-insensitive', () => {
    expect(tokenJaccardSimilarity('Foo Bar', 'foo bar')).toBe(1);
  });

  it('treats punctuation as token separators', () => {
    expect(tokenJaccardSimilarity('foo, bar', 'foo bar')).toBe(1);
  });

  it('returns 0 for non-strings', () => {
    expect(tokenJaccardSimilarity(null, 'foo')).toBe(0);
    expect(tokenJaccardSimilarity('foo', undefined)).toBe(0);
  });
});

describe('detectConflicts() — pre-write conflict detection (25.1, 25.2)', () => {
  let sandbox, projectRoot;
  beforeEach(() => {
    ({ sandbox, projectRoot } = makeFixture());
  });
  afterEach(() => {
    rmSync(sandbox, { recursive: true, force: true });
  });

  it('returns conflict: false when scratchpad is empty', () => {
    const r = detectConflicts({
      newText: 'we are using Python 3.14',
      newTrust: 'medium',
      scratchpadPath: join(projectRoot, 'context', 'MEMORY.md'),
      sectionTitle: 'Decisions',
    });
    expect(r.conflict).toBe(false);
    expect(r.scanned).toBe(0);
  });

  it('returns conflict: false when no existing bullet meets the similarity threshold', () => {
    const path = seedScratchpad(projectRoot, 'MEMORY.md', [
      { section: 'Decisions', id: 'P-AAAAAAAA', text: 'we ship on Fridays', trust: 'high' },
    ]);
    const r = detectConflicts({
      newText: 'we use Python 3.14 for websockets',
      newTrust: 'medium',
      scratchpadPath: path,
      sectionTitle: 'Decisions',
    });
    expect(r.conflict).toBe(false);
  });

  it('returns conflict: true + action: queue when similarity > threshold + new.trust < existing.trust', () => {
    const path = seedScratchpad(projectRoot, 'MEMORY.md', [
      { section: 'Decisions', id: 'P-AAAAAAAA', text: 'we standardized on Python 3.13', trust: 'high' },
    ]);
    const r = detectConflicts({
      newText: 'we standardized on Python 3.14',
      newTrust: 'medium',
      scratchpadPath: path,
      sectionTitle: 'Decisions',
    });
    expect(r.conflict).toBe(true);
    expect(r.action).toBe('queue');
    expect(r.existingId).toBe('P-AAAAAAAA');
    // Substring backend (token-Jaccard) scores this ~0.71 — below the
    // semantic threshold of 0.85 but above the substring default of 0.5.
    expect(r.similarity).toBeGreaterThan(0.5);
    expect(r.similarityBackend).toBe('substring');
  });

  it('returns conflict: true + action: supersede when new.trust >= existing.trust', () => {
    const path = seedScratchpad(projectRoot, 'MEMORY.md', [
      { section: 'Decisions', id: 'P-AAAAAAAA', text: 'we standardized on Python 3.13', trust: 'medium' },
    ]);
    const r = detectConflicts({
      newText: 'we standardized on Python 3.14',
      newTrust: 'high',
      scratchpadPath: path,
      sectionTitle: 'Decisions',
    });
    expect(r.conflict).toBe(true);
    expect(r.action).toBe('supersede');
    expect(r.existingId).toBe('P-AAAAAAAA');
  });

  it('uses an injected similarityFn when provided (Layer 5 / FTS5 future hook)', () => {
    const path = seedScratchpad(projectRoot, 'MEMORY.md', [
      { section: 'Decisions', id: 'P-AAAAAAAA', text: 'completely unrelated text', trust: 'high' },
    ]);
    const r = detectConflicts({
      newText: 'something else entirely',
      newTrust: 'medium',
      scratchpadPath: path,
      sectionTitle: 'Decisions',
      similarityFn: () => 0.99, // pretend FTS5 says they're very similar
    });
    expect(r.conflict).toBe(true);
    expect(r.similarityBackend).toBe('custom');
  });

  it('errors on missing newText', () => {
    const r = detectConflicts({
      newTrust: 'medium',
      scratchpadPath: join(projectRoot, 'context', 'MEMORY.md'),
    });
    expect(r.action).toBe('error');
    expect(r.errorCategory).toBe('schema');
  });

  it('errors on invalid newTrust', () => {
    const r = detectConflicts({
      newText: 'foo',
      newTrust: 'invalid',
      scratchpadPath: join(projectRoot, 'context', 'MEMORY.md'),
    });
    expect(r.action).toBe('error');
    expect(r.errorCategory).toBe('schema');
  });
});

describe('writeConflictEntry() — append to queues/conflicts.md (25.3)', () => {
  let sandbox, projectRoot;
  beforeEach(() => {
    ({ sandbox, projectRoot } = makeFixture());
  });
  afterEach(() => {
    rmSync(sandbox, { recursive: true, force: true });
  });

  it('creates the queue file on first write with header', () => {
    const r = writeConflictEntry({
      tier: 'P',
      projectRoot,
      newId: 'P-NEW22222',
      newText: 'we are using Python 3.14',
      newTrust: 'medium',
      existingId: 'P-AAAAAAAA',
      existingText: 'we standardized on Python 3.13',
      existingTrust: 'high',
      similarity: 0.91,
      similarityBackend: 'substring',
      detectedAt: '2026-05-27T10:00:00Z',
    });
    expect(r.action).toBe('queued');
    expect(r.id).toBe('P-NEW22222');
    expect(r.conflictsWith).toBe('P-AAAAAAAA');
    const queuePath = join(projectRoot, 'context', 'queues', 'conflicts.md');
    expect(existsSync(queuePath)).toBe(true);
    const content = readFileSync(queuePath, 'utf8');
    expect(content).toContain('# Conflicts queue');
    expect(content).toContain('- (proposed: P-NEW22222)');
    expect(content).toContain('conflicts_with: P-AAAAAAAA');
    expect(content).toContain('similarity: 0.9100');
    expect(content).toContain('similarity_backend: substring');
    expect(content).toContain('resolution: pending');
  });

  it('appends without re-writing the header on subsequent writes', () => {
    for (let i = 0; i < 2; i++) {
      writeConflictEntry({
        tier: 'P',
        projectRoot,
        newId: `P-NEW2222${i}`,
        newText: `text ${i}`,
        newTrust: 'medium',
        existingId: 'P-AAAAAAAA',
        existingText: 'existing text',
        existingTrust: 'high',
        similarity: 0.9,
        similarityBackend: 'substring',
      });
    }
    const queuePath = join(projectRoot, 'context', 'queues', 'conflicts.md');
    const content = readFileSync(queuePath, 'utf8');
    expect((content.match(/# Conflicts queue/g) || []).length).toBe(1);
    expect((content.match(/- \(proposed:/g) || []).length).toBe(2);
  });

  it('writes an audit-log entry with reasonCode CONFLICT_QUEUED', () => {
    writeConflictEntry({
      tier: 'P',
      projectRoot,
      newId: 'P-NEW22222',
      newText: 'foo',
      newTrust: 'medium',
      existingId: 'P-AAAAAAAA',
      existingText: 'bar',
      existingTrust: 'high',
      similarity: 0.91,
      similarityBackend: 'substring',
    });
    const auditPath = join(projectRoot, 'context', '.locks', 'audit.log');
    expect(existsSync(auditPath)).toBe(true);
    const lines = readFileSync(auditPath, 'utf8').trim().split('\n');
    const entry = JSON.parse(lines[lines.length - 1]);
    expect(entry.reasonCode).toBe('conflict-queued');
    expect(entry.action).toBe('queued');
    expect(entry.id).toBe('P-NEW22222');
  });
});

describe('resolveConflictQueue() — interactive walker (25.4)', () => {
  let sandbox, projectRoot;
  beforeEach(() => {
    ({ sandbox, projectRoot } = makeFixture());
  });
  afterEach(() => {
    rmSync(sandbox, { recursive: true, force: true });
  });

  function seedTwoPendingEntries() {
    writeConflictEntry({
      tier: 'P',
      projectRoot,
      newId: 'P-NEW22222',
      newText: 'first conflict',
      newTrust: 'medium',
      existingId: 'P-AAAAAAAA',
      existingText: 'first existing',
      existingTrust: 'high',
      similarity: 0.9,
      similarityBackend: 'substring',
    });
    writeConflictEntry({
      tier: 'P',
      projectRoot,
      newId: 'P-NEW33333',
      newText: 'second conflict',
      newTrust: 'medium',
      existingId: 'P-BBBBBBBB',
      existingText: 'second existing',
      existingTrust: 'high',
      similarity: 0.9,
      similarityBackend: 'substring',
    });
  }

  it('returns zero counts when the queue file does not exist', async () => {
    const r = await resolveConflictQueue({
      tier: 'P',
      projectRoot,
      prompter: () => 'keep-old',
    });
    expect(r).toMatchObject({ resolved: 0, kept_old: 0, kept_new: 0, merged: 0, skipped: 0 });
  });

  it('applies keep-old and counts it', async () => {
    seedTwoPendingEntries();
    const r = await resolveConflictQueue({
      tier: 'P',
      projectRoot,
      prompter: () => 'keep-old',
    });
    expect(r.resolved).toBe(2);
    expect(r.kept_old).toBe(2);
  });

  it('applies keep-new and counts it', async () => {
    seedTwoPendingEntries();
    const r = await resolveConflictQueue({
      tier: 'P',
      projectRoot,
      prompter: () => 'keep-new',
    });
    expect(r.kept_new).toBe(2);
  });

  it('applies skip and leaves entries pending', async () => {
    seedTwoPendingEntries();
    const r = await resolveConflictQueue({
      tier: 'P',
      projectRoot,
      prompter: () => 'skip',
    });
    expect(r.skipped).toBe(2);
    const queuePath = join(projectRoot, 'context', 'queues', 'conflicts.md');
    const content = readFileSync(queuePath, 'utf8');
    expect((content.match(/resolution: pending/g) || []).length).toBe(2);
  });

  it('applies merge-both and invokes the mergeFn (25.5)', async () => {
    seedTwoPendingEntries();
    let mergeCalls = 0;
    const r = await resolveConflictQueue({
      tier: 'P',
      projectRoot,
      prompter: () => 'merge-both',
      mergeFn: async ({ proposedId, existingId }) => {
        mergeCalls++;
        expect(proposedId.startsWith('P-NEW')).toBe(true);
        expect(['P-AAAAAAAA', 'P-BBBBBBBB']).toContain(existingId);
      },
    });
    expect(r.merged).toBe(2);
    expect(mergeCalls).toBe(2);
  });

  it('preserves already-resolved entries on subsequent calls (idempotent)', async () => {
    seedTwoPendingEntries();
    await resolveConflictQueue({
      tier: 'P',
      projectRoot,
      prompter: () => 'keep-old',
    });
    // Second pass: queue should have no pending entries.
    const r2 = await resolveConflictQueue({
      tier: 'P',
      projectRoot,
      prompter: () => {
        throw new Error('prompter should not be called — no pending entries remain');
      },
    });
    expect(r2.resolved).toBe(0);
    expect(r2.skipped).toBe(0);
  });

  it('writes an audit-log entry for each resolved decision', async () => {
    seedTwoPendingEntries();
    await resolveConflictQueue({
      tier: 'P',
      projectRoot,
      prompter: () => 'keep-old',
    });
    const auditPath = join(projectRoot, 'context', '.locks', 'audit.log');
    const lines = readFileSync(auditPath, 'utf8').trim().split('\n');
    const resolveEntries = lines
      .map((l) => JSON.parse(l))
      .filter((e) => e.reasonCode === 'conflict-resolved');
    expect(resolveEntries.length).toBe(2);
    expect(resolveEntries[0].extra.decision).toBe('keep-old');
  });

  it('errors on missing prompter', async () => {
    const r = await resolveConflictQueue({
      tier: 'P',
      projectRoot,
    });
    expect(r.action).toBe('error');
    expect(r.errorCategory).toBe('schema');
  });
});
