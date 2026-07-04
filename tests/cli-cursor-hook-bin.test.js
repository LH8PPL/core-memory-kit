// @doors: 1
// Door 2 N/A: disk state is the cores' concern (injected fakes here); the real
//   cores' state changes are pinned in their own test files.
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
});
