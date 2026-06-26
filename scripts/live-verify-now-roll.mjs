#!/usr/bin/env node
// Live-verify: the Task 167 now-roll self-heal (D-206/D-207).
//
// Proves the AUTOMATIC path end-to-end with REAL bins and NO manual command:
// the trap state (a bloated now.md + a DEAD cron heartbeat) heals by the act of
// STARTING A SESSION (firing cmk-inject-context, the SessionStart hook) — not by
// any `cmk compress` / `cmk roll` the test runs by hand. A test that ran the
// drain command would structurally mask the automatic path (the DJ5/D-169
// lesson; the original bug shipped green because every test ran the command
// first), so this script FIRES ONLY THE HOOK.
//
// Run: npm run live-verify:now-roll   (real claude --print spawn inside the
// inject bin's sync-drain → spends a real Haiku call; on a subscription there's
// no per-token cost, only wall-clock).
//
// Two scenarios:
//   1. SINGLE-session heal — one inject-hook fire drains the bloated now.md.
//   2. MULTI-session — proves it heals in ONE session, not many (the original
//      bug compounded across sessions).

import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  writeFileSync,
  readFileSync,
  existsSync,
  readdirSync,
  utimesSync,
  rmSync,
  chmodSync,
} from 'node:fs';
import { tmpdir, platform } from 'node:os';
import { join, dirname, delimiter } from 'node:path';
import { fileURLToPath } from 'node:url';

const IS_WIN = platform() === 'win32';
const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DEV_BIN_DIR = join(REPO_ROOT, 'packages', 'cli', 'bin');
const KEEP = process.argv.includes('--keep');

const BIN_NAMES = [
  'cmk', 'cmk-daily-distill', 'cmk-weekly-curate', 'cmk-compress-lazy',
  'cmk-inject-context', 'cmk-capture-prompt', 'cmk-observe-edit',
  'cmk-capture-turn', 'cmk-compress-session',
];

function log(...a) { console.log('[live-verify:now-roll]', ...a); }

function writeShims(binDir) {
  mkdirSync(binDir, { recursive: true });
  for (const name of BIN_NAMES) {
    const target = join(DEV_BIN_DIR, `${name}.mjs`);
    if (IS_WIN) {
      writeFileSync(join(binDir, `${name}.cmd`), `@echo off\r\nnode "${target}" %*\r\n`, 'utf8');
    } else {
      const p = join(binDir, name);
      writeFileSync(p, `#!/bin/sh\nexec node "${target}" "$@"\n`, 'utf8');
      chmodSync(p, 0o755);
    }
  }
}

function run(cmd, args, { cwd, binDir, userDir, input, timeoutMs = 120_000 } = {}) {
  const env = {
    ...process.env,
    PATH: binDir + delimiter + process.env.PATH,
    Path: binDir + delimiter + (process.env.Path ?? process.env.PATH),
    MEMORY_KIT_USER_DIR: userDir,
    CMK_PROJECT_DIR: cwd,
  };
  return spawnSync(cmd, args, { cwd, env, encoding: 'utf8', timeout: timeoutMs, input, shell: IS_WIN, windowsHide: true });
}

/** Fire the REAL SessionStart hook (cmk-inject-context). This is the ONLY action
 *  the test takes to trigger the heal — no manual compress/roll. The hook spawns
 *  a DETACHED cmk-compress-lazy child that does the actual roll (a real Haiku call
 *  is 18–37s, > the 30s hook ceiling, so it CAN'T be synchronous — see Q4). The
 *  hook itself returns fast; the heal completes in the background. */
function fireSessionStart({ cwd, binDir, userDir }) {
  return run('cmk-inject-context', [], {
    cwd, binDir, userDir,
    input: JSON.stringify({ hook_event_name: 'SessionStart', source: 'startup' }),
    timeoutMs: 60_000,
  });
}

/** Wait (poll) for the detached roll to drain now.md — up to timeoutMs. The heal
 *  is automatic but ASYNCHRONOUS (detached child), so the test waits for the
 *  background child to finish, exactly as the NEXT real session would find it. */
function waitForDrain(cwd, timeoutMs = 90_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const content = existsSync(nowMd(cwd)) ? readFileSync(nowMd(cwd), 'utf8').trim() : '';
    if (content === '' && todayFiles(cwd).length > 0) return true;
    // busy-wait in ~1s slices (a real session wouldn't poll; this is the test
    // standing in for "the next session start finds it drained").
    const until = Date.now() + 1000;
    while (Date.now() < until) { /* spin */ }
  }
  return false;
}

