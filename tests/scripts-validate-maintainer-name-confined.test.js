// @doors: 1
// Door 2 N/A: pure functions — no state mutation.
// Door 3 N/A: the pure helpers spawn nothing (the git-grep IO lives in the
//   unexported run() path, exercised by the real validator on every npm test).
// Door 4 N/A: no logging in the pure helpers.
// Door 5 N/A: no message queue.
//
// Boundary tests for the name-confinement guard (Task 122 / D-102). We test the
// PURE helpers (name extraction + allowlist filtering); the git-grep IO + the
// process.exit are the validator's own job (it runs in the npm-test chain, so
// the real confinement is checked on every run).

import { describe, it, expect } from 'vitest';
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
