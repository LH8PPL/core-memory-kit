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

import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

function emitContinue() {
  process.stdout.write('{"continue": true}');
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const readHookStdinPath = join(
  __dirname,
  '..',
  '..',
  'packages',
  'cli',
  'src',
  'read-hook-stdin.mjs',
);
const modulePath = join(
  __dirname,
  '..',
  '..',
  'packages',
  'cli',
  'src',
  'capture-prompt.mjs',
);

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
