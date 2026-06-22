#!/usr/bin/env node
// PreToolUse hook handler — the memory delete-guardrail (D-192).
//
// Wired by `cmk install` as a Claude Code PreToolUse hook (matcher
// "Bash|PowerShell"). Reads the tool call on stdin and, if it's a destructive
// command aimed at a claude-memory-kit memory path (context/ , the persona
// tier, a memory file), BLOCKS it by exiting 2 — Claude Code shows the stderr
// reason to the model and the command never runs.
//
// Exit contract (Claude Code PreToolUse):
//   exit 0 → allow (no opinion)
//   exit 2 → BLOCK; stderr is surfaced as the reason
// Fail-OPEN: any load/parse error exits 0 — a broken guardrail must never wedge
// the session; it just stops guarding.

import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const readHookStdinPath = join(__dirname, '..', 'src', 'read-hook-stdin.mjs');
const modulePath = join(__dirname, '..', 'src', 'guard-memory.mjs');

let readHookStdin;
let evaluatePayload;
try {
  ({ readHookStdin } = await import(pathToFileURL(readHookStdinPath).href));
  ({ evaluatePayload } = await import(pathToFileURL(modulePath).href));
} catch (err) {
  process.stderr.write(`cmk-guard-memory: failed to load modules: ${err?.message ?? err}\n`);
  process.exit(0); // fail-open
}

// Drain the hook payload — but not on an interactive TTY (a manual run), where
// a blocking stdin read would hang forever (the Task-101 lesson).
const raw = readHookStdin({ isTTY: process.stdin.isTTY });

let payload;
try {
  payload = raw.trim() === '' ? {} : JSON.parse(raw);
} catch {
  process.exit(0); // fail-open on unparseable input
}

let verdict;
try {
  verdict = evaluatePayload(payload);
} catch {
  process.exit(0); // fail-open on any logic error
}

if (verdict && verdict.block) {
  process.stderr.write(`${verdict.reason}\n`);
  process.exit(2); // BLOCK
}

process.exit(0); // allow
