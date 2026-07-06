// @doors: 1, 3
// Door 2 N/A: the backend spawns a subprocess + parses its stdout; no kit
//   disk-state mutation under test (an injectable spawnFn keeps it deterministic;
//   the real kiro-cli spawn is a live-verify item, not a unit test).
// Door 4 N/A: no NDJSON emission at this surface (the callers log the result).
// Door 5 N/A: no message-queue.

// Tests for Task 200 (D-270) — KiroCliBackend: the kit's LLM backend for a
// Kiro-only user (no Claude Code). Routes the "Haiku call" through the user's
// OWN `kiro-cli chat` (their Google/Kiro login — no ANTHROPIC_API_KEY). The
// invocation + output-parse were LIVE-CONFIRMED on the installed kiro-cli
// (docs/research/2026-07-04-agent-relative-llm-backend.md): a one-shot returns
// the answer on STDOUT (TUI noise → stderr) prefixed with `> ` + ANSI colors.

import { describe, it, expect } from 'vitest';
import { KiroCliBackend } from '../packages/cli/src/kiro-backend.mjs';
import { EventEmitter } from 'node:events';

// A fake spawn that captures the argv/opts and simulates kiro-cli emitting a
// response on stdout then exiting 0. `stdoutData` lets a test inject the exact
// (ANSI-polluted, `> `-prefixed) bytes the real kiro-cli produces.
function makeFakeSpawn(stdoutData, { exitCode = 0 } = {}) {
  const calls = [];
  const spawnFn = (cmd, args, opts) => {
    calls.push({ cmd, args, opts });
    const child = new EventEmitter();
    child.stdin = {
      write: () => true,
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

describe('Task 200 — KiroCliBackend', () => {
  it('spawns `kiro-cli chat --no-interactive --model <haiku> --trust-tools=` (the LIVE-verified invocation)', async () => {
    const { spawnFn, calls } = makeFakeSpawn('\x1b[38;5;141m> \x1b[0mmock answer');
    const b = new KiroCliBackend({ spawnFn });
    await b.compress({ input: 'compress this', instructions: 'be terse' });

    expect(calls).toHaveLength(1);
    const { cmd, args, opts } = calls[0];
    // Windows uses a pre-quoted single string; POSIX uses argv. Assert against
    // whichever the current platform produced (mirrors cli-compressor.test.js).
    const flat = process.platform === 'win32' ? cmd : [cmd, ...args].join(' ');
    expect(flat).toContain('chat');
    expect(flat).toContain('--no-interactive');
    expect(flat).toContain('--model');
    expect(flat).toContain('claude-haiku-4.5'); // the cheap model (0.40x, live-confirmed)
    expect(flat).toContain('--trust-tools'); // trust NO tools = the text-only sandbox
    // the recursion guard env var is set in the child (Task 200 — else kiro-cli
    // fires the kit's own hooks → a storm; reproduced live)
    const env = process.platform === 'win32' ? args.env : opts.env;
    expect(env.CMK_BACKEND_SPAWN).toBe('1');
  });

  it('D-279: joins instructions + input as a SINGLE directive line, not two newline blocks', async () => {
    const { spawnFn, calls } = makeFakeSpawn('\x1b[0m> ok');
    const b = new KiroCliBackend({ spawnFn });
    await b.compress({ input: 'THE_INPUT', instructions: 'BE_TERSE' });
    const { cmd, args } = calls[0];
    // the prompt is the positional; find it (last arg on posix, in the cmd string on win32)
    const promptSeen = process.platform === 'win32' ? cmd : args[args.length - 1];
    // single directive: "<instructions>: <input>" — NOT "<instructions>\n\n<input>"
    // (the two-line form made kiro-cli refuse the task, D-279).
    expect(promptSeen).toContain('BE_TERSE: THE_INPUT');
    expect(promptSeen).not.toContain('BE_TERSE\n\nTHE_INPUT');
  });

  it('parses the answer off STDOUT — strips ANSI + the leading `> ` prompt marker', async () => {
    // exactly the shape the live probe returned
    const { spawnFn } = makeFakeSpawn('\x1b[38;5;141m> \x1b[0mHELLO_WORLD_42');
    const b = new KiroCliBackend({ spawnFn });
    const r = await b.compress({ input: 'x' });
    expect(r.outputText).toBe('HELLO_WORLD_42');
  });

  it('handles a multi-line answer (strips the marker only from the first line)', async () => {
    const { spawnFn } = makeFakeSpawn('\x1b[0m> line one\nline two\nline three');
    const b = new KiroCliBackend({ spawnFn });
    const r = await b.compress({ input: 'x' });
    expect(r.outputText).toBe('line one\nline two\nline three');
  });

  it('honors timeoutMs — a hung spawn rejects with a timeout-category error', async () => {
    // a spawn that never emits close
    const spawnFn = () => {
      const child = new EventEmitter();
      child.stdin = { write: () => true, end: () => {} };
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      child.kill = () => {};
      return child;
    };
    const b = new KiroCliBackend({ spawnFn });
    await expect(b.compress({ input: 'x', timeoutMs: 30 })).rejects.toMatchObject({
      category: 'haiku_timeout',
    });
  });

  it('a non-zero exit rejects with a failed-category error carrying stderr', async () => {
    const { spawnFn } = makeFakeSpawn('', { exitCode: 1 });
    // also emit some stderr
    const wrapped = (cmd, args, opts) => {
      const child = spawnFn(cmd, args, opts);
      const origEnd = child.stdin.end;
      child.stdin.end = () => setImmediate(() => {
        child.stderr.emit('data', Buffer.from('kiro auth error', 'utf8'));
        child.emit('close', 1);
      });
      return child;
    };
    const b = new KiroCliBackend({ spawnFn: wrapped });
    await expect(b.compress({ input: 'x' })).rejects.toMatchObject({
      category: 'haiku_failed',
    });
  });

  it('modelId() + estimatedCostPerCall() satisfy the CompressorBackend contract', () => {
    const b = new KiroCliBackend();
    expect(typeof b.modelId()).toBe('string');
    expect(b.modelId()).toContain('haiku');
    expect(b.estimatedCostPerCall(1000)).toBeGreaterThan(0);
  });
});
