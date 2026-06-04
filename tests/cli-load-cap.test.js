// @doors: 1, 2
// Door 3 N/A: scratchpad write is in-process; graduation's writeFact is in-process too.
// Door 4 N/A: covered by cli-graduation (graduated/evicted audit entries); this file
//   pins the load-cap *response/state* contract.
// Door 5 N/A: no message-queue interaction.

// Tests for Task 94 — load-cap (not write-cap). Design §19 / D-61.
//
// The architecture invariant: memory is NEVER lost. A write that exceeds the
// per-file cap must still SUCCEED — the cap governs only how much is injected,
// not whether content can be saved. The `cap_exceeded` reject path (Task 12 /
// Task 91) is gone: writes always land; overflow graduates to the searchable
// store, and what can't graduate simply grows the file (inject load-caps it).
//
// Boundary-test discipline: assert appendScratchpadBullet()'s PUBLIC outcome —
// the write succeeds and the content is preserved (in the scratchpad or a
// graduated fact file), never dropped.

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

function buildMemoryMd({ targetBytes, paddingDate = '2026-05-24T10:00:00Z', paddingTrust = 'high' }) {
  const header = [
    '<!--', 'Cap: 2500 chars.', 'Last distilled: 2026-05-24.', 'Last health check: 2026-05-24.', '-->',
    '', '# Working Memory', '', '## Active Threads', '', '## Environment Notes', '',
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
      source: 'transcripts/2026-05-24.md', source_line: 42, sha1: 'b'.repeat(40),
      write: 'user-explicit', trust: 'high', at: '2026-05-24T12:00:00Z',
    },
    now: '2026-05-24T12:00:00Z',
    ...overrides,
  };
}

function buildLessonsMd({ targetBytes }) {
  const header = [
    '<!--', 'Cap: 1800 chars.', 'Last distilled: 2026-05-24.', 'Last health check: 2026-05-24.', '-->',
    '', '# Lessons (cross-project)', '', '## Tooling Lessons', '', '## Process Lessons',
    '', '## Anti-patterns', '', '## Cross-Project Lessons', '',
  ].join('\n');
  const lines = [header];
  let i = 0;
  while (true) {
    const id = `U-PAD${String(i).padStart(5, '0')}`;
    const bullet = `- (${id}) cross-project lesson number ${i} that should persist across every project`;
    const comment = `  <!-- source: pad/${i}.md, source_line: 1, sha1: ${'a'.repeat(40)}, write: user-explicit, trust: high, at: 2026-05-24T10:00:00Z -->`;
    const candidate = lines.join('\n') + '\n' + bullet + '\n' + comment;
    if (Buffer.byteLength(candidate, 'utf8') >= targetBytes) break;
    lines.push(bullet);
    lines.push(comment);
    i++;
  }
  return lines.join('\n') + '\n';
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

describe('Task 94 — load-cap, not write-cap (§19 / D-61)', () => {
  let sandbox, projectRoot, memoryMd;

  beforeEach(() => {
    sandbox = mkdtempSync(join(tmpdir(), 'cmk-loadcap-test-'));
    projectRoot = join(sandbox, 'proj');
    mkdirSync(join(projectRoot, 'context'), { recursive: true });
    memoryMd = join(projectRoot, 'context', 'MEMORY.md');
  });

  afterEach(() => {
    rmSync(sandbox, { recursive: true, force: true });
  });

  it('94.1: a write that exceeds the cap and CANNOT be relieved still SUCCEEDS (no cap_exceeded)', () => {
    // Cap below the empty-scaffold floor (~135B) — graduation can free nothing
    // useful, so pre-Task-94 this returned action:'error' cap_exceeded. Now the
    // write must land anyway (load-cap: the file is allowed to exceed the inject
    // budget; injection load-caps it later).
    setCap(projectRoot, 100);
    writeFileSync(memoryMd, buildMemoryMd({ targetBytes: 800 }), 'utf8');

    const r = appendScratchpadBullet(
      validBulletOpts({ projectRoot, text: 'a fact that must never be lost to a cap' }),
    );

    expect(r.action).toBe('appended'); // NOT 'error'
    expect(r.errorCategory).toBeUndefined();
    // Door 2: the content is on disk (not dropped), even though the file > cap.
    const after = readFileSync(memoryMd, 'utf8');
    expect(after).toContain('a fact that must never be lost to a cap');
  });

  it('94.1 never-lose-memory: many high-trust writes past a tight cap all land (scratchpad + graduated store)', () => {
    setCap(projectRoot, 1400);
    writeFileSync(memoryMd, buildMemoryMd({ targetBytes: 900 }), 'utf8');

    const texts = Array.from({ length: 10 }, (_, i) => `durable decision number ${i} the next session must recall`);
    for (const t of texts) {
      const r = appendScratchpadBullet(validBulletOpts({ projectRoot, text: t }));
      expect(r.action).toBe('appended'); // never rejected
    }

    // Every fact is retained SOMEWHERE — still in the scratchpad OR graduated to a
    // fact file. Seed N, assert N retained (never N−k).
    const scratch = readFileSync(memoryMd, 'utf8');
    const facts = factFiles(projectRoot).map((f) => readFileSync(join(projectRoot, 'context', 'memory', f), 'utf8')).join('\n');
    const corpus = scratch + '\n' + facts;
    for (const t of texts) {
      expect(corpus).toContain(t);
    }
  });

  it('94.2: a USER-tier scratchpad that fills GRADUATES to the user-tier fact store (not just project)', () => {
    // The persona write-lock from cut-gate2 §6 (D-60): graduation was project-
    // MEMORY.md-only. 94.2 lifts the gate so the user tier graduates too, into
    // its OWN fact store (userDir/memory/), keeping the never-lose invariant.
    const userDir = join(sandbox, 'user-tier');
    mkdirSync(userDir, { recursive: true });
    writeFileSync(join(userDir, 'LESSONS.md'), buildLessonsMd({ targetBytes: 1100 }), 'utf8');

    const r = appendScratchpadBullet({
      tier: 'U',
      scratchpad: 'LESSONS.md',
      section: 'Cross-Project Lessons',
      userDir,
      settings: { scratchpads: { 'LESSONS.md': { max_chars: 800 } } },
      text: 'always run the linter before pushing — a durable cross-project rule',
      provenance: {
        source: 'transcripts/x.md', source_line: 1, sha1: 'b'.repeat(40),
        write: 'user-explicit', trust: 'high', at: '2026-05-24T12:00:00Z',
      },
      now: '2026-05-24T12:00:00Z',
    });

    expect(r.action).toBe('appended');
    expect(r.bulletsGraduated).toBeGreaterThan(0); // graduation FIRED on the user tier

    // Door 2: graduated to the USER-tier fact store (userDir/fragments/ — the
    // user-tier equivalent of the project's context/memory/), not the project one.
    const userFactDir = join(userDir, 'fragments');
    expect(existsSync(userFactDir)).toBe(true);
    const userFacts = readdirSync(userFactDir).filter((f) => f.endsWith('.md') && f !== 'INDEX.md');
    expect(userFacts.length).toBeGreaterThan(0);
    // The new bullet still landed (never lost).
    expect(readFileSync(join(userDir, 'LESSONS.md'), 'utf8')).toContain('always run the linter before pushing');
  });
});
