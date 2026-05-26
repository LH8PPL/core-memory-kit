// @doors: 1, 3
// Door 2 N/A: this test does not write to the kit's disk surface;
//   it spawns a fixture process and verifies kill-chain behavior.
// Door 4 N/A: no message-queue interaction.
// Door 5 N/A: this test asserts process-control behavior, not
//   observability — log assertions are in cli-compressor-timeout.test.js
//   which covers the in-process side of door 5 (HaikuTimeoutError
//   carries the category field that callers route on).
//
// Real-binary spawn smoke test for terminateSubprocess() against a
// real OS process (Task 23.9, design §8.5 + §17.3-§17.5).
//
// What this test catches that the mocked-spawn unit test cannot:
//   - On the real OS, sending SIGTERM/SIGKILL to a real PID actually
//     kills it. The mocked-spawn test (cli-compressor-timeout.test.js)
//     pins the LOGIC of the kill chain; this test pins that the OS
//     primitives we're using (child.kill('SIGTERM'), child.kill('SIGKILL'))
//     resolve to behavior that ends a process.
//   - Windows handles signals differently from POSIX — node's
//     child.kill on Windows translates SIGTERM and SIGKILL to
//     TerminateProcess() under the hood. This test exercises that
//     translation path on Windows specifically. Without this test,
//     a regression in Node's Windows kill handling would only
//     surface in production when a real Haiku hung in the field.
//
// Fixture: tests/fixtures/hang-forever.mjs registers a setInterval
// to keep the event loop alive and writes a sentinel to stdout so
// we know it started.

import { describe, it, expect } from 'vitest';
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { terminateSubprocess } from '../packages/cli/src/compressor.mjs';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = join(dirname(__filename), '..');
const HANG_FIXTURE = join(REPO_ROOT, 'tests', 'fixtures', 'hang-forever.mjs');

// Spawn the hang-forever fixture and wait for its "started" sentinel
// on stdout so we know the process is actually running and the
// setInterval handle is registered before we try to kill it. Without
// this wait, a kill that fires before the child fully initialized
// would be testing OS race behavior, not the kill-chain logic.
async function spawnHangingChild() {
  const child = spawn(process.execPath, [HANG_FIXTURE], {
    stdio: ['ignore', 'pipe', 'pipe'],
    // No detached/unref — the test process should own this child
    // so vitest's cleanup can reap it if the test bails out.
  });
  return new Promise((resolve, reject) => {
    let started = false;
    const startTimeout = setTimeout(() => {
      if (!started) reject(new Error('hang-forever fixture did not signal start within 5s'));
    }, 5000);
    child.stdout.on('data', (chunk) => {
      if (chunk.toString('utf8').includes('hang-forever started')) {
        started = true;
        clearTimeout(startTimeout);
        resolve(child);
      }
    });
    child.on('error', (err) => {
      clearTimeout(startTimeout);
      reject(err);
    });
  });
}

describe('terminateSubprocess() against a real OS process', () => {
  it('SIGTERM kills a process that honors signals (POSIX) or fast-paths via TerminateProcess (Windows)', { timeout: 15000 }, async () => {
    const child = await spawnHangingChild();
    const pidBefore = child.pid;
    expect(pidBefore).toBeGreaterThan(0);

    const r = await terminateSubprocess(child, { killGraceMs: 2000 });

    // Door 1: terminateSubprocess returned a defined result with one
    // of the documented method values.
    expect(['sigterm', 'sigkill', 'already-exited']).toContain(r.method);
    // Door 3: the child is no longer running. On POSIX, SIGTERM
    // typically suffices (process honors it). On Windows, node's
    // .kill maps SIGTERM to TerminateProcess which is a hard kill —
    // r.method may report 'sigterm' even though semantically the
    // OS killed it forcibly. Either way, the process is gone.
    expect(child.exitCode !== null || child.signalCode !== null).toBe(true);
  });

  it('graceful exit before kill chain: process that exits on its own returns method:"already-exited" or "sigterm"', { timeout: 15000 }, async () => {
    // Spawn a child that exits immediately (not a hanging one).
    const child = spawn(process.execPath, ['-e', 'process.exit(0)'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    // Wait for the child to exit naturally before calling terminate.
    await new Promise((res) => child.once('exit', res));

    // exitCode is now set; terminateSubprocess should fast-path.
    const r = await terminateSubprocess(child, { killGraceMs: 2000 });
    expect(r.method).toBe('already-exited');
    expect(r.exitCode).toBe(0);
  });
});
