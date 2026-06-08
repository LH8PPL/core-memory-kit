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
