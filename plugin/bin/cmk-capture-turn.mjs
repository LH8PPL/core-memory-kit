#!/usr/bin/env node
// Stop hook real handler (Task 21). node-only since Task 62: hooks.json invokes this directly via
// node "${CLAUDE_PLUGIN_ROOT}/bin/cmk-capture-turn.mjs" (no bash wrapper).
//
// Protocol: payload arrives on stdin as JSON. Honor stop_hook_active
// guard, append to transcripts, spawn detached auto-extract subagent,
// emit {"continue": true} on stdout, exit 0 — within ~50ms (NFR-1).
// Always exit 0 — a hook crash here would leave the session in a weird
// half-closed state.

import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

function emitContinue() {
  process.stdout.write('{"continue": true}');
}

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
  'capture-turn.mjs',
);

// Auto-extract path: env override → plugin's bin/cmk-auto-extract.mjs
// (Task 23 ships the real implementation; absent until then, the
// spawn step is skipped).
const autoExtractPath =
  process.env.CMK_AUTO_EXTRACT_PATH ??
  (existsSync(join(__dirname, 'cmk-auto-extract.mjs'))
    ? join(__dirname, 'cmk-auto-extract.mjs')
    : null);

let readHookStdin;
let captureTurn;
try {
  ({ readHookStdin } = await import(pathToFileURL(readHookStdinPath).href));
  ({ captureTurn } = await import(pathToFileURL(modulePath).href));
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
  payload = raw.trim() === '' ? {} : JSON.parse(raw);
} catch (err) {
  process.stderr.write(
    `cmk-capture-turn: failed to parse stdin JSON: ${err?.message ?? err}\n`,
  );
  emitContinue();
  process.exit(0);
}

try {
  captureTurn({ payload, projectRoot: process.cwd(), autoExtractPath });
} catch (err) {
  process.stderr.write(
    `cmk-capture-turn: handler failed: ${err?.message ?? err}\n`,
  );
}

emitContinue();
process.exit(0);
