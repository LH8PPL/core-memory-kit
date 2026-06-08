#!/usr/bin/env node
// Automated live wedge test (Task 89 / D-45). The scripted equivalent of the
// manual "lior-test-N": drive REAL `claude -p` sessions through the kit's hooks
// and assert the cross-project persona wedge works end-to-end.
//
// WHY this can exist (verified 2026-06-03, D-45): `claude -p` fires the kit's
// SessionStart / Stop / SessionEnd hooks (proved by disk side-effects); the Stop
// hook records each turn VERBATIM into context/transcripts/{date}.md; multi-turn
// continuity works via --session-id / --resume; MEMORY_KIT_USER_DIR isolates the
// user tier so a run never touches the real ~/.claude-memory-kit.
//
// THE FLOW (mirrors what the user does by hand):
//   Phase A — project-A, ONE multi-turn session (the Ralph-loop shape: stage 1
//             prompt → output → stage 2 → output → …, all --resume'd into the same
//             session). The user STATES standing cross-project rules across turns
//             while doing work. Each turn fires Stop (transcript grows) +
//             SessionEnd (86b concurrent compress + 86c persona over the
//             accumulating transcript → promote into the user tier).
//   Phase B — project-B, a NEW session (fresh session-id + fresh cwd = cold open).
//             Ask for the standing rules; SessionStart injects the user tier; parse
//             Claude's answer and assert it NAMES the rules it never saw stated in
//             this project. That is the wedge.
//
// DEV-BUILD UNDER TEST: `cmk install` writes BARE hook-command names resolved via
// PATH (settings-hooks.mjs), so we shim `cmk` + the kit bins to the DEV tree's
// .mjs files in a temp dir prepended to PATH. The test exercises THIS checkout's
// code (86b/86c), not the globally-installed published cmk.
//
// COST + DETERMINISM: this spends real Claude + Haiku tokens (several `claude -p`
// turns) and depends on live model behaviour, so it is an ON-DEMAND script
// (`npm run live-verify`), NOT part of `npm test`. Assertions are presence-based
// and lenient (like the spawn-smokes) because live grading/recall phrasing varies.
//
// Guardrails (per the Ralph-Wiggum-loop article): per-turn timeout, overall budget,
// deterministic assertions, always clean up (unless --keep).

import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
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
const VERBOSE = process.argv.includes('--verbose');

// The kit bins to shim onto PATH (the 9 package.json `bin` entries — cmk drives
// install; the rest are hook targets + their sub-spawns).
const BIN_NAMES = [
  'cmk',
  'cmk-daily-distill',
  'cmk-weekly-curate',
  'cmk-compress-lazy',
  'cmk-inject-context',
  'cmk-capture-prompt',
  'cmk-observe-edit',
  'cmk-capture-turn',
  'cmk-compress-session',
];

// ---- the test scenario --------------------------------------------------------
// Two stated standing rules + a recall probe. De-biased away from the kit's own
// domain (no claude-memory-kit specifics); plain Python tooling habits.
const RULES = [
  { keyword: /\buv\b/i, label: 'use uv (not pip)' },
  { keyword: /\bruff\b/i, label: 'run ruff before committing' },
];
const PROJECT_A_TURNS = [
  'Let\'s start a tiny Python project. Create a file hello.py that prints "hi". Keep it to one line.',
  'Good. One standing preference for you to remember: from now on, in EVERY project I work on, always use uv for Python package management, never pip.',
  'Another standing rule, across ALL my repositories: always run ruff before committing. Now create a .gitignore that ignores .venv/ and __pycache__/.',
];
const PROJECT_B_QUESTION =
  'Before we start anything: what are my standing cross-project rules / preferences that you already know about me? List them as bullet points.';

// ---- helpers ------------------------------------------------------------------
function log(...a) { console.log('[live-verify]', ...a); }
function vlog(...a) { if (VERBOSE) console.log('[live-verify]', ...a); }

/** Write the cross-platform shim dir that points the bare bin names at DEV .mjs. */
function writeShims(binDir) {
  mkdirSync(binDir, { recursive: true });
  for (const name of BIN_NAMES) {
    const target = join(DEV_BIN_DIR, `${name}.mjs`);
    if (IS_WIN) {
      // .cmd so cmd.exe / `sh -c` (the hook shell form) resolves it.
      writeFileSync(join(binDir, `${name}.cmd`), `@echo off\r\nnode "${target}" %*\r\n`, 'utf8');
    } else {
      const p = join(binDir, name);
      writeFileSync(p, `#!/bin/sh\nexec node "${target}" "$@"\n`, 'utf8');
      chmodSync(p, 0o755);
    }
  }
}

