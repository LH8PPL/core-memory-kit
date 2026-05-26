// @doors: 1, 2
// Door 3 N/A: this module uses process.kill(pid, 0) for the liveness
//   probe — that's a syscall not a subprocess spawn. The
//   process-control surface is covered by spawn-smoke-kill-chain.test.js.
// Door 4 N/A: no message-queue interaction.
// Door 5 N/A: this module is a pure discipline library — it reports
//   stale-lock state to the caller (cmk doctor when Task 37 ships).
//   The caller writes any audit-log entries; the library itself does
//   no observability output.
//
// Tests for Task 23.10 — lock-file discipline + HC-9 stale-lock detection
// (post-PR-31 audit campaign Part 2/4; design §6.9).
//
// The library: detectStaleLocks(projectRoot, {userDir}) scans
// <projectRoot>/context/.locks/ + <userDir>/.locks/ (when userDir is
// supplied) for *.lock files, parses the PID inside each, probes
// liveness via process.kill(pid, 0), and returns a structured report
// of which locks are held vs. stale. cmk doctor HC-9 (Task 37 when
// it ships) consumes this report and surfaces recovery commands.
//
// pidIsAlive(pid) is exported separately because the auto-extract
// stale-recovery path already uses the same probe (inlined for now;
// Layer 4 close will consolidate).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  mkdirSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  detectStaleLocks,
  pidIsAlive,
} from '../packages/cli/src/lock-discipline.mjs';

function makeFixture() {
  const sandbox = mkdtempSync(join(tmpdir(), 'cmk-lock-discipline-test-'));
  const projectRoot = join(sandbox, 'proj');
  const userDir = join(sandbox, 'user');
  mkdirSync(join(projectRoot, 'context', '.locks'), { recursive: true });
  mkdirSync(join(userDir, '.locks'), { recursive: true });
  return { sandbox, projectRoot, userDir };
}

// A PID that is virtually guaranteed not to exist on a fresh test
// process. 1 is init/launchd/services on the major OSes; 99999 is
// almost always free. We use 99999 because pidIsAlive(1) returns
// true everywhere (and 1 actually owns plenty of subprocesses).
const DEAD_PID = 99999;
const LIVE_PID = process.pid;

describe('pidIsAlive(pid)', () => {
  it('returns true for the current process pid (live)', () => {
    expect(pidIsAlive(LIVE_PID)).toBe(true);
  });

  it('returns false for a pid that is essentially certain to be dead', () => {
    // 99999 is almost certainly not a running process on a test
    // machine. This is the same pattern auto-extract.mjs uses for
    // its stale-recovery test (it's been stable across the kit's
    // build history).
    expect(pidIsAlive(DEAD_PID)).toBe(false);
  });

  it('returns false for non-integer / nonsensical input', () => {
    expect(pidIsAlive(null)).toBe(false);
    expect(pidIsAlive(undefined)).toBe(false);
    expect(pidIsAlive(NaN)).toBe(false);
    expect(pidIsAlive('not-a-pid')).toBe(false);
    expect(pidIsAlive(-1)).toBe(false);
  });

  it('returns false for pid 0 (POSIX kill(0, sig) signals the entire process group — not a liveness probe)', () => {
    // The original inlined version in auto-extract.mjs passed pid 0
    // through to process.kill (which returned true), so the old
    // function reported pid 0 as alive. The consolidated version
    // rejects pid 0 in input validation — kit lock files never
    // legitimately hold pid 0 (auto-extract writes the live pid > 0),
    // and probing pid 0 has dangerous semantics if a caller ever
    // upgraded the signal from 0 to a real one. Pin the new behavior
    // explicitly so a regression doesn't silently restore the old
    // permissive shape.
    expect(pidIsAlive(0)).toBe(false);
  });
});

