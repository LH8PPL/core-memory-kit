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

import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const readHookStdinPath = join(
  __dirname,
  '..',
  '..',
  'packages',
  'cli',
  'src',
  'read-hook-stdin.mjs',
);
const modulePath = join(
  __dirname,
  '..',
  '..',
  'packages',
  'cli',
  'src',
  'observe-edit.mjs',
);

// Load ONLY the stdin-drain helper up front — it's tiny + needed before the
// envelope. observe-edit.mjs (the heavier append module) loads AFTER the
// envelope so the fast-response ordering below is preserved.
let readHookStdin;
let parseHookPayload;
try {
  ({ readHookStdin, parseHookPayload } = await import(pathToFileURL(readHookStdinPath).href));
} catch (err) {
  process.stderr.write(
    `cmk-observe-edit: failed to load read-hook-stdin: ${err?.message ?? err}\n`,
  );
  // Honor the hook protocol even when the drain helper is missing.
  process.stdout.write(JSON.stringify({ continue: true }));
  process.exit(0);
}

// Drain the hook payload — but NOT on an interactive TTY (a manual run):
// a blocking stdin read would hang forever on a console that never sends EOF, before
// any body runs (Task 101; DECISION-LOG 2026-06-06). readHookStdin returns ''
// for a TTY so a manual invocation finishes instead of hanging.
const raw = readHookStdin({ isTTY: process.stdin.isTTY });

let payload;
try {
  payload = parseHookPayload(raw); // Task 207: BOM-tolerant (D-306 generalized)
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
