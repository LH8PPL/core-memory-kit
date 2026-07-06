// agent-cli.mjs — the shared agent-CLI detector (Task 200, D-272/D-274/D-277).
//
// The kit's automatic engine routes its "Haiku call" through the agent's OWN CLI
// (claude / kiro-cli / cursor-agent). Before promising the automatic features
// work, both `cmk install` (first-touch) and `cmk doctor` (recurring) need to
// know: is that CLI actually RUNNABLE? This module is the ONE shared detector
// they both use — never re-derived inline (the shared-module discipline).
//
// D-274 lesson: presence-on-PATH is NOT enough. The Windows Cursor IDE shipped a
// live bug where a binary resolved on PATH but was the wrong (Unix) shim and
// errored out — "on PATH" ≠ "correctly installed." So the detector does an
// EXIT-CODE probe (`--version`), Windows `.cmd`-aware, with a bounded timeout so
// a wedged CLI can never hang the install/doctor flow.

import { spawnBinSync } from './spawn-bin.mjs';

// The agents the kit can run its background LLM call through. Values are the
// canonical keys; `detectInstallKind` returns `claude-code`/`kiro`/`cursor`, so
// `claude-code` is normalized to `claude` here.
export const KNOWN_BACKEND_AGENTS = ['claude', 'kiro', 'cursor'];

// A short probe timeout — a `--version` call returns in well under a second on a
// healthy CLI; anything longer means something is wrong and we should report
// not-present rather than block.
const PROBE_TIMEOUT_MS = 8000;

// Normalize the caller's agent kind to a canonical key. `detectInstallKind`
// returns `claude-code`; the backend/config world uses `claude`.
function normalizeAgent(kind) {
  if (kind === 'claude-code') return 'claude';
  return kind;
}

// The platform-correct binary NAME for an agent's CLI. On Windows, claude and
// cursor-agent install as `.cmd` shims (a bare-name spawn won't resolve a `.cmd`
// — the D-274 / claude-remember #120 class); kiro-cli is the same name on every
// platform.
export function backendBinName(kind, platform = process.platform) {
  const agent = normalizeAgent(kind);
  const win = platform === 'win32';
  switch (agent) {
    case 'claude':
      return win ? 'claude.cmd' : 'claude';
    case 'cursor':
      return win ? 'agent.cmd' : 'agent';
    case 'kiro':
      return 'kiro-cli';
    default:
      return null;
  }
}

// Is the agent's CLI present AND runnable? Returns:
//   { agent, bin, present: boolean, reason?: string }
// present=true  → the `--version` probe exited 0 (the CLI runs).
// present=false → ENOENT (not on PATH), a non-zero exit (a broken shim — D-274),
//                 a probe error/timeout, or an unknown agent kind. `reason`
//                 explains which, so install/doctor can print a useful message.
export function agentCliOnPath(kind, { spawnSyncFn, platform = process.platform } = {}) {
  const agent = normalizeAgent(kind);
  const bin = backendBinName(agent, platform);
  if (!bin) {
    return { agent: kind, bin: null, present: false, reason: `unknown agent kind: ${kind}` };
  }

  let result;
  try {
    result = spawnBinSync(
      bin,
      ['--version'],
      { timeout: PROBE_TIMEOUT_MS, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] },
      spawnSyncFn ? { spawnImpl: spawnSyncFn, platform } : { platform },
    );
  } catch (err) {
    // spawnBinSync itself shouldn't throw, but be defensive — never let a probe
    // crash the caller.
    return { agent, bin, present: false, reason: `probe error: ${err.message}` };
  }

  if (result && result.error) {
    const code = result.error.code;
    return {
      agent,
      bin,
      present: false,
      reason: code === 'ENOENT' ? `${bin} not found on PATH` : `probe error: ${result.error.message}`,
    };
  }
  if (result && result.status === 0) {
    return { agent, bin, present: true };
  }
  // On PATH (or resolvable) but the probe exited non-zero — a broken/wrong shim
  // (the D-274 Windows-Cursor-IDE class). Treat as NOT usable.
  return {
    agent,
    bin,
    present: false,
    reason: `${bin} found but --version exited ${result ? result.status : 'unknown'} (broken install?)`,
  };
}
