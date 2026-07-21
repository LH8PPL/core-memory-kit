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
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  findLiteralPins,
  checkNodePins,
  LITERAL_ALLOWLIST,
} from '../scripts/validate-node-pin.mjs';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');

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

  it('bench-storage composes with the .nvmrc floor for node:sqlite (D-384 → Task 243)', () => {
    // TEST DELIBERATELY CHANGED (Task 243) — the original pinned "bench-storage
    // MUST hold an allowlist entry", which was correct while .nvmrc was 20:
    // scripts/bench-storage.mjs imports node:sqlite at module scope, that module
    // needs Node >= 22.5, and the D-384 Blocking was that pinning it to 20 would
    // CRASH the benchmark, not skew it. Task 243 raised .nvmrc to 22 (the
    // better-sqlite3 v13 engines floor), which resolves to a 22.x >= 22.5 — so
    // the crash-floor reason evaporated and D-383's original argument (a bench
    // on a different major than the gates is an invisible confound) says it must
    // JOIN the pin. The durable invariant was never "the entry exists"; it is
    // the COMPOSITION between .nvmrc and the benchmark's node:sqlite floor —
    // asserted conditionally so this test survives the floor moving in either
    // direction instead of pinning one side of it.
    const nvmrcMajor = Number.parseInt(
      readFileSync(join(REPO, '.nvmrc'), 'utf8').trim(),
      10,
    );
    if (nvmrcMajor >= 22) {
      // node:sqlite exists on every 22.x setup-node resolves (>= 22.5) — the
      // bench must run the pinned runtime like every other job, and any future
      // re-divergence must re-earn its allowlist entry in writing.
      expect(LITERAL_ALLOWLIST['bench-storage.yml']).toBeUndefined();
      const bench = readFileSync(
        join(REPO, '.github', 'workflows', 'bench-storage.yml'),
        'utf8',
      );
      expect(bench).toMatch(/node-version-file:\s*\.nvmrc/);
    } else {
      // The D-384 world: a pin below the node:sqlite floor crashes the bench,
      // so the divergence MUST be declared.
      expect(LITERAL_ALLOWLIST['bench-storage.yml']).toBeTruthy();
      expect(LITERAL_ALLOWLIST['bench-storage.yml']).toMatch(/22\.5|node:sqlite/);
    }
  });
});
