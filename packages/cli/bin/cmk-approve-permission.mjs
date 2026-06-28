#!/usr/bin/env node
// PermissionRequest hook handler — the prompt-free auto-approver (Task 172).
//
// Wired by `cmk install` as a Claude Code PermissionRequest hook (matchers
// "mcp__cmk__.*" and "Skill"). Reads the permission request on stdin and, if it
// is for one of the kit's OWN surfaces (an `mcp__cmk__<tool>` MCP tool or a
// scaffolded kit skill), prints the allow decision to stdout so Claude Code
// approves it without a prompt. For anything else it prints nothing and exits 0,
// leaving CC's normal permission flow untouched.
//
// Why this exists: CC 2.1.x stopped honouring the kit's `permissions.allow`
// MCP rules + skill `allowed-tools` for these prompts (anthropics/claude-code
// #17499, #18837→#14956). The PermissionRequest hook is the documented,
// working mechanism (proven live, v041l).
//
// Output contract (code.claude.com/docs/en/hooks-guide):
//   stdout = {"hookSpecificOutput":{"hookEventName":"PermissionRequest",
//             "decision":{"behavior":"allow"}}}  → auto-approve
//   stdout empty + exit 0                         → no opinion (CC asks as usual)
// Fail-SILENT: any load/parse/logic error prints nothing and exits 0 — a broken
// auto-approver must never wedge the session OR wrongly approve; it just stops
// auto-approving and the user sees the normal prompt.

import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const readHookStdinPath = join(__dirname, '..', 'src', 'read-hook-stdin.mjs');
const modulePath = join(__dirname, '..', 'src', 'approve-permission.mjs');

let readHookStdin;
let evaluatePermissionRequest;
try {
  ({ readHookStdin } = await import(pathToFileURL(readHookStdinPath).href));
  ({ evaluatePermissionRequest } = await import(pathToFileURL(modulePath).href));
} catch {
  process.exit(0); // fail-silent: no opinion
}

// Drain the hook payload — but not on an interactive TTY (a manual run), where a
// blocking stdin read would hang forever (the Task-101 lesson).
const raw = readHookStdin({ isTTY: process.stdin.isTTY });

let payload;
try {
  payload = raw.trim() === '' ? {} : JSON.parse(raw);
} catch {
  process.exit(0); // fail-silent on unparseable input
}

let decision;
try {
  decision = evaluatePermissionRequest(payload);
} catch {
  process.exit(0); // fail-silent on any logic error
}

if (decision) {
  process.stdout.write(JSON.stringify(decision));
}
process.exit(0);
