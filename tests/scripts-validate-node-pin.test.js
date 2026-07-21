// @doors: 1
// Door 1 (Response): findLiteralPins / checkNodePins return the drift errors.
// Door 2 N/A: a validator reads; it writes nothing.
// Door 3 N/A: the pure functions take file CONTENT, so no subprocess or real repo.
// Door 4 N/A: no message-queue surface.
// Door 5 N/A: reporting is the CLI's stdout + exit code, exercised by npm run lint.
//
// Task 240 (D-383/D-384) — one Node version across CI.
//
// This test file exists because skill-review caught its ABSENCE: the validator
// shipped with the module commenting that its functions were exported "so it is
// testable without the real repo" — and then nothing testing them. 14 of the
// repo's other validators have a test; this one didn't, against a binding
// TDD rule. Manual verification (plant a literal, watch it fail) proved the
// logic but left no safety net for the next regex edit.

import { describe, it, expect } from 'vitest';
import {
  findLiteralPins,
  checkNodePins,
  LITERAL_ALLOWLIST,
} from '../scripts/validate-node-pin.mjs';

const GOOD = 'jobs:\n  a:\n    steps:\n      - uses: actions/setup-node@v7\n        with:\n          node-version-file: .nvmrc\n';
const BAD = 'jobs:\n  a:\n    steps:\n      - uses: actions/setup-node@v7\n        with:\n          node-version: 18\n';

describe('Task 240 — finding literal pins', () => {
  it('flags a bare node-version literal, with its line', () => {
    const hits = findLiteralPins(BAD);
    expect(hits).toHaveLength(1);
    expect(hits[0].line).toBe(6);
  });

  it('does NOT flag node-version-file (the good form contains the substring)', () => {
    expect(findLiteralPins(GOOD)).toEqual([]);
  });

  it('catches `node-version : 20` — space before the colon is valid YAML', () => {
    expect(findLiteralPins('          node-version : 20\n')).toHaveLength(1);
  });

  it('handles quoted values and CRLF', () => {
    expect(findLiteralPins("          node-version: '20'\r\n")).toHaveLength(1);
  });
});

describe('Task 240 — THE GATE BITES', () => {
  const nvmrc = '20\n';

  it('FAILS on a literal, naming the file and the remedy', () => {
    const errs = checkNodePins({ files: [{ name: 'ci.yml', text: BAD }], nvmrc, allowlist: {} });
    expect(errs).toHaveLength(1);
    expect(errs[0]).toMatch(/ci\.yml:6/);
    expect(errs[0], 'an error with no remedy is a nag').toMatch(/node-version-file|allowlist/i);
  });

  it('PASSES when every block reads the file', () => {
    expect(checkNodePins({ files: [{ name: 'ci.yml', text: GOOD }], nvmrc, allowlist: {} })).toEqual([]);
  });

  it('FAILS when .nvmrc is missing — the single source must exist', () => {
    const errs = checkNodePins({ files: [], nvmrc: '', allowlist: {} });
    expect(errs.some((e) => /\.nvmrc/.test(e))).toBe(true);
  });

  it('an ALLOWLISTED workflow may keep its literal', () => {
    const errs = checkNodePins({
      files: [{ name: 'bench.yml', text: BAD }],
      nvmrc,
      allowlist: { 'bench.yml': 'needs a newer runtime for the thing it benchmarks' },
    });
    expect(errs).toEqual([]);
  });
});

describe('Task 240 — the allowlist is a written choice, not a loophole', () => {
  it('every entry carries a non-trivial REASON string', () => {
    for (const [wf, reason] of Object.entries(LITERAL_ALLOWLIST)) {
      expect(typeof reason, `${wf} needs a reason`).toBe('string');
      expect(reason.length, `${wf}'s reason must actually explain something`).toBeGreaterThan(30);
    }
  });

  it('bench-storage is allowlisted for the node:sqlite floor (D-384 regression)', () => {
    // The first draft of Task 240 swept this workflow onto the pin, which would
    // have CRASHED the benchmark: scripts/bench-storage.mjs imports node:sqlite
    // at module scope and that module needs Node >= 22.5. Pin this so nobody
    // "helpfully" empties the allowlist later.
    expect(LITERAL_ALLOWLIST['bench-storage.yml']).toBeTruthy();
    expect(LITERAL_ALLOWLIST['bench-storage.yml']).toMatch(/22\.5|node:sqlite/);
  });
});
