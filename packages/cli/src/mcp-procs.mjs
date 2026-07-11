// mcp-procs.mjs — Task 205 (D-302): find (and optionally stop) the kit's own
// running `cmk mcp serve` processes.
//
// WHY: on Windows a running MCP server holds a lock on the kit's native files
// (vec0.dll / better_sqlite3.node); an `npm install -g` upgrade during the
// lock can half-break the global (see half-install.mjs). The kit can't hook
// npm, but it CAN make the hazard visible: `cmk install` runs a best-effort
// preflight that names the running servers + the upgrade caveat, and offers
// to stop them when interactive (they reconnect automatically on the next
// tool call — the documented manual kill, automated).
//
// Design constraints:
//   - argv-array spawns only, absolute System32 paths on Windows (the
//     register-crons Sonar-S4036 precedent — never PATH-resolve a system exe
//     for a privileged-ish operation).
//   - NEVER throw: a process-scan failure returns {servers: [], error} — the
//     preflight is an optimization, not a gate (install must never fail
//     because a process list couldn't be read).
//   - The kit only ever stops processes it POSITIVELY identified as its own
//     (command line contains both `cmk` and `mcp serve`), never by name alone.

import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const SCAN_TIMEOUT_MS = 10_000;

function windowsSystem32(exe, sub = []) {
  const root = process.env.SystemRoot || process.env.windir || 'C:\\Windows';
  return join(root, 'System32', ...sub, exe);
}

/**
 * Pure: is this command line one of the kit's own MCP servers?
 * Requires BOTH a `cmk` token and the consecutive `mcp serve` verb pair —
 * TOLERATING per-argument quoting, because the REAL Windows command line (live-
 * captured 2026-07-11 from a running server this very session) quotes each arg:
 *   "node"   "C:\...\claude-memory-kit\bin\cmk.mjs" "mcp" "serve"
 * A bare `\bmcp\s+serve\b` missed it (the D-306 real-payload class — found by
 * the live probe, not the unit tests).
 * Documented over-match: a transient `cmk search "mcp serve"` CLI call also
 * matches — acceptable because such invocations live milliseconds, the
 * preflight only WARNS, and any stop is gated behind positive listing + an
 * interactive confirm.
 */
export function isKitMcpCommandLine(commandLine) {
  const c = String(commandLine ?? '');
  return /cmk/i.test(c) && /\bmcp["']?\s+["']?serve\b/i.test(c);
}

/**
 * Pure: parse the PowerShell `ConvertTo-Json -Compress` output of
 * Win32_Process rows ({ProcessId, CommandLine}) — a single object when one
 * row, an array when several, empty/garbage on none.
 */
export function parseWindowsProcessJson(stdout) {
  const text = String(stdout ?? '').trim();
  if (!text) return [];
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return [];
  }
  const rows = Array.isArray(parsed) ? parsed : [parsed];
  return rows
    .map((r) => ({ pid: Number(r?.ProcessId), commandLine: String(r?.CommandLine ?? '') }))
    .filter((r) => Number.isFinite(r.pid) && r.pid > 0);
}

/** Pure: parse `ps -eo pid=,args=` output — one `  PID args...` line per proc. */
export function parsePosixProcessList(stdout) {
  return String(stdout ?? '')
    .split('\n')
    .map((line) => {
      const m = /^\s*(\d+)\s+(.+)$/.exec(line);
      return m ? { pid: Number(m[1]), commandLine: m[2] } : null;
    })
    .filter(Boolean);
}

/**
 * Best-effort: the kit's own running `cmk mcp serve` processes.
 * Returns {servers: [{pid, commandLine}], error?} — never throws.
 */
export function findRunningKitMcpServers({
  spawn = spawnSync,
  platform = process.platform,
  selfPid = process.pid,
} = {}) {
  try {
    let procs;
    if (platform === 'win32') {
      const psExe = windowsSystem32('powershell.exe', ['WindowsPowerShell', 'v1.0']);
      const r = spawn(
        psExe,
        [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          // node.exe only — the servers are node processes; ConvertTo-Json for
          // a parse that survives spaces/quotes in command lines.
          "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Select-Object ProcessId,CommandLine | ConvertTo-Json -Compress",
        ],
        { encoding: 'utf8', windowsHide: true, timeout: SCAN_TIMEOUT_MS },
      );
      if (r.error || r.status !== 0) {
        return { servers: [], error: r.error?.message ?? `powershell exit ${r.status}` };
      }
      procs = parseWindowsProcessJson(r.stdout);
    } else {
      const r = spawn('ps', ['-eo', 'pid=,args='], {
        encoding: 'utf8',
        timeout: SCAN_TIMEOUT_MS,
      });
      if (r.error || r.status !== 0) {
        return { servers: [], error: r.error?.message ?? `ps exit ${r.status}` };
      }
      procs = parsePosixProcessList(r.stdout);
    }
    const servers = procs.filter(
      (p) => p.pid !== selfPid && isKitMcpCommandLine(p.commandLine),
    );
    return { servers };
  } catch (err) {
    return { servers: [], error: err?.message ?? String(err) };
  }
}

/**
 * Best-effort: stop the given kit MCP server pids. The servers are safe to
 * kill — the host agent respawns them on the next MCP tool call (the
 * documented manual recovery, automated). Returns per-pid outcomes; never
 * throws.
 */
export function stopMcpServers(pids, { spawn = spawnSync, platform = process.platform } = {}) {
  const results = [];
  for (const pid of pids ?? []) {
    const n = Number(pid);
    if (!Number.isFinite(n) || n <= 0) {
      results.push({ pid, stopped: false, error: 'invalid pid' });
      continue;
    }
    try {
      let r;
      if (platform === 'win32') {
        r = spawn(windowsSystem32('taskkill.exe'), ['/PID', String(n), '/F'], {
          encoding: 'utf8',
          windowsHide: true,
          timeout: SCAN_TIMEOUT_MS,
        });
      } else {
        r = spawn('kill', ['-TERM', String(n)], { encoding: 'utf8', timeout: SCAN_TIMEOUT_MS });
      }
      results.push(
        r.error || r.status !== 0
          ? { pid: n, stopped: false, error: r.error?.message ?? `exit ${r.status}` }
          : { pid: n, stopped: true },
      );
    } catch (err) {
      results.push({ pid: n, stopped: false, error: err?.message ?? String(err) });
    }
  }
  return results;
}
