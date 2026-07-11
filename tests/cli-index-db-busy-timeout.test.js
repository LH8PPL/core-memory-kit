// @doors: 1, 2, 3
// Door 3: a REAL second process (tests/fixtures/hold-index-write-lock.mjs)
//   holds the DB write lock — the cross-process contention §16.35 said a
//   same-process sync test structurally cannot produce (better-sqlite3's
//   busy wait would block the very thread that must COMMIT).
// Door 4 N/A: no message-queue interaction.
// Door 5 N/A: openIndexDb writes no NDJSON log at this boundary.
//
// Tests for Task 219 (design §16.34, proposed 2026-05-27; the 2026-07-10
// recall review, D-312). PREMISE CORRECTION (D-321): §16.34 assumed SQLite's
// raw 0ms busy-timeout default, but better-sqlite3 defaults its `timeout`
// option to 5000ms — the wait-instead-of-SQLITE_BUSY behavior already existed
// via the driver default (this suite's behavior test passed BEFORE the pragma
// landed; the primary-source check was lib/database.js). These are therefore
// CONTRACT PINS: the explicit pragma + this suite keep the posture guaranteed
// even if a future driver major changes the default (or a caller passes
// `timeout: 0`) — because concurrent writers are the kit's NORMAL operating
// mode (Stop-hook auto-extract + lazy-compress child + cmk reindex + MCP
// server all open independent connections on the same index).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openIndexDb } from '../packages/cli/src/index-db.mjs';

const FIXTURE = fileURLToPath(
  new URL('./fixtures/hold-index-write-lock.mjs', import.meta.url),
);

let sandbox;
let dbPath;

beforeEach(() => {
  sandbox = mkdtempSync(join(tmpdir(), 'cmk-busy-'));
  dbPath = join(sandbox, 'index.db');
});

afterEach(() => {
  try {
    rmSync(sandbox, { recursive: true, force: true });
  } catch {
    /* Windows EPERM drain */
  }
});

async function waitFor(cond, capMs = 8000) {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > capMs) throw new Error('waitFor: condition never became true');
    await new Promise((r) => setTimeout(r, 25));
  }
}

describe('Task 219 — busy_timeout on openIndexDb (design §16.34)', () => {
  it('sets busy_timeout = 5000 on every connection (Door 1)', () => {
    const db = openIndexDb({ dbPath });
    try {
      expect(db.pragma('busy_timeout', { simple: true })).toBe(5000);
    } finally {
      db.close();
    }
  });

  it('a concurrent writer WAITS for the lock and succeeds instead of throwing SQLITE_BUSY (Doors 2+3; §16.35)', async () => {
    // Apply the schema + a scratch table while the DB is uncontended.
    const db = openIndexDb({ dbPath });
    db.exec('CREATE TABLE IF NOT EXISTS busy_probe (x INTEGER)');

    // A REAL second process takes the write lock, signals via sentinel, holds
    // it ~1500ms, then commits. The hold is deliberately generous: the parent
    // must get from sentinel detection to the INSERT while the lock is still
    // held, and a loaded stress box (5 parallel vitest workers) can stall the
    // event loop for hundreds of ms — 600ms left too thin a margin for the
    // `waited > 50` contention proof (skill-review finding 1).
    const sentinel = join(sandbox, 'lock-held');
    let childStderr = '';
    let childExited = false;
    const child = spawn(process.execPath, [FIXTURE, dbPath, sentinel, '1500'], {
      stdio: ['ignore', 'ignore', 'pipe'],
      windowsHide: true,
    });
    child.stderr.on('data', (d) => { childStderr += d; });
    child.on('exit', () => { childExited = true; });
    try {
      await waitFor(() => {
        // Fail fast with diagnostics if the child died before taking the lock
        // (native-binding failure, DB open error) instead of burning the cap.
        if (childExited && !existsSync(sentinel)) {
          throw new Error(`lock-holder child exited before sentinel; stderr: ${childStderr}`);
        }
        return existsSync(sentinel);
      });

      // With a 0ms busy timeout this throws SQLITE_BUSY immediately; with the
      // pragma it waits out the child's hold and lands.
      const t0 = performance.now();
      db.prepare('INSERT INTO busy_probe (x) VALUES (1)').run();
      const waited = performance.now() - t0;

      // State (Door 2): the write landed.
      expect(db.prepare('SELECT COUNT(*) AS n FROM busy_probe').get().n).toBe(1);
      // Evidence it actually CONTENDED (waited for the child's hold window,
      // give-or-take scheduling): not an instant no-contention write.
      expect(waited).toBeGreaterThan(50);
      expect(waited).toBeLessThan(5000); // and did NOT exhaust the 5s budget
    } finally {
      db.close();
      child.kill();
    }
  });
});
