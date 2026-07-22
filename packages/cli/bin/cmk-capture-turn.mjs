#!/usr/bin/env node
// Stop hook handler — npm-route bin (Task 49, T-037).
//
// De-plugin-ified twin of plugin/bin/cmk-capture-turn.mjs (Task 21).
// Ships in the @lh8ppl/core-memory-kit npm package so `cmk install`
// can wire a PATH-resolved `cmk-capture-turn` command. Two differences
// from the plugin copy:
//   1. src module path resolves ../src/ (not ../../packages/cli/src/).
//   2. the detached auto-extract subagent resolves to the sibling
//      cmk-auto-extract.mjs in THIS bin/ dir (it ships alongside).
//
// Protocol: payload arrives on stdin as JSON. Honor stop_hook_active,
// append to transcripts, spawn detached auto-extract, emit
// {"continue": true}, exit 0 within ~50ms (NFR-1). Always exit 0.

import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

function emitContinue() {
  process.stdout.write('{"continue": true}');
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const readHookStdinPath = join(__dirname, '..', 'src', 'read-hook-stdin.mjs');
const modulePath = join(__dirname, '..', 'src', 'capture-turn.mjs');
const tierPathsPath = join(__dirname, '..', 'src', 'tier-paths.mjs');

// Auto-extract path: env override → sibling cmk-auto-extract.mjs (ships
// in this same bin/ dir). Absent only in a corrupt install; the spawn
// step is skipped if missing.
const autoExtractPath =
  process.env.CMK_AUTO_EXTRACT_PATH ??
  (existsSync(join(__dirname, 'cmk-auto-extract.mjs'))
    ? join(__dirname, 'cmk-auto-extract.mjs')
    : null);

let readHookStdin;
let parseHookPayload;
let captureTurn;
let resolveHookProjectRoot;
try {
  ({ readHookStdin, parseHookPayload } = await import(pathToFileURL(readHookStdinPath).href));
  ({ captureTurn } = await import(pathToFileURL(modulePath).href));
  ({ resolveHookProjectRoot } = await import(pathToFileURL(tierPathsPath).href));
} catch (err) {
  process.stderr.write(
    `cmk-capture-turn: failed to load modules: ${err?.message ?? err}\n`,
  );
  emitContinue();
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
    `cmk-capture-turn: failed to parse stdin JSON: ${err?.message ?? err}\n`,
  );
  emitContinue();
  process.exit(0);
}

// Task 246: resolve the REAL project root (CLAUDE_PROJECT_DIR / CMK_PROJECT_DIR
// → walk up to the nearest context/ → cwd), never bare cwd — a subdirectory cwd
// used to fork a stray, unread memory tier. captureTurn threads this same root
// down to the detached auto-extract child via CMK_PROJECT_DIR, so the whole
// capture chain lands in one place.
try {
  captureTurn({ payload, projectRoot: resolveHookProjectRoot(), autoExtractPath });
} catch (err) {
  process.stderr.write(
    `cmk-capture-turn: handler failed: ${err?.message ?? err}\n`,
  );
}

emitContinue();
process.exit(0);
