#!/usr/bin/env node
// cmk — claude-memory-kit CLI entry point.
// Thin shim: defers all argv parsing + dispatch to src/index.mjs.
// Kept thin so the bin file rarely needs to change once installed.
//
// Task 205 (D-302): the import is DYNAMIC inside a try/catch — a HALF-BROKEN
// global install (npm install -g ran while a `cmk mcp serve` process held a
// Windows lock on the kit's files → some modules missing) previously died in
// the STATIC import chain with a raw ERR_MODULE_NOT_FOUND stack before any
// handler could attach. Now the boundary catches it and prints the actionable
// 2-step recovery (stop the servers, reinstall) via half-install.mjs — which
// is dependency-free so it loads even when the rest of the package doesn't.

try {
  const { run } = await import('../src/index.mjs');
  await run(process.argv);
} catch (err) {
  let handled = false;
  try {
    const mod = await import('../src/half-install.mjs');
    if (mod.isModuleResolutionError(err)) {
      console.error(mod.halfInstallRecoveryMessage(err));
      handled = true;
    }
  } catch {
    // half-install.mjs itself is missing (an even more broken install) —
    // fall through to the generic handler below.
  }
  if (!handled) {
    console.error('cmk: unexpected error');
    console.error(err && err.stack ? err.stack : err);
  }
  process.exit(1);
}
