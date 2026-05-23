#!/usr/bin/env node
// cmk — claude-memory-kit CLI entry point.
// Thin shim: defers all argv parsing + dispatch to src/index.mjs.
// Kept thin so the bin file rarely needs to change once installed.

import { run } from '../src/index.mjs';

run(process.argv).catch((err) => {
  console.error('cmk: unexpected error');
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
