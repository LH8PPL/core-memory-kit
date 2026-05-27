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
// Per-run output capture (added 2026-05-27 after Task 28 PR #44's
// stress claim was caught by Lior as "consistent with live-Haiku
// jitter" inference rather than data). Original posture used
// stdio:'inherit' — child output went to the terminal but wasn't
// captured anywhere, so a failing run produced no investigatable
// artifact. Now: child stdout/stderr is teed to BOTH the parent
// terminal AND a per-run log file under `.stress-logs/`. Failures
// produce a captured log; the summary points to it.

import { spawn } from 'node:child_process';
import { createWriteStream, mkdirSync, existsSync } from 'node:fs';
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

const LOG_DIR = '.stress-logs';
mkdirSync(LOG_DIR, { recursive: true });

// Per-invocation timestamp so successive stress invocations don't
// stomp each other's logs. ISO-ish, filename-safe.
const sessionStamp = new Date()
  .toISOString()
  .replace(/[:.]/g, '-')
  .replace('T', '_')
  .slice(0, 19);

// Windows: npm ships as `npm.cmd` and Node's spawn can't resolve
// .cmd shims without shell:true (CVE-2024-27980 hardening). Same
// class of bug PR #22 fixed for the `claude` binary. Linux/macOS:
// shell:true is a no-op for argv-style invocation with no shell
// metacharacters (we pass none).
const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const failures = [];
const startedAt = Date.now();

/**
 * Run one iteration. Child stdio is piped to per-run log files only —
 * not echoed to the parent terminal during the run. Background:
 * tee'ing chunks to both `process.stdout` and a file stream on Windows
 * imposes enough sync-IO overhead to push live-Haiku spawn-smokes
 * (`tests/spawn-smoke-haiku.test.js`, 30s test budget) past their
 * timeout — surfaced empirically when the first instrumented stress
 * went from 5/5 + ~50s/run to 2/5 + ~120s/run. The diagnostic value
 * is in the captured log, not in real-time terminal echo; the summary
 * at the end points to each log so the user can tail/grep after.
 */
function runOne(i) {
  return new Promise((resolve) => {
    const runStart = Date.now();
    const logPath = join(LOG_DIR, `${sessionStamp}_run-${i}.log`);
    const logStream = createWriteStream(logPath, { encoding: 'utf8' });
    logStream.write(
      `=== stress run ${i}/${runs} @ ${new Date().toISOString()} ===\n`,
    );

    console.log(`\n=== stress run ${i}/${runs} ===  (log: ${logPath})`);

    const child = spawn(npmCmd, ['test'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
      windowsHide: true,
    });

    // Pipe child output to log file ONLY (not to parent terminal —
    // see runOne docstring for the IO-overhead rationale).
    child.stdout.pipe(logStream, { end: false });
    child.stderr.pipe(logStream, { end: false });

    child.on('close', (code) => {
      const elapsed = ((Date.now() - runStart) / 1000).toFixed(1);
      logStream.write(`=== run exit code: ${code} (${elapsed}s) ===\n`);
      logStream.end();
      if (code === 0) {
        console.log(`run ${i}: PASS (${elapsed}s)`);
      } else {
        console.log(
          `run ${i}: FAIL (${elapsed}s) — exit ${code} — see ${logPath}`,
        );
        failures.push({
          run: i,
          exit: code,
          elapsedSec: Number(elapsed),
          logPath,
        });
      }
      resolve();
    });

    child.on('error', (err) => {
      logStream.write(`=== spawn error: ${err.message} ===\n`);
      logStream.end();
      console.error(`run ${i}: SPAWN ERROR — ${err.message}`);
      failures.push({
        run: i,
        exit: 'spawn-error',
        elapsedSec: ((Date.now() - runStart) / 1000),
        logPath,
        spawnError: err.message,
      });
      resolve();
    });
  });
}

for (let i = 1; i <= runs; i++) {
  // Sequential — concurrent runs would invalidate the "green under
  // realistic load" contract since each run becomes its own workload.
  // eslint-disable-next-line no-await-in-loop
  await runOne(i);
}

const totalSec = ((Date.now() - startedAt) / 1000).toFixed(1);
console.log(`\n=== stress summary (${totalSec}s total) ===`);
console.log(`  passed: ${runs - failures.length}/${runs}`);
console.log(`  log dir: ${LOG_DIR}/${sessionStamp}_run-*.log`);
if (failures.length > 0) {
  console.log(`  failed: ${failures.length}/${runs}`);
  for (const f of failures) {
    const errBit = f.spawnError ? ` (spawn-error: ${f.spawnError})` : '';
    console.log(
      `    run ${f.run}: exit ${f.exit}${errBit} (${f.elapsedSec}s) — log: ${f.logPath}`,
    );
  }
  console.log(
    '\nInvestigation: each failing run has a captured log; grep for `FAIL` ' +
      "or `Error:` to locate the failing test.\n" +
      'When the failure class is identified, classify it per the kit\'s ' +
      'stress-gate rule (CLAUDE.md): the narrow live-Haiku jitter exception ' +
      'requires a specific test in the documented jitter set.',
  );
  process.exit(1);
}
process.exit(0);
