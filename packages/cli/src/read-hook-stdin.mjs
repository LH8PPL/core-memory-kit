// Hook-stdin drain (Task: cmk-compress-session manual-invocation hang fix).
//
// The SessionEnd hook bins (npm: packages/cli/bin/; plugin: plugin/bin/) drain
// stdin so Claude Code's hook pipe closes cleanly. The PAYLOAD is discarded —
// the bins read their state from disk (sessions/now.md, the fact corpus), not
// from the hook JSON — so the read exists ONLY to drain the pipe.
//
// The hazard this module fixes: `readFileSync(0, 'utf8')` BLOCKS until stdin
// reaches EOF. When the bin is run as a real hook, Claude Code pipes the JSON
// payload and closes the pipe → EOF arrives → the read returns instantly. But
// when the bin is run MANUALLY without redirecting stdin (e.g. the v0.2.0
// cut-gate B7 probe: `cmk-compress-session | Out-Null` pipes stdout but leaves
// stdin on the interactive console), the console never sends EOF, so the read
// blocks forever — before ANY of the bin's body runs. The 60s SessionEnd hook
// ceiling then kills it (exit 124, zero stderr), which looked for days like a
// graduation/Haiku/lock hang but was the wrapper never executing. See
// DECISION-LOG 2026-06-06 FIX/RESOLVED.
//
// Boundary: readHookStdin({ isTTY }) → string. When stdin is an interactive TTY
// (no piped payload to drain, and reading would block), return '' without
// touching the fd. Otherwise drain the fd as before. isTTY is INJECTED by the
// caller (`process.stdin.isTTY`) so the function is pure and unit-testable
// without a real terminal.

import { readFileSync } from 'node:fs';
import { stripBom } from './read-json.mjs';

/**
 * Drain the hook payload from stdin without blocking an interactive console.
 *
 * @param {object} [opts]
 * @param {boolean} [opts.isTTY] - the caller's `process.stdin.isTTY`. When
 *   truthy, stdin is an interactive terminal: there is no piped payload and a
 *   blocking read would hang, so we return '' and never touch the fd.
 * @param {number} [opts.fd=0] - the stdin file descriptor (override for tests).
 * @returns {string} the drained payload, or '' for a TTY / unconnected stdin.
 */
export function readHookStdin({ isTTY, fd = 0 } = {}) {
  // Interactive console → no payload to drain and readFileSync(fd) would block
  // waiting for an EOF the terminal never sends. Treat as empty.
  if (isTTY) return '';
  try {
    return readFileSync(fd, 'utf8');
  } catch {
    // stdin not connected (e.g. fd closed) — fine; the hook still proceeds.
    return '';
  }
}

/**
 * Task 207 (D-306 generalized): parse a hook's raw stdin payload BOM-tolerantly.
 * Every Claude-Code hook bin previously did `raw.trim() === '' ? {} : JSON.parse(raw)`
 * inline — the exact BOM-unsafe shape that silently no-op'd EVERY Cursor-Windows
 * hook (D-306: a leading U+FEFF makes JSON.parse throw, the catch swallows it,
 * the hook exits 0 having done nothing). Claude Code does not BOM its payloads
 * today, so this is latent hardening — but the class took a live probe to find
 * once; the shared helper makes it structurally impossible per-bin.
 *
 * Contract: '' / whitespace-only / BOM-only → {} (the clean no-op the bins
 * expect); a BOM-prefixed JSON payload parses normally; malformed JSON still
 * THROWS (the bins' existing catch blocks own the error path — this helper
 * only removes the BOM trap, it does not change error semantics).
 *
 * @param {string} raw - the drained stdin payload (readHookStdin output).
 * @returns {object} the parsed payload, or {} when there is nothing to parse.
 */
export function parseHookPayload(raw) {
  const text = stripBom(String(raw ?? ''));
  if (text.trim() === '') return {};
  return JSON.parse(text);
}
