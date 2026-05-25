#!/usr/bin/env node
// Stop hook real handler (Task 21). The bash wrapper at
// plugin/bin/cmk-capture-turn execs this file.
//
// Protocol: payload arrives on stdin as JSON. Honor stop_hook_active
// guard, append to transcripts, spawn detached auto-extract subagent,
// emit {"continue": true} on stdout, exit 0 — within ~50ms (NFR-1).
// Always exit 0 — a hook crash here would leave the session in a weird
// half-closed state.

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
