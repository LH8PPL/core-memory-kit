// @doors: 1, 2, 3
// Door 4 N/A: hooks.json scaffold + node bin spawns don't exchange messages via queues; the bin scripts emit envelope JSON to stdout (Door 1).
// Door 5 N/A: hooks-scaffold tests assert the scaffold's STRUCTURE (json parses, node bins exec) — observability behavior of each hook is owned by that hook's own test file (cli-inject-context, cli-capture-prompt, cli-capture-turn, cli-observe-edit, cli-compress-session).

// Tests for Task 17 — hooks.json + 6-hook scaffold (T-014).
// Per tasks.md 17.3:
//   - Test `hooks.json` parses as valid JSON
//   - Test all 6 hook events registered: Setup, SessionStart,
//     UserPromptSubmit, PostToolUse, Stop, SessionEnd
//   - Test PostToolUse has matcher "Write|Edit|MultiEdit"
//   - Test each stub exists, is executable, exits 0 on dummy stdin
//   - Test each stub's stdout parses as valid JSON containing
//     "continue": true
//
// Boundary-test discipline:
//   - Test the public contract: hooks.json shape + the 6 stub commands'
//     observable behavior (exit code, parseable JSON, continue:true).
//     Do NOT test how each stub internally formats the "not yet
//     implemented" notice or which language it's written in — those are
//     implementation details that change when the real handlers ship in
//     Tasks 18-24.
//   - The node invocation pattern is part of the design.md §5.1 contract
//     (Task 62: the kit ships its hooks as node `.mjs` invoked via
//     `node "${CLAUDE_PLUGIN_ROOT}/bin/<stub>.mjs"`, so they run on node
//     alone — no bash — across every OS); assert the command string
//     matches the documented shape.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { readFileSync, statSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = join(dirname(__filename), '..');
// Canonical Anthropic plugin layout: hooks.json lives at <plugin-root>/hooks/
// per https://code.claude.com/docs/en/plugins ("Plugin structure overview" —
// the `.claude-plugin/` subdirectory holds ONLY `plugin.json`, NOT `hooks/`).
// An earlier draft of design.md placed this at `plugin/.claude-plugin/hooks/`;
// that path does not load in Claude Code 2.1.140 and the working-product live
// test caught it (see docs/journey/2026-05-26-live-test-findings.md).
const HOOKS_JSON_PATH = join(
  REPO_ROOT,
  'plugin',
  'hooks',
  'hooks.json',
);
const BIN_DIR = join(REPO_ROOT, 'plugin', 'bin');

// Documented event → (basename, timeout seconds, async?, isStub?) per
// design §5.1. As each hook gets its real handler the `isStub` flag
// flips to false; the assertion suite below then only enforces the
// stub-shape contracts (`continue: true`, "not yet implemented") for
// the entries that are still stubs.
const EXPECTED_HOOKS = [
  { event: 'Setup', stub: 'cmk-version-check', timeout: 30, async: false, isStub: true },
  { event: 'SessionStart', stub: 'cmk-inject-context', timeout: 30, async: false, isStub: false },
  { event: 'UserPromptSubmit', stub: 'cmk-capture-prompt', timeout: 10, async: false, isStub: false },
  { event: 'PostToolUse', stub: 'cmk-observe-edit', timeout: 120, async: true, matcher: 'Write|Edit|MultiEdit', isStub: false },
  { event: 'Stop', stub: 'cmk-capture-turn', timeout: 30, async: false, isStub: false },
  { event: 'SessionEnd', stub: 'cmk-compress-session', timeout: 60, async: false, isStub: false },
];

function loadHooksJson() {
  return JSON.parse(readFileSync(HOOKS_JSON_PATH, 'utf8'));
}

