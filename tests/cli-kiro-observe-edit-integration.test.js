// @doors: 1, 2
// Door 3 N/A: no subprocess spawn — observeEdit appends to now.md in-process.
// Door 4 N/A: observeEdit has no NDJSON observability surface of its own.
// Door 5 N/A: no message-queue interaction.

// Integration test for 50.N.2 — the kiro observe-edit path END TO END:
// runHook('postToolUse') with a Kiro fs_write payload → the bin maps fs_write →
// Write → dispatcher → the real observeEdit core → a one-line edit summary is
// appended to context/sessions/now.md. Exercises the tool-name map + the real
// core + the real disk path, which the unit tests (injected observe) can't.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runHook } from '../packages/cli/src/subcommands.mjs';

let sandbox;
beforeEach(() => {
  sandbox = mkdtempSync(join(tmpdir(), 'cmk-kiro-observe-'));
});
afterEach(() => {
  rmSync(sandbox, { recursive: true, force: true });
});

function nowMd() {
  const p = join(sandbox, 'context', 'sessions', 'now.md');
  return existsSync(p) ? readFileSync(p, 'utf8') : null;
}

// observeEdit only records edits whose tool_response content is > 50 lines.
const bigContent = Array.from({ length: 60 }, (_, i) => `line ${i}`).join('\n');

describe('50.N.2 — kiro observe-edit integration (fs_write → now.md edit summary)', () => {
  it('a Kiro fs_write of a large file lands a one-line edit summary in now.md', () => {
    runHook('postToolUse', {}, undefined, {
      cwd: sandbox,
      env: {},
      // the Kiro postToolUse payload shape: {tool_name, tool_input, tool_response}
      payload: {
        tool_name: 'fs_write',
        tool_input: { path: 'app.py' },
        tool_response: { content: bigContent },
      },
      log: () => {},
      logError: () => {},
    });
    const body = nowMd();
    expect(body).not.toBeNull();
    expect(body).toContain('file=app.py');
    expect(body).toContain('Write'); // mapped from fs_write
    expect(body).toMatch(/lines=6\d/); // ~60 lines
  });

  it('a small fs_write (≤50 lines) records nothing (below threshold)', () => {
    runHook('postToolUse', {}, undefined, {
      cwd: sandbox,
      env: {},
      payload: {
        tool_name: 'fs_write',
        tool_input: { path: 'tiny.py' },
        tool_response: { content: 'one\ntwo\nthree' },
      },
      log: () => {},
      logError: () => {},
    });
    expect(nowMd()).toBeNull();
  });

  it('a non-file-write Kiro tool (execute_command) records nothing', () => {
    runHook('postToolUse', {}, undefined, {
      cwd: sandbox,
      env: {},
      payload: { tool_name: 'execute_command', tool_response: { content: bigContent } },
      log: () => {},
      logError: () => {},
    });
    expect(nowMd()).toBeNull(); // not an edit tool → observeEdit noops
  });
});
