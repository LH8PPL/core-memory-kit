// @doors: 1, 3
// Door 2 N/A: the backend spawns a subprocess + parses its stdout; no kit
//   disk-state mutation under test (an injectable spawnFn keeps it deterministic;
//   the real codex spawn is a live-verify item, done on the real 0.142.5).
// Door 4 N/A: no NDJSON emission at this surface (the callers log the result).
// Door 5 N/A: no message-queue.

// Tests for Task 196/200 — CodexExecBackend: the kit's LLM backend for a
// Codex-only user (no Claude Code). Routes the "Haiku call" through the user's
// OWN `codex exec` (their ChatGPT/Codex login — no API key). The invocation was
// LIVE-VERIFIED on the maintainer's real machine, codex-cli 0.142.5 (2026-07-12):
//   `codex exec --skip-git-repo-check -s read-only --json -` with the prompt on
//   STDIN → exit 0, a JSONL event stream ending in
//   {"type":"item.completed","item":{"type":"agent_message","text":"…"}}.

import { describe, it, expect } from 'vitest';
import { CodexExecBackend, parseCodexJsonStream } from '../packages/cli/src/codex-backend.mjs';
import { EventEmitter } from 'node:events';

// The live-captured event-stream shape (sanitized): parse the LAST agent_message.
const LIVE_STREAM = [
  '{"type":"thread.started","thread_id":"019f57e8-773a-77b3-9b32-e726240d6467"}',
  '{"type":"turn.started"}',
  '{"type":"item.completed","item":{"id":"item_0","type":"agent_message","text":"THE ANSWER"}}',
  '{"type":"turn.completed","usage":{"input_tokens":14441,"output_tokens":6}}',
].join('\n');

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

describe('Task 196 — parseCodexJsonStream', () => {
  it('extracts the LAST item.completed agent_message text', () => {
    expect(parseCodexJsonStream(LIVE_STREAM)).toBe('THE ANSWER');
  });

  it('skips non-JSON noise lines and other event types', () => {
    const noisy = `some banner\n${LIVE_STREAM}\ntrailing note`;
    expect(parseCodexJsonStream(noisy)).toBe('THE ANSWER');
  });

  it('degrades to empty string on a drifted/empty stream (never throws)', () => {
    expect(parseCodexJsonStream('')).toBe('');
    expect(parseCodexJsonStream('{"type":"turn.completed"}')).toBe('');
    expect(parseCodexJsonStream(undefined)).toBe('');
  });
});

describe('Task 196/200 — CodexExecBackend', () => {
  it('spawns `codex exec --skip-git-repo-check -s read-only --json -` with the prompt on STDIN (the LIVE-verified invocation)', async () => {
    const { spawnFn, calls } = makeFakeSpawn(LIVE_STREAM);
    const b = new CodexExecBackend({ spawnFn });
    await b.compress({ input: 'compress this', instructions: 'be terse' });

    expect(calls).toHaveLength(1);
    const { cmd, args, opts, stdin } = calls[0];
    const flat = process.platform === 'win32' ? cmd : [cmd, ...args].join(' ');
    expect(flat).toContain('exec');
    expect(flat).toContain('--skip-git-repo-check'); // the sandbox cwd is not a git repo
    expect(flat).toContain('read-only'); // never execute model-generated commands
    expect(flat).toContain('--json'); // deterministic machine output
    // the prompt goes on STDIN (the D-278/D-280 posture), not argv
    expect(stdin).toContain('be terse');
    expect(stdin).toContain('compress this');
    expect(flat).not.toContain('compress this');
    // the recursion guard env var is set in the child (else the inner codex
    // would fire .codex/hooks.json → cmk codex-hook → the kit again)
    const env = process.platform === 'win32' ? args.env : opts.env;
    expect(env.CMK_BACKEND_SPAWN).toBe('1');
  });

  it('omits --model by default (the user\'s configured default), passes it when given', async () => {
    const a = makeFakeSpawn(LIVE_STREAM);
    await new CodexExecBackend({ spawnFn: a.spawnFn }).compress({ input: 'x' });
    const flatA = process.platform === 'win32' ? a.calls[0].cmd : [a.calls[0].cmd, ...a.calls[0].args].join(' ');
    expect(flatA).not.toContain('--model');

    const c = makeFakeSpawn(LIVE_STREAM);
    await new CodexExecBackend({ spawnFn: c.spawnFn, model: 'gpt-5.3-codex' }).compress({ input: 'x' });
    const flatB = process.platform === 'win32' ? c.calls[0].cmd : [c.calls[0].cmd, ...c.calls[0].args].join(' ');
    expect(flatB).toContain('--model');
    expect(flatB).toContain('gpt-5.3-codex');
  });

  it('parses the answer from the JSONL stream', async () => {
    const { spawnFn } = makeFakeSpawn(LIVE_STREAM);
    const b = new CodexExecBackend({ spawnFn });
    const r = await b.compress({ input: 'x' });
    expect(r.outputText).toBe('THE ANSWER');
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
    const b = new CodexExecBackend({ spawnFn });
    await expect(b.compress({ input: 'x', timeoutMs: 30 })).rejects.toMatchObject({
      category: 'haiku_timeout',
    });
  });

  it('a non-zero exit rejects with a failed-category error', async () => {
    const { spawnFn } = makeFakeSpawn('', { exitCode: 1 });
    const wrapped = (cmd, args, opts) => {
      const child = spawnFn(cmd, args, opts);
      child.stdin.end = () => setImmediate(() => {
        child.stderr.emit('data', Buffer.from('codex auth error', 'utf8'));
        child.emit('close', 1);
      });
      return child;
    };
    const b = new CodexExecBackend({ spawnFn: wrapped });
    await expect(b.compress({ input: 'x' })).rejects.toMatchObject({
      category: 'haiku_failed',
    });
  });

  it('modelId() + estimatedCostPerCall() satisfy the CompressorBackend contract', () => {
    const b = new CodexExecBackend();
    expect(typeof b.modelId()).toBe('string');
    expect(b.estimatedCostPerCall(1000)).toBeGreaterThan(0);
  });
});
