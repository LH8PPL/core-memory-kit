// spawn-bin.mjs — cross-platform subprocess spawning that AVOIDS the
// `shell:true` + args-array combination (self-test finding #4).
//
// Why this exists
// ---------------
// Spawning an npm-global bin (claude, memsearch, cmk-*) needs `shell:true` on
// Windows so the `.cmd` shim resolves through cmd.exe — Node won't auto-resolve
// `.cmd`/`.bat` without a shell (CVE-2024-27980 hardening). But `shell:true`
// WITH an args array is doubly bad:
//   1. Node emits DEP0190 ("passing args to a child process with shell:true …
//      arguments are not escaped, only concatenated").
//   2. The args ARE concatenated unescaped, so a path containing a space
//      (e.g. `--mcp-config C:\Users\First Last\…\empty-mcp.json` under tmpdir)
//      is re-tokenized by cmd.exe and breaks parsing — silently failing
//      auto-extract/compression for any Windows user whose profile has a space.
//
// The fix: never pass an args array together with shell:true.
//   - POSIX: spawn(bin, args, {shell:false}) — Node resolves PATH directly and
//     passes argv safely. No shell, no concatenation.
//   - Windows: shell:true with a SINGLE pre-quoted command string (no args
//     array) — clears DEP0190 and lets us quote each arg so spaces survive.
//
// The kit's spawn args are controlled (flags + filesystem paths, never
// user-supplied shell text), so cmd.exe double-quoting is sufficient: inside
// double-quotes cmd.exe treats &|<>^ as literal; `%` is the only residual
// special char and kit paths/flags never contain it.

import { spawn, spawnSync } from 'node:child_process';

/**
 * Quote one argument for a cmd.exe command line. Quotes args that contain a
 * space or a double-quote, AND empty-string args (an unquoted empty arg would
 * vanish and shift the next token into its value slot — the compressor passes
 * `--allowed-tools ''`). Embedded double-quotes are doubled.
 */
function quoteWinArg(s) {
  const str = String(s);
  if (str === '' || /[\s"]/.test(str)) {
    // Double embedded double-quotes, AND double any trailing backslash run so
    // a quoted value ending in `\` (e.g. a directory path with a space) does
    // NOT escape the closing quote — the classic Windows CommandLineToArgv /
    // cmd.exe footgun (`"C:\dir\"` parses as `C:\dir"`).
    const escaped = str.replace(/"/g, '""').replace(/(\\+)$/, '$1$1');
    return `"${escaped}"`;
  }
  return str;
}

/**
 * Build the single cmd.exe command string for a Windows `shell:true` spawn.
 * Exported for direct unit testing of the quoting (platform-independent).
 */
export function winCommandLine(bin, args = []) {
  return [bin, ...args].map(quoteWinArg).join(' ');
}

/**
 * Spawn a bin cross-platform without ever pairing `shell:true` with an args
 * array. `deps` allows tests to inject a recording spawn + force a platform:
 *   deps.spawnImpl — defaults to node:child_process spawn (compressor injects
 *                    its own for the kill-chain / testability).
 *   deps.platform  — defaults to process.platform.
 * Returns whatever the spawn impl returns (a ChildProcess in production).
 */
export function spawnBin(bin, args = [], opts = {}, deps = {}) {
  const { spawnImpl = spawn, platform = process.platform } = deps;
  // spawn-discipline: ignore pass-through helper — timeout/kill is the
  // caller's contract (compressor terminateSubprocess + setTimeout; doctor
  // timeout:3500), not this wrapper's.
  if (platform === 'win32') {
    return spawnImpl(winCommandLine(bin, args), { ...opts, shell: true });
  }
  return spawnImpl(bin, args, { ...opts, shell: false });
}

/** Synchronous twin of spawnBin (for one-shot checks like `cmk doctor`'s memsearch probe). */
export function spawnBinSync(bin, args = [], opts = {}, deps = {}) {
  const { spawnImpl = spawnSync, platform = process.platform } = deps;
  if (platform === 'win32') {
    return spawnImpl(winCommandLine(bin, args), { ...opts, shell: true });
  }
  return spawnImpl(bin, args, { ...opts, shell: false });
}
