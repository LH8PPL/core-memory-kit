// @doors: 1
// Door 2 N/A: pure function; no disk/state mutation (it only READS an fd).
// Door 3 N/A: no subprocess.
// Door 4 N/A: no NDJSON log.
// Door 5 N/A: no message queue.

// Tests for read-hook-stdin.mjs — the SessionEnd-hook stdin drain that must NOT
// block when the bin is run manually on an interactive console.
//
// Root cause it guards (DECISION-LOG 2026-06-06): the twin cmk-compress-session
// bins drained stdin via `readFileSync(0)`, which blocks until EOF. Run as a
// real hook, Claude Code pipes the payload + closes the pipe → instant EOF. Run
// MANUALLY without redirecting stdin (the cut-gate B7 probe), the console never
// EOFs → the read blocks before the bin body runs → the 60s hook ceiling kills
// it (exit 124, zero stderr). readHookStdin({ isTTY }) returns '' for a TTY so
// the manual path degrades gracefully instead of hanging.
//
// Boundary: the function's CONTRACT is "given isTTY + an fd, return the drained
// payload or '' — and for a TTY, never touch the fd." isTTY is injected so the
// TTY branch is testable without a real terminal.

import { describe, it, expect, afterEach } from 'vitest';
import { openSync, closeSync, writeFileSync, rmSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { readHookStdin } from '../packages/cli/src/read-hook-stdin.mjs';

const cleanups = [];
afterEach(() => {
  while (cleanups.length) {
    const fn = cleanups.pop();
    try {
      fn();
    } catch {
      /* best-effort */
    }
  }
});

function tmpFileWith(contents) {
  const dir = mkdtempSync(join(tmpdir(), 'cmk-stdin-'));
  const path = join(dir, 'payload');
  writeFileSync(path, contents, 'utf8');
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  return path;
}

describe('readHookStdin', () => {
  it('returns "" for an interactive TTY WITHOUT reading the fd (the hang guard)', () => {
    // Pass a deliberately-invalid fd: if the TTY branch ever fell through to
    // readFileSync(fd) it would throw EBADF, not return ''. Returning '' proves
    // the fd is never touched — the exact behavior that stops the console hang.
    const badFd = 999999;
    expect(readHookStdin({ isTTY: true, fd: badFd })).toBe('');
  });

  it('drains and returns the payload when stdin is NOT a TTY (the real hook path)', () => {
    const path = tmpFileWith('{"session_id":"abc","hook":"SessionEnd"}');
    const fd = openSync(path, 'r');
    cleanups.push(() => {
      try {
        closeSync(fd);
      } catch {
        /* already closed */
      }
    });
    expect(readHookStdin({ isTTY: false, fd })).toBe('{"session_id":"abc","hook":"SessionEnd"}');
  });

  it('returns "" (does not throw) when a non-TTY fd is unreadable', () => {
    // Simulates stdin not connected: a closed/invalid fd. The drain must
    // swallow the read error so SessionEnd still proceeds.
    expect(readHookStdin({ isTTY: false, fd: 999999 })).toBe('');
  });

  // NB: deliberately NO test of the default `fd = 0` against real stdin. In a
  // test runner whose stdin is an open pipe without EOF, readFileSync(0) blocks
  // forever — which would hang the suite (it actually did during development).
  // That is the very hazard this module guards; the production caller always
  // passes `isTTY: process.stdin.isTTY`, so the bare-fd-0 read is only reached
  // for a genuinely non-TTY, EOF-terminated pipe (the real hook). The explicit
  // fd cases above cover the contract without touching the runner's stdin.
});