describe('detectStaleLocks() — HC-9 stale-lock detection', () => {
  let sandbox, projectRoot, userDir;

  beforeEach(() => {
    const f = makeFixture();
    sandbox = f.sandbox;
    projectRoot = f.projectRoot;
    userDir = f.userDir;
  });

  afterEach(() => {
    rmSync(sandbox, { recursive: true, force: true });
  });

  it('reports empty list when no lock files exist', () => {
    const r = detectStaleLocks(projectRoot, { userDir });
    expect(r).toEqual([]);
  });

  it('reports a held lock as holder-alive (NOT stale) when the holding pid is the current process', () => {
    const lockPath = join(projectRoot, 'context', '.locks', 'auto-extract.lock');
    writeFileSync(lockPath, String(LIVE_PID), 'utf8');

    const r = detectStaleLocks(projectRoot, { userDir });
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({
      path: lockPath,
      pid: LIVE_PID,
      holderAlive: true,
      stale: false,
    });
  });

  it('reports a lock with a dead PID as stale + provides a concrete recovery command', () => {
    const lockPath = join(projectRoot, 'context', '.locks', 'auto-extract.lock');
    writeFileSync(lockPath, String(DEAD_PID), 'utf8');

    const r = detectStaleLocks(projectRoot, { userDir });
    expect(r).toHaveLength(1);
    expect(r[0].path).toBe(lockPath);
    expect(r[0].pid).toBe(DEAD_PID);
    expect(r[0].holderAlive).toBe(false);
    expect(r[0].stale).toBe(true);
    // Door 1: recoveryCommand is a concrete string the user can copy-paste.
    expect(typeof r[0].recoveryCommand).toBe('string');
    expect(r[0].recoveryCommand).toContain(lockPath);
  });

  it('reports a lock file with garbage contents (no parseable pid) as stale + cleanup-recoverable', () => {
    // Real-world case: lock file got corrupted (partial write, disk
    // full mid-write, etc). Stale-recovery treats it as cleanable.
    const lockPath = join(projectRoot, 'context', '.locks', 'auto-extract.lock');
    writeFileSync(lockPath, 'not-a-pid-just-garbage', 'utf8');

    const r = detectStaleLocks(projectRoot, { userDir });
    expect(r).toHaveLength(1);
    expect(r[0].path).toBe(lockPath);
    expect(r[0].pid).toBe(null);
    expect(r[0].stale).toBe(true);
    expect(r[0].reason).toMatch(/unparseable|invalid/i);
  });

  it('scans BOTH projectRoot/.locks/ AND userDir/.locks/ when userDir is supplied', () => {
    writeFileSync(
      join(projectRoot, 'context', '.locks', 'project-lock.lock'),
      String(DEAD_PID),
      'utf8',
    );
    writeFileSync(
      join(userDir, '.locks', 'user-lock.lock'),
      String(DEAD_PID),
      'utf8',
    );

    const r = detectStaleLocks(projectRoot, { userDir });
    expect(r).toHaveLength(2);
    const paths = r.map((e) => e.path).sort();
    expect(paths[0]).toContain('project-lock.lock');
    expect(paths[1]).toContain('user-lock.lock');
  });

  it('ignores non-*.lock files in .locks/ (audit.log, poison-guard.log, etc. are NOT lock files)', () => {
    writeFileSync(
      join(projectRoot, 'context', '.locks', 'audit.log'),
      'not a lock file',
      'utf8',
    );
    writeFileSync(
      join(projectRoot, 'context', '.locks', 'last-haiku-call.ts'),
      '',
      'utf8',
    );
    // Real lock file mixed in
    writeFileSync(
      join(projectRoot, 'context', '.locks', 'auto-extract.lock'),
      String(LIVE_PID),
      'utf8',
    );

    const r = detectStaleLocks(projectRoot, { userDir });
    // Only the .lock file is reported; the logs are correctly skipped.
    expect(r).toHaveLength(1);
    expect(r[0].path).toContain('auto-extract.lock');
  });

  it('gracefully handles missing .locks/ directory (returns empty, no crash)', () => {
    // Fresh project that hasn't been auto-extracted yet — no .locks/
    const freshProject = join(sandbox, 'fresh');
    mkdirSync(freshProject, { recursive: true });
    const r = detectStaleLocks(freshProject, { userDir });
    expect(r).toEqual([]);
  });

  it('empty lock file is reported as stale (unparseable pid → cleanup-recoverable)', () => {
    // Real-world case: partial write at process death, disk full
    // mid-write, etc. The library cannot determine a holder, so it
    // takes the safe direction (mark stale → user-visible recovery
    // command) rather than the unsafe one (assume live → no
    // recovery hint, lock leaks forever).
    const lockPath = join(projectRoot, 'context', '.locks', 'broken.lock');
    writeFileSync(lockPath, '', 'utf8');

    const r = detectStaleLocks(projectRoot, { userDir });
    expect(r).toHaveLength(1);
    expect(r[0].stale).toBe(true);
    expect(r[0].pid).toBe(null);
  });

  it('defensive guard: detectStaleLocks(undefined) returns empty array without throwing', () => {
    // cmk doctor (Task 37) will call this with config-derived paths.
    // If the project root can't be resolved (fresh install, missing
    // config), the safe response is an empty report — the missing-
    // projectRoot diagnostic is a separate cmk doctor check. Without
    // this guard, `join(undefined, 'context', '.locks')` would throw
    // on Node >= 18 and bubble out of cmk doctor's HC-9 step.
    expect(detectStaleLocks(undefined)).toEqual([]);
    expect(detectStaleLocks('')).toEqual([]);
    expect(detectStaleLocks(null)).toEqual([]);
  });

  it('recoveryCommand is platform-appropriate (Remove-Item on Windows, rm on POSIX)', () => {
    // The kit is Windows-first; emitting `rm` on Windows would tell
    // users to run a command stock cmd.exe doesn't have. Pin the
    // platform-conditional emission so a future regression doesn't
    // silently revert to POSIX-only.
    const lockPath = join(projectRoot, 'context', '.locks', 'auto-extract.lock');
    writeFileSync(lockPath, String(DEAD_PID), 'utf8');

    const r = detectStaleLocks(projectRoot, { userDir });
    expect(r).toHaveLength(1);
    if (process.platform === 'win32') {
      expect(r[0].recoveryCommand).toMatch(/^Remove-Item "/);
    } else {
      expect(r[0].recoveryCommand).toMatch(/^rm "/);
    }
    // In both cases the lock path is quoted so spaces in the path
    // don't break the command.
    expect(r[0].recoveryCommand).toContain(`"${lockPath}"`);
  });
});
