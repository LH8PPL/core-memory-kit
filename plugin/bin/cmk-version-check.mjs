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

import { readFileSync } from 'node:fs';

// Drain stdin so a caller blocking on EPIPE doesn't hang.
try {
  readFileSync(0, 'utf8');
} catch {
  // stdin not connected; fine.
}

process.stderr.write(
  'cmk: Setup hook (cmk-version-check) — not yet implemented\n',
);
process.stdout.write(JSON.stringify({ continue: true }));
process.exit(0);
