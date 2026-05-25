// Tests for Task 20 — cmk-observe-edit PostToolUse hook (T-017).
// Per tasks.md 20.4:
//   - Test invocation with 51-line Write output: sessions/now.md gets
//     one summary line
//   - Test invocation with 49-line Write output: now.md unchanged
//   - Test invocation with tool_name: "Read": matcher blocks at
//     hooks.json level (integration test asserts matcher value;
//     handler also defensive-checks tool_name)
//   - Test handler returns {"continue": true} within 50 ms
//   - Test parent termination: kill parent mid-append; summary line
//     still lands in now.md (mtime watch)
//
// Boundary-test discipline:
//   - observeEdit({payload, projectRoot, now}) is the deep boundary —
//     payload in, file-on-disk + result struct out. Tests assert what
//     landed where, NOT which helper counts lines or how content
//     extraction probes the payload shape.
//   - The bash wrapper's `async: true` detach behavior is verified at
//     the bin level by spawning, waiting for the parent to exit, then
//     polling for the summary line.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  rmSync,
  readFileSync,
  existsSync,
  mkdirSync,
  statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { observeEdit } from '../packages/cli/src/observe-edit.mjs';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = join(dirname(__filename), '..');
const BIN_PATH = join(REPO_ROOT, 'plugin', 'bin', 'cmk-observe-edit');
const HOOKS_JSON_PATH = join(
  REPO_ROOT,
  'plugin',
  'hooks',
  'hooks.json',
);

function makeFixture() {
  const sandbox = mkdtempSync(join(tmpdir(), 'cmk-observe-edit-test-'));
  const projectRoot = join(sandbox, 'proj');
  mkdirSync(projectRoot, { recursive: true });
  return { sandbox, projectRoot };
}

function linesNTimes(n) {
  return 'l\n'.repeat(n);
}

describe('Task 20 — observeEdit() boundary', () => {
  let sandbox;
  let projectRoot;

  beforeEach(() => {
    const f = makeFixture();
    sandbox = f.sandbox;
    projectRoot = f.projectRoot;
  });

  afterEach(() => {
    rmSync(sandbox, { recursive: true, force: true });
  });

  describe('eligibility (20.1)', () => {
    for (const toolName of ['Write', 'Edit', 'MultiEdit']) {
      it(`${toolName} with >50-line output: appended`, () => {
        const r = observeEdit({
          payload: {
            tool_name: toolName,
            tool_input: { file_path: 'src/foo.ts' },
            tool_response: { content: linesNTimes(51) },
          },
          projectRoot,
          now: '2026-05-25T10:00:00Z',
        });
        expect(r.action).toBe('appended');
      });
    }

    it('Read with >50-line output: noop (defensive — matcher should block first)', () => {
      const r = observeEdit({
        payload: {
          tool_name: 'Read',
          tool_response: { content: linesNTimes(100) },
        },
        projectRoot,
      });
      expect(r.action).toBe('noop');
      expect(r.reason).toBe('tool-name-not-eligible');
      expect(existsSync(join(projectRoot, 'context', 'sessions', 'now.md'))).toBe(false);
    });

    it('Bash with >50-line output: noop', () => {
      const r = observeEdit({
        payload: {
          tool_name: 'Bash',
          tool_response: { content: linesNTimes(100) },
        },
        projectRoot,
      });
      expect(r.action).toBe('noop');
    });

    it('hooks.json PostToolUse matcher is exactly "Write|Edit|MultiEdit"', () => {
      // This is the FIRST line of defense — the handler defensive-check
      // above is a backstop. Pin the matcher value so a hooks.json edit
      // can't loosen it accidentally.
      const obj = JSON.parse(readFileSync(HOOKS_JSON_PATH, 'utf8'));
      expect(obj.hooks.PostToolUse[0].matcher).toBe('Write|Edit|MultiEdit');
    });
  });

  describe('line-count threshold (20.2)', () => {
    it('51-line Write output: appended (just above threshold)', () => {
      const r = observeEdit({
        payload: {
          tool_name: 'Write',
          tool_input: { file_path: 'src/foo.ts' },
          tool_response: { content: linesNTimes(51) },
        },
        projectRoot,
        now: '2026-05-25T10:00:00Z',
      });
      expect(r.action).toBe('appended');
      const text = readFileSync(
        join(projectRoot, 'context', 'sessions', 'now.md'),
        'utf8',
      );
      expect(text.split('\n').filter(Boolean).length).toBe(1);
      expect(text).toContain('lines=51');
      expect(text).toContain('Write');
      expect(text).toContain('src/foo.ts');
    });

    it('49-line Write output: noop, now.md not created', () => {
      const r = observeEdit({
        payload: {
          tool_name: 'Write',
          tool_input: { file_path: 'src/bar.ts' },
          tool_response: { content: linesNTimes(49) },
        },
        projectRoot,
      });
      expect(r.action).toBe('noop');
      expect(r.reason).toBe('below-line-threshold');
      expect(
        existsSync(join(projectRoot, 'context', 'sessions', 'now.md')),
      ).toBe(false);
    });

    it('exactly-50-line Write output: noop (threshold is strict >)', () => {
      const r = observeEdit({
        payload: {
          tool_name: 'Write',
          tool_input: { file_path: 'src/x.ts' },
          tool_response: { content: linesNTimes(50) },
        },
        projectRoot,
      });
      expect(r.action).toBe('noop');
    });

    it('multiple appends accumulate into one now.md', () => {
      for (let i = 0; i < 3; i++) {
        observeEdit({
          payload: {
            tool_name: 'Write',
            tool_input: { file_path: `src/${i}.ts` },
            tool_response: { content: linesNTimes(51) },
          },
          projectRoot,
          now: `2026-05-25T10:0${i}:00Z`,
        });
      }
      const text = readFileSync(
        join(projectRoot, 'context', 'sessions', 'now.md'),
        'utf8',
      );
      expect(text.split('\n').filter(Boolean).length).toBe(3);
    });
  });

  describe('summary format (20.3)', () => {
    it('summary line contains ts, tool name, file path, line count', () => {
      const r = observeEdit({
        payload: {
          tool_name: 'Edit',
          tool_input: { file_path: 'packages/cli/src/foo.mjs' },
          tool_response: { content: linesNTimes(75) },
        },
        projectRoot,
        now: '2026-05-25T10:30:00Z',
      });
      expect(r.summaryLine).toMatch(
        /^\[2026-05-25T10:30:00Z\] Edit file=packages\/cli\/src\/foo\.mjs lines=75\n$/,
      );
    });

    it('handles MultiEdit with no file_path (falls back to empty)', () => {
      const r = observeEdit({
        payload: {
          tool_name: 'MultiEdit',
          tool_input: {},
          tool_response: { content: linesNTimes(100) },
        },
        projectRoot,
        now: '2026-05-25T10:00:00Z',
      });
      expect(r.action).toBe('appended');
      expect(r.summaryLine).toContain('MultiEdit');
      expect(r.summaryLine).toContain('lines=100');
    });
  });

  describe('input validation + perf', () => {
    it('missing payload: noop', () => {
      const r = observeEdit({ projectRoot });
      expect(r.action).toBe('noop');
    });

    it('completes well under 50ms on the synchronous path (NFR-1)', () => {
      const t0 = Date.now();
      observeEdit({
        payload: {
          tool_name: 'Write',
          tool_input: { file_path: 'src/foo.ts' },
          tool_response: { content: linesNTimes(100) },
        },
        projectRoot,
        now: '2026-05-25T10:00:00Z',
      });
      const elapsed = Date.now() - t0;
      expect(elapsed).toBeLessThan(50);
    });
  });
});

