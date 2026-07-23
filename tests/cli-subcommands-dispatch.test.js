// @doors: 1, 2
// Door 3 N/A: these handlers delegate to in-process module functions. The
//   handlers that spawn subprocesses (doctor/daily-distill/weekly-curate/
//   compress/persona-generate/register-crons/mcp) are intentionally NOT
//   exercised here — they have their own spawn-smoke suites — so this file
//   stays hermetic and fast.
// Door 4 N/A: no message-queue boundary (the interactive `queue` dispatcher
//   uses readline and is excluded).
// Door 5 N/A: the audit-log / NDJSON observability these handlers emit is
//   asserted in each module's OWN suite (cli-memory-write, cli-write-fact,
//   cli-forget, cli-trust, cli-lessons-promote); this dispatch file pins the
//   Response + State doors of the CLI wiring.
//
// Task 85 follow-up: exercise the `cmk` subcommand HANDLERS in-process. The
// dispatch layer (subcommands.mjs) is otherwise only reached by the integration
// tests that SPAWN the real `cmk` binary, so v8 in-process coverage couldn't see
// it (it read ~14%). These tests invoke the array's `.action` directly against a
// sandbox, asserting the real side effects (the five-doors Response + State).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';
import { subcommands } from '../packages/cli/src/subcommands.mjs';
import { install } from '../packages/cli/src/install.mjs';

const cmd = (name) => subcommands.find((s) => s.name === name);
const child = (name, c) => cmd(name).children.find((x) => x.name === c);

let sandbox, projectRoot, userDir, prevCwd, prevUserEnv, logs, errs, origLog, origErr;

function memoryMd() {
  return readFileSync(join(projectRoot, 'context', 'MEMORY.md'), 'utf8');
}
function factFiles() {
  return readdirSync(join(projectRoot, 'context', 'memory')).filter(
    (f) => f.endsWith('.md') && f !== 'INDEX.md' && f !== 'MAP.md',
  );
}
function firstFactId() {
  const f = factFiles()[0];
  const m = readFileSync(join(projectRoot, 'context', 'memory', f), 'utf8').match(/id:\s*([PUL]-\w+)/);
  return m && m[1];
}

beforeEach(async () => {
  sandbox = mkdtempSync(join(tmpdir(), 'cmk-dispatch-'));
  projectRoot = join(sandbox, 'proj');
  userDir = join(sandbox, 'user');
  await install({ projectRoot, userTier: userDir, noHooks: true });
  prevCwd = process.cwd();
  process.chdir(projectRoot); // handlers resolve projectRoot from process.cwd()
  prevUserEnv = process.env.MEMORY_KIT_USER_DIR;
  process.env.MEMORY_KIT_USER_DIR = userDir; // handlers read the user tier from here
  logs = [];
  errs = [];
  origLog = console.log;
  origErr = console.error;
  console.log = (...a) => logs.push(a.join(' '));
  console.error = (...a) => errs.push(a.join(' '));
  process.exitCode = 0;
});

afterEach(() => {
  console.log = origLog;
  console.error = origErr;
  process.chdir(prevCwd);
  if (prevUserEnv === undefined) delete process.env.MEMORY_KIT_USER_DIR;
  else process.env.MEMORY_KIT_USER_DIR = prevUserEnv;
  process.exitCode = 0;
  rmSync(sandbox, { recursive: true, force: true });
});

