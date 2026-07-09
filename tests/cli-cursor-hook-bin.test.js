// @doors: 1, 2
// Door 2: the routing tests fake the cores (disk state is the cores' own
//   concern there), BUT the integration-lock block at the bottom runs the REAL
//   cores and asserts the on-disk now.md — both the afterFileEdit landing and
//   the D-305 `/c:/…`-root landing (the state change the routing tests can't see).
// Door 3 N/A: no subprocess spawn — the detached auto-extract spawn is pinned by
//   capture-turn's spawn-smoke tests; here we assert the autoExtractPath is
//   FORWARDED (the D-200 class), which is the wiring this layer owns.
// Door 4 N/A: the bin's own surface is stdin-parse + routing + stdout response;
//   log emission is the cores' concern.
// Door 5 N/A: no message-queue interaction.

// Tests for Task 196 — `cmk cursor-hook`, the Cursor hook entrypoint.
//
// Cursor calls ONE command for every wired event; the payload arrives as JSON on
// stdin with `hook_event_name` + `workspace_roots` (cursor.com/docs/agent/hooks).
// runCursorHook: read stdin → resolve event + project root from the PAYLOAD
// (Cursor may spawn hooks outside the project dir — workspace_roots[0] is the
// authoritative root, cwd is only the fallback) → dispatchCursorHook with the
// real cores → print the Cursor JSON response on stdout → ALWAYS exit 0.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCursorHook, runHook } from '../packages/cli/src/subcommands.mjs';

