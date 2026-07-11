// Task 207 (D-306 generalized) — BOM-tolerant hook-payload parsing across ALL
// Claude-Code hook bins.
// @doors: 1,3
// Door 2 N/A: parseHookPayload mutates nothing; the guard-memory spawn asserts
// a DECISION (exit code), not disk state.
// Door 3: the behavioral half REAL-spawns the actual bin with the BOM payload
// (the Task-221 fixture-corpus discipline — the BOM prefix is the exact byte
// Cursor 3.5.17 was live-captured sending in D-306).
// Door 4 N/A: no message queues in the kit.
// Door 5 N/A: no NDJSON surface — the parse is plumbing; the bins' own logs
// are covered by their feature suites.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseHookPayload } from '../packages/cli/src/read-hook-stdin.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const BOM = '﻿';

describe('Task 207 — parseHookPayload (the shared BOM-tolerant parse)', () => {
  it('a BOM-prefixed JSON payload parses normally (the D-306 shape)', () => {
    expect(parseHookPayload(BOM + '{"hook_event_name":"Stop","session_id":"s1"}')).toEqual({
      hook_event_name: 'Stop',
      session_id: 's1',
    });
  });

  it('empty / whitespace / BOM-only / null → {} (the clean no-op the bins expect)', () => {
    expect(parseHookPayload('')).toEqual({});
    expect(parseHookPayload('   \n')).toEqual({});
    expect(parseHookPayload(BOM)).toEqual({});
    expect(parseHookPayload(BOM + '  ')).toEqual({});
    expect(parseHookPayload(null)).toEqual({});
    expect(parseHookPayload(undefined)).toEqual({});
  });

  it('malformed JSON still THROWS — the helper removes the BOM trap, not the error path', () => {
    expect(() => parseHookPayload('not json')).toThrow();
    expect(() => parseHookPayload(BOM + '{broken')).toThrow();
  });
});

describe('Task 207 — structural: every hook bin routes its parse through parseHookPayload', () => {
  // Both trees resolve to the ONE canonical read-hook-stdin.mjs, so a bin that
  // regresses to an inline `JSON.parse(raw)` re-opens the BOM trap. This scan
  // makes the fix structural (the validate-* posture): a new/edited bin with a
  // raw payload parse fails here, not in a live gate two minors later.
  const bins = [
    'packages/cli/bin/cmk-approve-permission.mjs',
    'packages/cli/bin/cmk-capture-prompt.mjs',
    'packages/cli/bin/cmk-capture-turn.mjs',
    'packages/cli/bin/cmk-guard-memory.mjs',
    'packages/cli/bin/cmk-inject-context.mjs',
    'packages/cli/bin/cmk-observe-edit.mjs',
    'plugin/bin/cmk-approve-permission.mjs',
    'plugin/bin/cmk-capture-prompt.mjs',
    'plugin/bin/cmk-capture-turn.mjs',
    'plugin/bin/cmk-inject-context.mjs',
    'plugin/bin/cmk-observe-edit.mjs',
  ];
  for (const rel of bins) {
    it(`${rel} uses parseHookPayload and has NO raw payload JSON.parse`, () => {
      const src = readFileSync(join(ROOT, rel), 'utf8');
      expect(src).toContain('parseHookPayload(');
      // The BOM-unsafe inline shapes this task removed:
      expect(src).not.toMatch(/JSON\.parse\(raw(Input)?\)/);
      expect(src).not.toMatch(/JSON\.parse\(hookPayloadRaw\)/);
    });
  }
});

describe('Task 207 — behavioral REAL spawn: a BOM payload ROUTES instead of silently no-opping', () => {
  // cmk-guard-memory is the sharpest discriminator: pre-fix, a BOM-prefixed
  // payload made JSON.parse throw → the catch FAIL-OPENED (exit 0) → a
  // destructive command against context/memory sailed through — the BOM class
  // wasn't just a cosmetic no-op here, it was a GUARD BYPASS. Post-fix the
  // same bytes must BLOCK (exit 2).
  const binPath = join(ROOT, 'packages', 'cli', 'bin', 'cmk-guard-memory.mjs');
  const destructivePayload = JSON.stringify({
    tool_name: 'Bash',
    tool_input: { command: 'rm -rf context/memory' },
  });

  it('BOM-prefixed destructive payload → BLOCK (exit 2), identical to the un-BOM\'d payload', () => {
    const bom = spawnSync(process.execPath, [binPath], {
      input: BOM + destructivePayload,
      encoding: 'utf8',
      timeout: 30_000,
    });
    const plain = spawnSync(process.execPath, [binPath], {
      input: destructivePayload,
      encoding: 'utf8',
      timeout: 30_000,
    });
    expect(plain.status).toBe(2); // sanity: the guard blocks the plain payload
    expect(bom.status).toBe(2); // THE FIX: the BOM'd payload routes + blocks too
  });

  it('a harmless BOM-prefixed payload still allows (exit 0) — no over-blocking', () => {
    const r = spawnSync(process.execPath, [binPath], {
      input: BOM + JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'ls -la' } }),
      encoding: 'utf8',
      timeout: 30_000,
    });
    expect(r.status).toBe(0);
  });
});