describe('Task 85 — cmk subcommand handlers (in-process dispatch coverage)', () => {
  // Task 143: runRemember is now async (the terse path may embed once for the
  // near-dup guard) — terse dispatches are awaited. Rich-flag dispatches route
  // to the still-sync runRememberRich; awaiting them is harmless + uniform.
  it('remember (terse) → appends a MEMORY.md bullet', async () => {
    await cmd('remember').action(['We deploy with Kamal to Hetzner, never Vercel'], {});
    expect(memoryMd()).toContain('Kamal to Hetzner');
    expect(logs.join('\n')).toMatch(/cmk remember/i);
  });

  it('remember (rich) → writes a granular fact file with Why/How + keeps INDEX current', () => {
    cmd('remember').action(['FastAPI is the delivery layer; logic in services'], {
      why: 'pay the structure cost up front',
      how: 'thin routes; push logic into services',
      type: 'feedback',
      title: 'layered-architecture',
    });
    const files = factFiles();
    expect(files).toHaveLength(1);
    const content = readFileSync(join(projectRoot, 'context', 'memory', files[0]), 'utf8');
    expect(content).toContain('**Why:**');
    expect(content).toContain('**How to apply:**');
    // Task 85: INDEX stays in sync on capture.
    const index = readFileSync(join(projectRoot, 'context', 'memory', 'INDEX.md'), 'utf8');
    expect(index).toContain(`(${files[0]})`);
  });

  it('reindex → rebuilds INDEX.md to reference existing fact files', () => {
    cmd('remember').action(['x'], { type: 'feedback', title: 'pin-versions', why: 'a', how: 'b' });
    const fname = factFiles()[0];
    cmd('reindex').action({});
    const index = readFileSync(join(projectRoot, 'context', 'memory', 'INDEX.md'), 'utf8');
    expect(index).toContain(fname);
  });

  it('search (keyword) → finds a captured fact', async () => {
    await cmd('remember').action(['We deploy with Kamal to Hetzner'], {});
    await cmd('search').action(['Kamal'], { mode: 'keyword' });
    expect(process.exitCode ?? 0).toBe(0);
    expect(logs.join('\n')).toMatch(/Kamal/);
  });

  // Task 125.4 — the configured-default branches of runSearch, in-process.
  // The CLI integration test (cli-install-semantic.test.js) proves the same
  // contract through the real bin, but subprocess runs can't attribute v8
  // coverage to these lines (the Task 85 lesson — the reason this file exists).
  describe('search default-mode branches (Task 46/125)', () => {
    const settingsPath = () => join(projectRoot, 'context', 'settings.json');
    let prevDisable;
    beforeEach(() => {
      prevDisable = process.env.CMK_DISABLE_SEMANTIC;
    });
    afterEach(() => {
      if (prevDisable === undefined) delete process.env.CMK_DISABLE_SEMANTIC;
      else process.env.CMK_DISABLE_SEMANTIC = prevDisable;
    });

    it('configured hybrid default + unavailable embedder → keyword results + fallback note, exit 0', async () => {
      await cmd('remember').action(['we cache with Valkey as the key-value store'], {});
      writeFileSync(settingsPath(), JSON.stringify({ search: { default_mode: 'hybrid' } }), 'utf8');
      process.env.CMK_DISABLE_SEMANTIC = '1';
      await cmd('search').action(['Valkey'], {});
      expect(process.exitCode ?? 0).toBe(0);
      expect(errs.join('\n')).toMatch(/semantic default unavailable.*falling back to keyword/);
      expect(logs.join('\n')).toMatch(/Valkey/);
      expect(logs.join('\n')).toMatch(/mode=keyword/);
    });

    it('explicit --mode=keyword wins over the configured hybrid default (no fallback note)', async () => {
      await cmd('remember').action(['we cache with Valkey as the key-value store'], {});
      writeFileSync(settingsPath(), JSON.stringify({ search: { default_mode: 'hybrid' } }), 'utf8');
      process.env.CMK_DISABLE_SEMANTIC = '1';
      await cmd('search').action(['Valkey'], { mode: 'keyword' });
      expect(process.exitCode ?? 0).toBe(0);
      expect(errs.join('\n')).not.toMatch(/falling back/);
      expect(logs.join('\n')).toMatch(/Valkey/);
    });

    it('explicit --mode=semantic + unavailable embedder → exit 2 + install hint (no silent fallback)', async () => {
      await cmd('remember').action(['we cache with Valkey as the key-value store'], {});
      process.env.CMK_DISABLE_SEMANTIC = '1';
      await cmd('search').action(['Valkey'], { mode: 'semantic' });
      expect(process.exitCode).toBe(2);
      expect(errs.join('\n')).toMatch(/semantic backend unavailable/);
    });

    // The decisions scope is keyword-only BY DESIGN (the journal is a flat
    // markdown file, not embedded) — so it must NEVER attempt the semantic
    // backend, and the user must NEVER see an "unknown-scope:decisions" warning
    // for using a real, shipped scope. (v0.3.3 cut-gate-16 finding.)
    it('--scope decisions with configured hybrid default → keyword silently, NO unknown-scope warning, exit 0', async () => {
      await cmd('remember').action(['we chose better-sqlite3 over node:sqlite on perf'], { type: 'project', title: 'sqlite-choice' });
      await cmd('digest').action({}); // build the journal so the scope has something to find
      writeFileSync(settingsPath(), JSON.stringify({ search: { default_mode: 'hybrid' } }), 'utf8');
      process.env.CMK_DISABLE_SEMANTIC = '1';
      await cmd('search').action(['sqlite'], { scope: 'decisions' });
      expect(process.exitCode ?? 0).toBe(0);
      // The bug: it emitted "unknown-scope:decisions" / "semantic default unavailable".
      expect(errs.join('\n')).not.toMatch(/unknown-scope/);
      expect(errs.join('\n')).not.toMatch(/semantic default unavailable/);
    });

    it('--scope decisions with EXPLICIT --mode=hybrid → keyword silently, NOT exit 2', async () => {
      await cmd('remember').action(['we chose better-sqlite3 over node:sqlite on perf'], { type: 'project', title: 'sqlite-choice' });
      await cmd('digest').action({});
      await cmd('search').action(['sqlite'], { scope: 'decisions', mode: 'hybrid' });
      // decisions is keyword-only — an explicit non-keyword mode must NOT hard-fail
      // (exit 2) on the headline recall path; it coerces to keyword and returns results.
      expect(process.exitCode ?? 0).toBe(0);
      expect(errs.join('\n')).not.toMatch(/unknown-scope|semantic backend unavailable/);
    });
  });

  it('trust → updates a fact\'s trust level', () => {
    cmd('remember').action(['y'], { type: 'feedback', title: 'a-rule', why: 'a', how: 'b' });
    const id = firstFactId();
    cmd('trust').action(id, 'medium');
    expect(logs.join('\n')).toMatch(/trust/i);
    expect(process.exitCode ?? 0).toBe(0);
  });

  it('forget --yes → tombstones a fact', () => {
    cmd('remember').action(['z'], { type: 'feedback', title: 'to-forget', why: 'a', how: 'b' });
    const id = firstFactId();
    cmd('forget').action(id, { yes: true });
    expect(logs.join('\n')).toMatch(/tombstoned/i);
    expect(existsSync(join(projectRoot, 'context', 'memory', 'archive', 'tombstones'))).toBe(true);
  });

  it('forget WITHOUT --yes → refuses (exit 2), nothing tombstoned', () => {
    cmd('remember').action(['w'], { type: 'feedback', title: 'keep-me', why: 'a', how: 'b' });
    const id = firstFactId();
    cmd('forget').action(id, {});
    expect(errs.join('\n')).toMatch(/--yes is required/);
    expect(process.exitCode).toBe(2);
    expect(factFiles()).toHaveLength(1); // untouched
  });

  it('lessons promote → routes a project fact to the user tier (promoted or queued, never hand-edit)', () => {
    cmd('remember').action(['Always pin exact dependency versions'], {
      type: 'feedback', title: 'pin-exact', why: 'reproducible', how: 'use ==',
    });
    const id = firstFactId();
    child('lessons', 'promote').action(id, {});
    // Either it promoted (exit 0) or queued for review (exit 3) — both are the
    // safe path; what must NOT happen is an error/not-found.
    expect([0, 3]).toContain(process.exitCode ?? 0);
    expect((logs.join('\n') + errs.join('\n'))).toMatch(/lessons promote/i);
  });

  it('disable-native-memory / enable-native-memory → toggle the committable setting', () => {
    cmd('disable-native-memory').action();
    const settingsPath = join(projectRoot, '.claude', 'settings.json');
    expect(JSON.parse(readFileSync(settingsPath, 'utf8')).autoMemoryEnabled).toBe(false);
    cmd('enable-native-memory').action();
    expect(JSON.parse(readFileSync(settingsPath, 'utf8')).autoMemoryEnabled).toBe(true);
  });

  // --- error / guard branches (cheap, but they're new code too) ---

  it('remember --tier U (terse) → captures to project tier (P) + note, NOT an error (D-102)', async () => {
    process.exitCode = 0; // defensive: no leak from a prior test's exit-2 path
    await cmd('remember').action(['a project note'], { tier: 'U' });
    expect(`${logs.join('\n')} ${errs.join('\n')}`).toMatch(/project tier \(P\)|promote/);
    expect(process.exitCode).not.toBe(2); // captured, not refused
    expect(memoryMd()).toContain('a project note'); // landed at P
  });

  it('trust with an unknown id → not-found, exit 2', () => {
    cmd('trust').action('P-ZZZZZZZZ', 'medium'); // validate-test-ids: ignore
    expect(errs.join('\n')).toMatch(/cmk trust/i);
    expect(process.exitCode).toBe(2);
  });

  it('lessons promote with an unknown id → not-found, exit 2', () => {
    child('lessons', 'promote').action('P-ZZZZZZZZ', {}); // validate-test-ids: ignore
    expect(errs.join('\n')).toMatch(/cmk lessons promote/i);
    expect(process.exitCode).toBe(2);
  });

  it('reindex --full → rebuilds from scratch without error', () => {
    cmd('remember').action(['q'], { type: 'feedback', title: 'full-reindex', why: 'a', how: 'b' });
    cmd('reindex').action({ full: true });
    expect(process.exitCode ?? 0).toBe(0);
    const index = readFileSync(join(projectRoot, 'context', 'memory', 'INDEX.md'), 'utf8');
    expect(index).toContain(factFiles()[0]);
  });
});