function nowMd(cwd) { return join(cwd, 'context', 'sessions', 'now.md'); }
function todayFiles(cwd) {
  const d = join(cwd, 'context', 'sessions');
  if (!existsSync(d)) return [];
  return readdirSync(d).filter((n) => /^today-\d{4}-\d{2}-\d{2}\.md$/.test(n));
}
function heartbeatPath(cwd) { return join(cwd, 'context', '.locks', 'cron-heartbeat'); }

/** Seed the trap state: a bloated now.md + a DEAD cron heartbeat (5 days old). */
function seedTrapState(cwd) {
  const sessions = join(cwd, 'context', 'sessions');
  const locks = join(cwd, 'context', '.locks');
  mkdirSync(sessions, { recursive: true });
  mkdirSync(locks, { recursive: true });
  // A realistic bloated now.md: many prior-session turns.
  const turns = [];
  for (let i = 0; i < 40; i++) {
    turns.push(`## 2026-06-20T${String(i % 24).padStart(2, '0')}:00:00Z — user\n\nPrior-session turn ${i}: we discussed task ${i} and decided to do X${i}.\n`);
  }
  writeFileSync(nowMd(cwd), turns.join('\n'), 'utf8');
  // A DEAD cron: heartbeat exists (cron registered) but 5 days stale.
  writeFileSync(heartbeatPath(cwd), '', 'utf8');
  const old = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
  utimesSync(heartbeatPath(cwd), old, old);
}

async function main() {
  // Preflight: claude must be installed + authed (the inject bin's sync-drain
  // spawns a real `claude --print`).
  const probe = spawnSync('claude', ['--version'], { encoding: 'utf8', shell: IS_WIN });
  if (probe.status !== 0) {
    log('SKIP: `claude` CLI not available/authed — the sync-drain needs it. (', (probe.stderr || probe.error?.message || '').slice(0, 120), ')');
    process.exit(0);
  }

  const root = mkdtempSync(join(tmpdir(), 'cmk-now-roll-'));
  const binDir = join(root, 'bin');
  const userDir = join(root, 'user');
  const projectA = join(root, 'proj-a');
  mkdirSync(projectA, { recursive: true });
  writeShims(binDir);
  log('sandbox:', root);

  let pass1 = false;
  let pass2 = false;

  try {
    // Install the kit into the sandbox project (real bin).
    const inst = run('cmk', ['install'], { cwd: projectA, binDir, userDir });
    if ((inst.status ?? 1) !== 0) {
      log('install failed:', (inst.stderr || inst.stdout || '').slice(0, 300));
    }

    // ---- Scenario 1: single-session heal -------------------------------------
    seedTrapState(projectA);
    const beforeBytes = readFileSync(nowMd(projectA), 'utf8').length;
    log(`SCENARIO 1: seeded trap state — now.md ${beforeBytes}B + dead cron heartbeat`);

    // The ONLY action: fire the SessionStart hook. No `cmk compress`/`roll`.
    fireSessionStart({ cwd: projectA, binDir, userDir });
    // The roll is detached (a real Haiku call > the hook ceiling) — wait for the
    // background child to finish, as the next real session would find it.
    pass1 = waitForDrain(projectA);
    const tFiles = todayFiles(projectA);
    log(`SCENARIO 1 ${pass1 ? 'PASS' : 'FAIL'} — bloated now.md healed automatically (detached roll), today-*.md: ${tFiles.join(', ') || 'none'}`);
    if (!pass1) {
      const after = existsSync(nowMd(projectA)) ? readFileSync(nowMd(projectA), 'utf8').trim() : '';
      log('  now.md after (first 200):', after.slice(0, 200));
    }

    // ---- Scenario 2: heals in ONE session, not many --------------------------
    // Re-seed; confirm a SINGLE inject-hook fire is enough (the original bug
    // compounded because each session deferred — this proves no deferral).
    const projectB = join(root, 'proj-b');
    mkdirSync(projectB, { recursive: true });
    run('cmk', ['install'], { cwd: projectB, binDir, userDir });
    seedTrapState(projectB);
    fireSessionStart({ cwd: projectB, binDir, userDir });
    pass2 = waitForDrain(projectB);
    log(`SCENARIO 2 ${pass2 ? 'PASS' : 'FAIL'} — bloated now.md healed from ONE session start (167.A: a dead cron no longer suppresses the roll)`);
  } finally {
    if (KEEP) {
      log('--keep set; sandbox preserved at', root);
    } else {
      try { rmSync(root, { recursive: true, force: true }); }
      catch (e) { log('cleanup: could not remove', root, `(${e?.code ?? e?.message}); OS will reclaim tmpdir`); }
    }
  }

  const ok = pass1 && pass2;
  log(ok ? '✅ ALL PASS — the now-roll self-heal works automatically (no manual command).' : '❌ FAIL — see scenarios above.');
  process.exit(ok ? 0 : 1);
}

main().catch((e) => { log('ERROR:', e?.message ?? e); process.exit(1); });
