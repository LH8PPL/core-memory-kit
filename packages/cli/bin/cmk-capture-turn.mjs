#!/usr/bin/env node
// Stop hook handler — npm-route bin (Task 49, T-037).
//
// De-plugin-ified twin of plugin/bin/cmk-capture-turn.mjs (Task 21).
// Ships in the @lh8ppl/claude-memory-kit npm package so `cmk install`
// can wire a PATH-resolved `cmk-capture-turn` command. Two differences
// from the plugin copy:
//   1. src module path resolves ../src/ (not ../../packages/cli/src/).
//   2. the detached auto-extract subagent resolves to the sibling
//      cmk-auto-extract.mjs in THIS bin/ dir (it ships alongside).
//
// Protocol: payload arrives on stdin as JSON. Honor stop_hook_active,
// append to transcripts, spawn detached auto-extract, emit
// {"continue": true}, exit 0 within ~50ms (NFR-1). Always exit 0.

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

function emitContinue() {
  process.stdout.write('{"continue": true}');
}

let raw = '';
try {
  raw = readFileSync(0, 'utf8');
} catch {
  emitContinue();
  process.exit(0);
}

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

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const modulePath = join(__dirname, '..', 'src', 'capture-turn.mjs');

// Auto-extract path: env override → sibling cmk-auto-extract.mjs (ships
// in this same bin/ dir). Absent only in a corrupt install; the spawn
// step is skipped if missing.
const autoExtractPath =
  process.env.CMK_AUTO_EXTRACT_PATH ??
  (existsSync(join(__dirname, 'cmk-auto-extract.mjs'))
    ? join(__dirname, 'cmk-auto-extract.mjs')
    : null);

let captureTurn;
try {
  ({ captureTurn } = await import(pathToFileURL(modulePath).href));
} catch (err) {
  process.stderr.write(
    `cmk-capture-turn: failed to load module: ${err?.message ?? err}\n`,
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