describe('Task 196 — cmk cursor-hook (the Cursor hook bin)', () => {
  it('parses the stdin payload, routes on hook_event_name, resolves the root from workspace_roots', async () => {
    const injectCalls = [];
    const out = [];
    await runCursorHook({}, undefined, {
      readStdin: () => JSON.stringify({
        hook_event_name: 'sessionStart',
        workspace_roots: ['/ws/proj'],
        session_id: 's1',
      }),
      inject: (a) => { injectCalls.push(a); return { ok: true, text: 'SNAPSHOT' }; },
      log: (s) => out.push(s),
    });
    expect(injectCalls[0].cwd).toBe('/ws/proj');
    expect(JSON.parse(out.join(''))).toEqual({ additional_context: 'SNAPSHOT' });
    expect(process.exitCode ?? 0).toBe(0);
  });

  it('normalizes Cursor-on-Windows `/c:/…` workspace_roots to a valid drive path (D-305)', async () => {
    // GROUND TRUTH (Cursor 3.5.17 on Windows, captured live in the v0.5.0 gate):
    // Cursor sends workspace_roots as "/c:/Temp/proj" — a leading slash BEFORE
    // the drive letter + forward slashes. Passed verbatim to path.join it yields
    // "\c:\Temp\proj\…" (a bogus root off the process cwd), so every hook wrote
    // now.md to a garbage location and capture silently no-op'd on Windows. The
    // resolver must strip the leading slash before the drive letter.
    const injectCalls = [];
    await runCursorHook({}, undefined, {
      readStdin: () => JSON.stringify({
        hook_event_name: 'sessionStart',
        workspace_roots: ['/c:/Temp/proj'],
        session_id: 's1',
      }),
      inject: (a) => { injectCalls.push(a); return { text: '' }; },
      log: () => {},
    });
    // The leading slash before the drive letter is gone; the rest is preserved.
    expect(injectCalls[0].cwd).toBe('c:/Temp/proj');
  });

  it('leaves an already-valid workspace_root untouched (POSIX + Windows passthrough)', async () => {
    for (const root of ['/ws/proj', 'C:/Temp/proj', 'C:\\Temp\\proj']) {
      const injectCalls = [];
      await runCursorHook({}, undefined, {
        readStdin: () => JSON.stringify({
          hook_event_name: 'sessionStart',
          workspace_roots: [root],
          session_id: 's1',
        }),
        inject: (a) => { injectCalls.push(a); return { text: '' }; },
        log: () => {},
      });
      expect(injectCalls[0].cwd).toBe(root);
    }
  });

  it('falls back to deps.cwd when the payload has no workspace_roots', async () => {
    const injectCalls = [];
    await runCursorHook({}, undefined, {
      payload: { hook_event_name: 'sessionStart' },
      cwd: '/fallback',
      inject: (a) => { injectCalls.push(a); return { text: '' }; },
      log: () => {},
    });
    expect(injectCalls[0].cwd).toBe('/fallback');
  });

  it('beforeSubmitPrompt → the real capturePrompt wiring gets the prompt, responds {continue:true}', async () => {
    const cpCalls = [];
    const out = [];
    await runCursorHook({}, undefined, {
      payload: {
        hook_event_name: 'beforeSubmitPrompt',
        workspace_roots: ['/ws/proj'],
        prompt: 'remember this',
      },
      capturePrompt: (a) => cpCalls.push(a),
      log: (s) => out.push(s),
    });
    expect(cpCalls[0].payload.prompt).toBe('remember this');
    expect(cpCalls[0].projectRoot).toBe('/ws/proj');
    expect(JSON.parse(out.join(''))).toEqual({ continue: true });
  });

  it('afterAgentResponse → capture is fed the assistant text AND the resolved autoExtractPath (D-200 class)', async () => {
    const seen = [];
    await runCursorHook({}, undefined, {
      payload: {
        hook_event_name: 'afterAgentResponse',
        workspace_roots: ['/ws/proj'],
        text: 'assistant final message',
      },
      // captureTurn (not capture) so the bin's DEFAULT capture dep — the one
      // that forwards autoExtractPath — is the code under test.
      captureTurn: (a) => seen.push(a),
      log: () => {},
    });
    expect(seen[0].payload.assistant_message).toBe('assistant final message');
    expect(seen[0].projectRoot).toBe('/ws/proj');
    expect(typeof seen[0].autoExtractPath).toBe('string');
    expect(seen[0].autoExtractPath).toMatch(/cmk-auto-extract\.mjs$/);
  });

  it('beforeShellExecution → the guard reads the Cursor command field; a block responds permission:deny', async () => {
    const out = [];
    await runCursorHook({}, undefined, {
      payload: {
        hook_event_name: 'beforeShellExecution',
        workspace_roots: ['/ws/proj'],
        command: 'rm -rf context/memory',
      },
      guard: ({ payload }) => ({ block: payload.command.includes('context/memory'), reason: 'guardrail' }),
      log: (s) => out.push(s),
    });
    expect(JSON.parse(out.join('')).permission).toBe('deny');
  });

  it('sessionEnd → awaits the pending session-end tasks before returning (process must outlive the work)', async () => {
    let settled = false;
    await runCursorHook({}, undefined, {
      payload: { hook_event_name: 'sessionEnd', workspace_roots: ['/ws/proj'] },
      sessionEnd: () => new Promise((res) => setTimeout(() => { settled = true; res(); }, 20)),
      log: () => {},
    });
    expect(settled).toBe(true);
  });

  it('a rejected sessionEnd is swallowed (fail-open) — exit stays 0', async () => {
    const errs = [];
    await runCursorHook({}, undefined, {
      payload: { hook_event_name: 'sessionEnd', workspace_roots: ['/ws/proj'] },
      sessionEnd: () => Promise.reject(new Error('haiku down')),
      logError: (s) => errs.push(s),
      log: () => {},
    });
    expect(process.exitCode ?? 0).toBe(0);
    expect(errs.join('')).toContain('haiku down');
  });

  it('malformed stdin JSON → clean no-op, exit 0 (never crash the Cursor session)', async () => {
    await runCursorHook({}, undefined, {
      readStdin: () => 'not json {{{',
      log: () => {},
    });
    expect(process.exitCode ?? 0).toBe(0);
  });

  it('a UTF-8 BOM prefix on the stdin payload still parses + routes (D-306, the real Cursor-Windows killer)', async () => {
    // GROUND TRUTH (Cursor 3.5.17 on Windows, captured live): Cursor prepends a
    // UTF-8 BOM (﻿) to the hook stdin JSON. A raw JSON.parse THROWS on the
    // BOM → payload degrades to {} → hook_event_name is '' → EVERY hook silently
    // no-op'd (exit 0, empty stdout, no capture). This is why user turns never
    // landed on Cursor. The reader must strip a leading BOM before parsing.
    const cpCalls = [];
    const out = [];
    await runCursorHook({}, undefined, {
      readStdin: () =>
        '﻿' +
        JSON.stringify({
          hook_event_name: 'beforeSubmitPrompt',
          prompt: 'I always use httpx',
          workspace_roots: ['/ws/proj'],
        }),
      capturePrompt: (a) => cpCalls.push(a),
      log: (s) => out.push(s),
    });
    // The event routed (capturePrompt ran with the prompt) AND the Cursor
    // response is on stdout — NOT the empty-string no-op a BOM used to cause.
    expect(cpCalls).toHaveLength(1);
    expect(cpCalls[0].payload.prompt).toBe('I always use httpx');
    expect(JSON.parse(out.join(''))).toEqual({ continue: true });
  });
});

