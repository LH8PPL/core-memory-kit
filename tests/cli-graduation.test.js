// @doors: 1, 2, 4
// Door 3 N/A: graduation calls writeFact() in-process (no subprocess spawn).
// Door 5 N/A: no message-queue interaction.

// Tests for Task 91 — MEMORY.md graduation (the missing 3rd shrink mechanism).
//
// Scope (D-57, Decision A): graduation is a SAFETY VALVE — when MEMORY.md is at
// cap pressure and consolidate() can't free enough (because the bullets are
// high-trust, which stale-drop never removes), the oldest high-trust bullets
// GRADUATE into context/memory/*.md fact files (via writeFact), freeing the hot
// index so the new write lands instead of returning CAP_EXCEEDED. Search-only;
// project MEMORY.md only.
//
// Boundary-test discipline: assert appendScratchpadBullet()'s PUBLIC outcome —
// the write succeeds, fact files appear on disk, MEMORY.md drops under cap, the
// graduated bullets leave MEMORY.md but the recent/low-trust ones do not.
// Do NOT test internal graduation helpers.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  rmSync,
  existsSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { appendScratchpadBullet } from '../packages/cli/src/scratchpad.mjs';

// A MEMORY.md full of RECENT + HIGH-trust bullets — exactly the accumulation
// consolidate() refuses to drop (high-trust is preserved regardless of age),
// so cap pressure can only be relieved by graduation. This is the proven helper
// from cli-scratchpad.test.js (padding lands in Environment Notes; each bullet
// body is distinct so writeFact derives a distinct content id).
function buildMemoryMd({
  targetBytes,
  paddingDate = '2026-05-24T10:00:00Z',
  paddingTrust = 'high',
}) {
  const header = [
    '<!--',
    'Cap: 2500 chars.',
    'Last distilled: 2026-05-24.',
    'Last health check: 2026-05-24.',
    '-->',
    '',
    '# Working Memory',
    '',
    '## Active Threads',
    '',
    '## Environment Notes',
    '',
  ].join('\n');
  const footer = ['', '## Pending Decisions', '', ''].join('\n');

  const lines = [header];
  let i = 0;
  while (true) {
    const id = `P-PAD${String(i).padStart(5, '0')}`;
    const bullet = `- (${id}) padding bullet number ${i} ensuring deterministic char count`;
    const comment = `  <!-- source: pad/${i}.md, source_line: 1, sha1: ${'a'.repeat(40)}, write: manual-edit, trust: ${paddingTrust}, at: ${paddingDate} -->`;
    const candidate = lines.join('\n') + '\n' + bullet + '\n' + comment + footer;
    if (Buffer.byteLength(candidate, 'utf8') >= targetBytes) break;
    lines.push(bullet);
    lines.push(comment);
    i++;
  }
  return lines.join('\n') + footer;
}

function validBulletOpts(overrides = {}) {
  return {
    tier: 'P',
    scratchpad: 'MEMORY.md',
    section: 'Active Threads',
    text: 'newly added scratchpad bullet',
    provenance: {
      source: 'transcripts/2026-05-24.md',
      source_line: 42,
      sha1: 'b'.repeat(40),
      write: 'user-explicit',
      trust: 'high',
      at: '2026-05-24T12:00:00Z',
    },
    now: '2026-05-24T12:00:00Z',
    ...overrides,
  };
}

function setCap(projectRoot, maxChars) {
  writeFileSync(
    join(projectRoot, 'context', 'settings.json'),
    JSON.stringify({ scratchpads: { 'MEMORY.md': { max_chars: maxChars } } }),
    'utf8',
  );
}

function factFiles(projectRoot) {
  const dir = join(projectRoot, 'context', 'memory');
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith('.md') && f !== 'INDEX.md');
}

