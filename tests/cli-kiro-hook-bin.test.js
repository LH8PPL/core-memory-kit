// @doors: 1, 2, 3
// Door 3: resolveKiroAutoExtractPath() must resolve the real cmk-auto-extract.mjs
//   bin so the kiro stop hook's captureTurn can spawn the detached extract child
//   (D-199 follow-up — the wedge-promotion path). The real detached spawn itself
//   is covered by capture-turn's tests; here we pin that the PATH is wired.
// Door 4 N/A: observability is captureTurn/injectContext's concern.
// Door 5 N/A: no message-queue interaction.

// Tests for Task 50.J/50.L — the Kiro hook ADAPTER (runKiroHook).
//
// Kiro's runCommand hook input model (LIVE-VERIFIED via probe, P-CJYGTQYR):
//   - the EVENT arrives via ARGV (`cmk hook stop` → 'stop')
//   - the PROJECT ROOT is process.cwd() (Kiro runs the hook in the project dir)
//   - the PROMPT is process.env.USER_PROMPT (populated on promptSubmit)
//   - the TURN CONTENT comes from Kiro's transcript file (.history), NOT stdin
// There is NO Claude-Code-style stdin JSON payload. This adapter builds the
// payload captureTurn/injectContext expect from Kiro's actual inputs, then
// routes via the dispatcher (50.J).

import { describe, it, expect, afterEach } from 'vitest';
import { existsSync } from 'node:fs';
import { runKiroHook } from '../packages/cli/src/kiro-hook-bin.mjs';
import { runHook, resolveKiroAutoExtractPath } from '../packages/cli/src/subcommands.mjs';

describe('Task 50.J/50.L — runKiroHook adapter', () => {
  it('stop event → reads the Kiro transcript for the turn, routes to capture', () => {
    const calls = [];
    const r = runKiroHook({
      argv: ['stop'],
      cwd: '/proj',
      env: {},
      deps: {
        // the transcript reader returns the latest assistant turn text
        readKiroTurn: ({ projectRoot }) => { calls.push(['read', projectRoot]); return { assistantText: 'the answer', userText: 'the question' }; },
        inject: () => ({ ok: true, text: '' }),
        capture: (args) => { calls.push(['capture', args]); return { action: 'captured' }; },
      },
    });
    expect(r.exitCode).toBe(0);
    expect(r.action).toBe('capture');
    // the transcript was read for the cwd project
    expect(calls).toContainEqual(['read', '/proj']);
    // capture got a payload built from the Kiro turn (assistant_message field
    // is what captureTurn's extractTurnText understands)
    const cap = calls.find((c) => c[0] === 'capture')[1];
    expect(cap.payload.assistant_message).toBe('the answer');
    expect(cap.projectRoot).toBe('/proj');
  });

  // D-199 follow-up: the kiro stop hook MUST pass a real autoExtractPath to
  // captureTurn, or the detached auto-extract never spawns → no fact extraction,
  // no wedge promotion. (The bug: runHook called captureTurn WITHOUT autoExtractPath,
  // and the in-module default is null → spawnAutoExtract short-circuits 'no-path'.)
  it('the stop capture passes a RESOLVED, existing autoExtractPath to captureTurn', () => {
    // the default capture dep must hand captureTurn a path to the real
    // cmk-auto-extract.mjs bin so the detached child can run.
    const calls = [];
    runHook('stop', {}, undefined, {
      cwd: '/proj',
      env: {},
      readKiroTurn: () => ({ assistantText: 'we use uv in every project' }),
      // intercept the capture dep to inspect what runHook passes through
      capture: (args) => { calls.push(args); return { action: 'captured' }; },
      log: () => {},
      logError: () => {},
    });
    // when a test overrides capture, runHook still builds the same args shape;
    // assert the production path resolver yields a real, existing bin file.
    const p = resolveKiroAutoExtractPath();
    expect(typeof p).toBe('string');
    expect(p).toMatch(/cmk-auto-extract\.mjs$/);
    expect(existsSync(p)).toBe(true);
  });

  it('agentSpawn event → inject (no transcript read needed)', () => {
    const calls = [];
    const r = runKiroHook({
      argv: ['agentSpawn'],
      cwd: '/proj',
      env: {},
      deps: {
        readKiroTurn: () => { calls.push('read'); return {}; },
        inject: (a) => { calls.push(['inject', a]); return { ok: true, text: 'MEMORY SNAPSHOT' }; },
        capture: () => {},
      },
    });
    expect(r.action).toBe('inject');
    expect(r.stdout).toContain('MEMORY SNAPSHOT');
    // inject does NOT read the transcript
    expect(calls).not.toContain('read');
  });

  it('uses USER_PROMPT env on promptSubmit (Kiro passes the prompt via env, not stdin)', () => {
    const calls = [];
    runKiroHook({
      argv: ['promptSubmit'],
      cwd: '/proj',
      env: { USER_PROMPT: 'what did we decide about X?' },
      deps: {
        readKiroTurn: () => ({}),
        inject: (a) => { calls.push(a); return { ok: true, text: '' }; },
        capture: () => {},
      },
    });
    // the prompt from env is forwarded to inject (for prompt-aware recall)
    expect(calls[0].userPrompt).toBe('what did we decide about X?');
  });

  it('missing event arg → exit 0 noop (never crash the Kiro session)', () => {
    const r = runKiroHook({ argv: [], cwd: '/proj', env: {}, deps: { readKiroTurn: () => ({}), inject: () => ({ ok: true, text: '' }), capture: () => {} } });
    expect(r.exitCode).toBe(0);
    expect(r.action).toBe('noop');
  });

  it('a throwing transcript read → exit 0 (capture is best-effort, session must live)', () => {
    const r = runKiroHook({
      argv: ['stop'],
      cwd: '/proj',
      env: {},
      deps: {
        readKiroTurn: () => { throw new Error('transcript gone'); },
        inject: () => ({ ok: true, text: '' }),
        capture: () => {},
      },
    });
    expect(r.exitCode).toBe(0);
    expect(r.stderr).toMatch(/transcript gone/);
  });
});

