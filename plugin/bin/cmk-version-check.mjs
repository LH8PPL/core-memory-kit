#!/usr/bin/env node
// cmk-version-check — Setup hook stub (Task 17 scaffold; ported from the
// bash stub to node in Task 62 so the kit's hooks run on node alone, no
// bash, on every OS). hooks.json invokes this via
//   node "${CLAUDE_PLUGIN_ROOT}/bin/cmk-version-check.mjs"
//
// Real implementation deferred to a later task: verify the installed
// plugin/template version matches what the project's CLAUDE.md was
// generated against; on mismatch, print the `cmk repair` command.
//
// Hook protocol: payload arrives on stdin as JSON; emit JSON on stdout;
// diagnostics on stderr. The kit's hooks return {"continue": true} so
// Claude Code proceeds normally even when the real handler is absent.

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

let readHookStdin;
try {
  ({ readHookStdin } = await import(pathToFileURL(readHookStdinPath).href));
} catch {
  // read-hook-stdin missing (corrupt install) — honor the hook protocol + exit.
  process.stdout.write(JSON.stringify({ continue: true }));
  process.exit(0);
}

// Drain stdin so a caller blocking on EPIPE doesn't hang — but NOT on an
// interactive TTY (a manual run): a blocking stdin read would hang forever on a
// console that never sends EOF (Task 101; DECISION-LOG 2026-06-06). The payload
// is discarded; readHookStdin returns '' for a TTY so a manual run finishes.
readHookStdin({ isTTY: process.stdin.isTTY });

process.stderr.write(
  'cmk: Setup hook (cmk-version-check) — not yet implemented\n',
);
process.stdout.write(JSON.stringify({ continue: true }));
process.exit(0);
