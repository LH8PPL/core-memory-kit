// @doors: 1, 3
// Door 2 N/A: this module is in-process logic; nothing lands on disk
//   during a timeout (the timeout REJECTS before any write would occur).
//   The sandbox tempfile cleanup IS verified at the cli-compressor.test.js
//   level; this file's scope is the timeout LOGIC, not disk-state.
// Door 4 N/A: no message-queue interaction in this module.
// Door 5 N/A: observability assertions for HAIKU_TIMEOUT live in the
//   caller-side tests where the NDJSON log actually gets written —
//   cli-auto-extract.test.js (extract.log) and cli-compress-session.test.js
//   (compress.log). The HaikuTimeoutError.category field is a Door 1
//   response property, not a Door 5 observability artifact.
//
// Tests for Task 23.9 — subprocess timeout + cleanup contract for
// HaikuViaAnthropicApi (design §8.5). The fix being tested:
//
//   Before: HaikuViaAnthropicApi.compress() spawned `claude --print`
//   and awaited 'close' indefinitely. If the subprocess hung (e.g.,
//   slow Anthropic response), the Promise never resolved; the parent
//   was eventually killed by Claude Code's hook timeout (30s Stop,
//   60s SessionEnd) WITHOUT running cleanup. The auto-extract lock
//   file leaked; no error_category log entry was written.
//
//   After: compress({timeoutMs, killGraceMs}) schedules a timer that
//   on expiry sends SIGTERM to the child, waits killGraceMs, then
//   SIGKILL if still alive. The Promise rejects with a
//   HaikuTimeoutError carrying category:'haiku_timeout'. The caller's
//   try/catch + finally then run normally (audit-log entry written,
//   lock released).
//
// Boundary-test discipline (per CLAUDE.md):
//   - Tests inject `spawnFn` to construct a child that never emits
//     'close' or 'error'. This is the production code path's view
//     of a hung subprocess.
//   - We do NOT spawn a real OS process here. The real-OS kill-chain
//     test is the spawn-smoke at tests/spawn-smoke-kill-chain.test.js
//     which uses the hang-forever fixture.

import { describe, it, expect } from 'vitest';
import { EventEmitter } from 'node:events';
import {
  HaikuViaAnthropicApi,
  HaikuTimeoutError,
  terminateSubprocess,
} from '../packages/cli/src/compressor.mjs';

function makeHangingChild() {
  const child = new EventEmitter();
  child.killCalls = [];
  child.stdin = {
    write: () => true,
    end: () => {
      // Never emit close/error — simulates hang
    },
  };
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = (signal) => {
    child.killCalls.push(signal);
    // Don't emit 'exit' — escalation path is the test's concern
  };
  child.exitCode = null;
  return child;
}

