#!/usr/bin/env node
// UserPromptSubmit hook handler — npm-route bin (Task 49, T-037).
//
// De-plugin-ified twin of plugin/bin/cmk-capture-prompt.mjs (Task 19).
// Ships in the @lh8ppl/claude-memory-kit npm package so `cmk install`
// can wire a PATH-resolved `cmk-capture-prompt` command. Only the src
// module path differs from the plugin copy (../src/ vs ../../packages/cli/src/).
//
// Protocol: payload arrives on stdin as JSON ({prompt, session_id, ...}).
// Sanitize <private> blocks, preserve <retain> tags, append to the daily
// transcript, emit {"continue": true}. Always exit 0 — a hook that errors
// would interrupt the user mid-prompt.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

function emitContinue() {
  process.stdout.write('{"continue": true}');
}

let rawInput = '';
try {
  rawInput = readFileSync(0, 'utf8');
} catch {
  emitContinue();
  process.exit(0);
}

let payload;
try {
  payload = rawInput.trim() === '' ? {} : JSON.parse(rawInput);
} catch (err) {
  process.stderr.write(
    `cmk-capture-prompt: failed to parse stdin JSON: ${err?.message ?? err}\n`,
  );
  emitContinue();
  process.exit(0);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const modulePath = join(__dirname, '..', 'src', 'capture-prompt.mjs');

let capturePrompt;
try {
  ({ capturePrompt } = await import(pathToFileURL(modulePath).href));
} catch (err) {
  process.stderr.write(
    `cmk-capture-prompt: failed to load module: ${err?.message ?? err}\n`,
  );
  emitContinue();
  process.exit(0);
}

try {
  capturePrompt({ payload, projectRoot: process.cwd() });
} catch (err) {
  process.stderr.write(
    `cmk-capture-prompt: handler failed: ${err?.message ?? err}\n`,
  );
}

emitContinue();
process.exit(0);
