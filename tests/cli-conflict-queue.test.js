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
  mergeScratchpadBullets,
} from '../packages/cli/src/conflict-queue.mjs';
import { runQueueConflicts, buildConflictPrompter } from '../packages/cli/src/subcommands.mjs';

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

  // B-1 regression (surfaced by Task 45, 2026-05-30): scratchpad provenance
  // comments are written INDENTED by writeBullet/appendScratchpadBullet
  // (`  <!-- … trust: high … -->`). collectExistingBullets parsed trust via a
  // `^<!--`-anchored regex that missed the indentation and defaulted EVERY
  // existing bullet to 'medium' — so a new medium fact wrongly 'superseded' a
  // trust:high hand-curated bullet instead of routing to the conflict queue.
  // The earlier tests passed only because their fixture wrote NON-indented
  // comments (fixture-diverges-from-production). This pins the real format.
  it('reads trust from an INDENTED provenance comment (production format) — medium vs high → queue not supersede', () => {
    const path = join(projectRoot, 'context', 'MEMORY.md');
    mkdirSync(join(projectRoot, 'context'), { recursive: true });
    const text = [
      '# Test scratchpad',
      '',
      '## Active Threads',
      '',
      '- (P-WGQAZFVC) Prefers terse direct replies with no filler',
      // INDENTED comment, exactly as appendScratchpadBullet emits it:
      '  <!-- source: seed, source_line: 1, sha1: cccccccccccccccccccccccccccccccccccccccc, write: user-explicit, trust: high, at: 2026-05-29T00:00:00Z -->',
      '',
    ].join('\n');
    writeFileSync(path, text, 'utf8');

    const r = detectConflicts({
      newText: 'Prefers terse direct replies with no filler or preamble',
      newTrust: 'medium',
      scratchpadPath: path,
      sectionTitle: 'Active Threads',
    });

    expect(r.conflict).toBe(true);
    // The existing bullet is trust:high → a new medium fact must NOT supersede
    // it; it routes to the conflict queue for the user to resolve.
    expect(r.action).toBe('queue');
    expect(r.existingTrust).toBe('high');
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

describe('mergeScratchpadBullets() — Layer-3 merger (Task 25b)', () => {
  let sandbox, projectRoot;
  beforeEach(() => {
    ({ sandbox, projectRoot } = makeFixture());
  });
  afterEach(() => {
    rmSync(sandbox, { recursive: true, force: true });
  });

  it('combines two bullets into a third with " | " separator', () => {
    const path = seedScratchpad(projectRoot, 'MEMORY.md', [
      { section: 'Decisions', id: 'P-AAAAAAAA', text: 'we use Python 3.13', trust: 'high' },
      { section: 'Decisions', id: 'P-BBBBBBBB', text: 'we are moving to 3.14', trust: 'medium' },
    ]);
    const r = mergeScratchpadBullets({
      tier: 'P',
      projectRoot,
      scratchpadPath: path,
      section: 'Decisions',
      idA: 'P-AAAAAAAA',
      idB: 'P-BBBBBBBB',
    });
    expect(r.action).toBe('merged');
    expect(r.id).toMatch(/^P-[A-Za-z0-9]{8}$/);
    expect(r.supersededIds).toEqual(['P-AAAAAAAA', 'P-BBBBBBBB']);
    const text = readFileSync(path, 'utf8');
    expect(text).toContain(`(${r.id}) we use Python 3.13 | we are moving to 3.14`);
    expect(text).toContain('source: merge-both');
    expect(text).toContain('merged_from: [P-AAAAAAAA, P-BBBBBBBB]');
  });

  it('mutates both originals to inject superseded_by:<newId>', () => {
    const path = seedScratchpad(projectRoot, 'MEMORY.md', [
      { section: 'Decisions', id: 'P-AAAAAAAA', text: 'first', trust: 'high' },
      { section: 'Decisions', id: 'P-BBBBBBBB', text: 'second', trust: 'medium' },
    ]);
    const r = mergeScratchpadBullets({
      tier: 'P',
      projectRoot,
      scratchpadPath: path,
      section: 'Decisions',
      idA: 'P-AAAAAAAA',
      idB: 'P-BBBBBBBB',
    });
    const text = readFileSync(path, 'utf8');
    const lines = text.split('\n');
    const supersededComments = lines.filter((l) =>
      l.includes(`superseded_by: ${r.id}`) && l.startsWith('<!--'),
    );
    expect(supersededComments.length).toBe(2);
  });

  it('picks max(trust) for the merged bullet', () => {
    const path = seedScratchpad(projectRoot, 'MEMORY.md', [
      { section: 'Decisions', id: 'P-AAAAAAAA', text: 'low-trust fact', trust: 'low' },
      { section: 'Decisions', id: 'P-BBBBBBBB', text: 'high-trust fact', trust: 'high' },
    ]);
    mergeScratchpadBullets({
      tier: 'P',
      projectRoot,
      scratchpadPath: path,
      section: 'Decisions',
      idA: 'P-AAAAAAAA',
      idB: 'P-BBBBBBBB',
    });
    const text = readFileSync(path, 'utf8');
    expect(text).toContain('trust: high');
  });

  it('writes an audit-log entry with reasonCode CURATED_MERGE + decision merge-both', () => {
    const path = seedScratchpad(projectRoot, 'MEMORY.md', [
      { section: 'Decisions', id: 'P-AAAAAAAA', text: 'first', trust: 'medium' },
      { section: 'Decisions', id: 'P-BBBBBBBB', text: 'second', trust: 'medium' },
    ]);
    const r = mergeScratchpadBullets({
      tier: 'P',
      projectRoot,
      scratchpadPath: path,
      section: 'Decisions',
      idA: 'P-AAAAAAAA',
      idB: 'P-BBBBBBBB',
    });
    const auditPath = join(projectRoot, 'context', '.locks', 'audit.log');
    expect(existsSync(auditPath)).toBe(true);
    const lines = readFileSync(auditPath, 'utf8').trim().split('\n');
    const entry = JSON.parse(lines[lines.length - 1]);
    expect(entry.reasonCode).toBe('curated-merge');
    expect(entry.action).toBe('merged');
    expect(entry.id).toBe(r.id);
    expect(entry.extra.decision).toBe('merge-both');
    expect(entry.extra.merged_from).toEqual(['P-AAAAAAAA', 'P-BBBBBBBB']);
  });

  it('FAILS gracefully when idA is not found', () => {
    const path = seedScratchpad(projectRoot, 'MEMORY.md', [
      { section: 'Decisions', id: 'P-BBBBBBBB', text: 'only B', trust: 'high' },
    ]);
    const r = mergeScratchpadBullets({
      tier: 'P',
      projectRoot,
      scratchpadPath: path,
      section: 'Decisions',
      idA: 'P-AAAAAAAA',
      idB: 'P-BBBBBBBB',
    });
    expect(r.action).toBe('error');
    expect(r.errorCategory).toBe('not-found');
    expect(r.errors.some((e) => e.includes('P-AAAAAAAA'))).toBe(true);
  });

  it('FAILS gracefully when the scratchpad does not exist', () => {
    const r = mergeScratchpadBullets({
      tier: 'P',
      projectRoot,
      scratchpadPath: join(projectRoot, 'context', 'MISSING.md'),
      section: 'Decisions',
      idA: 'P-AAAAAAAA',
      idB: 'P-BBBBBBBB',
    });
    expect(r.action).toBe('error');
    expect(r.errorCategory).toBe('not-found');
  });

  it('errors on missing tier / scratchpadPath', () => {
    const r1 = mergeScratchpadBullets({ projectRoot, scratchpadPath: 'foo', idA: 'P-AAAAAAAA', idB: 'P-BBBBBBBB' });
    expect(r1.errorCategory).toBe('schema');
    const r2 = mergeScratchpadBullets({ tier: 'P', projectRoot });
    expect(r2.errorCategory).toBe('schema');
  });

  it('rejects merging a bullet with itself (idA === idB, code-review IMP-1)', () => {
    const path = seedScratchpad(projectRoot, 'MEMORY.md', [
      { section: 'Decisions', id: 'P-AAAAAAAA', text: 'only one', trust: 'medium' },
    ]);
    const r = mergeScratchpadBullets({
      tier: 'P',
      projectRoot,
      scratchpadPath: path,
      section: 'Decisions',
      idA: 'P-AAAAAAAA',
      idB: 'P-AAAAAAAA',
    });
    expect(r.action).toBe('error');
    expect(r.errorCategory).toBe('schema');
    expect(r.errors.some((e) => /same.*cannot merge a bullet with itself/.test(e))).toBe(true);
  });

  it('self-supersede prevention: identical texts get a merge-discriminator (code-review IMP-2)', () => {
    // Two different IDs but identical text (rare — manual edit, or
    // hash collision survivor). Without the discriminator, the
    // canonical id of "combinedText" would equal idA AND idB, so
    // injectSupersededBy would mark a bullet as "superseded_by itself".
    const path = seedScratchpad(projectRoot, 'MEMORY.md', [
      { section: 'Decisions', id: 'P-AAAAAAAA', text: 'duplicate text', trust: 'high' },
      { section: 'Decisions', id: 'P-BBBBBBBB', text: 'duplicate text', trust: 'medium' },
    ]);
    const r = mergeScratchpadBullets({
      tier: 'P',
      projectRoot,
      scratchpadPath: path,
      section: 'Decisions',
      idA: 'P-AAAAAAAA',
      idB: 'P-BBBBBBBB',
    });
    expect(r.action).toBe('merged');
    expect(r.id).not.toBe('P-AAAAAAAA');
    expect(r.id).not.toBe('P-BBBBBBBB');
    // Verify the two originals each got a superseded_by pointing at
    // the new id (not at themselves).
    const text = readFileSync(path, 'utf8');
    expect(text).toContain(`superseded_by: ${r.id}`);
  });

  it('auto-discovers section from idA when caller passes no section', () => {
    const path = seedScratchpad(projectRoot, 'MEMORY.md', [
      { section: 'Decisions', id: 'P-AAAAAAAA', text: 'first', trust: 'high' },
      { section: 'Decisions', id: 'P-BBBBBBBB', text: 'second', trust: 'medium' },
    ]);
    const r = mergeScratchpadBullets({
      tier: 'P',
      projectRoot,
      scratchpadPath: path,
      // section: undefined — CLI resolver path doesn't pass section
      idA: 'P-AAAAAAAA',
      idB: 'P-BBBBBBBB',
    });
    expect(r.action).toBe('merged');
    const text = readFileSync(path, 'utf8');
    // The new bullet should land in the "Decisions" section, not at EOF.
    const lines = text.split('\n');
    const decisionsIdx = lines.findIndex((l) => l.trim() === '## Decisions');
    const newBulletIdx = lines.findIndex((l) => l.startsWith(`- (${r.id})`));
    expect(newBulletIdx).toBeGreaterThan(decisionsIdx);
    // No other heading should appear between Decisions and the new bullet.
    for (let i = decisionsIdx + 1; i < newBulletIdx; i++) {
      expect(lines[i]).not.toMatch(/^##\s/);
    }
  });
});

// Task 113 (F-9): the cut-gate sweep ran `cmk queue conflicts` on an EMPTY queue —
// proving only the walker doesn't crash on nothing, NOT that the CLI command
// actually resolves real conflicts. The resolver (resolveConflictQueue) is covered
// above; THIS drives the CLI wrapper (runQueueConflicts, now dep-injectable) on a
// real seeded conflict + asserts the end-to-end resolution.
describe('Task 113 (F-9) — runQueueConflicts CLI path on REAL queued items', () => {
  let sandbox, projectRoot;
  beforeEach(() => {
    ({ sandbox, projectRoot } = makeFixture());
  });
  afterEach(() => {
    rmSync(sandbox, { recursive: true, force: true });
  });

  function seedOneConflict(newId, existingId) {
    writeConflictEntry({
      tier: 'P', projectRoot,
      newId, newText: 'conflicting proposal', newTrust: 'medium',
      existingId, existingText: 'the established fact', existingTrust: 'high',
      similarity: 0.9, similarityBackend: 'substring',
    });
  }

  it('resolves a real conflict via keep-old end-to-end (counted, queue drained, reported)', async () => {
    seedOneConflict('P-NEW22222', 'P-AAAAAAAA');
    const out = [];
    const r = await runQueueConflicts({
      projectRoot,
      prompter: () => 'keep-old',
      log: (m) => out.push(String(m)),
      logError: (m) => out.push(String(m)),
    });
    // Door 1 (Response): the CLI wrapper returns the resolver result + reports counts.
    expect(r.resolved).toBe(1);
    expect(r.kept_old).toBe(1);
    expect(out.join('\n')).toContain('kept-old');
    // Door 2 (State): the entry is MARKED resolved (kept in the file for audit,
    // not deleted), so a second pass finds nothing pending to resolve.
    const again = await runQueueConflicts({ projectRoot, prompter: () => 'keep-old', log: () => {}, logError: () => {} });
    expect(again.resolved).toBe(0);
  });

  it('resolves a real conflict via keep-new end-to-end', async () => {
    seedOneConflict('P-NEW33333', 'P-BBBBBBBB');
    const out = [];
    const r = await runQueueConflicts({
      projectRoot,
      prompter: () => 'keep-new',
      log: (m) => out.push(String(m)),
      logError: () => {},
    });
    expect(r.resolved).toBe(1);
    expect(r.kept_new).toBe(1);
    // Marked resolved (audit-preserved); a second pass finds nothing pending.
    const again = await runQueueConflicts({ projectRoot, prompter: () => 'keep-new', log: () => {}, logError: () => {} });
    expect(again.resolved).toBe(0);
  });
});

describe('Task 113 — buildConflictPrompter (prompter logic, unit)', () => {
  const entry = { proposedId: 'P-NEW22222', proposedText: 'a', proposedTrust: 'medium', existingId: 'P-AAAAAAAA', existingText: 'b', existingTrust: 'high', similarity: 0.9 };
  it('returns the chosen valid decision', async () => {
    const p = buildConflictPrompter({ ask: async () => 'keep-old', log: () => {} });
    expect(await p(entry)).toBe('keep-old');
  });
  it('re-asks on an invalid answer until a valid one (validate-retry loop)', async () => {
    let n = 0;
    const p = buildConflictPrompter({ ask: async () => (n++ === 0 ? 'nope' : 'keep-new'), log: () => {} });
    expect(await p(entry)).toBe('keep-new');
    expect(n).toBe(2);
  });
});

describe('Task 113 (F-9) — runQueueConflicts merge-both drives the real merger', () => {
  it('merge-both merges the two scratchpad bullets end-to-end (covers the mergeFn path)', async () => {
    const { sandbox, projectRoot } = makeFixture();
    try {
      seedScratchpad(projectRoot, 'MEMORY.md', [
        { section: 'Decisions', id: 'P-AAAAAAAA', text: 'we use Postgres', trust: 'high' },
        { section: 'Decisions', id: 'P-NEW22222', text: 'we use Postgres 16', trust: 'medium' },
      ]);
      writeConflictEntry({
        tier: 'P', projectRoot,
        newId: 'P-NEW22222', newText: 'we use Postgres 16', newTrust: 'medium',
        existingId: 'P-AAAAAAAA', existingText: 'we use Postgres', existingTrust: 'high',
        similarity: 0.9, similarityBackend: 'substring',
      });
      const out = [];
      const r = await runQueueConflicts({
        projectRoot,
        prompter: () => 'merge-both',
        log: (m) => out.push(String(m)),
        logError: (m) => out.push(String(m)),
      });
      expect(r.resolved).toBe(1);
      expect(r.merged).toBe(1);
      expect(out.join('\n')).toMatch(/merge-both|merged/);
    } finally {
      rmSync(sandbox, { recursive: true, force: true });
    }
  });
});

describe('Task 113 — runQueueConflicts error handling (resolve seam)', () => {
  afterEach(() => { process.exitCode = 0; });
  it('reports a resolver error + sets exit code (error branch)', async () => {
    const errs = [];
    const r = await runQueueConflicts({
      projectRoot: '/x', prompter: () => 'keep-old', log: () => {}, logError: (m) => errs.push(String(m)),
      resolve: async () => ({ action: 'error', errors: ['nope'] }),
    });
    expect(r.action).toBe('error');
    expect(errs.join('\n')).toContain('nope');
  });
});
