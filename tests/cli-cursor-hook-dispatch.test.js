// @doors: 1
// Door 2 N/A: the dispatcher is a pure router over injected deps; disk state is
//   injectContext/captureTurn/observeEdit's concern (tested in their own files).
// Door 3 N/A: no subprocess spawn — the real detached auto-extract spawn is
//   covered by capture-turn's own spawn-smoke tests.
// Door 4 N/A: observability is the cores' concern; the dispatcher's surface is
//   routing + the Cursor JSON response protocol (Door 1 here).
// Door 5 N/A: no message-queue interaction.

// Tests for Task 196 — the `cmk cursor-hook` dispatcher.
//
// Cursor hooks speak JSON over stdio BOTH directions (cursor.com/docs/agent/hooks,
// primary-verified 2026-07-03): the payload arrives on stdin with a
// `hook_event_name` field; the response is hook-specific JSON on stdout. The
// dispatcher fans out by event to the kit's existing cores and emits the
// Cursor-shaped response. Invariants:
//   - routes each event to the right kit operation with the right adapted payload
//   - responses are the EXACT Cursor field names (additional_context / continue /
//     permission) — Cursor parses these; a drifted key is a silent no-op
//   - ALWAYS exits 0, and permission-type events fail OPEN on a crash (a broken
//     memory hook must never block the user's prompt or shell command)

import { describe, it, expect } from 'vitest';
import { dispatchCursorHook } from '../packages/cli/src/cursor-hook-dispatch.mjs';

