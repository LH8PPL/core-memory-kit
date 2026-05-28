// @doors: 1, 2, 3
// Door 3: this IS the Door-3 test — spawns the real bin wrapper as the cron emission path would. Asserts the cron-chain (absolute node + absolute bin + absolute projectRoot triple) survives a restricted-PATH spawn (simulating cron / launchd / schtasks at fire time).
// Door 4 N/A: no message-queue interaction.
// Door 5 N/A: NDJSON observability assertions live in the bin's own test file; this smoke just checks the chain works end-to-end.

// Tests for Task 36 — Layer 6 cron-chain spawn-smoke (skill-review S1).
//
// Proves the FULL chain from a cron-emitted command line through the
// bin wrapper to the project root works correctly on the local host:
//
//   "<absolute-node>" "<absolute-bin.mjs>" "<absolute-project-root>"
//
// Catches B1 (projectRoot not resolved from cwd; bin needs argv[2])
// and B2 (bare bin name won't PATH-resolve under cron). Uses the
// `no-input` path so no Haiku call fires — the bin exits 0 with
// skipped:no-input, but the NDJSON log entry lands in the project's
// sessions/ dir which proves projectRoot was correctly taken from
// argv (not from cwd).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { install } from '../packages/cli/src/install.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let sandbox;
let projectRoot;
let userDir;
let binDir;
const dailyBinPath = () => join(binDir, 'cmk-daily-distill.mjs');
const weeklyBinPath = () => join(binDir, 'cmk-weekly-curate.mjs');

async function makeFixture() {
  sandbox = mkdtempSync(join(tmpdir(), 'cmk-cron-smoke-'));
  projectRoot = join(sandbox, 'proj');
  userDir = join(sandbox, 'user');
  binDir = join(__dirname, '..', 'packages', 'cli', 'bin');
  await install({ projectRoot, userTier: userDir });
  // install() lazy-creates sessions/ — pre-create it so the bin's
  // no-context-dir guard doesn't fire (we want to exercise the
  // log-writing path that proves projectRoot resolution worked).
  mkdirSync(join(projectRoot, 'context', 'sessions'), { recursive: true });
}

beforeEach(async () => {
  await makeFixture();
});

afterEach(() => {
  rmSync(sandbox, { recursive: true, force: true });
});

describe('Task 36 — cron-chain spawn-smoke (B1+B2 acceptance)', () => {
  it('B1+B2: cmk-daily-distill bin run with absolute-paths-and-argv triple writes NDJSON to the argv-supplied projectRoot', () => {
    // Build the EXACT shape runRegisterCrons emits: absolute node +
    // absolute bin + absolute projectRoot, with PATH stripped to the
    // launchd-default. If the chain works under this PATH, it'll work
    // under cron / launchctl / schtasks (all of which have restricted
    // PATH at fire time).
    const r = spawnSync(
      process.execPath,
      [dailyBinPath(), projectRoot],
      {
        // Restricted PATH simulating cron/launchd's default.
        env: { ...process.env, PATH: '/usr/bin:/bin' },
        encoding: 'utf8',
        timeout: 15_000,
      },
    );
    // Bin always exits 0 (documented at the bin wrapper's process.exit(0))
    expect(r.status).toBe(0);
    // Today's date — bin uses nowIso() so let's accept any
    // YYYY-MM-DD.distill.log
    const sessionsDir = join(projectRoot, 'context', 'sessions');
    expect(existsSync(sessionsDir)).toBe(true);
    const files = require('node:fs').readdirSync(sessionsDir);
    const logFiles = files.filter((n) => /^\d{4}-\d{2}-\d{2}\.distill\.log$/.test(n));
    expect(logFiles.length).toBeGreaterThanOrEqual(1);
    // The entry should be the "no-input" or "no-context-dir" case (no
    // today files seeded). Confirms projectRoot was resolved correctly
    // — if argv was ignored and cwd was used, the log would land
    // somewhere outside our sandbox.
    const entry = JSON.parse(
      readFileSync(join(sessionsDir, logFiles[0]), 'utf8').trim().split('\n')[0],
    );
    expect(entry.scope).toBe('daily-distill');
  });

  it('B1+B2: cmk-weekly-curate bin run with absolute-paths-and-argv triple writes NDJSON to the argv-supplied projectRoot', () => {
    const r = spawnSync(
      process.execPath,
      [weeklyBinPath(), projectRoot],
      {
        env: { ...process.env, PATH: '/usr/bin:/bin' },
        encoding: 'utf8',
        timeout: 15_000,
      },
    );
    expect(r.status).toBe(0);
    const sessionsDir = join(projectRoot, 'context', 'sessions');
    const files = require('node:fs').readdirSync(sessionsDir);
    const logFiles = files.filter((n) => /^\d{4}-\d{2}-\d{2}\.curate\.log$/.test(n));
    expect(logFiles.length).toBeGreaterThanOrEqual(1);
    const entry = JSON.parse(
      readFileSync(join(sessionsDir, logFiles[0]), 'utf8').trim().split('\n')[0],
    );
    expect(entry.scope).toBe('weekly-curate');
  });

  it('B1 negative: bin WITHOUT argv[2] falls back to cwd (proves argv is the load-bearing source for cron)', () => {
    // Sanity check the fallback chain: if argv[2] is missing AND
    // CMK_PROJECT_DIR env is unset, the bin uses cwd. Simulate by
    // running with cwd=projectRoot but no argv path. This is the
    // PRE-FIX behavior — proves we know what we're guarding against.
    const r = spawnSync(
      process.execPath,
      [dailyBinPath()], // NO projectRoot argv
      {
        cwd: projectRoot, // cwd happens to BE projectRoot in this test
        env: { ...process.env, PATH: '/usr/bin:/bin', CMK_PROJECT_DIR: '' },
        encoding: 'utf8',
        timeout: 15_000,
      },
    );
    expect(r.status).toBe(0);
    // When cwd matches projectRoot, the bin still lands its log in
    // the right place — but only by coincidence. The B1 bug was that
    // cron's cwd is NEVER projectRoot (it's $HOME / / / C:\Windows\System32).
    // The argv-supplied path is the load-bearing fix.
    const sessionsDir = join(projectRoot, 'context', 'sessions');
    const files = require('node:fs').readdirSync(sessionsDir);
    const logFiles = files.filter((n) => /^\d{4}-\d{2}-\d{2}\.distill\.log$/.test(n));
    expect(logFiles.length).toBeGreaterThanOrEqual(1);
  });
});