describe('Task 17 — hooks.json scaffold', () => {
  it('hooks.json exists at the documented path (plugin/hooks/hooks.json)', () => {
    expect(existsSync(HOOKS_JSON_PATH)).toBe(true);
  });

  it('hooks.json parses as valid JSON', () => {
    expect(() => loadHooksJson()).not.toThrow();
  });

  it('top-level shape is { hooks: { ... } }', () => {
    const obj = loadHooksJson();
    expect(obj).toHaveProperty('hooks');
    expect(typeof obj.hooks).toBe('object');
    expect(obj.hooks).not.toBeNull();
  });

  it('all 6 hook events are registered', () => {
    const obj = loadHooksJson();
    const registered = Object.keys(obj.hooks);
    for (const { event } of EXPECTED_HOOKS) {
      expect(registered).toContain(event);
    }
  });

  it('no extra (undocumented) hook events are registered', () => {
    const obj = loadHooksJson();
    const registered = Object.keys(obj.hooks).sort();
    const expected = EXPECTED_HOOKS.map((h) => h.event).sort();
    expect(registered).toEqual(expected);
  });

  describe('per-hook shape (per design §5.1 verbatim)', () => {
    for (const expected of EXPECTED_HOOKS) {
      describe(`${expected.event}`, () => {
        it('is an array with exactly one entry', () => {
          const obj = loadHooksJson();
          expect(Array.isArray(obj.hooks[expected.event])).toBe(true);
          expect(obj.hooks[expected.event]).toHaveLength(1);
        });

        it('entry has a hooks: [...] array with exactly one command', () => {
          const obj = loadHooksJson();
          const entry = obj.hooks[expected.event][0];
          expect(Array.isArray(entry.hooks)).toBe(true);
          expect(entry.hooks).toHaveLength(1);
          expect(entry.hooks[0].type).toBe('command');
        });

        it(`command targets bin/${expected.stub}.mjs via the node + CLAUDE_PLUGIN_ROOT pattern (Task 62 — node-only, no bash)`, () => {
          const obj = loadHooksJson();
          const cmd = obj.hooks[expected.event][0].hooks[0].command;
          expect(cmd).toBe(
            `node "\${CLAUDE_PLUGIN_ROOT}/bin/${expected.stub}.mjs"`,
          );
        });

        it(`timeout is ${expected.timeout}`, () => {
          const obj = loadHooksJson();
          expect(obj.hooks[expected.event][0].hooks[0].timeout).toBe(
            expected.timeout,
          );
        });

        if (expected.async) {
          it('is marked async: true', () => {
            const obj = loadHooksJson();
            expect(obj.hooks[expected.event][0].hooks[0].async).toBe(true);
          });
        } else {
          it('does NOT set async (or sets it to false)', () => {
            const obj = loadHooksJson();
            const h = obj.hooks[expected.event][0].hooks[0];
            // The spec only sets async on PostToolUse; absence is the default
            expect(h.async === undefined || h.async === false).toBe(true);
          });
        }

        if (expected.matcher !== undefined) {
          it(`entry has matcher "${expected.matcher}"`, () => {
            const obj = loadHooksJson();
            expect(obj.hooks[expected.event][0].matcher).toBe(expected.matcher);
          });
        } else {
          it('entry does NOT have a matcher (matcher only applies to PostToolUse)', () => {
            const obj = loadHooksJson();
            expect(obj.hooks[expected.event][0].matcher).toBeUndefined();
          });
        }
      });
    }
  });
});

