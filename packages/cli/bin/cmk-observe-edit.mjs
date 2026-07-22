#!/usr/bin/env node
// PostToolUse hook handler — npm-route bin (Task 49, T-037).
//
// De-plugin-ified twin of plugin/bin/cmk-observe-edit.mjs (Task 20).
// Ships in the @lh8ppl/core-memory-kit npm package so `cmk install`
// can wire a PATH-resolved `cmk-observe-edit` command (registered
// async: true in the hooks block). Only the src module path differs
// from the plugin copy (../src/ vs ../../packages/cli/src/).
//
// All errors are swallowed + logged to stderr — a hook child crashing
// must never surface in the user's session. The append is
// fire-and-forget by design.

import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const readHookStdinPath = join(__dirname, '..', 'src', 'read-hook-stdin.mjs');
const modulePath = join(__dirname, '..', 'src', 'observe-edit.mjs');
const tierPathsPath = join(__dirname, '..', 'src', 'tier-paths.mjs');

let readHookStdin;
let parseHookPayload;
let observeEdit;
let resolveHookProjectRoot;
try {
  ({ readHookStdin, parseHookPayload } = await import(pathToFileURL(readHookStdinPath).href));
  ({ observeEdit } = await import(pathToFileURL(modulePath).href));
  ({ resolveHookProjectRoot } = await import(pathToFileURL(tierPathsPath).href));
} catch (err) {
  process.stderr.write(
    `cmk-observe-edit: failed to load modules: ${err?.message ?? err}\n`,
  );
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
  process.exit(0);
}

// Task 246: resolve the REAL project root, never bare cwd (a subdirectory cwd
// used to fork a stray, unread memory tier).
try {
  observeEdit({ payload, projectRoot: resolveHookProjectRoot() });
} catch (err) {
  process.stderr.write(
    `cmk-observe-edit: handler failed: ${err?.message ?? err}\n`,
  );
}

process.exit(0);
