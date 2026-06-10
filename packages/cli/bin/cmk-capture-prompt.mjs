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

import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

function emitContinue() {
  process.stdout.write('{"continue": true}');
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const readHookStdinPath = join(__dirname, '..', 'src', 'read-hook-stdin.mjs');
const modulePath = join(__dirname, '..', 'src', 'capture-prompt.mjs');

let readHookStdin;
let capturePrompt;
let buildMemoryHint;
try {
  ({ readHookStdin } = await import(pathToFileURL(readHookStdinPath).href));
  ({ capturePrompt, buildMemoryHint } = await import(pathToFileURL(modulePath).href));
} catch (err) {
  process.stderr.write(
    `cmk-capture-prompt: failed to load modules: ${err?.message ?? err}\n`,
  );
  emitContinue();
  process.exit(0);
}

// Drain the hook payload — but NOT on an interactive TTY (a manual run):
// a blocking stdin read would hang forever on a console that never sends EOF, before
// any body runs (Task 101; DECISION-LOG 2026-06-06). readHookStdin returns ''
// for a TTY so a manual invocation finishes instead of hanging.
const rawInput = readHookStdin({ isTTY: process.stdin.isTTY });

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

try {
  capturePrompt({ payload, projectRoot: process.cwd() });
} catch (err) {
  process.stderr.write(
    `cmk-capture-prompt: handler failed: ${err?.message ?? err}\n`,
  );
}

// Task 75.2 — emit the "memory available" recall nudge as additionalContext
// (the MODEL-facing UserPromptSubmit field per Anthropic's hooks doc;
// systemMessage is user-display). Best-effort: a hint failure must never
// break the capture protocol.
try {
  const hint = buildMemoryHint({ projectRoot: process.cwd(), prompt: payload?.prompt });
  if (hint) {
    process.stdout.write(
      JSON.stringify({
        continue: true,
        hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: hint },
      }),
    );
    process.exit(0);
  }
} catch (err) {
  process.stderr.write(`cmk-capture-prompt: hint failed: ${err?.message ?? err}\n`);
}

emitContinue();
process.exit(0);
