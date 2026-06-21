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

    it('promptSubmit → inject (per-prompt recall)', () => {
      const calls = [];
      dispatchKiroHook({
        event: 'promptSubmit',
        payload: {},
        cwd: '/proj',
        deps: { inject: (a) => { calls.push('inject'); return { ok: true, text: '' }; }, capture: () => {} },
      });
      expect(calls).toEqual(['inject']);
    });

    // I-1: the Amazon-Q/CLI Rust contract names the prompt trigger
    // `userPromptSubmit` (the IDE .kiro.hook surface calls it `promptSubmit`).
    // The dispatcher must recognize BOTH → inject, so a CLI agent wiring the
    // contract name never routes to the silent no-op branch.
    it('userPromptSubmit (the Rust-contract name) → inject, not no-op', () => {
      const calls = [];
      const r = dispatchKiroHook({
        event: 'userPromptSubmit',
        payload: {},
        cwd: '/proj',
        deps: { inject: () => { calls.push('inject'); return { ok: true, text: 'M' }; }, capture: () => {} },
      });
      expect(r.action).toBe('inject');
      expect(calls).toEqual(['inject']);
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
        event: 'preToolUse',
        payload: {},
        cwd: '/proj',
        deps: { inject: () => ({ ok: true, text: '' }), capture: () => {} },
      });
      expect(r.exitCode).toBe(0);
      expect(r.action).toBe('noop');
    });
  });
});
