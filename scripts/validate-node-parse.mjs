#!/usr/bin/env node
// Real-Node parse/import guard (Task 139, D-126).
//
// Why this exists: vitest transforms modules through esbuild, which tolerated
// a literal line terminator inside a single-quoted string — real Node does
// not. A SyntaxError shipped to main and into the v0.3.0 candidate artifact
// (cut-gate9 H1: `cmk search` crashed in the clone) while 1729 tests, 5/5
// stress, AND CI all stayed green: the test runner parsed leniently, and the
// CI smoke never imported the broken module (lazy loading). This validator
// closes the divergence: every src module must import under the SAME engine
// that runs the published CLI.
//
// Scope: packages/cli/src/*.mjs (the shipped runtime). Importing also
// surfaces missing-import/identifier errors at module scope, not just
// syntax. Modules are side-effect-free at import by repo convention.

import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'packages', 'cli', 'src');

async function runCli() {
  const files = readdirSync(SRC).filter((f) => f.endsWith('.mjs')).sort();
  const failures = [];
  for (const f of files) {
    try {
      await import(pathToFileURL(join(SRC, f)).href);
    } catch (err) {
      failures.push(`${f}: ${err?.message ?? err}`);
    }
  }
  if (failures.length > 0) {
    console.error(`validate-node-parse: FAIL — ${failures.length} module(s) do not load under real Node`);
    for (const m of failures) console.error('  - ' + m);
    process.exit(1);
  }
  console.log(`validate-node-parse: OK — ${files.length} src modules import cleanly under node ${process.version}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  runCli();
}