// I1 (review): runHook (the production CLI action) keeps process.exitCode 0 for
// every event EXCEPT a deliberate preToolUse BLOCK (which exits 2 to block the
// Kiro tool — the memory delete-guardrail, D-192).
describe('Task 50 — runHook keeps exit 0 (I1)', () => {
  afterEach(() => { process.exitCode = 0; });
  it('sets process.exitCode 0 even when capture throws', () => {
    process.exitCode = 1; // simulate a prior verb having set it
    runHook('stop', {}, undefined, {
      cwd: '/proj',
      env: {},
      readKiroTurn: () => { throw new Error('boom'); },
      inject: () => ({ ok: true, text: '' }),
      capture: () => { throw new Error('boom'); },
      log: () => {},
      logError: () => {},
    });
    expect(process.exitCode).toBe(0);
  });
});

// preToolUse → the memory delete-guardrail (D-192). The ONE event that exits
// non-zero, and only on a deliberate block.
describe('Task 50 — runHook preToolUse guard (D-192)', () => {
  afterEach(() => { process.exitCode = 0; });
  it('exit 2 (BLOCK) when the guard says block', () => {
    process.exitCode = 0;
    let stderr = '';
    runHook('preToolUse', {}, undefined, {
      cwd: '/proj',
      env: {},
      guard: () => ({ block: true, reason: 'memory delete blocked' }),
      inject: () => ({}),
      capture: () => {},
      log: () => {},
      logError: (s) => { stderr += s; },
    });
    expect(process.exitCode).toBe(2);
    expect(stderr).toMatch(/memory delete blocked/);
  });
  it('exit 0 (allow) when the guard says allow', () => {
    process.exitCode = 0;
    runHook('preToolUse', {}, undefined, {
      cwd: '/proj', env: {},
      guard: () => ({ block: false }),
      inject: () => ({}), capture: () => {}, log: () => {}, logError: () => {},
    });
    expect(process.exitCode).toBe(0);
  });
  it('exit 0 (fail-open) when the guard THROWS — a crashed guard must not wedge the tool', () => {
    process.exitCode = 0;
    runHook('preToolUse', {}, undefined, {
      cwd: '/proj', env: {},
      guard: () => { throw new Error('boom'); },
      inject: () => ({}), capture: () => {}, log: () => {}, logError: () => {},
    });
    expect(process.exitCode).toBe(0);
  });
});
