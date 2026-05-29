#!/usr/bin/env node
// SessionEnd hook handler — npm-route bin (Task 49, T-037).
//
// De-plugin-ified twin of plugin/bin/cmk-compress-session.mjs (Task 22).
// Ships in the @lh8ppl/claude-memory-kit npm package so `cmk install`
// can wire a PATH-resolved `cmk-compress-session` command. Only the src
// module paths differ from the plugin copy (../src/ vs ../../packages/cli/src/).
//
// Protocol: drain stdin, resolve project root from CMK_PROJECT_DIR env
// or cwd, run compressSession() with a real HaikuViaAnthropicApi, emit
// {"continue": true}. Always exit 0 — a crashed SessionEnd hook would
// block the user from closing their terminal.

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
  // stdin not connected — fine; SessionEnd still proceeds.
}
void rawInput;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compressSessionModulePath = join(__dirname, '..', 'src', 'compress-session.mjs');
const compressorModulePath = join(__dirname, '..', 'src', 'compressor.mjs');

let compressSession;
let HaikuViaAnthropicApi;
try {
  ({ compressSession } = await import(pathToFileURL(compressSessionModulePath).href));
  ({ HaikuViaAnthropicApi } = await import(pathToFileURL(compressorModulePath).href));
} catch (err) {
  process.stderr.write(
    `cmk-compress-session: failed to load modules: ${err?.message ?? err}\n`,
  );
  emitContinue();
  process.exit(0);
}

const projectRoot = process.env.CMK_PROJECT_DIR ?? process.cwd();

try {
  const backend = new HaikuViaAnthropicApi();
  const r = await compressSession({ projectRoot, backend });
  process.stderr.write(
    `cmk-compress-session: ${r.action}${r.reason ? ` (${r.reason})` : ''}${r.bytesIn ? ` (in: ${r.bytesIn}b, out: ${r.bytesOut}b)` : ''} ms: ${r.duration_ms ?? 0}\n`,
  );
} catch (err) {
  process.stderr.write(
    `cmk-compress-session: unexpected error: ${err?.message ?? err}\n`,
  );
}

emitContinue();
process.exit(0);
