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

import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

function emitContinue() {
  process.stdout.write('{"continue": true}');
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const readHookStdinPath = join(__dirname, '..', 'src', 'read-hook-stdin.mjs');
const sessionEndTasksModulePath = join(__dirname, '..', 'src', 'session-end-tasks.mjs');
const compressorModulePath = join(__dirname, '..', 'src', 'compressor.mjs');

let readHookStdin;
let runSessionEndTasks;
let summarizeSessionEnd;
let HaikuViaAnthropicApi;
try {
  ({ readHookStdin } = await import(pathToFileURL(readHookStdinPath).href));
  ({ runSessionEndTasks, summarizeSessionEnd } = await import(pathToFileURL(sessionEndTasksModulePath).href));
  ({ HaikuViaAnthropicApi } = await import(pathToFileURL(compressorModulePath).href));
} catch (err) {
  process.stderr.write(
    `cmk-compress-session: failed to load modules: ${err?.message ?? err}\n`,
  );
  emitContinue();
  process.exit(0);
}

// Drain the hook payload so Claude Code's pipe closes cleanly — but NOT when
// stdin is an interactive TTY (a manual run): readFileSync(0) would block
// forever on a console that never sends EOF, hanging before any of the body
// runs (DECISION-LOG 2026-06-06). The payload is discarded; we read state from
// disk. readHookStdin returns '' for a TTY so a manual invocation finishes.
readHookStdin({ isTTY: process.stdin.isTTY });

const projectRoot = process.env.CMK_PROJECT_DIR ?? process.cwd();

try {
  // Task 86b + D-42: run compressSession and the dedicated autoPersona classifier
  // CONCURRENTLY (they have disjoint inputs/outputs, so they don't race), keeping
  // the SessionEnd wall-clock at max(~50s) under the 60s hook ceiling instead of
  // the sequential sum (~100s). See session-end-tasks.mjs for the full rationale.
  const userDir = process.env.MEMORY_KIT_USER_DIR ?? join(homedir(), '.claude-memory-kit');
  const outcomes = await runSessionEndTasks({
    projectRoot,
    userDir,
    makeBackend: () => new HaikuViaAnthropicApi(),
  });
  for (const line of summarizeSessionEnd(outcomes)) {
    process.stderr.write(line);
  }
} catch (err) {
  // Defensive backstop: runSessionEndTasks uses allSettled so it should never
  // reject, but a synchronous throw (e.g. resolving userDir) must not block the
  // user from closing their terminal.
  process.stderr.write(
    `cmk-compress-session: unexpected error: ${err?.message ?? err}\n`,
  );
}

emitContinue();
process.exit(0);
