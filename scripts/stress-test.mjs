#!/usr/bin/env node
// Stress-runner for `npm test`.
//
// Loops the full test suite N times (default 5) and EXIT-FAILS on the
// first non-green run. The point isn't to chase flakes — it's to lock
// down the "green under realistic load" contract that
// individual `npm test` invocations sometimes hide on Windows
// (cold-start contention, file-system visibility races, live-Haiku
// rate-limit retry windows).
//
// Default behavior is the same as production CI: live-Haiku
// spawn-smokes run (no CMK_SKIP_LIVE_HAIKU=1). The agent (Claude
// running in this repo) is expected to invoke `npm run stress`
// before opening any PR whose surface includes spawn boundaries,
// detached children, or hook handlers — i.e. anything where
// concurrency-class flakes hide.
//
// Why a script and not a one-liner: I (Claude) was typing
//   `for i in 1 2 3 4 5; do npm test; done`
// fresh each session — error-prone (could forget the loop, run
// 3 iterations instead of 5, accidentally pass CMK_SKIP_LIVE_HAIKU=1).
// Lior asked: "are you using scripts to run tests or are you doing
// them manually?" — and the honest answer was "manually." This
// script is the fix.
//
// =========================================================================
// TWO MODES:
//   1. DEFAULT (no env var)  — fast: stdio:'inherit', ~50s/run.
//      Vitest stays in TTY mode (progress UI with cursor moves).
//      No per-run output is captured anywhere.
//      Use this for the routine pre-PR gate.
//
//   2. CAPTURE (CMK_STRESS_LOG=1)  — slow: bash-tee, ~100-120s/run.
//      Pipes npm test's stdout+stderr through `bash -c '... | tee <log>'`
//      so a per-run log lands under `.stress-logs/`. Vitest detects
//      non-TTY (because of the pipe) and emits its verbose default
//      reporter, which adds ~50s/run of wall-time vs TTY mode.
//      Use this when you actually need to investigate a flaky stress
//      run — the 2x slowdown is the cost of having captured logs to
//      grep after.
//
// Why opt-in: a stress capture that turns 5/5 into 2/5 by pushing
// timing-sensitive tests past their budgets is worse than no capture
// at all — surfaced empirically through PR #45 (Node-pipe approach)
// and `fix-stress-os-level-tee` (bash-tee approach). Both made the
// stress-gate WORSE for diagnosing real flakes by manufacturing new
// ones. Capture stays available as an opt-in for investigation; the
// default returns to the fast TTY mode that was the original baseline.
// =========================================================================

import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const DEFAULT_RUNS = 5;
const runs = Number.parseInt(process.argv[2] ?? '', 10) || DEFAULT_RUNS;

if (process.env.CMK_SKIP_LIVE_HAIKU === '1') {
  console.error(
    'stress-test: refusing to run with CMK_SKIP_LIVE_HAIKU=1. ' +
      'The whole point of stressing is to catch flakes that hide when ' +
      'live spawn-smokes are skipped. Unset the env var and try again.',
  );
  process.exit(2);
}

const CAPTURE = process.env.CMK_STRESS_LOG === '1';
const LOG_DIR = '.stress-logs';
let sessionStamp;
if (CAPTURE) {
  mkdirSync(LOG_DIR, { recursive: true });
  sessionStamp = new Date()
    .toISOString()
    .replace(/[:.]/g, '-')
    .replace('T', '_')
    .slice(0, 19);
  console.log(
    `stress-test: CAPTURE mode (CMK_STRESS_LOG=1). Per-run logs → ` +
      `${LOG_DIR}/${sessionStamp}_run-*.log. ~2x slower than default.`,
  );
} else {
  console.log(
    `stress-test: FAST mode. To capture per-run logs (slower): ` +
      `CMK_STRESS_LOG=1 npm run stress`,
  );
}

// Windows: npm ships as `npm.cmd` and Node's spawn can't resolve
// .cmd shims without shell:true (CVE-2024-27980 hardening). Same
// class of bug PR #22 fixed for the `claude` binary. Linux/macOS:
// shell:true is a no-op for argv-style invocation with no shell
// metacharacters (we pass none).
const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const failures = [];
const startedAt = Date.now();

