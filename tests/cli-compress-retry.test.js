// @doors: 1, 3
// Door 2 N/A: compressWithRetry is a pure wrapper over an injected backend — it
//   mutates no kit disk state; state-mutation lives in the callers (compress-session
//   etc.), tested there.
// Door 4 N/A: no message-queue interaction.
// Door 5 N/A: compressWithRetry itself writes no NDJSON log — the calling verb logs
//   the final outcome (compress.log), tested in the caller suites.
//
// Task 161 / D-175 — a bounded, transient-only retry for the Haiku compress call.
// The fix for the D-174 environmental-failure finding: the compress timeout is
// transient (a re-call usually succeeds), not input-size-driven. Grounded in the
// 9-system retry survey (docs/research/2026-06-19-llm-call-retry-patterns-cross-system.md):
// bounded attempts (<=2 for the kit), exponential backoff, retry ONLY the transient
// class (timeout / transient non-zero exit) keyed on the error TYPE, NEVER the
// deterministic class (ENOENT / a deterministic exit), reraise after exhaustion.

import { describe, it, expect } from 'vitest';
import { compressWithRetry, isRetryableCompressError } from '../packages/cli/src/compress-retry.mjs';
import { HaikuTimeoutError, HaikuFailedError } from '../packages/cli/src/compressor.mjs';

// A backend that throws the given errors in order, then returns `success` once the
// throw-queue is exhausted. Records every compress() call for Door-3 assertions.
function sequencedBackend({ throwsThenSucceeds = [], success = { outputText: 'ok' } } = {}) {
  const queue = [...throwsThenSucceeds];
  const calls = [];
  return {
    calls,
    modelId: () => 'mock',
    estimatedCostPerCall: () => 0,
    async compress(opts) {
      calls.push(opts);
      if (queue.length > 0) throw queue.shift();
      return success;
    },
  };
}

const timeoutErr = () => new HaikuTimeoutError('slow', { timeoutMs: 50_000 });
const transientExit = () => new HaikuFailedError('claude --print exit 1: overloaded', { exitCode: 1, stderr: 'overloaded_error: please retry' });
const enoentErr = () => Object.assign(new Error('spawn claude ENOENT'), { code: 'ENOENT' });

describe('isRetryableCompressError', () => {
  it('haiku_timeout is retryable (the transient/environmental case — D-174)', () => {
    expect(isRetryableCompressError(timeoutErr())).toBe(true);
  });

  it('a transient haiku_failed (overloaded/5xx-ish stderr) is retryable', () => {
    expect(isRetryableCompressError(transientExit())).toBe(true);
  });

  it('ENOENT (binary missing) is NOT retryable — re-spawning re-fails identically', () => {
    expect(isRetryableCompressError(enoentErr())).toBe(false);
  });

  it('a deterministic auth failure is NOT retryable', () => {
    const authErr = new HaikuFailedError('claude --print exit 1: authentication failed', {
      exitCode: 1,
      stderr: 'authentication_error: invalid api key',
    });
    expect(isRetryableCompressError(authErr)).toBe(false);
  });

  it('an unknown non-zero exit defaults to NOT retryable (conservative, fail-safe)', () => {
    // Skill-review M/I: the Windows "is not recognized as an internal or external
    // command" missing-binary message matches NEITHER list → conservative default.
    const unknown = new HaikuFailedError('exit 1', {
      exitCode: 1,
      stderr: "'claude' is not recognized as an internal or external command",
    });
    expect(isRetryableCompressError(unknown)).toBe(false);
  });

  it('deterministic precedence: a stderr with BOTH a deterministic and a transient token is NOT retryable', () => {
    // Skill-review I-2: the deterministic check runs FIRST and wins — an auth error
    // that also mentions "retry" must not be retried (a re-call re-fails on auth).
    const mixed = new HaikuFailedError('exit 1', {
      exitCode: 1,
      stderr: 'authentication failed — please retry after fixing your api key',
    });
    expect(isRetryableCompressError(mixed)).toBe(false);
  });
});

