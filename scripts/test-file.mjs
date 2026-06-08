#!/usr/bin/env node
// Targeted-file test runner.
//
// Usage:
//   npm run test:file -- tests/cli-foo.test.js [tests/cli-bar.test.js ...]
//   npm run test:file -- tests/cli-foo.test.js -t "specific test name"
//
// Wraps `vitest run <args>` so the agent (Claude in this repo) can
// invoke it as a single npm verb instead of re-typing
// `npx vitest run <args>` each time, AND so the windowsHide:true
// option fires consistently (no transient cmd.exe popup on Windows).
//
// Why this is in a script, not a bare npm alias:
//   - `npm test -- <args>` triggers the validate-test-ids +
//     validate-template prerun steps, which are slow when you're
//     iterating on a single file.
//   - A bash one-liner like `"test:file": "vitest run"` would work
//     on Linux/macOS but flashes a cmd.exe window on Windows via
//     npm's shell wrapping.
//
// The user's directive (2026-05-26): "please write all tests in
// scripts, idont care if it's shell/python/what-ever just keep it
// best practices, never do tests manually." This is one of those
// scripts.

import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('usage: npm run test:file -- <path-to-test-file> [more files...] [vitest args]');
  console.error('       npm run test:file -- tests/cli-foo.test.js -t "specific test name"');
  process.exit(2);
}

const vitestCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const r = spawnSync(vitestCmd, ['vitest', 'run', ...args], {
  stdio: 'inherit',
  shell: true,
  // Hide the transient cmd.exe console window that shell:true would
  // otherwise pop up on Windows. stdio:inherit means the child's
  // output still appears in the parent terminal — only the wrapper
  // window is hidden.
  windowsHide: true,
});
process.exit(r.status ?? 1);