/** Run a command with the shim dir prepended to PATH + the isolated user tier. */
function run(cmd, args, { cwd, binDir, userDir, timeoutMs = 180_000, input } = {}) {
  const env = {
    ...process.env,
    PATH: binDir + delimiter + process.env.PATH,
    Path: binDir + delimiter + (process.env.Path ?? process.env.PATH), // Windows casing
    MEMORY_KIT_USER_DIR: userDir,
    CMK_PROJECT_DIR: cwd,
  };
  const r = spawnSync(cmd, args, {
    cwd,
    env,
    encoding: 'utf8',
    timeout: timeoutMs,
    input,
    shell: IS_WIN, // resolve .cmd shims on Windows
    windowsHide: true,
  });
  if (r.error) throw new Error(`spawn ${cmd} failed: ${r.error.message}`);
  return r;
}

/**
 * One `claude -p` turn, always in JSON mode so we can read back the REAL
 * session id Claude assigned (the user's approach: "get the session id from each
 * invocation" — more robust than pre-generating a UUID). Pass `resumeId` to
 * continue a session; omit it to start a fresh one (a cold open).
 * Returns { text, sessionId }.
 */
function claudeTurn({ prompt, resumeId, cwd, binDir, userDir }) {
  const args = ['-p', '--output-format', 'json'];
  if (resumeId) args.push('--resume', resumeId);
  // The prompt goes via STDIN, NOT argv. On Windows we need shell:true to resolve
  // the claude.cmd shim, and shell:true concatenates (does not escape) argv — so a
  // prompt arg with spaces/apostrophes ("Let's …") gets shredded by cmd.exe (first
  // live run: Claude only received the word "Let's"). `claude -p` reads the prompt
  // from stdin, which is immune to shell quoting. Verified: echo prompt | claude -p.
  const r = run('claude', args, { cwd, binDir, userDir, timeoutMs: 240_000, input: prompt });
  if (r.status !== 0) {
    log(`WARN: claude -p exited ${r.status}; stderr:`, (r.stderr || '').slice(0, 400));
  }
  const raw = r.stdout ?? '';
  let text = raw;
  let sessionId = null;
  try {
    const j = JSON.parse(raw);
    text = j.result ?? j.text ?? j.response ?? raw;
    sessionId = j.session_id ?? j.sessionId ?? null;
  } catch {
    // non-JSON (shouldn't happen with --output-format json) — keep raw text.
  }
  return { text, sessionId };
}

function readUserTier(userDir) {
  const blobs = [];
  for (const f of ['USER.md', 'HABITS.md', 'LESSONS.md']) {
    const p = join(userDir, f);
    if (existsSync(p)) blobs.push(`# ${f}\n` + readFileSync(p, 'utf8'));
  }
  // queued (not-yet-promoted) candidates, for diagnostics on a miss
  const q = join(userDir, 'queues', 'persona-review.md');
  const queued = existsSync(q) ? readFileSync(q, 'utf8') : '';
  return { promoted: blobs.join('\n\n'), queued };
}