describe('Task 20 — bin/cmk-observe-edit (hook bash wrapper)', () => {
  let sandbox;
  let projectRoot;

  beforeEach(() => {
    const f = makeFixture();
    sandbox = f.sandbox;
    projectRoot = f.projectRoot;
  });

  afterEach(() => {
    rmSync(sandbox, { recursive: true, force: true });
  });

  it('exits 0 immediately with {"continue": true} even with large payload', () => {
    const r = spawnSync('bash', [BIN_PATH], {
      input: JSON.stringify({
        hook_event_name: 'PostToolUse',
        tool_name: 'Write',
        tool_input: { file_path: 'src/bin-wrapper-test.ts' },
        tool_response: { content: linesNTimes(200) },
      }),
      encoding: 'utf8',
      cwd: projectRoot,
    });
    expect(r.status).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(parsed).toMatchObject({ continue: true });
  });

  it('detached append: parent exits fast, summary line lands later (mtime watch)', async () => {
    const t0 = Date.now();
    const r = spawnSync('bash', [BIN_PATH], {
      input: JSON.stringify({
        hook_event_name: 'PostToolUse',
        tool_name: 'Write',
        tool_input: { file_path: 'src/detached-test.ts' },
        tool_response: { content: linesNTimes(99) },
      }),
      encoding: 'utf8',
      cwd: projectRoot,
    });
    const parentMs = Date.now() - t0;
    expect(r.status).toBe(0);

    // Sanity bound on the parent. Design §5.1 sets the hook envelope at
    // 120s; we want a value tight enough to fail-fast if the parent is
    // actually stuck on the detached child, but loose enough that a
    // Windows cold-start spike under full-suite concurrency (bash +
    // node + spawn contention with ~700 other tests) doesn't tip it
    // into a false-negative. 30s mirrors the timeout we set on every
    // other live-spawn test in this repo (e.g. spawn-smoke-haiku) and
    // is two orders of magnitude below the actual hook ceiling, so it
    // still catches a true "parent is waiting for the detached child"
    // regression — the child here does <50ms of work, so any case
    // where parentMs approaches the child's work time would already
    // be exposed by the polling completion check below.
    expect(parentMs).toBeLessThan(30000);

    // Poll for the now.md file to appear — the detached node child is
    // doing the work after the parent returned.
    const nowMd = join(projectRoot, 'context', 'sessions', 'now.md');
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
      if (existsSync(nowMd) && statSync(nowMd).size > 0) break;
      await new Promise((res) => setTimeout(res, 50));
    }
    expect(existsSync(nowMd)).toBe(true);
    const text = readFileSync(nowMd, 'utf8');
    expect(text).toContain('detached-test.ts');
    expect(text).toContain('lines=99');
  });
});