describe('Task 196 — Cursor hook dispatcher', () => {
  describe('routing + Cursor-shaped responses', () => {
    it('sessionStart → inject, responds {additional_context} JSON', () => {
      const calls = [];
      const r = dispatchCursorHook({
        event: 'sessionStart',
        payload: {},
        cwd: '/proj',
        deps: {
          inject: (args) => { calls.push(['inject', args]); return { ok: true, text: 'MEMORY SNAPSHOT' }; },
        },
      });
      expect(r.action).toBe('inject');
      expect(r.exitCode).toBe(0);
      expect(calls).toEqual([['inject', { cwd: '/proj' }]]);
      expect(JSON.parse(r.stdout)).toEqual({ additional_context: 'MEMORY SNAPSHOT' });
    });

    it('sessionStart with an EMPTY snapshot responds valid JSON without additional_context', () => {
      const r = dispatchCursorHook({
        event: 'sessionStart',
        payload: {},
        cwd: '/proj',
        deps: { inject: () => ({ ok: true, text: '' }) },
      });
      expect(r.exitCode).toBe(0);
      expect(JSON.parse(r.stdout)).toEqual({});
    });

    it('beforeSubmitPrompt → capturePrompt with the Cursor prompt field, responds {continue: true}', () => {
      const calls = [];
      const r = dispatchCursorHook({
        event: 'beforeSubmitPrompt',
        payload: { prompt: 'a question', attachments: [] },
        cwd: '/proj',
        deps: {
          capturePrompt: (a) => { calls.push(['capturePrompt', a]); },
        },
      });
      expect(r.action).toBe('capture-prompt');
      expect(r.exitCode).toBe(0);
      const cp = calls.find((c) => c[0] === 'capturePrompt');
      expect(cp[1].payload.prompt).toBe('a question');
      expect(cp[1].projectRoot).toBe('/proj');
      expect(JSON.parse(r.stdout)).toEqual({ continue: true });
    });

    it('afterAgentResponse → capture with {assistant_message} built from the payload text', () => {
      const calls = [];
      const r = dispatchCursorHook({
        event: 'afterAgentResponse',
        payload: { text: 'the assistant said things' },
        cwd: '/proj',
        deps: {
          capture: (a) => { calls.push(['capture', a]); },
        },
      });
      expect(r.action).toBe('capture');
      expect(r.exitCode).toBe(0);
      const c = calls.find((x) => x[0] === 'capture');
      expect(c[1].payload.assistant_message).toBe('the assistant said things');
      expect(c[1].projectRoot).toBe('/proj');
      // afterAgentResponse supports no output fields — no stdout response.
      expect(r.stdout).toBeUndefined();
    });

    it('afterFileEdit → observe with a Write-class tool payload observeEdit recognizes', () => {
      const calls = [];
      const r = dispatchCursorHook({
        event: 'afterFileEdit',
        payload: { file_path: '/proj/src/a.mjs', edits: [{ old_string: 'x', new_string: 'y' }] },
        cwd: '/proj',
        deps: {
          observe: (a) => { calls.push(['observe', a]); },
        },
      });
      expect(r.action).toBe('observe');
      expect(r.exitCode).toBe(0);
      const o = calls.find((x) => x[0] === 'observe');
      expect(o[1].payload.tool_name).toBe('Edit');
      expect(o[1].payload.tool_input.file_path).toBe('/proj/src/a.mjs');
    });

    it('sessionEnd → sessionEnd tasks (fire-and-forget, no response)', () => {
      const calls = [];
      const r = dispatchCursorHook({
        event: 'sessionEnd',
        payload: { reason: 'completed' },
        cwd: '/proj',
        deps: {
          sessionEnd: (a) => { calls.push(['sessionEnd', a]); },
        },
      });
      expect(r.action).toBe('session-end');
      expect(r.exitCode).toBe(0);
      expect(calls.length).toBe(1);
      expect(r.stdout).toBeUndefined();
    });

    it('beforeShellExecution → guard; a block responds {permission: "deny"} with the reason', () => {
      const r = dispatchCursorHook({
        event: 'beforeShellExecution',
        payload: { command: 'rm -rf context/memory', cwd: '/proj' },
        cwd: '/proj',
        deps: {
          guard: () => ({ block: true, reason: 'memory delete-guardrail' }),
        },
      });
      expect(r.action).toBe('blocked');
      expect(r.exitCode).toBe(0); // deny via JSON permission, NOT exit code
      const resp = JSON.parse(r.stdout);
      expect(resp.permission).toBe('deny');
      expect(resp.agent_message).toContain('memory delete-guardrail');
    });

    it('beforeShellExecution → guard; an allow responds {permission: "allow"}', () => {
      const r = dispatchCursorHook({
        event: 'beforeShellExecution',
        payload: { command: 'ls' },
        cwd: '/proj',
        deps: { guard: () => ({ block: false }) },
      });
      expect(r.action).toBe('allow');
      expect(JSON.parse(r.stdout)).toEqual({ permission: 'allow' });
    });

    it('an unknown / future Cursor event is a no-op, never a crash (forward-compatible)', () => {
      const r = dispatchCursorHook({ event: 'someFutureEvent', payload: {}, cwd: '/proj', deps: {} });
      expect(r.action).toBe('noop');
      expect(r.exitCode).toBe(0);
    });
  });

  describe('fail-open invariants (a broken hook must never wedge the Cursor session)', () => {
    it('a crashed inject still exits 0 with the error on stderr', () => {
      const r = dispatchCursorHook({
        event: 'sessionStart',
        payload: {},
        cwd: '/proj',
        deps: { inject: () => { throw new Error('boom'); } },
      });
      expect(r.exitCode).toBe(0);
      expect(r.stderr).toContain('boom');
    });

    it('a crashed capturePrompt STILL responds {continue: true} — capture must never block the prompt', () => {
      const r = dispatchCursorHook({
        event: 'beforeSubmitPrompt',
        payload: { prompt: 'q' },
        cwd: '/proj',
        deps: { capturePrompt: () => { throw new Error('capture boom'); } },
      });
      expect(r.exitCode).toBe(0);
      expect(JSON.parse(r.stdout)).toEqual({ continue: true });
      expect(r.stderr).toContain('capture boom');
    });

    it('a crashed guard fails OPEN ({permission: "allow"}) — a broken guardrail must not block the shell', () => {
      const r = dispatchCursorHook({
        event: 'beforeShellExecution',
        payload: { command: 'ls' },
        cwd: '/proj',
        deps: { guard: () => { throw new Error('guard boom'); } },
      });
      expect(r.exitCode).toBe(0);
      expect(JSON.parse(r.stdout)).toEqual({ permission: 'allow' });
      expect(r.stderr).toContain('guard boom');
    });

    it('missing deps (older install) → clean no-op per event, never a crash', () => {
      for (const event of ['sessionStart', 'beforeSubmitPrompt', 'afterAgentResponse', 'afterFileEdit', 'sessionEnd', 'beforeShellExecution']) {
        const r = dispatchCursorHook({ event, payload: {}, cwd: '/proj', deps: {} });
        expect(r.exitCode).toBe(0);
      }
    });

    it('userDir is forwarded to inject/capture when provided (cross-project user tier)', () => {
      const calls = [];
      dispatchCursorHook({
        event: 'sessionStart',
        payload: {},
        cwd: '/proj',
        userDir: '/u/dir',
        deps: { inject: (a) => { calls.push(a); return { text: '' }; } },
      });
      expect(calls[0].userDir).toBe('/u/dir');
    });
  });
});
