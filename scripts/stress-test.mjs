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

import { spawnSync } from 'node:child_process';

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

// Windows: npm ships as `npm.cmd` and Node's spawn can't resolve
// .cmd shims without shell:true (CVE-2024-27980 hardening). Same
// class of bug PR #22 fixed for the `claude` binary. Linux/macOS:
// shell:true is a no-op for argv-style invocation with no shell
// metacharacters (we pass none).
const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const failures = [];
const startedAt = Date.now();

for (let i = 1; i <= runs; i++) {
  const runStart = Date.now();
  console.log(`\n=== stress run ${i}/${runs} ===`);
  const r = spawnSync(npmCmd, ['test'], {
    stdio: 'inherit',
    shell: true,
    // Suppress the cmd.exe console window flicker on Windows — every
    // shell:true spawn would otherwise pop a transient window. The
    // child's stdio:'inherit' still writes to the parent terminal.
    windowsHide: true,
  });
  const elapsed = ((Date.now() - runStart) / 1000).toFixed(1);
  if (r.status === 0) {
    console.log(`run ${i}: PASS (${elapsed}s)`);
  } else {
    console.log(`run ${i}: FAIL (${elapsed}s) — exit ${r.status}`);
    failures.push({ run: i, exit: r.status, elapsedSec: Number(elapsed) });
  }
}

const totalSec = ((Date.now() - startedAt) / 1000).toFixed(1);
console.log(`\n=== stress summary (${totalSec}s total) ===`);
console.log(`  passed: ${runs - failures.length}/${runs}`);
if (failures.length > 0) {
  console.log(`  failed: ${failures.length}/${runs}`);
  for (const f of failures) {
    console.log(`    run ${f.run}: exit ${f.exit} (${f.elapsedSec}s)`);
  }
  process.exit(1);
}
process.exit(0);
