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

const autoPersonaModulePath = join(__dirname, '..', '..', 'packages', 'cli', 'src', 'auto-persona.mjs');

let compressSession;
let HaikuViaAnthropicApi;
let autoPersona;
try {
  ({ compressSession } = await import(pathToFileURL(compressSessionModulePath).href));
  ({ HaikuViaAnthropicApi } = await import(pathToFileURL(compressorModulePath).href));
  ({ autoPersona } = await import(pathToFileURL(autoPersonaModulePath).href));
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

  // Task 86b (D-41): dedicated persona classifier at SessionEnd over the clean
  // fact list — the reliable cross-project promotion path (the per-turn extraction
  // call drops persona under load; verified lior-test-8). cooldownMs:0 because
  // compressSession just touched the shared Haiku cooldown. Best-effort.
  try {
    const userDir = process.env.MEMORY_KIT_USER_DIR ?? join(homedir(), '.claude-memory-kit');
    const p = await autoPersona({ projectRoot, userDir, backend, cooldownMs: 0 });
    process.stderr.write(
      `cmk-compress-session: persona ${p.action} (promoted: ${p.promoted?.length ?? 0}, queued: ${p.queued?.length ?? 0})\n`,
    );
  } catch (perr) {
    process.stderr.write(`cmk-compress-session: persona refresh failed: ${perr?.message ?? perr}\n`);
  }
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
