// Lock-file discipline + stale-lock detection (Task 23.10, design §6.9).
//
// Public boundary:
//   - pidIsAlive(pid) → boolean
//     Liveness probe via `process.kill(pid, 0)`. POSIX: signal 0 is
//     a permission/existence check (does not actually signal).
//     Windows: node's process.kill maps signal 0 to OpenProcess →
//     returns true if the process handle opens. ESRCH = no such
//     process; EPERM = process exists but we can't signal it
//     (still alive). Non-numeric / negative / NaN inputs return false.
//
//   - detectStaleLocks(projectRoot, {userDir}) → Array<LockReport>
//     Scans context/.locks/*.lock under projectRoot (and ~/.locks/*.lock
//     under userDir if supplied), parses the PID inside each, and
//     reports which locks are held vs. stale. Returns an empty
//     array when no .locks/ directory exists. Skips non-lock files
//     (audit.log, last-haiku-call.ts, etc.) by extension match.
//
//     LockReport shape:
//       {
//         path: string,             // absolute path to the lock file
//         pid: number | null,       // parsed pid; null on unparseable
//         holderAlive: boolean,     // pidIsAlive(pid); false on null pid
//         stale: boolean,           // !holderAlive (or unparseable)
//         reason?: string,          // explanation when stale (e.g. "unparseable pid")
//         recoveryCommand?: string, // user-facing rm command to clear
//       }
//
// Consumed by:
//   - cmk doctor HC-9 (Task 37 when it ships) — surfaces stale locks
//     in the diagnostic report with the recoveryCommand for each.
//   - auto-extract.mjs stale-recovery path: uses the same pidIsAlive
//     probe inline today; Layer 4 close will consolidate.
//
// Composition with PR-A's subprocess timeout (per design §6.9): PR-A
// closed the dominant lock-leak path (hook ceiling killing the parent
// mid-Haiku). This module is the defense for the residual cases —
// external SIGKILL, OS OOM, hardware failure, parent uncaught
// exception. Without HC-9 + the recovery command, a residual leak
// has no user-visible escape hatch.

import {
  existsSync,
  readdirSync,
  readFileSync,
} from 'node:fs';
import { join } from 'node:path';

// Cross-platform recovery command. The kit is Windows-first; stock
// cmd.exe has no `rm` (and PowerShell users typically reach for
// `Remove-Item` or its alias `del`). Linux/macOS users get the POSIX
// `rm`. Either way the command is copy-paste-ready in the user's
// native shell. Quoting handles paths with spaces (Windows program-
// files, macOS user-folder display names, etc.).
function recoveryCommandFor(lockPath) {
  if (process.platform === 'win32') {
    return `Remove-Item "${lockPath}"`;
  }
  return `rm "${lockPath}"`;
}

// Note on pid=0: POSIX defines kill(0, sig) as "signal every process
// in the caller's process group" — calling it for a liveness probe
// is incorrect (and dangerous if the caller mistakenly uses a real
// signal later). The original inlined version in auto-extract.mjs
// passed pid 0 through to process.kill (which returned true on
// success), so `pidIsAlive(0)` returned true. This consolidation
// rejects pid 0 in the input-validation guard instead — kit lock
// files never legitimately hold pid 0 (auto-extract writes
// `String(process.pid)`, which is the live process's id > 0). The
// behavior change is intentional input hardening, pinned by the
// `pidIsAlive(0) → false` test case.
export function pidIsAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // ESRCH = no such process. EPERM = process exists but we lack
    // permission to signal it (still alive — count as alive).
    return err.code === 'EPERM';
  }
}

function parseLockPid(lockPath) {
  // Returns the integer pid the lock contains, or null if the file
  // is unreadable / empty / non-numeric. The current
  // auto-extract.mjs writeFileSync writes `String(process.pid)`
  // verbatim; future PID-reuse hardening (write `{pid, started_at}`
  // JSON) would extend this parser to handle both shapes.
  let raw;
  try {
    raw = readFileSync(lockPath, 'utf8');
  } catch {
    return null;
  }
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  const n = Number.parseInt(trimmed, 10);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

function scanLocksDir(locksDir) {
  if (!existsSync(locksDir)) return [];
  let entries;
  try {
    entries = readdirSync(locksDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!entry.name.endsWith('.lock')) continue;
    out.push(join(locksDir, entry.name));
  }
  return out;
}

function buildReport(lockPath) {
  const pid = parseLockPid(lockPath);
  if (pid === null) {
    return {
      path: lockPath,
      pid: null,
      holderAlive: false,
      stale: true,
      reason: 'unparseable pid (empty file or non-numeric contents)',
      recoveryCommand: recoveryCommandFor(lockPath),
    };
  }
  const alive = pidIsAlive(pid);
  if (alive) {
    return {
      path: lockPath,
      pid,
      holderAlive: true,
      stale: false,
    };
  }
  return {
    path: lockPath,
    pid,
    holderAlive: false,
    stale: true,
    reason: `pid ${pid} no longer alive (holder process died without releasing lock)`,
    recoveryCommand: recoveryCommandFor(lockPath),
  };
}

export function detectStaleLocks(projectRoot, { userDir } = {}) {
  // Defensive guard: cmk doctor will call this with config-derived
  // paths that might be undefined when the project root hasn't been
  // resolved yet. Returning an empty report is safer than throwing
  // — the report consumer treats "no stale locks" as a healthy
  // state, and a missing projectRoot is itself a separate diagnostic
  // (cmk doctor's other checks surface it).
  if (typeof projectRoot !== 'string' || projectRoot === '') return [];
  const projectLocksDir = join(projectRoot, 'context', '.locks');
  const userLocksDir = userDir ? join(userDir, '.locks') : null;

  const lockPaths = [
    ...scanLocksDir(projectLocksDir),
    ...(userLocksDir ? scanLocksDir(userLocksDir) : []),
  ];

  return lockPaths.map(buildReport);
}
