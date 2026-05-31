#!/usr/bin/env node
// UserPromptSubmit hook real handler (Task 19). node-only since Task 62: hooks.json invokes this directly via
// node "${CLAUDE_PLUGIN_ROOT}/bin/cmk-capture-prompt.mjs" (no bash wrapper).
//
// Protocol: payload arrives on stdin as JSON ({prompt, session_id, ...}
// per Anthropic hook spec). Sanitize <private> blocks, preserve
// <retain> tags, append to the daily transcript file, emit
// {"continue": true} so the prompt continues to Claude as normal.
// Always exit 0 — a hook that errors out would interrupt the user
// mid-prompt; that's worse than silently dropping the capture.

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
  // stdin not connected — fine; emit continue and exit.
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
const modulePath = join(
  __dirname,
  '..',
  '..',
  'packages',
  'cli',
  'src',
  'capture-prompt.mjs',
);

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