describe('compressWithRetry', () => {
  it('returns the result on first-try success without retrying (Door 1 + 3)', async () => {
    const backend = sequencedBackend({ success: { outputText: 'summary' } });
    const r = await compressWithRetry(backend, { input: 'x' }, { maxAttempts: 2, baseBackoffMs: 0 });
    expect(r.outputText).toBe('summary');
    expect(backend.calls).toHaveLength(1); // no retry on success
  });

  it('retries a transient timeout ONCE, then succeeds (Door 3: 2 spawns, same opts)', async () => {
    const backend = sequencedBackend({ throwsThenSucceeds: [timeoutErr()], success: { outputText: 'recovered' } });
    const r = await compressWithRetry(backend, { input: 'buf', instructions: 'i' }, { maxAttempts: 2, baseBackoffMs: 0 });
    expect(r.outputText).toBe('recovered');
    expect(backend.calls).toHaveLength(2);
    // Door 3: the retry sends the SAME input/instructions (not a mangled re-call).
    expect(backend.calls[1].input).toBe('buf');
    expect(backend.calls[1].instructions).toBe('i');
  });

  it('does NOT exceed maxAttempts — reraises the last error after exhaustion', async () => {
    const backend = sequencedBackend({ throwsThenSucceeds: [timeoutErr(), timeoutErr()] });
    await expect(
      compressWithRetry(backend, { input: 'x' }, { maxAttempts: 2, baseBackoffMs: 0 }),
    ).rejects.toBeInstanceOf(HaikuTimeoutError);
    expect(backend.calls).toHaveLength(2); // 2 attempts, no third
  });

  it('does NOT retry a non-retryable error — fails immediately on the first attempt', async () => {
    const backend = sequencedBackend({ throwsThenSucceeds: [enoentErr(), { outputText: 'never' }] });
    await expect(
      compressWithRetry(backend, { input: 'x' }, { maxAttempts: 2, baseBackoffMs: 0 }),
    ).rejects.toMatchObject({ code: 'ENOENT' });
    expect(backend.calls).toHaveLength(1); // no retry on a deterministic failure
  });

  it('maxAttempts:1 disables retry (the SessionEnd-hook contract — D-175)', async () => {
    const backend = sequencedBackend({ throwsThenSucceeds: [timeoutErr()] });
    await expect(
      compressWithRetry(backend, { input: 'x' }, { maxAttempts: 1, baseBackoffMs: 0 }),
    ).rejects.toBeInstanceOf(HaikuTimeoutError);
    expect(backend.calls).toHaveLength(1); // single attempt — no retry under the ceiling
  });

  // Task 161.12 — the retry must be OBSERVABLE (a frequent-retry rate is the
  // degrading-environment signal D-174 is about). onRetry fires once per retry,
  // BEFORE the backoff, with the failed attempt number + the (transient) error.
  it('calls onRetry once per retry with {attempt, error} (observability — 161.12)', async () => {
    const backend = sequencedBackend({ throwsThenSucceeds: [timeoutErr()], success: { outputText: 'ok' } });
    const retries = [];
    await compressWithRetry(
      backend,
      { input: 'x' },
      { maxAttempts: 2, baseBackoffMs: 0, onRetry: (info) => retries.push(info) },
    );
    expect(retries).toHaveLength(1);
    expect(retries[0].attempt).toBe(1); // the attempt that FAILED (before the retry)
    expect(retries[0].error).toBeInstanceOf(HaikuTimeoutError);
  });

  it('does NOT call onRetry on a first-try success', async () => {
    const backend = sequencedBackend({ success: { outputText: 'ok' } });
    const retries = [];
    await compressWithRetry(backend, { input: 'x' }, { maxAttempts: 2, onRetry: () => retries.push(1) });
    expect(retries).toHaveLength(0);
  });

  it('does NOT call onRetry when a non-retryable error fails immediately', async () => {
    const backend = sequencedBackend({ throwsThenSucceeds: [enoentErr()] });
    const retries = [];
    await compressWithRetry(backend, { input: 'x' }, { maxAttempts: 2, onRetry: () => retries.push(1) }).catch(() => {});
    expect(retries).toHaveLength(0); // deterministic failure → no retry → no onRetry
  });
});