describe('Task 23.9 — HaikuViaAnthropicApi subprocess timeout', () => {
  it('compress({timeoutMs}) rejects with HaikuTimeoutError when subprocess never closes (door 1 + door 3)', async () => {
    const child = makeHangingChild();
    const fakeSpawn = () => child;
    const h = new HaikuViaAnthropicApi({ spawnFn: fakeSpawn });

    const startedAt = Date.now();
    await expect(
      h.compress({
        input: 'never returns',
        maxOutputBytes: 100,
        timeoutMs: 100,
        killGraceMs: 50,
      }),
    ).rejects.toThrow(HaikuTimeoutError);
    const elapsed = Date.now() - startedAt;
    // Door 3: the kill chain executed against the spawned child
    expect(child.killCalls).toContain('SIGTERM');
    // Door 1: the timeout fired in a reasonable window (not waiting
    // for some upstream OS-level timeout). Allow generous headroom
    // for Windows scheduler jitter.
    expect(elapsed).toBeLessThan(2000);
  });

  it('HaikuTimeoutError carries category: "haiku_timeout" so callers can route on err.category (door 1)', async () => {
    const child = makeHangingChild();
    const fakeSpawn = () => child;
    const h = new HaikuViaAnthropicApi({ spawnFn: fakeSpawn });

    try {
      await h.compress({
        input: 'x',
        maxOutputBytes: 100,
        timeoutMs: 50,
        killGraceMs: 25,
      });
      expect.fail('expected compress to reject');
    } catch (err) {
      expect(err).toBeInstanceOf(HaikuTimeoutError);
      expect(err.category).toBe('haiku_timeout');
      expect(err.timeoutMs).toBe(50);
    }
  });

  it('SIGTERM sent first, SIGKILL escalation after grace window (door 3)', async () => {
    const child = makeHangingChild();
    const fakeSpawn = () => child;
    const h = new HaikuViaAnthropicApi({ spawnFn: fakeSpawn });

    await expect(
      h.compress({
        input: 'x',
        maxOutputBytes: 100,
        timeoutMs: 50,
        killGraceMs: 100,
      }),
    ).rejects.toThrow(HaikuTimeoutError);

    // Note: compress() rejects the Promise IMMEDIATELY when the
    // timeout fires (the caller gets its rejection ASAP) and the
    // kill chain runs in the BACKGROUND. So at the moment the await
    // unblocks, SIGTERM has been issued but SIGKILL is still
    // scheduled (~killGraceMs out). Wait for the kill chain to
    // complete before checking the full sequence.
    await new Promise((res) => setTimeout(res, 300));

    // SIGTERM came first
    expect(child.killCalls[0]).toBe('SIGTERM');
    // SIGKILL came after (the test child doesn't honor SIGTERM, so
    // the grace-window timer escalates to SIGKILL).
    expect(child.killCalls).toContain('SIGKILL');
    const sigtermIdx = child.killCalls.indexOf('SIGTERM');
    const sigkillIdx = child.killCalls.indexOf('SIGKILL');
    expect(sigkillIdx).toBeGreaterThan(sigtermIdx);
  });

  it('successful close before timeout: no kill signals sent, normal return (door 1 + door 3 negative)', async () => {
    const child = new EventEmitter();
    child.killCalls = [];
    child.stdin = {
      write: () => true,
      end: () => {
        // Simulate quick successful response
        setImmediate(() => {
          child.stdout.emit('data', Buffer.from('compressed output\n'));
          child.emit('close', 0);
        });
      },
    };
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.kill = (signal) => {
      child.killCalls.push(signal);
    };
    const fakeSpawn = () => child;
    const h = new HaikuViaAnthropicApi({ spawnFn: fakeSpawn });

    const r = await h.compress({
      input: 'x',
      maxOutputBytes: 100,
      timeoutMs: 1000,
      killGraceMs: 500,
    });
    expect(r.outputText).toBe('compressed output');
    // Door 3 negative: no kill signal sent on the happy path. A
    // bug that fired the timer despite a clean exit would surface
    // here.
    expect(child.killCalls).toEqual([]);
  });

  it('compress without timeoutMs option preserves prior behavior (no timeout, no kill — backwards compatible)', async () => {
    const child = new EventEmitter();
    child.killCalls = [];
    child.stdin = {
      write: () => true,
      end: () => {
        setImmediate(() => {
          child.stdout.emit('data', Buffer.from('ok\n'));
          child.emit('close', 0);
        });
      },
    };
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.kill = (signal) => {
      child.killCalls.push(signal);
    };
    const fakeSpawn = () => child;
    const h = new HaikuViaAnthropicApi({ spawnFn: fakeSpawn });

    // Call WITHOUT timeoutMs; should still work (old callers don't
    // pass it). No timer registered, no kill chain involved.
    const r = await h.compress({ input: 'x', maxOutputBytes: 100 });
    expect(r.outputText).toBe('ok');
    expect(child.killCalls).toEqual([]);
  });
});

describe('Task 23.9 — terminateSubprocess() helper', () => {
  it('returns method:"already-exited" if exitCode is set when called (door 1)', async () => {
    const child = new EventEmitter();
    child.exitCode = 0;
    child.kill = () => {
      // Should not be called
      throw new Error('terminateSubprocess should not kill an already-exited child');
    };
    const r = await terminateSubprocess(child, { killGraceMs: 50 });
    expect(r.method).toBe('already-exited');
    expect(r.exitCode).toBe(0);
  });

  it('returns method:"sigterm" when child exits after SIGTERM (door 1 + door 3)', async () => {
    const child = new EventEmitter();
    child.exitCode = null;
    let killSignal = null;
    child.kill = (signal) => {
      killSignal = signal;
      // Honor SIGTERM after a short delay
      setImmediate(() => {
        child.exitCode = 143; // 128 + 15 (SIGTERM)
        child.emit('exit', 143, 'SIGTERM');
      });
    };
    const r = await terminateSubprocess(child, { killGraceMs: 200 });
    expect(killSignal).toBe('SIGTERM');
    expect(r.method).toBe('sigterm');
  });

  it('escalates to SIGKILL when SIGTERM ignored (door 3)', async () => {
    const child = new EventEmitter();
    child.exitCode = null;
    const signals = [];
    child.kill = (signal) => {
      signals.push(signal);
      // Ignore SIGTERM, honor SIGKILL
      if (signal === 'SIGKILL') {
        setImmediate(() => {
          child.exitCode = 137; // 128 + 9 (SIGKILL)
          child.emit('exit', 137, 'SIGKILL');
        });
      }
    };
    const r = await terminateSubprocess(child, { killGraceMs: 50 });
    expect(signals).toEqual(['SIGTERM', 'SIGKILL']);
    expect(r.method).toBe('sigkill');
  });
});
