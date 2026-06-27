#!/usr/bin/env node
// PermissionRequest hook handler — the prompt-free auto-approver (Task 172).
// Plugin-route twin of packages/cli/bin/cmk-approve-permission.mjs. node-only:
// hooks.json invokes this directly via
// node "${CLAUDE_PLUGIN_ROOT}/bin/cmk-approve-permission.mjs" (no bash wrapper).
//
// Reads the permission request on stdin; if it is for one of the kit's OWN
// surfaces (an `mcp__cmk__<tool>` MCP tool or a scaffolded kit skill), prints
// the allow decision to stdout so Claude Code approves it without a prompt.
// Anything else → prints nothing, exits 0, CC's normal permission flow runs.
//
// Fail-SILENT: any load/parse/logic error prints nothing and exits 0 — a broken
// auto-approver must never wedge the session OR wrongly approve.

import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

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
  'approve-permission.mjs',
);

let readHookStdin;
let evaluatePermissionRequest;
try {
  ({ readHookStdin } = await import(pathToFileURL(readHookStdinPath).href));
  ({ evaluatePermissionRequest } = await import(pathToFileURL(modulePath).href));
} catch {
  process.exit(0); // fail-silent: no opinion
}

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
