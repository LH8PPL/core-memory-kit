// @doors: 1, 3
// Door 2 N/A: the backend spawns a subprocess + parses its stdout; no kit
//   disk-state mutation under test (an injectable spawnFn keeps it deterministic;
//   the real cursor-agent spawn is a live-verify item, not a unit test).
// Door 4 N/A: no NDJSON emission at this surface (the callers log the result).
// Door 5 N/A: no message-queue.

// Tests for Task 200 (D-270/D-274) — CursorAgentBackend: the kit's LLM backend
// for a Cursor-only user (no Claude Code). Routes the "Haiku call" through the
// user's OWN `cursor-agent` (their Cursor SUBSCRIPTION login — no API key). The
// invocation was LIVE-VERIFIED on the user's real Windows machine (D-274):
//   `agent -p --trust --model composer-2.5-fast --output-format text "<prompt>"`
//   → exit 0, ~11s, clean answer on STDOUT (no ANSI/`> ` marker, unlike kiro-cli).
// On Windows the binary is an `agent.cmd` shim under %LOCALAPPDATA%\cursor-agent\.

import { describe, it, expect } from 'vitest';
import { CursorAgentBackend } from '../packages/cli/src/cursor-backend.mjs';
import { EventEmitter } from 'node:events';

// A fake spawn that captures the argv/opts AND the stdin the backend writes, then
// simulates cursor-agent emitting a response on stdout and exiting 0. Unlike
// kiro-cli, Cursor's --output-format text is CLEAN (no ANSI colors, no `> `
// marker); and (D-278) the prompt is PIPED ON STDIN, not passed as a positional.
function makeFakeSpawn(stdoutData, { exitCode = 0 } = {}) {
  const calls = [];
  const spawnFn = (cmd, args, opts) => {
    const rec = { cmd, args, opts, stdin: '' };
    calls.push(rec);
    const child = new EventEmitter();
    child.stdin = {
      write: (chunk) => { rec.stdin += chunk.toString(); return true; },
      end: () => setImmediate(() => {
        child.stdout.emit('data', Buffer.from(stdoutData, 'utf8'));
        child.emit('close', exitCode);
      }),
    };
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.kill = () => {};
    return child;
  };
  return { spawnFn, calls };
}

describe('Task 200 — CursorAgentBackend', () => {
  it('spawns `agent -p --trust --model composer-2.5-fast --output-format text` and pipes the prompt on STDIN (the LIVE-verified invocation, D-278)', async () => {
    const { spawnFn, calls } = makeFakeSpawn('cursor backend works');
    const b = new CursorAgentBackend({ spawnFn });
    await b.compress({ input: 'compress this', instructions: 'be terse' });

    expect(calls).toHaveLength(1);
    const { cmd, args, opts, stdin } = calls[0];
    // Windows uses a pre-quoted single string; POSIX uses argv. Assert against
    // whichever the current platform produced (mirrors cli-kiro-backend.test.js).
    const flat = process.platform === 'win32' ? cmd : [cmd, ...args].join(' ');
    expect(flat).toContain('-p'); // headless print mode
    expect(flat).toContain('--trust'); // headless workspace-trust: dodges the `[a] Trust this workspace` prompt
    expect(flat).toContain('--model');
    expect(flat).toContain('composer-2.5-fast'); // the cheap background "Haiku-role" model (D-274)
    expect(flat).toContain('--output-format');
    expect(flat).toContain('text');
    // D-278: the prompt goes on STDIN, NOT as a positional arg (a multi-line
    // positional read as a workspace question; stdin makes the model do the task).
    expect(stdin).toContain('be terse');
    expect(stdin).toContain('compress this');
    expect(flat).not.toContain('compress this'); // not in argv
    // the recursion guard env var is set in the child (else cursor-agent could
    // re-fire the kit's own Cursor hooks — same class as kiro; agent-agnostic guard)
    const env = process.platform === 'win32' ? args.env : opts.env;
    expect(env.CMK_BACKEND_SPAWN).toBe('1');
  });

  it('parses the answer off STDOUT — clean, NO ANSI/`> ` strip needed (unlike kiro)', async () => {
    const { spawnFn } = makeFakeSpawn('HELLO_WORLD_42');
    const b = new CursorAgentBackend({ spawnFn });
    const r = await b.compress({ input: 'x' });
    expect(r.outputText).toBe('HELLO_WORLD_42');
  });

  it('trims surrounding whitespace/newlines from the answer', async () => {
    const { spawnFn } = makeFakeSpawn('\n  line one\nline two\n  ');
    const b = new CursorAgentBackend({ spawnFn });
    const r = await b.compress({ input: 'x' });
    expect(r.outputText).toBe('line one\nline two');
  });

  it('honors timeoutMs — a hung spawn rejects with a timeout-category error', async () => {
    const spawnFn = () => {
      const child = new EventEmitter();
      child.stdin = { write: () => true, end: () => {} };
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      child.kill = () => {};
      return child;
    };
    const b = new CursorAgentBackend({ spawnFn });
    await expect(b.compress({ input: 'x', timeoutMs: 30 })).rejects.toMatchObject({
      category: 'haiku_timeout',
    });
  });

  it('a non-zero exit rejects with a failed-category error carrying stderr', async () => {
    const { spawnFn } = makeFakeSpawn('', { exitCode: 1 });
    const wrapped = (cmd, args, opts) => {
      const child = spawnFn(cmd, args, opts);
      child.stdin.end = () => setImmediate(() => {
        child.stderr.emit('data', Buffer.from('cursor auth error', 'utf8'));
        child.emit('close', 1);
      });
      return child;
    };
    const b = new CursorAgentBackend({ spawnFn: wrapped });
    await expect(b.compress({ input: 'x' })).rejects.toMatchObject({
      category: 'haiku_failed',
    });
  });

  it('respects maxOutputBytes by truncating the answer', async () => {
    const { spawnFn } = makeFakeSpawn('abcdefghij');
    const b = new CursorAgentBackend({ spawnFn });
    const r = await b.compress({ input: 'x', maxOutputBytes: 4 });
    expect(Buffer.byteLength(r.outputText, 'utf8')).toBeLessThanOrEqual(4);
  });

  it('modelId() + estimatedCostPerCall() satisfy the CompressorBackend contract', () => {
    const b = new CursorAgentBackend();
    expect(typeof b.modelId()).toBe('string');
    expect(b.modelId()).toContain('composer');
    expect(b.estimatedCostPerCall(1000)).toBeGreaterThan(0);
  });
});