describe('Task 91 — MEMORY.md graduation (safety valve)', () => {
  let sandbox;
  let projectRoot;
  let memoryMd;

  beforeEach(() => {
    sandbox = mkdtempSync(join(tmpdir(), 'cmk-graduation-test-'));
    projectRoot = join(sandbox, 'proj');
    mkdirSync(join(projectRoot, 'context'), { recursive: true });
    memoryMd = join(projectRoot, 'context', 'MEMORY.md');
  });

  afterEach(() => {
    rmSync(sandbox, { recursive: true, force: true });
  });

  it('the BLOCKER: a high-trust-full MEMORY.md that would CAP_EXCEEDED now graduates + appends', () => {
    setCap(projectRoot, 1500);
    // ~1450 bytes of recent high-trust bullets — consolidate() can drop NONE.
    writeFileSync(memoryMd, buildMemoryMd({ targetBytes: 1480 }), 'utf8');

    const r = appendScratchpadBullet(
      validBulletOpts({
        projectRoot,
        text: 'a brand new high-trust durable fact about the deploy target',
      }),
    );

    // Door 1 (response): the write SUCCEEDS — pre-graduation this returned
    // action:'error', errorCategory:'cap_exceeded'.
    expect(r.action).toBe('appended');
    expect(r.bulletsGraduated).toBeGreaterThan(0);

    // Door 2 (state): graduated bullets became fact files on disk...
    expect(factFiles(projectRoot).length).toBeGreaterThan(0);
    // ...MEMORY.md is back under cap...
    const after = readFileSync(memoryMd, 'utf8');
    expect(Buffer.byteLength(after, 'utf8')).toBeLessThanOrEqual(1500);
    // ...the new bullet landed...
    expect(after).toContain('a brand new high-trust durable fact about the deploy target');
    // ...and at least one padding (graduated) bullet LEFT MEMORY.md.
    expect(after).not.toContain('P-PAD00000'); // validate-test-ids: ignore (helper-generated 0-padded id)
  });

  it('cross-store dedup: a bullet whose fact already exists does not create a second file', () => {
    setCap(projectRoot, 1500);
    writeFileSync(memoryMd, buildMemoryMd({ targetBytes: 1480 }), 'utf8');

    // First append → graduation creates fact files.
    appendScratchpadBullet(
      validBulletOpts({ projectRoot, text: 'first durable fact for the deploy target' }),
    );
    const countAfterFirst = factFiles(projectRoot).length;
    expect(countAfterFirst).toBeGreaterThan(0);

    // Re-seed the SAME high-trust-full state and append again. The padding
    // bodies are identical to round 1, so graduating them must DEDUP against
    // the fact files already on disk (writeFact keys on content id) — not pile
    // up duplicate files.
    writeFileSync(memoryMd, buildMemoryMd({ targetBytes: 1480 }), 'utf8');
    appendScratchpadBullet(
      validBulletOpts({ projectRoot, text: 'second durable fact for the deploy target' }),
    );

    const countAfterSecond = factFiles(projectRoot).length;
    // The padding bodies repeat, so re-graduating them adds NO new files for the
    // already-graduated bodies (exact-canonical cross-store dedup).
    expect(countAfterSecond).toBe(countAfterFirst);
  });

  it('over-mutation guard: graduation only fires under cap pressure; a comfortable write keeps every bullet', () => {
    setCap(projectRoot, 2500);
    // Well under cap → no graduation should happen.
    writeFileSync(memoryMd, buildMemoryMd({ targetBytes: 900 }), 'utf8');

    const r = appendScratchpadBullet(
      validBulletOpts({ projectRoot, text: 'a small addition with plenty of room' }),
    );

    expect(r.action).toBe('appended');
    expect(r.bulletsGraduated ?? 0).toBe(0);
    expect(factFiles(projectRoot).length).toBe(0);
    const after = readFileSync(memoryMd, 'utf8');
    expect(after).toContain('P-PAD00000'); // validate-test-ids: ignore (helper-generated 0-padded id); nothing graduated away
  });

  it('91.2 eviction archives, does not vanish: a consolidate()-dropped stale bullet is recoverable', () => {
    // Near default cap with STALE MEDIUM padding → consolidate() drops them
    // (low/medium AND >14d). Pre-Task-91 those were hard-deleted with no trace.
    writeFileSync(
      memoryMd,
      buildMemoryMd({
        targetBytes: 2400, // > 95% of the 2500 default cap
        paddingDate: '2026-04-01T00:00:00Z', // >14d old
        paddingTrust: 'medium', // droppable by consolidate
      }),
      'utf8',
    );

    const r = appendScratchpadBullet(validBulletOpts({ projectRoot }));
    expect(r.action).toBe('appended');
    expect(r.bulletsConsolidated).toBeGreaterThan(0);

    // Dropped from the live hot index...
    const after = readFileSync(memoryMd, 'utf8');
    expect(after).not.toContain('P-PAD00000'); // validate-test-ids: ignore (helper id)

    // ...but ARCHIVED, not vanished (the §6.5 tombstone principle applied to the
    // eviction edge — Door 2 state + Door 4 recoverability).
    const archivePath = join(
      projectRoot,
      'context',
      'memory',
      'archive',
      'evicted-bullets.md',
    );
    expect(existsSync(archivePath)).toBe(true);
    expect(readFileSync(archivePath, 'utf8')).toContain('P-PAD00000'); // validate-test-ids: ignore (helper id)
  });
});
