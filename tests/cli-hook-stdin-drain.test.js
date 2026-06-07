// @doors: 1
// Door 2 N/A: this test pins the stdin-DRAIN contract of the hook bins, not what
//   they write to disk — each bin's own test file (cli-capture-prompt/turn/
//   inject-context/observe-edit.test.js) owns the State door for its writes.
// Door 3 N/A: with an empty payload the bins take their noop path and spawn
//   nothing (capture-turn's detached auto-extract only fires on a real turn);
//   the spawn surface is owned by cli-auto-extract.test.js + the spawn-smokes.
// Door 4 N/A: no NDJSON observability surface here — the drain is plumbing.
// Door 5 N/A: no message-queue surface in the kit.
//
// Task 101 — extend the manual-run-stdin-hang fix (Task 100) to ALL hook bins.
//
// Background: every hook bin must DRAIN stdin so Claude Code's hook pipe closes.
// The original drain — `readFileSync(0, 'utf8')` — BLOCKS until EOF. As a real
// hook that's instant (Claude pipes the payload then closes). Run MANUALLY on an
// interactive console (no piped stdin), the terminal never sends EOF, so the
// read blocks forever before any body runs and the hook ceiling kills it — the
// v0.2.0 cut-gate B7 symptom (DECISION-LOG 2026-06-06). Task 100 fixed only
// `cmk-compress-session` (the reported blocker) via `readHookStdin({ isTTY })`,
// which returns '' for a TTY instead of blocking. Task 101 extends the helper to
// the remaining bins: capture-prompt, capture-turn, inject-context, observe-edit
// (both npm + plugin twins) and the plugin-only version-check stub.
//
// Why structural + behavioral, not a TTY-repro:
//   The hang only manifests with a REAL interactive terminal (isTTY === true),
//   which a spawned test child never has. So we prove the fix COMPOSITIONALLY:
//     - structural: each bin delegates its drain to readHookStdin and passes the
//       `process.stdin.isTTY` injection (and no longer calls the raw blocking
//       readFileSync(0) form). This is the regression lock across all 9 bins.
//     - unit (cli-read-hook-stdin.test.js): readHookStdin returns '' when
//       isTTY is true, without touching the fd.
//     - behavioral (here): each bin still exits 0 (within a hard timeout, i.e.
//       does NOT hang) when fed an empty/closed stdin — the no-regression half.

import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readFileSync, mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = join(dirname(__filename), '..');

// Every hook bin that drains stdin, both twins. `npm: false` = plugin-only.
// `behavioral: false` = structural lock only (its empty-stdin runtime is the
// heavy SessionEnd task chain, already pinned by spawn-smoke-compress-session +
// cli-compress-session; we don't pull that — incl. a possible live `claude
// --print` — into this drain test's behavioral loop).
const BINS = [
  { name: 'cmk-capture-prompt', npm: true },
  { name: 'cmk-capture-turn', npm: true },
  { name: 'cmk-inject-context', npm: true },
  { name: 'cmk-observe-edit', npm: true },
  { name: 'cmk-version-check', npm: false }, // plugin-only stub
  { name: 'cmk-compress-session', npm: true, behavioral: false }, // Task 100 fix; regression-locked here too
];

function binPaths(bin) {
  const paths = [
    { route: 'plugin', path: join(REPO_ROOT, 'plugin', 'bin', bin.name + '.mjs') },
  ];
  if (bin.npm) {
    paths.push({
      route: 'npm',
      path: join(REPO_ROOT, 'packages', 'cli', 'bin', bin.name + '.mjs'),
    });
  }
  return paths;
}

describe('Task 101 — hook bins drain stdin via readHookStdin (no raw blocking read)', () => {
  describe('structural: each bin delegates the drain to the TTY-safe helper', () => {
    for (const bin of BINS) {
      for (const { route, path } of binPaths(bin)) {
        it(`${bin.name} (${route}) imports read-hook-stdin and injects isTTY`, () => {
          const src = readFileSync(path, 'utf8');
          // Delegates to the shared helper module...
          expect(src).toContain('read-hook-stdin.mjs');
          // ...and passes the caller's TTY flag so a manual run returns '' rather
          // than blocking on an EOF the console never sends.
          expect(src).toContain('readHookStdin({ isTTY: process.stdin.isTTY })');
        });

        it(`${bin.name} (${route}) no longer calls the raw blocking readFileSync(0)`, () => {
          const src = readFileSync(path, 'utf8');
          // The exact hang-prone form. `readFileSync(0` (fd 0 = stdin) is the
          // blocking drain Task 101 replaces; readHookStdin still uses it
          // INTERNALLY behind the isTTY guard, but no bin may call it directly.
          expect(src).not.toMatch(/readFileSync\(\s*0\b/);
        });
      }
    }
  });

  describe('behavioral: empty/closed stdin exits 0 within a hard timeout (no hang)', () => {
    for (const bin of BINS.filter((b) => b.behavioral !== false)) {
      for (const { route, path } of binPaths(bin)) {
        it(`${bin.name} (${route}) exits 0 on empty stdin and does not time out`, () => {
          // A scratch cwd so any bin that touches the filesystem has a real dir.
          const sandbox = mkdtempSync(join(tmpdir(), 'cmk-hook-drain-'));
          mkdirSync(sandbox, { recursive: true });
          try {
            const r = spawnSync(process.execPath, [path], {
              input: '', // closed pipe → immediate EOF; the no-regression path
              encoding: 'utf8',
              cwd: sandbox,
              timeout: 15000, // a hung bin trips this → signal !== null, test fails
            });
            // Not killed by the timeout (the anti-hang assertion)...
            expect(r.signal).toBe(null);
            // ...and the hook protocol's always-exit-0 contract holds.
            expect(r.status).toBe(0);
          } finally {
            rmSync(sandbox, { recursive: true, force: true });
          }
        });
      }
    }
  });
});
