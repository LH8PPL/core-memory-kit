// @doors: 1, 2
// Door 3 N/A: the dispatcher reuses the in-process injectContext/captureTurn
//   logic via injected deps in tests; the real detached auto-extract spawn is
//   covered by capture-turn's own spawn-smoke tests.
// Door 4 N/A: observability is captureTurn/injectContext's concern (tested there);
//   the dispatcher's own surface is routing.
// Door 5 N/A: no message-queue interaction.

// Tests for Task 50.J — the `cmk hook <event>` Kiro dispatcher.
//
// ONE entrypoint that fans out by Kiro's lifecycle event → reuses the kit's
// existing inject/capture logic. Kiro's hook events (agentSpawn / promptSubmit /
// stop) map to the kit's inject-at-start / capture-at-turn-end. Two invariants:
//   - routes each event to the right kit operation (inject vs capture)
//   - ALWAYS exits 0 — a crashed hook must not break the Kiro session (PILOT caveat)

import { describe, it, expect } from 'vitest';
import { dispatchKiroHook } from '../packages/cli/src/kiro-hook-dispatch.mjs';

describe('Task 50.J — Kiro hook dispatcher', () => {
  describe('routes events to the right kit operation', () => {
    it('agentSpawn → inject (returns the injection text on stdout)', () => {
      const calls = [];
      const r = dispatchKiroHook({
        event: 'agentSpawn',
        payload: {},
        cwd: '/proj',
        deps: {
          inject: (args) => { calls.push(['inject', args]); return { ok: true, text: 'MEMORY' }; },
          capture: () => { calls.push(['capture']); },
        },
      });
      expect(r.action).toBe('inject');
      expect(r.exitCode).toBe(0);
      expect(calls).toEqual([['inject', { cwd: '/proj' }]]);
      expect(r.stdout).toContain('MEMORY');
    });

    // 50.N.1: promptSubmit does BOTH inject (recall) AND capturePrompt (the
    // <private>-strip + transcript-append half) — matching Claude Code's
    // UserPromptSubmit which fires cmk-capture-prompt (inject hint + capture).
    it('promptSubmit → inject AND capturePrompt (per-prompt recall + prompt capture)', () => {
      const calls = [];
      dispatchKiroHook({
        event: 'promptSubmit',
        payload: { prompt: 'a question' },
        cwd: '/proj',
        deps: {
          inject: () => { calls.push('inject'); return { ok: true, text: '' }; },
          capturePrompt: (a) => { calls.push(['capturePrompt', a]); },
          capture: () => {},
        },
      });
      expect(calls).toContain('inject');
      const cp = calls.find((c) => c[0] === 'capturePrompt');
      expect(cp).toBeTruthy();
      expect(cp[1].payload.prompt).toBe('a question');
      expect(cp[1].projectRoot).toBe('/proj');
    });

    // I-1: the Amazon-Q/CLI Rust contract names the prompt trigger
    // `userPromptSubmit` (the IDE .kiro.hook surface calls it `promptSubmit`).
    // Both → inject AND capturePrompt, so a CLI agent wiring the contract name
    // never routes to the silent no-op branch and captures the prompt too.
    it('userPromptSubmit (the Rust-contract name) → inject AND capturePrompt', () => {
      const calls = [];
      const r = dispatchKiroHook({
        event: 'userPromptSubmit',
        payload: { prompt: 'rule X' },
        cwd: '/proj',
        deps: {
          inject: () => { calls.push('inject'); return { ok: true, text: 'M' }; },
          capturePrompt: (a) => { calls.push(['capturePrompt', a]); },
          capture: () => {},
        },
      });
      expect(r.action).toBe('inject');
      expect(calls).toContain('inject');
      expect(calls.some((c) => c[0] === 'capturePrompt')).toBe(true);
    });

    // capturePrompt is best-effort: a throw must NOT break inject or the session.
    it('promptSubmit with capturePrompt THROWING still injects + exits 0', () => {
      const calls = [];
      const r = dispatchKiroHook({
        event: 'promptSubmit',
        payload: { prompt: 'q' },
        cwd: '/proj',
        deps: {
          inject: () => { calls.push('inject'); return { ok: true, text: 'M' }; },
          capturePrompt: () => { throw new Error('capture boom'); },
          capture: () => {},
        },
      });
      expect(r.exitCode).toBe(0);
      expect(r.action).toBe('inject');
      expect(r.stdout).toBe('M'); // inject still surfaced despite the capture throw
      expect(calls).toContain('inject');
    });

    // a dispatcher with NO capturePrompt dep (older install) → inject only, no crash.
    it('promptSubmit with NO capturePrompt dep → inject only (forward/back compat)', () => {
      const r = dispatchKiroHook({
        event: 'promptSubmit',
        payload: { prompt: 'q' },
        cwd: '/proj',
        deps: { inject: () => ({ ok: true, text: 'M' }), capture: () => {} },
      });
      expect(r.exitCode).toBe(0);
      expect(r.action).toBe('inject');
    });

    it('stop → capture (turn-end capture)', () => {
      const calls = [];
      const r = dispatchKiroHook({
        event: 'stop',
        payload: { assistant_response: 'hi' },
        cwd: '/proj',
        deps: {
          inject: () => ({ ok: true, text: '' }),
          capture: (args) => { calls.push(args); return { action: 'captured' }; },
        },
      });
      expect(r.action).toBe('capture');
      expect(r.exitCode).toBe(0);
      // the Kiro payload is forwarded to capture
      expect(calls[0].projectRoot).toBe('/proj');
      expect(calls[0].payload).toEqual({ assistant_response: 'hi' });
    });

    // 50.N.2 — postToolUse → observe (the file-edit observation leg, matching
    // Claude Code's PostToolUse → cmk-observe-edit).
    it('postToolUse → observe (forwards the Kiro payload + projectRoot)', () => {
      const calls = [];
      const r = dispatchKiroHook({
        event: 'postToolUse',
        payload: { tool_name: 'fs_write', tool_input: { path: '/proj/app.py' } },
        cwd: '/proj',
        deps: {
          inject: () => ({ ok: true, text: '' }),
          capture: () => {},
          observe: (args) => { calls.push(args); return { action: 'appended' }; },
        },
      });
      expect(r.action).toBe('observe');
      expect(r.exitCode).toBe(0);
      expect(calls[0].projectRoot).toBe('/proj');
      expect(calls[0].payload.tool_name).toBe('fs_write');
    });

    it('postToolUse with NO observe dep (older install) → noop, exit 0 (no crash)', () => {
      const r = dispatchKiroHook({
        event: 'postToolUse',
        payload: { tool_name: 'fs_write' },
        cwd: '/proj',
        deps: { inject: () => ({ ok: true, text: '' }), capture: () => {} },
      });
      expect(r.exitCode).toBe(0);
      expect(r.action).toBe('noop');
    });

    it('postToolUse + observe THROWS → exit 0 (best-effort, never wedges the session)', () => {
      const r = dispatchKiroHook({
        event: 'postToolUse',
        payload: { tool_name: 'fs_write' },
        cwd: '/proj',
        deps: {
          inject: () => ({ ok: true, text: '' }),
          capture: () => {},
          observe: () => { throw new Error('observe boom'); },
        },
      });
      expect(r.exitCode).toBe(0);
      // a thrown observe surfaces via the outer catch as action:'error' (exit 0
      // holds — there's no inject-after-observe to protect on postToolUse).
      expect(r.action).toBe('error');
    });

    // preToolUse → the memory delete-guardrail (D-192). The ONE event that may
    // exit non-zero: a block → exit 2 (Kiro blocks the tool).
    it('preToolUse + guard says BLOCK → exitCode 2 + reason on stderr', () => {
      const r = dispatchKiroHook({
        event: 'preToolUse',
        payload: { command: 'rm -rf context/memory' },
        cwd: '/proj',
        deps: {
          inject: () => ({ ok: true, text: '' }),
          capture: () => {},
          guard: () => ({ block: true, reason: 'nope — memory delete' }),
        },
      });
      expect(r.action).toBe('blocked');
      expect(r.exitCode).toBe(2);
      expect(r.stderr).toMatch(/memory delete/);
    });

    it('preToolUse + guard says ALLOW → exitCode 0', () => {
      const r = dispatchKiroHook({
        event: 'preToolUse',
        payload: { command: 'ls' },
        cwd: '/proj',
        deps: { inject: () => ({}), capture: () => {}, guard: () => ({ block: false }) },
      });
      expect(r.action).toBe('allow');
      expect(r.exitCode).toBe(0);
    });

    it('preToolUse with NO guard dep (older install) → allow, fail-open (never block by accident)', () => {
      const r = dispatchKiroHook({
        event: 'preToolUse',
        payload: { command: 'rm -rf context/memory' },
        cwd: '/proj',
        deps: { inject: () => ({}), capture: () => {} }, // no guard wired
      });
      expect(r.action).toBe('allow');
      expect(r.exitCode).toBe(0);
    });

    it('preToolUse + guard THROWS → exitCode 0 (a crashed guard fails OPEN, never wedges the tool)', () => {
      const r = dispatchKiroHook({
        event: 'preToolUse',
        payload: { command: 'rm -rf context/memory' },
        cwd: '/proj',
        deps: {
          inject: () => ({}),
          capture: () => {},
          guard: () => { throw new Error('guard boom'); },
        },
      });
      expect(r.exitCode).toBe(0); // fail-open via the dispatcher catch
      expect(r.action).toBe('error');
    });
  });

  describe('always exits 0 (a crashed hook must not break the Kiro session)', () => {
    it('inject throwing → exitCode 0, error reported on stderr not a crash', () => {
      const r = dispatchKiroHook({
        event: 'agentSpawn',
        payload: {},
        cwd: '/proj',
        deps: { inject: () => { throw new Error('boom'); }, capture: () => {} },
      });
      expect(r.exitCode).toBe(0);
      expect(r.stderr).toMatch(/boom/);
    });

    it('capture throwing → exitCode 0', () => {
      const r = dispatchKiroHook({
        event: 'stop',
        payload: {},
        cwd: '/proj',
        deps: { inject: () => ({ ok: true, text: '' }), capture: () => { throw new Error('kaboom'); } },
      });
      expect(r.exitCode).toBe(0);
      expect(r.stderr).toMatch(/kaboom/);
    });

    it('an unknown event → exitCode 0, no-op (forward-compatible with new Kiro events)', () => {
      const r = dispatchKiroHook({
        event: 'someFutureEvent', // genuinely unknown (preToolUse is now the guard event)
        payload: {},
        cwd: '/proj',
        deps: { inject: () => ({ ok: true, text: '' }), capture: () => {} },
      });
      expect(r.exitCode).toBe(0);
      expect(r.action).toBe('noop');
    });
  });
});
