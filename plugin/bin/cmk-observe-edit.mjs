#!/usr/bin/env node
// PostToolUse hook real handler (Task 20; node-only since Task 62).
//
// hooks.json invokes this directly via
//   node "${CLAUDE_PLUGIN_ROOT}/bin/cmk-observe-edit.mjs"
// with `async: true`, so Claude Code does NOT block on it. Before Task 62
// a bash wrapper owned the hook envelope: it buffered stdin, detached a
// node child to do the append, and echoed {"continue": true} immediately.
// This file now owns that contract itself — node needs no wrapper:
//   1. read + parse the payload from stdin,
//   2. emit {"continue": true} on stdout FIRST (fast response; any reader
//      gets the envelope immediately, even though async:true means Claude
//      Code won't wait),
//   3. THEN run the observation append.
//
// All errors are swallowed + logged to stderr — a hook child crashing must
// never surface in the user's session. The append is fire-and-forget.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

let raw = '';
try {
  raw = readFileSync(0, 'utf8');
} catch {
  // stdin not connected; fall through and still emit the envelope.
}

let payload;
try {
  payload = raw.trim() === '' ? {} : JSON.parse(raw);
} catch (err) {
  process.stderr.write(
    `cmk-observe-edit: failed to parse stdin JSON: ${err?.message ?? err}\n`,
  );
  // Honor the hook protocol even on bad input.
  process.stdout.write(JSON.stringify({ continue: true }));
  process.exit(0);
}

// Emit the hook envelope FIRST, then do the (fire-and-forget) append below.
process.stdout.write(JSON.stringify({ continue: true }));

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const modulePath = join(
  __dirname,
  '..',
  '..',
  'packages',
  'cli',
  'src',
  'observe-edit.mjs',
);

let observeEdit;
try {
  ({ observeEdit } = await import(pathToFileURL(modulePath).href));
} catch (err) {
  process.stderr.write(
    `cmk-observe-edit: failed to load module: ${err?.message ?? err}\n`,
  );
  process.exit(0);
}

try {
  observeEdit({ payload, projectRoot: process.cwd() });
} catch (err) {
  process.stderr.write(
    `cmk-observe-edit: handler failed: ${err?.message ?? err}\n`,
  );
}

process.exit(0);
