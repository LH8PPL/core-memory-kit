// @doors: 1,3
// Door 2 N/A: pure functions — no state mutation.
// Door 3: the git-grep behavior test (Task 214) REAL-spawns `git grep
//   --untracked` against a temp repo to prove the flag scans untracked files —
//   the D-310 blind spot this task closes.
// Door 4 N/A: no logging in the pure helpers.
// Door 5 N/A: no message queue.
//
// Boundary tests for the name-confinement guard (Task 122 / D-102). We test the
// PURE helpers (name extraction + allowlist filtering) + the Task-214 untracked
// scan behavior via the real git command.

import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  parseMaintainerFirstName,
  offendersOutsideAllowlist,
  buildNamePattern,
  ALLOWLIST,
} from '../scripts/validate-maintainer-name-confined.mjs';

describe('parseMaintainerFirstName', () => {
  it('extracts the first-name token from a standard copyright line', () => {
    expect(parseMaintainerFirstName('Copyright (c) 2026 Jane Doe')).toBe('Jane');
  });

  it('accepts an uppercase (C) and extra whitespace', () => {
    expect(parseMaintainerFirstName('Copyright (C) 2026   Sam  Smith')).toBe('Sam');
  });

  it('handles a single-token name', () => {
    expect(parseMaintainerFirstName('Copyright (c) 2030 Madonna')).toBe('Madonna');
  });

  it('returns null when there is no copyright line (so the validator can error loudly)', () => {
    expect(parseMaintainerFirstName('MIT License\n\nPermission is hereby granted...')).toBeNull();
  });
});

describe('offendersOutsideAllowlist', () => {
  it('returns nothing when every hit is an allowlisted author/credit file', () => {
    const hits = [
      'LICENSE',
      'plugin/.claude-plugin/plugin.json',
      '.claude-plugin/marketplace.json',
      'python/pyproject.toml',
    ];
    expect(offendersOutsideAllowlist(hits)).toEqual([]);
  });

  it('flags any file outside the allowlist', () => {
    const hits = ['LICENSE', 'packages/cli/src/doctor.mjs', 'tests/foo.test.js'];
    expect(offendersOutsideAllowlist(hits)).toEqual([
      'packages/cli/src/doctor.mjs',
      'tests/foo.test.js',
    ]);
  });

  it('an empty hit list yields no offenders', () => {
    expect(offendersOutsideAllowlist([])).toEqual([]);
  });

  it('honors a custom allowlist (over-mutation guard: only non-listed survive)', () => {
    const hits = ['a.md', 'b.md', 'c.md'];
    expect(offendersOutsideAllowlist(hits, new Set(['b.md']))).toEqual(['a.md', 'c.md']);
  });

  it('the exported ALLOWLIST is exactly the 4 author/credit files', () => {
    expect([...ALLOWLIST].sort()).toEqual([
      '.claude-plugin/marketplace.json',
      'LICENSE',
      'plugin/.claude-plugin/plugin.json',
      'python/pyproject.toml',
    ]);
  });
});

describe('buildNamePattern (hardened case-insensitive word-START match — Task 123.B / D-103)', () => {
  // Compile the pattern exactly as `git grep -i -P` applies it, to pin behavior.
  // Synthetic names ('Jane' / 'Test') keep this test itself name-free while
  // proving the rule: the OLD `-w -F` match missed lowercase + name-prefixed
  // forms; `\b<name>` catches them, the word-START boundary skips mid-word noise.
  const re = (name) => new RegExp(buildNamePattern(name), 'i');

  it('matches the bare name, case-insensitively', () => {
    expect(re('Jane').test('Jane')).toBe(true);
    expect(re('Jane').test('jane')).toBe(true);
    expect(re('Jane').test('JANE')).toBe(true);
  });

  it('matches name-prefixed identifiers the old -w -F whole-word match missed', () => {
    const r = re('Jane');
    expect(r.test('jane-test-5')).toBe(true); // hyphenated run label (lowercase)
    expect(r.test('janewiki')).toBe(true); // no internal boundary at all
    expect(r.test('janepedia')).toBe(true);
    expect(r.test('cloned to /c/Projects/janewiki/raw')).toBe(true); // inside a path
  });

  it('does NOT match the stem buried mid-word (word-START boundary excludes false positives)', () => {
    const r = re('Test'); // "test" sits mid-word in "contest"/"latest"
    expect(r.test('contest')).toBe(false);
    expect(r.test('latest')).toBe(false);
    expect(r.test('test-run')).toBe(true); // but a word STARTING with the stem is flagged
    expect(r.test('testing')).toBe(true);
  });

  it('regex-escapes the name so a metacharacter cannot break or widen the pattern', () => {
    expect(() => new RegExp(buildNamePattern('A.B'), 'i')).not.toThrow();
    expect(re('A.B').test('A.B')).toBe(true);
    expect(re('A.B').test('AxB')).toBe(false); // the dot is literal, not "any char"
  });
});

describe('Task 214 (D-310) — the untracked scan: `git grep --untracked` catches a not-yet-committed leak', () => {
  // The D-310 incident: a research note carried the maintainer's name in a path
  // label, the pre-commit screen ran the validator BY THE BOOK and passed —
  // because the file was still UNTRACKED and plain `git grep` only sees tracked
  // files. This proves the --untracked flag (Task 214) now catches that exact
  // shape, while STILL respecting .gitignore (so gitignored tiers stay excluded).
  let repo;
  const git = (args) => spawnSync('git', args, { cwd: repo, encoding: 'utf8', timeout: 30000 });

  function makeRepo() {
    repo = mkdtempSync(join(tmpdir(), 'cmk-nameguard-'));
    git(['init', '-q']);
    git(['config', 'user.email', 'test@example.com']);
    git(['config', 'user.name', 'Test']);
    writeFileSync(join(repo, '.gitignore'), 'secret-tier/\n');
    return repo;
  }

  // The pattern the validator uses (word-START boundary), applied to a stand-in name.
  const NAME = 'Alexname';
  const grepUntracked = () =>
    git(['grep', '-l', '-i', '-P', '--untracked', '--', buildNamePattern(NAME)]);

  it('flags an UNTRACKED (not-yet-added) file carrying the name', () => {
    makeRepo();
    try {
      // An untracked research-note-shaped file with the name in a path-label.
      mkdirSync(join(repo, 'docs'), { recursive: true });
      writeFileSync(join(repo, 'docs', 'note.md'), `- capture: ${NAME}wiki/raw/x.md\n`);
      const r = grepUntracked();
      expect(r.status).toBe(0); // 0 = matches found
      expect(r.stdout).toContain('docs/note.md');
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it('STILL excludes a gitignored file (untracked-not-ignored only — the tier deviation is preserved)', () => {
    makeRepo();
    try {
      mkdirSync(join(repo, 'secret-tier'), { recursive: true });
      writeFileSync(join(repo, 'secret-tier', 'raw.md'), `${NAME} appears here freely\n`);
      const r = grepUntracked();
      // No non-ignored match → git grep exits 1 (no matches).
      expect(r.status).toBe(1);
      expect(r.stdout.trim()).toBe('');
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});
