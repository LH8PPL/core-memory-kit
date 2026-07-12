// @doors: 1, 2
// Door 2: readCodexTurn reads the rollout jsonl from disk (the fixture tests) —
//   the capture-side state itself is captureTurn's concern (its own file).
// Door 3 N/A: no subprocess spawn — the real detached auto-extract spawn is
//   covered by capture-turn's own spawn-smoke tests.
// Door 4 N/A: no message-queue interaction.
// Door 5 N/A: observability is the cores' concern; the dispatcher's surface is
//   routing + the Codex hook JSON response protocol (Door 1 here).

// Tests for Task 196 (Codex) — the `cmk codex-hook` dispatcher + rollout reader.
//
// Codex hooks speak JSON over stdio (learn.chatgpt.com/docs/hooks, primary-
// verified 2026-07-12): the payload arrives on stdin with `hook_event_name`,
// `transcript_path`, `cwd`, `session_id`; responses use Codex's exact envelope —
// `hookSpecificOutput.{hookEventName, additionalContext | permissionDecision}`.
// These keys are load-bearing: a drifted key is a silent no-op (inject) or a
// non-blocking guard (deny). Invariants mirror the Cursor dispatcher:
//   - ALWAYS exit 0; permission-type events FAIL OPEN on a crash
//   - unknown events no-op (forward-compatible)
//   - CMK_BACKEND_SPAWN no-ops everything at the entry (Task 200 recursion guard)
//
// The rollout fixture (tests/fixtures/codex-rollout-sample.jsonl) mirrors a REAL
// capture from codex-cli 0.142.5 on 2026-07-12 (shapes preserved, content
// sanitized): event_msg lines with payload.type user_message / agent_message.

import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dispatchCodexHook } from '../packages/cli/src/codex-hook-dispatch.mjs';
import { readCodexTurn } from '../packages/cli/src/codex-transcript.mjs';

const __filename = fileURLToPath(import.meta.url);
const FIXTURE = join(dirname(__filename), 'fixtures', 'codex-rollout-sample.jsonl');

describe('Task 196 (Codex) — readCodexTurn (rollout jsonl)', () => {
  it('extracts the LAST user_message + final agent_message from a real-shaped rollout', () => {
    const turn = readCodexTurn(FIXTURE);
    expect(turn.userText).toBe('Use uv for python packages, remember that.');
    expect(turn.assistantText).toBe(
      "Noted — I'll use uv (never pip) for Python package management in this project.",
    );
  });

  it('returns empty strings for a missing file (never throws)', () => {
    const turn = readCodexTurn(join(dirname(__filename), 'fixtures', 'no-such-rollout.jsonl'));
    expect(turn.userText).toBe('');
    expect(turn.assistantText).toBe('');
  });

  it('tolerates malformed lines + a BOM (the D-306 input-boundary class)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cmk-codex-rollout-'));
    const p = join(dir, 'rollout-broken.jsonl');
    const lines = [
      'not json at all',
      '{"type":"event_msg","payload":{"type":"user_message","message":"real question"}}',
      '{"truncated...',
      '{"type":"event_msg","payload":{"type":"agent_message","message":"real answer","phase":"final_answer"}}',
    ].join('\n');
    writeFileSync(p, `﻿${lines}\n`, 'utf8');
    const turn = readCodexTurn(p);
    expect(turn.userText).toBe('real question');
    expect(turn.assistantText).toBe('real answer');
  });
});

