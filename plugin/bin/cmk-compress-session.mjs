#!/usr/bin/env node
// SessionEnd hook real handler (Task 22, T-019). node-only since Task 62: hooks.json invokes this directly via
// node "${CLAUDE_PLUGIN_ROOT}/bin/cmk-compress-session.mjs" (no bash wrapper).
//
// Protocol: payload arrives on stdin as JSON ({session_id, ...} per
// Anthropic hook spec). The hook fires when the user ends the session
// (`/exit`, window close, etc.). We:
//   1. Drain stdin (otherwise Claude Code waits on the pipe).
//   2. Resolve project root from CMK_PROJECT_DIR env (set by the
//      capture-turn pattern) or fall back to cwd.
//   3. Invoke compressSession() with a real HaikuViaAnthropicApi.
//   4. Emit {"continue": true} so SessionEnd completes normally.
//   5. Always exit 0 — a crashed SessionEnd hook would block the user
//      from closing their terminal, which is worse than silently
//      skipping the compression (the live buffer is preserved and
//      will be compressed at the next session end).

import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

function emitContinue() {
  process.stdout.write('{"continue": true}');
}

// Drain stdin so Claude Code's hook pipe closes cleanly. We don't
// actually read the payload — SessionEnd doesn't carry data we need;
// we read state from disk (sessions/now.md).
let rawInput = '';
try {
  rawInput = readFileSync(0, 'utf8');
} catch {
  // stdin not connected — fine; SessionEnd still proceeds.
}
// Touch rawInput so lint doesn't complain about unused — and so a
// future maintainer sees the drain pattern is intentional.
void rawInput;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const sessionEndTasksModulePath = join(
  __dirname,
  '..',
  '..',
  'packages',
  'cli',
  'src',
  'session-end-tasks.mjs',
);
const compressorModulePath = join(
  __dirname,
  '..',
  '..',
  'packages',
  'cli',
  'src',
  'compressor.mjs',
);

let runSessionEndTasks;
let summarizeSessionEnd;
let HaikuViaAnthropicApi;
try {
  ({ runSessionEndTasks, summarizeSessionEnd } = await import(pathToFileURL(sessionEndTasksModulePath).href));
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
  // Task 86b + D-42: run compressSession and the dedicated autoPersona classifier
  // CONCURRENTLY (disjoint inputs/outputs → no race), keeping the SessionEnd
  // wall-clock at max(~50s) under the 60s hook ceiling instead of the sequential
  // sum (~100s). See packages/cli/src/session-end-tasks.mjs for the full rationale.
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
  // reject; a synchronous throw must not block the user from closing the session.
  process.stderr.write(
    `cmk-compress-session: unexpected error: ${err?.message ?? err}\n`,
  );
}

emitContinue();
process.exit(0);
