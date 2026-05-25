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
//   - The bash invocation pattern is part of the design.md §5.1 contract
//     (the kit ships its hooks under the documented bash-wrapped path so
//     they work uniformly across Anthropic's plugin loader); assert the
//     command string matches the documented shape.

import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readFileSync, statSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = join(dirname(__filename), '..');
const HOOKS_JSON_PATH = join(
  REPO_ROOT,
  'plugin',
  '.claude-plugin',
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
  { event: 'UserPromptSubmit', stub: 'cmk-capture-prompt', timeout: 10, async: false, isStub: true },
  { event: 'PostToolUse', stub: 'cmk-observe-edit', timeout: 120, async: true, matcher: 'Write|Edit|MultiEdit', isStub: true },
  { event: 'Stop', stub: 'cmk-capture-turn', timeout: 30, async: false, isStub: true },
  { event: 'SessionEnd', stub: 'cmk-compress-session', timeout: 60, async: false, isStub: true },
];

function loadHooksJson() {
  return JSON.parse(readFileSync(HOOKS_JSON_PATH, 'utf8'));
}

describe('Task 17 — hooks.json scaffold', () => {
  it('hooks.json exists at the documented path (plugin/.claude-plugin/hooks/hooks.json)', () => {
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

        it(`command targets bin/${expected.stub} via the documented bash + CLAUDE_PLUGIN_ROOT pattern`, () => {
          const obj = loadHooksJson();
          const cmd = obj.hooks[expected.event][0].hooks[0].command;
          expect(cmd).toBe(
            `bash "\${CLAUDE_PLUGIN_ROOT}/bin/${expected.stub}"`,
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
      const stubPath = join(BIN_DIR, stub);

      it('exists on disk', () => {
        expect(existsSync(stubPath)).toBe(true);
      });

      it('is a regular file (not a directory or symlink chain)', () => {
        expect(statSync(stubPath).isFile()).toBe(true);
      });

      // POSIX execute bit is not reliably preserved on Windows checkouts. The
      // claude-mem / claude-remember pattern is to ship as bash scripts under
      // `bash "${CLAUDE_PLUGIN_ROOT}/bin/<stub>"` — bash interprets the file
      // regardless of the +x bit. The hooks.json command therefore wraps each
      // stub in `bash "..."` (asserted by the hooks.json suite above). What we
      // can portably check here is that the file starts with a `#!` shebang
      // referencing bash/sh, signaling the documented run-mode.
      it('begins with a bash/sh shebang', () => {
        const head = readFileSync(stubPath, 'utf8').slice(0, 32);
        expect(head).toMatch(/^#!\s*(\/usr\/bin\/env\s+bash|\/bin\/bash|\/bin\/sh|\/usr\/bin\/env\s+sh)\b/);
      });

      it('exits 0 when invoked via bash with empty stdin', () => {
        const r = spawnSync('bash', [stubPath], {
          input: '',
          encoding: 'utf8',
        });
        expect(r.status).toBe(0);
      });

      it('stdout parses as JSON', () => {
        const r = spawnSync('bash', [stubPath], {
          input: '',
          encoding: 'utf8',
        });
        expect(() => JSON.parse(r.stdout)).not.toThrow();
      });

      if (isStub) {
        it('stub JSON contains continue: true', () => {
          const r = spawnSync('bash', [stubPath], {
            input: '',
            encoding: 'utf8',
          });
          const parsed = JSON.parse(r.stdout);
          expect(parsed).toMatchObject({ continue: true });
        });

        it('stub stdout (or stderr) contains the documented "not yet implemented" notice', () => {
          const r = spawnSync('bash', [stubPath], {
            input: '',
            encoding: 'utf8',
          });
          const combined = `${r.stdout}\n${r.stderr}`;
          expect(combined.toLowerCase()).toContain('not yet implemented');
        });
      } else {
        // Real handlers emit hookSpecificOutput per Anthropic's hook
        // protocol, not the stub-shaped {continue: true}. Per-hook
        // behavior tests live in the per-hook test file (e.g.
        // tests/cli-inject-context.test.js for SessionStart); here we
        // only assert the shape envelope.
        it('real handler JSON contains hookSpecificOutput', () => {
          const r = spawnSync('bash', [stubPath], {
            input: '',
            encoding: 'utf8',
          });
          const parsed = JSON.parse(r.stdout);
          expect(parsed).toHaveProperty('hookSpecificOutput');
        });
      }

      it('exits 0 with a payload-shaped JSON stdin (proves it tolerates real hook input)', () => {
        const fakePayload = JSON.stringify({
          hook_event_name: 'Stop',
          stop_hook_active: false,
          session_id: 'test-session',
        });
        const r = spawnSync('bash', [stubPath], {
          input: fakePayload,
          encoding: 'utf8',
        });
        expect(r.status).toBe(0);
        expect(() => JSON.parse(r.stdout)).not.toThrow();
      });
    });
  }
});