describe('Task 196 (Codex) — dispatcher routing + Codex-shaped responses', () => {
  it('no-ops EVERY event when CMK_BACKEND_SPAWN is set, without calling any core', () => {
    for (const event of ['SessionStart', 'UserPromptSubmit', 'PostToolUse', 'Stop', 'PreToolUse']) {
      const calls = [];
      const r = dispatchCodexHook({
        event,
        payload: { tool_input: { command: 'ls' } },
        cwd: '/proj',
        env: { CMK_BACKEND_SPAWN: '1' },
        deps: {
          inject: () => { calls.push('inject'); return { text: 'X' }; },
          capture: () => calls.push('capture'),
          capturePrompt: () => calls.push('capturePrompt'),
          observe: () => calls.push('observe'),
          guard: () => { calls.push('guard'); return { block: true, reason: 'no' }; },
        },
      });
      expect(r.action).toBe('noop');
      expect(r.exitCode).toBe(0);
      expect(calls, `event ${event} ran a core despite the guard`).toEqual([]);
    }
  });

  it('SessionStart → inject → hookSpecificOutput.additionalContext (exact envelope)', () => {
    const r = dispatchCodexHook({
      event: 'SessionStart',
      payload: {},
      cwd: '/proj',
      env: {},
      deps: { inject: () => ({ text: 'THE SNAPSHOT' }) },
    });
    expect(r.action).toBe('inject');
    expect(r.exitCode).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual({
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
        additionalContext: 'THE SNAPSHOT',
      },
    });
  });

  it('SessionStart with an empty snapshot emits NO stdout (no empty-context envelope)', () => {
    const r = dispatchCodexHook({
      event: 'SessionStart',
      payload: {},
      cwd: '/proj',
      env: {},
      deps: { inject: () => ({ text: '' }) },
    });
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toBeUndefined();
  });

  it('UserPromptSubmit → capturePrompt; NEVER blocks (no decision field, exit 0)', () => {
    const seen = [];
    const r = dispatchCodexHook({
      event: 'UserPromptSubmit',
      payload: { prompt: 'the user prompt' },
      cwd: '/proj',
      env: {},
      deps: { capturePrompt: (a) => seen.push(a) },
    });
    expect(r.exitCode).toBe(0);
    expect(seen).toHaveLength(1);
    expect(seen[0].projectRoot).toBe('/proj');
    // no block/decision in the response — a memory hook must never block a prompt
    if (r.stdout) expect(JSON.parse(r.stdout).decision).toBeUndefined();
  });

  it('UserPromptSubmit fails OPEN when capturePrompt throws (exit 0, no block)', () => {
    const r = dispatchCodexHook({
      event: 'UserPromptSubmit',
      payload: { prompt: 'x' },
      cwd: '/proj',
      env: {},
      deps: { capturePrompt: () => { throw new Error('boom'); } },
    });
    expect(r.exitCode).toBe(0);
    expect(r.stderr).toContain('boom');
    if (r.stdout) expect(JSON.parse(r.stdout).decision).toBeUndefined();
  });

  it('Stop → capture with the turn read from transcript_path (the rollout fixture)', () => {
    const seen = [];
    const r = dispatchCodexHook({
      event: 'Stop',
      payload: { transcript_path: FIXTURE },
      cwd: '/proj',
      env: {},
      deps: { capture: (a) => seen.push(a) },
    });
    expect(r.action).toBe('capture');
    expect(r.exitCode).toBe(0);
    expect(seen).toHaveLength(1);
    expect(seen[0].payload.user_prompt).toBe('Use uv for python packages, remember that.');
    expect(seen[0].payload.assistant_message).toContain('uv (never pip)');
    expect(seen[0].projectRoot).toBe('/proj');
  });

  it('Stop with a missing transcript still captures (empty texts, never crashes)', () => {
    const seen = [];
    const r = dispatchCodexHook({
      event: 'Stop',
      payload: { transcript_path: '/nope/rollout.jsonl' },
      cwd: '/proj',
      env: {},
      deps: { capture: (a) => seen.push(a) },
    });
    expect(r.exitCode).toBe(0);
    expect(seen[0].payload.assistant_message).toBe('');
  });

  it('PostToolUse (apply_patch) → observe with a Write-class payload observeEdit recognizes', () => {
    const seen = [];
    const r = dispatchCodexHook({
      event: 'PostToolUse',
      payload: {
        tool_name: 'apply_patch',
        tool_input: { file_path: '/proj/src/a.mjs' },
        tool_response: { content: 'line1\nline2\nline3' },
      },
      cwd: '/proj',
      env: {},
      deps: { observe: (a) => seen.push(a) },
    });
    expect(r.action).toBe('observe');
    expect(r.exitCode).toBe(0);
    expect(seen[0].payload.tool_name).toBe('Edit');
    expect(seen[0].payload.tool_input.file_path).toBe('/proj/src/a.mjs');
    // the content must survive so observeEdit's line-count eligibility isn't 0
    // (the D-269 "wired-but-dead" class)
    expect(seen[0].payload.tool_response.content).toBe('line1\nline2\nline3');
  });

  it('PreToolUse guard BLOCK → permissionDecision deny (exact envelope)', () => {
    const r = dispatchCodexHook({
      event: 'PreToolUse',
      payload: { tool_name: 'Bash', tool_input: { command: 'rm -rf context/memory' } },
      cwd: '/proj',
      env: {},
      deps: { guard: () => ({ block: true, reason: 'memory delete blocked' }) },
    });
    expect(r.action).toBe('blocked');
    expect(r.exitCode).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: 'memory delete blocked',
      },
    });
  });

  it('PreToolUse guard ALLOW → no deny envelope', () => {
    const r = dispatchCodexHook({
      event: 'PreToolUse',
      payload: { tool_name: 'Bash', tool_input: { command: 'ls' } },
      cwd: '/proj',
      env: {},
      deps: { guard: () => ({ block: false }) },
    });
    expect(r.action).toBe('allow');
    expect(r.exitCode).toBe(0);
    if (r.stdout) {
      expect(JSON.parse(r.stdout).hookSpecificOutput?.permissionDecision).not.toBe('deny');
    }
  });

  it('PreToolUse fails OPEN when the guard crashes (allow, exit 0, error on stderr)', () => {
    const r = dispatchCodexHook({
      event: 'PreToolUse',
      payload: { tool_name: 'Bash', tool_input: { command: 'rm -rf context' } },
      cwd: '/proj',
      env: {},
      deps: { guard: () => { throw new Error('guard crashed'); } },
    });
    expect(r.exitCode).toBe(0);
    expect(r.stderr).toContain('guard crashed');
    if (r.stdout) {
      expect(JSON.parse(r.stdout).hookSpecificOutput?.permissionDecision).not.toBe('deny');
    }
  });

  it('unknown / future events no-op (forward-compatible)', () => {
    for (const event of ['PreCompact', 'SubagentStop', 'SomeFutureEvent']) {
      const r = dispatchCodexHook({ event, payload: {}, cwd: '/proj', env: {}, deps: {} });
      expect(r.action).toBe('noop');
      expect(r.exitCode).toBe(0);
    }
  });

  it('missing deps are clean no-ops, never crashes (older install)', () => {
    for (const event of ['SessionStart', 'UserPromptSubmit', 'PostToolUse', 'Stop']) {
      const r = dispatchCodexHook({ event, payload: {}, cwd: '/proj', env: {}, deps: {} });
      expect(r.exitCode).toBe(0);
    }
  });
});
