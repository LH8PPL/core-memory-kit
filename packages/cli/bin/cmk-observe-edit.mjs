#!/usr/bin/env node
// PostToolUse hook handler — npm-route bin (Task 49, T-037).
//
// De-plugin-ified twin of plugin/bin/cmk-observe-edit.mjs (Task 20).
// Ships in the @lh8ppl/claude-memory-kit npm package so `cmk install`
// can wire a PATH-resolved `cmk-observe-edit` command (registered
// async: true in the hooks block). Only the src module path differs
// from the plugin copy (../src/ vs ../../packages/cli/src/).
//
// All errors are swallowed + logged to stderr — a hook child crashing
// must never surface in the user's session. The append is
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
const modulePath = join(__dirname, '..', 'src', 'observe-edit.mjs');

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
