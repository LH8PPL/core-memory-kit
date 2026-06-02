// @doors: 1, 2
// Door 3 N/A: lessonsPromote routes through memoryWrite (in-process file
//   write) — no subprocess spawn at this boundary.
// Door 4 N/A: the audit-log entry is memoryWrite's contract, asserted in
//   tests/cli-memory-write.test.js. This boundary asserts routing + on-disk
//   state (the fact lands in the right user-tier file/section, untouched
//   neighbors), which is what Task 76 adds.
// Door 5 N/A: no message-queue surface.
//
// Tests for Task 76 — `cmk lessons promote <id>`: the EXPLICIT half of the
// wedge (D-27/D-30). Before this the subcommand was a stub and the
// memory-write skill hand-edited LESSONS.md, bypassing every safety the
// promote path provides. This locks the contract: an explicit promote moves a
// project fact into the user tier through promoteCandidatesToUserTier at
// confidence:'high' (promotes, not queues), and leaves neighbors intact.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { lessonsPromote } from '../packages/cli/src/lessons-promote.mjs';
import { writeFact } from '../packages/cli/src/write-fact.mjs';
import { forget } from '../packages/cli/src/forget.mjs';
import { appendScratchpadBullet, ensureSectionExists } from '../packages/cli/src/scratchpad.mjs';

let projectRoot;
let userDir;

function validFactOpts(overrides = {}) {
  return {
    tier: 'P',
    type: 'feedback',
    slug: 'sample',
    title: 'Sample fact',
    body: 'Always pin the venv path before installing deps.',
    writeSource: 'user-explicit',
    trust: 'high',
    sourceFile: 'context/transcripts/2026-06-01.md',
    sourceLine: 1,
    sourceSha1: 'deadbeef0123456789abcdef0123456789abcdef',
    ...overrides,
  };
}

beforeEach(() => {
  projectRoot = mkdtempSync(join(tmpdir(), 'cmk-lp-proj-'));
  userDir = mkdtempSync(join(tmpdir(), 'cmk-lp-user-'));
  // Scaffold the user-tier scratchpads the promote path writes into. They must
  // exist (ensureSectionExists returns {error:'no-file'} otherwise → queued).
  writeFileSync(join(userDir, 'LESSONS.md'), '# Lessons\n\n## Existing Section\n\n- pre-existing lesson\n');
  writeFileSync(join(userDir, 'HABITS.md'), '# Habits\n\n## Existing Habit\n\n- pre-existing habit\n');
});

afterEach(() => {
  rmSync(projectRoot, { recursive: true, force: true });
  rmSync(userDir, { recursive: true, force: true });
});

