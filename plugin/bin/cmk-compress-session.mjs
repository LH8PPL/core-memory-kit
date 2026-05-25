#!/usr/bin/env node
// SessionEnd hook real handler (Task 22, T-019). The bash wrapper at
// plugin/bin/cmk-compress-session execs this file.
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

const compressSessionModulePath = join(
  __dirname,
  '..',
  '..',
  'packages',
  'cli',
  'src',
  'compress-session.mjs',
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
  // Defensive: compressSession is expected to swallow backend errors
  // into the return struct, but any unanticipated throw lands here so
  // it doesn't block the user from closing their terminal.
  process.stderr.write(
    `cmk-compress-session: unexpected error: ${err?.message ?? err}\n`,
  );
}

emitContinue();
process.exit(0);
