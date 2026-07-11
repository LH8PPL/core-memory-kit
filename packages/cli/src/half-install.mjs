// half-install.mjs — Task 205 (D-302): the actionable error boundary for a
// half-broken global install.
//
// THE FAILURE THIS NAMES: on Windows, a running `cmk mcp serve` process
// (spawned by Claude Code / the IDE) holds a lock on the kit's native files
// (vec0.dll / better_sqlite3.node). An `npm install -g` upgrade that runs
// while the lock is held can leave a HALF-INSTALLED global — some modules
// replaced, some missing (the observed symptom: `Cannot find module
// '@modelcontextprotocol/sdk'` from the static import chain, which breaks
// EVERY `cmk` command with a raw ESM-resolve stack).
//
// The bin (bin/cmk.mjs) cannot rely on any of the kit's own modules being
// loadable in that state — so THIS module is deliberately dependency-free
// (node builtins only), and the bin imports it dynamically inside its catch,
// with an inline fallback if even this file is gone.
//
// Why this is the right detection layer (the Task 205 "(d) doctor HC" option
// resolved): a doctor health check cannot flag a half-install that prevents
// `cmk doctor` from RUNNING — the static import chain breaks before dispatch.
// The bin-level boundary is the only surface guaranteed to still execute.

/**
 * Pure: is this error a module-resolution failure (the half-install
 * signature), as opposed to an ordinary runtime error?
 */
export function isModuleResolutionError(err) {
  if (!err) return false;
  const code = err.code ?? '';
  if (code === 'ERR_MODULE_NOT_FOUND' || code === 'MODULE_NOT_FOUND') return true;
  // Some loaders surface the failure without the code — match the message.
  const msg = String(err.message ?? err);
  return /Cannot find (module|package)/i.test(msg);
}

/**
 * Pure: the actionable recovery text for a half-broken install.
 * Emits NO platform-specific shell commands beyond the cross-platform npm
 * reinstall (the cross-platform command discipline): the process-kill step is
 * descriptive ("close Claude Code / end the node processes") because the
 * right mechanism differs per OS and the servers reconnect automatically.
 */
export function halfInstallRecoveryMessage(err) {
  const detail = String(err?.message ?? err ?? '').split('\n')[0].slice(0, 200);
  return [
    'cmk: this install looks HALF-BROKEN — a module the kit ships failed to load.',
    detail ? `  (${detail})` : '',
    '',
    'This usually happens when `npm install -g` ran while a `cmk mcp serve`',
    'process (spawned by Claude Code / your IDE) held a lock on the kit\'s',
    'files — npm could not replace everything, leaving a partial install.',
    '',
    'Fix (2 steps):',
    '  1. Stop the running kit MCP servers: close Claude Code / your IDE, or',
    '     end the node processes whose command line contains "cmk mcp serve"',
    '     (Task Manager on Windows, your process viewer elsewhere). They',
    '     reconnect automatically on the next tool call — nothing is lost.',
    '  2. Reinstall: npm install -g @lh8ppl/claude-memory-kit',
    '',
    'Your memory data (context/ in your projects + the user tier) is files on',
    'disk and is NOT touched by any of this.',
  ].filter((l) => l !== null).join('\n');
}