describe('cmk lessons promote (Task 76)', () => {
  it('promotes a project fact into the user-tier LESSONS.md (default target)', () => {
    const w = writeFact(validFactOpts({ projectRoot }));
    expect(w.id).toBeTruthy();

    const res = lessonsPromote({ id: w.id, projectRoot, userDir });

    // Door 1 — Response
    expect(res.action).toBe('promoted');
    expect(res.target).toBe('LESSONS.md');
    expect(res.section).toBe('Cross-Project Lessons');
    expect(res.id).toBe(w.id);

    // Door 2 — State: the fact body landed in LESSONS.md under the default section
    const lessons = readFileSync(join(userDir, 'LESSONS.md'), 'utf8');
    expect(lessons).toContain('## Cross-Project Lessons');
    expect(lessons).toContain('Always pin the venv path before installing deps.');
    // Durability: an EXPLICIT promote is user-attested → trust:high (the
    // maintenance passes never age it out / auto-supersede it). A medium write
    // here would let the persona decay like an inferred preference.
    expect(lessons).toMatch(/trust: high/);
    // Over-mutation guard: the pre-existing section + bullet survive untouched
    expect(lessons).toContain('## Existing Section');
    expect(lessons).toContain('- pre-existing lesson');
    // HABITS.md was not touched
    expect(readFileSync(join(userDir, 'HABITS.md'), 'utf8')).not.toContain('venv');
  });

  it('routes to HABITS.md when --to HABITS.md is given', () => {
    const w = writeFact(validFactOpts({ projectRoot, body: 'I prefer terse commit messages.' }));

    const res = lessonsPromote({ id: w.id, projectRoot, userDir, to: 'HABITS.md' });

    expect(res.action).toBe('promoted');
    expect(res.target).toBe('HABITS.md');
    const habits = readFileSync(join(userDir, 'HABITS.md'), 'utf8');
    expect(habits).toContain('I prefer terse commit messages.');
    // LESSONS.md untouched by a HABITS promote
    expect(readFileSync(join(userDir, 'LESSONS.md'), 'utf8')).not.toContain('terse commit');
  });

  it('honors an explicit --section override', () => {
    const w = writeFact(validFactOpts({ projectRoot }));
    const res = lessonsPromote({ id: w.id, projectRoot, userDir, section: 'Tooling Lessons' });
    expect(res.action).toBe('promoted');
    expect(res.section).toBe('Tooling Lessons');
    expect(readFileSync(join(userDir, 'LESSONS.md'), 'utf8')).toContain('## Tooling Lessons');
  });

  it('a supersede (updated lesson replaces a same-topic one) reports promoted, not queued', () => {
    // Seed an existing Cross-Project Lessons bullet at trust:medium.
    ensureSectionExists(join(userDir, 'LESSONS.md'), 'Cross-Project Lessons');
    appendScratchpadBullet({
      tier: 'U',
      scratchpad: 'LESSONS.md',
      section: 'Cross-Project Lessons',
      text: 'Always pin the venv path before installing dependencies',
      provenance: {
        source: 'seed',
        source_line: 1,
        sha1: 'c'.repeat(40),
        write: 'compressor',
        trust: 'medium',
        at: '2026-05-29T00:00:00Z',
      },
      userDir,
      now: '2026-05-29T00:00:00Z',
    });
    // A refined version of the same rule (Jaccard ≈0.78 ≥ 0.5 → conflict;
    // high ≥ medium → supersede, not queue).
    const w = writeFact(validFactOpts({ projectRoot, body: 'Always pin the venv path before installing deps' }));
    const res = lessonsPromote({ id: w.id, projectRoot, userDir });
    expect(res.action).toBe('promoted');
    expect(res.superseded).toBeTruthy();
    // State: the old wording is gone, the new one is present (replaced, not duplicated).
    const lessons = readFileSync(join(userDir, 'LESSONS.md'), 'utf8');
    expect(lessons).toContain('installing deps');
    expect(lessons).not.toContain('installing dependencies');
  });

  it('promotes a RICH (multi-line --why/--how) fact — flattened to one well-formed bullet (B1)', () => {
    // The primary wedge case: an explicitly-captured rich rule. resolveFact
    // returns the multi-line body; a raw multi-line bullet would be rejected
    // by writeBullet (newline guard) → queued. lessonsPromote must flatten it.
    const richBody = 'Use the repository pattern.\n\n**Why:** keeps data access out of route handlers.\n\n**How to apply:** put queries in app/repositories/.';
    const w = writeFact(validFactOpts({ projectRoot, title: 'Repository pattern', body: richBody }));

    const res = lessonsPromote({ id: w.id, projectRoot, userDir });
    expect(res.action).toBe('promoted');

    const lessons = readFileSync(join(userDir, 'LESSONS.md'), 'utf8');
    // The rule + its rationale landed, on a SINGLE bullet line (no raw newlines
    // splitting the body across lines / detaching the provenance comment).
    expect(lessons).toContain('Use the repository pattern.');
    expect(lessons).toContain('**Why:** keeps data access out of route handlers.');
    expect(lessons).toContain('**How to apply:** put queries in app/repositories/.');
    const bulletLine = lessons.split('\n').find((l) => l.includes('Use the repository pattern.'));
    expect(bulletLine).toMatch(/keeps data access/); // Why/How on the SAME line
    expect(bulletLine).toMatch(/put queries in app\/repositories/);
  });

  it('returns not-found for an unknown id (no write)', () => {
    const before = readFileSync(join(userDir, 'LESSONS.md'), 'utf8');
    const res = lessonsPromote({ id: 'P-S79MJHFN', projectRoot, userDir });
    expect(res.action).toBe('not-found');
    // State: nothing written
    expect(readFileSync(join(userDir, 'LESSONS.md'), 'utf8')).toBe(before);
  });

  it('refuses to promote a tombstoned (forgotten) fact', () => {
    const w = writeFact(validFactOpts({ projectRoot }));
    forget({ idOrQuery: w.id, projectRoot, userDir, yes: true });
    const res = lessonsPromote({ id: w.id, projectRoot, userDir });
    expect(res.action).toBe('not-found');
    expect(res.errors[0]).toContain('tombstoned');
  });

  it('rejects an invalid --to target with a schema error (no write)', () => {
    const w = writeFact(validFactOpts({ projectRoot }));
    const res = lessonsPromote({ id: w.id, projectRoot, userDir, to: '../etc/passwd' });
    expect(res.action).toBe('error');
    expect(res.errorCategory).toBe('schema');
  });

  it('requires userDir (writes to the user tier)', () => {
    const w = writeFact(validFactOpts({ projectRoot }));
    const res = lessonsPromote({ id: w.id, projectRoot, userDir: undefined });
    expect(res.action).toBe('error');
    expect(res.errorCategory).toBe('schema');
  });
});