// The D-269 integration lock: every routing test above fakes `inject`, which is
// exactly how the REAL wiring shipped reading the wrong field of
// injectContext's return ({snapshot, hookOutput, …} — it has never had a
// `.text`), so both the Kiro AND Cursor inject legs emitted EMPTY in
// production while every unit test passed (found by the Task-196 sandbox
// live-test). These tests run the DEFAULT inject dep against the real
// injectContext over a real on-disk project — the cross-module path the
// per-module tests structurally can't see (the CLAUDE.md integration-test
// rule).
describe('D-269 — the default inject dep carries the REAL memory snapshot', () => {
  let sandbox;
  let projectRoot;

  beforeEach(() => {
    sandbox = mkdtempSync(join(tmpdir(), 'cmk-inject-integration-'));
    projectRoot = join(sandbox, 'proj');
    mkdirSync(join(projectRoot, 'context'), { recursive: true });
    writeFileSync(
      join(projectRoot, 'context', 'MEMORY.md'),
      '# Working Memory\n\n## Active Threads\n\n- (P-D269FACT) the vitest sandbox uses SQLite\n',
      'utf8',
    );
  });

  afterEach(() => {
    rmSync(sandbox, { recursive: true, force: true });
  });

  it('cursor sessionStart → additional_context contains the on-disk fact', async () => {
    const out = [];
    await runCursorHook({}, undefined, {
      payload: { hook_event_name: 'sessionStart', workspace_roots: [projectRoot] },
      log: (s) => out.push(s),
    });
    const resp = JSON.parse(out.join(''));
    expect(resp.additional_context).toContain('the vitest sandbox uses SQLite');
  });

  it('kiro agentSpawn → stdout contains the on-disk fact (the same wiring bug, Kiro side)', () => {
    const out = [];
    runHook('agentSpawn', {}, undefined, {
      cwd: projectRoot,
      log: (s) => out.push(s),
    });
    expect(out.join('')).toContain('the vitest sandbox uses SQLite');
  });

  // The #1 skill-review catch: afterFileEdit was wired but DEAD — the dispatcher
  // dropped the edit content, so observeEdit's line-count was always 0 and every
  // Cursor edit no-op'd (same "advertised-but-inert" class as D-269). This test
  // runs the DEFAULT observe dep against the real observeEdit and asserts an
  // above-threshold edit actually LANDS in now.md (Door 2 — the state change the
  // routing test could not see).
  it('cursor afterFileEdit → an above-threshold edit is recorded in now.md (Door 2)', async () => {
    const bigEdit = Array.from({ length: 60 }, (_, i) => `new line ${i}`).join('\n');
    await runCursorHook({}, undefined, {
      payload: {
        hook_event_name: 'afterFileEdit',
        workspace_roots: [projectRoot],
        file_path: join(projectRoot, 'src', 'big.mjs'),
        edits: [{ old_string: '', new_string: bigEdit }],
      },
      log: () => {},
    });
    const nowMd = join(projectRoot, 'context', 'sessions', 'now.md');
    const recorded = readFileSync(nowMd, 'utf8');
    expect(recorded).toMatch(/Edit file=.*big\.mjs lines=\d+/);
  });

  // D-305 (code-review follow-up): the malformed Cursor-on-Windows root
  // `/c:/…` must route through the REAL cores to the REAL project's now.md —
  // the routing tests only assert the fake inject's cwd arg; this asserts the
  // disk state (Door 2) the earlier tests structurally can't see. We build the
  // exact malformed shape Cursor sends from the sandbox root: a `<drive>:\…`
  // path → `/<drive>:/…` (leading slash, forward slashes). On a POSIX runner
  // the sandbox root has no drive letter, so the transform is a no-op and this
  // degrades to the plain integration path (still a valid assertion).
  it('cursor afterFileEdit with a `/c:/…` root still lands in the REAL now.md (D-305, Door 2)', () => {
    const malformedRoot = /^[A-Za-z]:/.test(projectRoot)
      ? '/' + projectRoot.replace(/\\/g, '/') // C:\a\b → /C:/a/b (Cursor's Windows form)
      : projectRoot;
    const bigEdit = Array.from({ length: 60 }, (_, i) => `d305 line ${i}`).join('\n');
    runCursorHook({}, undefined, {
      payload: {
        hook_event_name: 'afterFileEdit',
        workspace_roots: [malformedRoot],
        file_path: join(projectRoot, 'src', 'd305.mjs'),
        edits: [{ old_string: '', new_string: bigEdit }],
      },
      log: () => {},
    });
    // The edit landed in the REAL project's now.md, NOT a bogus `\c:\…` path.
    const nowMd = join(projectRoot, 'context', 'sessions', 'now.md');
    expect(readFileSync(nowMd, 'utf8')).toMatch(/Edit file=.*d305\.mjs lines=\d+/);
  });
});