// ---- the run ------------------------------------------------------------------
async function main() {
  // Preflight: claude must be installed + authed (the user's own CLI).
  const ver = spawnSync('claude', ['--version'], { encoding: 'utf8', shell: IS_WIN });
  if (ver.status !== 0) {
    log('FAIL: `claude` CLI not found on PATH. Install Claude Code first.');
    process.exit(2);
  }
  log(`claude: ${(ver.stdout || '').trim()}`);

  const root = mkdtempSync(join(tmpdir(), 'cmk-live-'));
  const binDir = join(root, 'shimbin');
  const userDir = join(root, 'userdir');
  const projA = join(root, 'projectA');
  const projB = join(root, 'projectB');
  for (const d of [userDir, projA, projB]) mkdirSync(d, { recursive: true });
  writeShims(binDir);
  log(`sandbox: ${root}`);
  log(`dev bins shimmed from: ${DEV_BIN_DIR}`);

  let phaseA = false;
  let phaseB = false;
  let answer = '';
  try {
    // ---- install the kit into both projects (dev bins via the shim PATH) ----
    // Invoke cmk by ABSOLUTE shim path: Node resolves the executable via the
    // parent PATH (not options.env.PATH), so a bare `cmk` could hit the global
    // published cmk. The HOOKS still resolve to dev bins regardless (claude passes
    // our augmented env to the hook shell, which resolves cmk-* via it), but the
    // install step itself should also be the dev tree for a faithful test.
    const cmkBin = join(binDir, IS_WIN ? 'cmk.cmd' : 'cmk');
    for (const [name, cwd] of [['A', projA], ['B', projB]]) {
      const r = run(cmkBin, ['install'], { cwd, binDir, userDir, timeoutMs: 60_000 });
      if (r.status !== 0) throw new Error(`cmk install (project ${name}) failed: ${r.stderr}`);
      vlog(`project ${name} installed`);
    }

    // ---- PHASE A: one multi-turn session that STATES the rules + does work ----
    log('PHASE A — project-A: stating standing rules across a multi-turn session');
    let sidA = null; // captured from turn 1's JSON, then --resume'd
    for (let i = 0; i < PROJECT_A_TURNS.length; i++) {
      log(`  turn ${i + 1}/${PROJECT_A_TURNS.length} …`);
      const { text, sessionId } = claudeTurn({
        prompt: PROJECT_A_TURNS[i],
        resumeId: sidA, // null on turn 1 (fresh session), captured id after
        cwd: projA, binDir, userDir,
      });
      if (i === 0) {
        sidA = sessionId;
        if (!sidA) log('  WARN: no session_id returned on turn 1; later turns start fresh sessions');
        else vlog(`  session id: ${sidA}`);
      }
      vlog(`  ← ${String(text).trim().slice(0, 160)}`);
    }
    // Let any SessionEnd persona writes settle, then read the user tier.
    await new Promise((r) => setTimeout(r, 1500));
    const tier = readUserTier(userDir);
    vlog('user tier (promoted):\n' + tier.promoted);
    const promotedHits = RULES.filter((rule) => rule.keyword.test(tier.promoted));
    phaseA = promotedHits.length === RULES.length;
    log(`PHASE A ${phaseA ? 'PASS' : 'FAIL'} — promoted ${promotedHits.length}/${RULES.length} rules to the user tier` +
      (phaseA ? '' : ` (missing: ${RULES.filter((r) => !promotedHits.includes(r)).map((r) => r.label).join(', ')})`));
    if (!phaseA && tier.queued) log(`  (note: candidates sitting in persona-review queue — graded medium, not promoted)`);

    // ---- PHASE B: cold-open a NEW project + session, ask for the rules -------
    log('PHASE B — project-B cold open: does a brand-new session already know the rules?');
    answer = claudeTurn({ prompt: PROJECT_B_QUESTION, resumeId: null, cwd: projB, binDir, userDir }).text;
    vlog('cold-open answer:\n' + answer);
    const recallHits = RULES.filter((rule) => rule.keyword.test(answer));
    phaseB = recallHits.length === RULES.length;
    log(`PHASE B ${phaseB ? 'PASS' : 'FAIL'} — cold open recalled ${recallHits.length}/${RULES.length} rules` +
      (phaseB ? '' : ` (missing: ${RULES.filter((r) => !recallHits.includes(r)).map((r) => r.label).join(', ')})`));
  } finally {
    if (KEEP) {
      log(`--keep set; sandbox preserved at ${root}`);
    } else {
      // Best-effort cleanup. A detached hook child (auto-extract, spawned by the
      // Stop hook) can still hold a file handle inside the sandbox at this point,
      // and Windows then refuses the recursive delete with EPERM. A cleanup
      // failure must NEVER mask the wedge verdict (it threw out of finally and
      // turned a PASS into exit 2). Retry once after a short settle, then leave
      // the temp dir for the OS to reclaim.
      try {
        rmSync(root, { recursive: true, force: true });
      } catch {
        await new Promise((r) => setTimeout(r, 2500));
        try {
          rmSync(root, { recursive: true, force: true });
        } catch (e) {
          log(`cleanup: could not remove ${root} (${e?.code ?? e?.message}); OS will reclaim tmpdir`);
        }
      }
    }
  }

  // ---- verdict ----
  console.log('');
  log('================ WEDGE LIVE VERIFY ================');
  log(`  Phase A (capture → promote):   ${phaseA ? 'PASS ✅' : 'FAIL ❌'}`);
  log(`  Phase B (cold-open recall):    ${phaseB ? 'PASS ✅' : 'FAIL ❌'}`);
  log('==================================================');
  if (phaseA && phaseB) {
    log('WEDGE VERIFIED end-to-end on live models.');
    process.exit(0);
  }
  log('Wedge NOT fully verified — see phase output above.');
  if (!phaseB && phaseA) {
    log('  (Phase A promoted but cold-open did not recall — likely the behavioral');
    log('   "lead with memory" layer, D-40, not the capture/promote code.)');
  }
  process.exit(1);
}

main().catch((err) => {
  console.error('[live-verify] ERROR:', err?.stack ?? err);
  process.exit(2);
});