/**
 * Run one iteration. Mode-dependent:
 *
 *   - DEFAULT (fast):  spawnSync(npm test) with stdio:'inherit'. Vitest
 *     sees TTY, uses progress UI, ~50s/run. No log captured.
 *
 *   - CAPTURE:  spawnSync(bash -c "set -o pipefail; npm test 2>&1 | tee
 *     <log>") with stdio:'inherit'. OS-level teeing — terminal still
 *     gets output AND a per-run log lands at .stress-logs/. Vitest
 *     sees non-TTY (because of the pipe), switches to verbose default
 *     reporter, ~100-120s/run. set -o pipefail propagates npm's exit
 *     code through tee so a failure is still detectable.
 */
function runOne(i) {
  const runStart = Date.now();
  const logPath = CAPTURE
    ? join(LOG_DIR, `${sessionStamp}_run-${i}.log`)
    : null;

  console.log(
    `\n=== stress run ${i}/${runs} ===` +
      (CAPTURE ? `  (log: ${logPath})` : ''),
  );

  let r;
  if (CAPTURE) {
    // bash prefers forward slashes; works on Windows too. Embedded
    // double-quotes in the path would break the cmd string, but our
    // sessionStamp + run-N format never produces them.
    const escapedLogPath = logPath.replace(/\\/g, '/');
    const cmd = `set -o pipefail; npm test 2>&1 | tee "${escapedLogPath}"`;
    r = spawnSync('bash', ['-c', cmd], {
      stdio: 'inherit',
      windowsHide: true,
    });
  } else {
    r = spawnSync(npmCmd, ['test'], {
      stdio: 'inherit',
      shell: true,
      windowsHide: true,
    });
  }

  const elapsed = ((Date.now() - runStart) / 1000).toFixed(1);
  const code = r.status;
  const spawnErr = r.error;

  if (spawnErr) {
    const hint = CAPTURE
      ? `  Hint: CAPTURE mode needs \`bash\` on PATH. Install Git for ` +
        `Windows (git-bash) or unset CMK_STRESS_LOG.`
      : '';
    console.error(`run ${i}: SPAWN ERROR — ${spawnErr.message}\n${hint}`);
    failures.push({
      run: i,
      exit: 'spawn-error',
      elapsedSec: Number(elapsed),
      logPath,
      spawnError: spawnErr.message,
    });
    return;
  }

  if (code === 0) {
    console.log(`run ${i}: PASS (${elapsed}s)`);
  } else {
    const trailer = CAPTURE ? ` — see ${logPath}` : '';
    console.log(`run ${i}: FAIL (${elapsed}s) — exit ${code}${trailer}`);
    failures.push({
      run: i,
      exit: code,
      elapsedSec: Number(elapsed),
      logPath,
    });
  }
}

for (let i = 1; i <= runs; i++) {
  // Sequential — concurrent runs would invalidate the "green under
  // realistic load" contract since each run becomes its own workload.
  runOne(i);
}

const totalSec = ((Date.now() - startedAt) / 1000).toFixed(1);
console.log(`\n=== stress summary (${totalSec}s total) ===`);
console.log(`  passed: ${runs - failures.length}/${runs}`);
if (CAPTURE) {
  console.log(`  log dir: ${LOG_DIR}/${sessionStamp}_run-*.log`);
}
if (failures.length > 0) {
  console.log(`  failed: ${failures.length}/${runs}`);
  for (const f of failures) {
    const errBit = f.spawnError ? ` (spawn-error: ${f.spawnError})` : '';
    const logBit = f.logPath ? ` — log: ${f.logPath}` : '';
    console.log(
      `    run ${f.run}: exit ${f.exit}${errBit} (${f.elapsedSec}s)${logBit}`,
    );
  }
  if (CAPTURE) {
    console.log(
      '\nInvestigation: each failing run has a captured log; grep for ' +
        '`FAIL` or `Error:` to locate the failing test.\n' +
        'When the failure class is identified, classify it per the kit\'s ' +
        'stress-gate rule (CLAUDE.md): the narrow live-Haiku jitter ' +
        'exception requires a specific test in the documented jitter set.',
    );
  } else {
    console.log(
      '\nFor captured per-run logs to investigate this failure, re-run with:\n' +
        '  CMK_STRESS_LOG=1 npm run stress\n' +
        '(slower — ~2x — but produces per-run log files under .stress-logs/)',
    );
  }
  process.exit(1);
}
process.exit(0);
