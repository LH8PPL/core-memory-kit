// @doors: 1, 2
// Door 3 N/A: no subprocess.
// Door 4 N/A: the not-found error paths return before any audit-log write.
// Door 5 N/A: no message queue.

// Tests for bullet-lookup.mjs + its integration into lessons-promote / forget.
//
// The finding (cut-gate F-3/F-7, 2026-06-06): `cmk search` surfaces ids for BOTH
// graduated facts AND scratchpad bullets, but `cmk lessons promote` / `cmk forget`
// operate on FACTS only — so pasting a bullet id returned a flat, unhelpful
// "no matching fact for ID" even though the id is a live bullet. findBulletScratchpad
// lets both commands say "that's a scratchpad bullet in <file>, not a fact" instead.
//
// Boundary: findBulletScratchpad(id, {projectRoot,userDir}) → scratchpad name | null;
// and the two commands return the actionable error for a bullet id while still
// returning the plain not-found for a genuinely-unknown id (control). Over-mutation
// guard: the error paths must not write — assert MEMORY.md is byte-identical after.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { generateId } from '@lh8ppl/cmk-canonicalize';
import { findBulletScratchpad } from '../packages/cli/src/bullet-lookup.mjs';
import { lessonsPromote } from '../packages/cli/src/lessons-promote.mjs';
import { forget } from '../packages/cli/src/forget.mjs';

let projectRoot;
let userDir;
let memoryPath;
let bulletId;
let unknownFactId;

const BULLET_TEXT = 'always run the migration in a transaction so a failure rolls back cleanly';

beforeEach(() => {
  projectRoot = mkdtempSync(join(tmpdir(), 'cmk-bullet-proj-'));
  userDir = mkdtempSync(join(tmpdir(), 'cmk-bullet-user-'));
  // Project scratchpad with one bullet. id generated at runtime so no literal
  // id token sits in this source (keeps validate-test-ids out of it).
  mkdirSync(join(projectRoot, 'context'), { recursive: true });
  bulletId = generateId('P', BULLET_TEXT);
  unknownFactId = generateId('P', 'a totally different fact that was never written anywhere');
  memoryPath = join(projectRoot, 'context', 'MEMORY.md');
  writeFileSync(
    memoryPath,
    `# Memory\n\n## Decisions\n- (${bulletId}) ${BULLET_TEXT}\n` +
      `  <!-- source: chat, source_line: 1, sha1: deadbeef, write: user-explicit, trust: high, at: 2026-01-01T00:00:00Z -->\n`,
    'utf8',
  );
  // Minimal user-tier scaffold so lessonsPromote's userDir requirement is met.
  mkdirSync(userDir, { recursive: true });
  writeFileSync(join(userDir, 'LESSONS.md'), '# Lessons\n\n## Cross-Project Lessons\n', 'utf8');
});

afterEach(() => {
  rmSync(projectRoot, { recursive: true, force: true });
  rmSync(userDir, { recursive: true, force: true });
});

describe('findBulletScratchpad (Door 1)', () => {
  it('returns the scratchpad filename for a live bullet id', () => {
    expect(findBulletScratchpad(bulletId, { projectRoot, userDir })).toBe('MEMORY.md');
  });

  it('returns null for an id that is not a bullet anywhere', () => {
    expect(findBulletScratchpad(unknownFactId, { projectRoot, userDir })).toBeNull();
  });

  it('returns null for a malformed / wrong-tier id', () => {
    expect(findBulletScratchpad('garbage', { projectRoot, userDir })).toBeNull();
    expect(findBulletScratchpad('X-ABCDEFGH', { projectRoot, userDir })).toBeNull(); // validate-test-ids: ignore
    expect(findBulletScratchpad('', { projectRoot, userDir })).toBeNull();
  });
});

describe('lessons promote — bullet-id hint (Door 1 + 2)', () => {
  it('a bullet id gets the actionable "scratchpad bullet, not a fact" error', () => {
    const res = lessonsPromote({ id: bulletId, projectRoot, userDir });
    expect(res.action).toBe('not-found');
    expect(res.errors[0]).toMatch(/scratchpad bullet in MEMORY\.md, not a graduated fact/);
    expect(res.errors[0]).toMatch(/context\/memory/);
  });

  it('a genuinely-unknown fact id still gets the plain not-found (control — hint is bullet-only)', () => {
    const res = lessonsPromote({ id: unknownFactId, projectRoot, userDir });
    expect(res.action).toBe('not-found');
    expect(res.errors[0]).toBe(`no fact with id '${unknownFactId}'`);
  });

  it('the error path does not mutate the scratchpad (over-mutation guard)', () => {
    const before = readFileSync(memoryPath, 'utf8');
    lessonsPromote({ id: bulletId, projectRoot, userDir });
    expect(readFileSync(memoryPath, 'utf8')).toBe(before);
  });
});

describe('forget — bullet-id hint (Door 1 + 2)', () => {
  it('a bullet id gets the actionable "scratchpad bullet, not a fact" error', () => {
    const res = forget({ idOrQuery: bulletId, projectRoot, userDir, yes: true });
    expect(res.action).toBe('not-found');
    expect(res.errors[0]).toMatch(/scratchpad bullet in MEMORY\.md, not a fact/);
  });

  it('a genuinely-unknown fact id still gets the plain not-found (control)', () => {
    const res = forget({ idOrQuery: unknownFactId, projectRoot, userDir, yes: true });
    expect(res.action).toBe('not-found');
    expect(res.errors[0]).toBe(`no matching fact for "${unknownFactId}"`);
  });

  it('the error path does not mutate the scratchpad (over-mutation guard)', () => {
    const before = readFileSync(memoryPath, 'utf8');
    forget({ idOrQuery: bulletId, projectRoot, userDir, yes: true });
    expect(readFileSync(memoryPath, 'utf8')).toBe(before);
  });
});
