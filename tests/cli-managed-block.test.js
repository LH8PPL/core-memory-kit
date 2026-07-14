// @doors: 1, 2
// Door 3 N/A: file read/write only — no subprocess spawn.
// Door 4 N/A: no log/NDJSON surface.
// Door 5 N/A: no message-queue interaction.

// Tests for managed-block.mjs — the shared agent-config + instruction helpers
// (deduped from install-agent.mjs + install-kiro.mjs).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  writeManagedBlock,
  removeManagedBlock,
  removeJsonKey,
  pruneEmptyParent,
  trimLeadingNewlines,
  trimTrailingNewlines,
} from '../packages/cli/src/managed-block.mjs';

let dir;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'cmk-mb-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

describe('managed-block — shared helpers', () => {
  it('writeManagedBlock creates with frontmatter, byte-preserves user content on append', () => {
    const p = join(dir, 'AGENTS.md');
    expect(writeManagedBlock(p, { body: 'BODY', frontmatter: '---\ninclusion: always\n---\n\n' })).toBe(true);
    let txt = readFileSync(p, 'utf8');
    expect(txt).toMatch(/inclusion: always/);
    expect(txt).toContain('BODY');
    // idempotent
    expect(writeManagedBlock(p, { body: 'BODY', frontmatter: '---\ninclusion: always\n---\n\n' })).toBe(false);
  });

  it('writeManagedBlock appends to a user file preserving their content', () => {
    const p = join(dir, 'X.md');
    writeFileSync(p, '# Mine\n\nkeep me', 'utf8');
    writeManagedBlock(p, { body: 'OURS' });
    const txt = readFileSync(p, 'utf8');
    expect(txt).toContain('keep me');
    expect(txt).toContain('OURS');
  });

  it('removeManagedBlock strips our block, preserves the rest', () => {
    const p = join(dir, 'X.md');
    writeFileSync(p, '# Mine\nkeep', 'utf8');
    writeManagedBlock(p, { body: 'OURS' });
    expect(removeManagedBlock(p)).toBe(true);
    const txt = readFileSync(p, 'utf8');
    expect(txt).toContain('keep');
    expect(txt).not.toMatch(/core-memory-kit:start/);
  });

  it('removeJsonKey preserves siblings; pruneEmptyParent drops an emptied object', () => {
    const p = join(dir, 'c.json');
    writeFileSync(p, JSON.stringify({ servers: { a: 1, ours: 2 } }), 'utf8');
    removeJsonKey(p, ['servers', 'ours']);
    expect(JSON.parse(readFileSync(p, 'utf8')).servers).toEqual({ a: 1 });

    writeFileSync(p, JSON.stringify({ servers: { ours: 2 } }), 'utf8');
    removeJsonKey(p, ['servers', 'ours']);
    pruneEmptyParent(p, ['servers']);
    expect(JSON.parse(readFileSync(p, 'utf8')).servers).toBeUndefined();
  });

  it('removeJsonKey refuses to clobber a corrupt file', () => {
    const p = join(dir, 'bad.json');
    writeFileSync(p, '{ broken,,, ', 'utf8');
    expect(removeJsonKey(p, ['x'])).toBe(false);
    expect(readFileSync(p, 'utf8')).toBe('{ broken,,, ');
  });

  it('newline trims are correct (and ReDoS-safe by construction)', () => {
    expect(trimTrailingNewlines('a\n\n\n')).toBe('a');
    expect(trimLeadingNewlines('\n\n\nb')).toBe('b');
    expect(trimTrailingNewlines('a')).toBe('a');
  });
});