describe('Task 17 — bin/cmk-<verb> hook scripts', () => {
  for (const { stub, isStub } of EXPECTED_HOOKS) {
    describe(`bin/${stub}${isStub ? '' : ' (real handler)'}`, () => {
      // Task 62: the hooks are node `.mjs` files invoked via
      // `node "${CLAUDE_PLUGIN_ROOT}/bin/<stub>.mjs"` (asserted by the
      // hooks.json suite above) — node alone, no bash, on every OS.
      const stubPath = join(BIN_DIR, `${stub}.mjs`);

      // Task 98 isolation (hazard surfaced 2026-06-10 by the Task-52
      // dogfood): this REPO is itself a kit project now (real context/ +
      // live session buffers), and these smokes spawn REAL bins. Without
      // cwd/env isolation the bins resolve the repo's own tiers — the
      // compress-session smoke engaged the REAL Haiku compress pipeline
      // against the live now.md under stress (5/5 consistent failures) and
      // mutated real (gitignored) session state. Every spawn below runs in
      // a per-suite temp sandbox instead.
      let sandbox;
      let spawnEnv;
      beforeAll(() => {
        sandbox = mkdtempSync(join(tmpdir(), 'cmk-hooks-smoke-'));
        mkdirSync(join(sandbox, 'proj'), { recursive: true });
        mkdirSync(join(sandbox, 'user'), { recursive: true });
        spawnEnv = {
          ...process.env,
          CMK_PROJECT_DIR: join(sandbox, 'proj'),
          MEMORY_KIT_USER_DIR: join(sandbox, 'user'),
        };
      });
      afterAll(() => {
        rmSync(sandbox, { recursive: true, force: true });
      });
      const sandboxedSpawn = (args, opts) =>
        spawnSync(process.execPath, args, {
          ...opts,
          cwd: join(sandbox, 'proj'),
          env: spawnEnv,
        });

      it('exists on disk', () => {
        expect(existsSync(stubPath)).toBe(true);
      });

      it('is a regular file (not a directory or symlink chain)', () => {
        expect(statSync(stubPath).isFile()).toBe(true);
      });

      // The bins run via `node <file>` (npm-route PATH shim or the plugin
      // route's `node "${CLAUDE_PLUGIN_ROOT}/bin/<stub>.mjs"`), so node — not
      // bash — is the only runtime dependency. We assert the node shebang as
      // the documented run-mode (and `node <file>` ignores the +x bit, so the
      // Windows-checkout exec-bit problem is moot).
      it('begins with a node shebang', () => {
        const head = readFileSync(stubPath, 'utf8').slice(0, 32);
        expect(head).toMatch(/^#!\s*(\/usr\/bin\/env\s+node|\/usr\/bin\/node|\/usr\/local\/bin\/node)\b/);
      });

      it('exits 0 when invoked via node with empty stdin', () => {
        const r = sandboxedSpawn([stubPath], {
          input: '',
          encoding: 'utf8',
        });
        expect(r.status).toBe(0);
      });

      it('stdout parses as JSON', () => {
        const r = sandboxedSpawn([stubPath], {
          input: '',
          encoding: 'utf8',
        });
        expect(() => JSON.parse(r.stdout)).not.toThrow();
      });

      if (isStub) {
        it('stub JSON contains continue: true', () => {
          const r = sandboxedSpawn([stubPath], {
            input: '',
            encoding: 'utf8',
          });
          const parsed = JSON.parse(r.stdout);
          expect(parsed).toMatchObject({ continue: true });
        });

        it('stub stdout (or stderr) contains the documented "not yet implemented" notice', () => {
          const r = sandboxedSpawn([stubPath], {
            input: '',
            encoding: 'utf8',
          });
          const combined = `${r.stdout}\n${r.stderr}`;
          expect(combined.toLowerCase()).toContain('not yet implemented');
        });
      } else {
        // Real handlers emit different JSON shapes depending on the
        // hook event — SessionStart emits hookSpecificOutput;
        // UserPromptSubmit / Stop / etc. emit a bare {continue: true}
        // because their side effect is on disk, not in the prompt.
        // The per-hook test file (tests/cli-<verb>.test.js) asserts
        // the specific shape; here we only assert that the script
        // still emits parseable JSON and exits 0 — i.e., that it
        // honors the hook-protocol envelope regardless of payload.
        it('real handler emits parseable JSON (envelope contract)', () => {
          const r = sandboxedSpawn([stubPath], {
            input: '',
            encoding: 'utf8',
          });
          expect(() => JSON.parse(r.stdout)).not.toThrow();
        });
      }

      it('exits 0 with a payload-shaped JSON stdin (proves it tolerates real hook input)', () => {
        const fakePayload = JSON.stringify({
          hook_event_name: 'Stop',
          stop_hook_active: false,
          session_id: 'test-session',
        });
        const r = sandboxedSpawn([stubPath], {
          input: fakePayload,
          encoding: 'utf8',
        });
        expect(r.status).toBe(0);
        expect(() => JSON.parse(r.stdout)).not.toThrow();
      });
    });
  }
});
