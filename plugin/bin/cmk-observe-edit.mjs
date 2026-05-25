#!/usr/bin/env node
// PostToolUse hook real handler (Task 20). The bash wrapper at
// plugin/bin/cmk-observe-edit execs this file as a detached background
// process (`async: true` in hooks.json + the wrapper's detach pattern),
// so this script runs after the parent has already returned its
// {"continue": true} to Claude Code.
//
// All errors are swallowed + logged to stderr — we never want a hook
// child crashing to surface in the user's session. The append is
// fire-and-forget by design.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

let raw = '';
try {
  raw = readFileSync(0, 'utf8');
} catch {
  process.exit(0);
}

let payload;
try {
  payload = raw.trim() === '' ? {} : JSON.parse(raw);
} catch (err) {
  process.stderr.write(
    `cmk-observe-edit: failed to parse stdin JSON: ${err?.message ?? err}\n`,
  );
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
