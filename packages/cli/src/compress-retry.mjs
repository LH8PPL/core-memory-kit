// Bounded, transient-only retry for the Haiku compress call (Task 161 / D-175).
//
// WHY this exists: the v0.3.3 cut-gate surfaced `haiku_timeout` / `compress_failed`
// failures on the compression path. Measurement (D-174) proved the failure is
// ENVIRONMENTAL/TRANSIENT, not input-size-driven — the kit's own compress.log shows
// the largest SUCCESS (470 KB) bigger than the largest timeout (334 KB), and a 9 KB
// input timed out. So the fix is a RETRY (a re-call usually succeeds), not an input
// cap. The kit inherited the no-retry shape from claude-remember (its precedent —
// which doesn't retry either); the rest of the field does.
//
// The SHAPE is grounded in a 9-system code read
// (docs/research/2026-06-19-llm-call-retry-patterns-cross-system.md), which converges
// unanimously on: bounded attempts, exponential backoff, retry ONLY the transient
// class keyed on the error TYPE, NEVER the deterministic class, reraise after
// exhaustion. graphiti's `is_server_or_retry_error` predicate + Letta's
// ValueError(retry)-vs-RuntimeError(don't) split are the model.
//
// COMPOSITION (design §8.5 / D-42): the SessionEnd-hook `compressSession` runs under
// a 60s ceiling CONCURRENT with autoPersona — a 50s attempt + a 50s retry = 100s
// blows the ceiling. So callers under the ceiling pass `maxAttempts: 1` (no retry —
// they delegate the retry to the ceiling-free lazy path via the existing
// restore-on-failure, D-79); only the ceiling-free paths (daily-distill /
// weekly-curate / lazy compress) pass `maxAttempts: 2`.
//
// COOLDOWN INTERACTION (skill-review I-1): the 120s Haiku cooldown marker is touched
// on SUCCESS only, and the callers gate `isCooldownActive` ONCE before the retry loop.
// A retry WIDENS the existing "no marker until success" window (~50s → ~100s), so a
// second hook firing mid-retry could pass the gate and start its own compress. This
// is NOT a new bug class — the window pre-exists the retry — and the D-79 claim-rename
// mutex (renameSync of now.md is the real lock) still prevents any corruption: only
// one roll wins the rename; the other reads an empty buffer and skips. The retry only
// makes a pre-existing benign window ~2× wider; no marker change is warranted.
//
// NO JITTER (skill-review M-2): the field (graphiti) jitters its backoff
// (wait_random_exponential) to avoid thundering-herd across many concurrent clients.
// The kit's compress is a single low-concurrency local process (one detached child at
// a time, gated by the cooldown), so there is no herd to avoid — a plain exponential
// backoff is sufficient and keeps the timing deterministic for tests.

/**
 * Classify a compress() rejection as transient (worth a retry) or deterministic
 * (a re-call re-fails identically — don't waste the attempt or the budget).
 *
 * Transient (retry):
 *   - HaikuTimeoutError (`category: 'haiku_timeout'`) — `claude --print` was slow;
 *     the D-174 environmental case. A re-call usually succeeds.
 *   - HaikuFailedError (`category: 'haiku_failed'`) whose stderr looks like a
 *     transient server/overload/rate-limit blip (the field's 5xx/429/overloaded
 *     class), classified from the `exit_code`/`stderr` that 161.6a now captures.
 *
 * Deterministic (do NOT retry):
 *   - A spawn error (`code: 'ENOENT'` etc.) — the binary isn't there; re-spawning
 *     re-fails.
 *   - A HaikuFailedError whose stderr is a known-deterministic class (auth /
 *     invalid-key / policy / bad-request) — retrying always re-fails (graphiti's
 *     explicit "retrying policy-violating content will always fail").
 *   - Anything unrecognized — default to NOT retryable (conservative: an unknown
 *     failure is more likely a real bug than a blip, and a wasted retry costs the
 *     hook budget).
 *
 * @param {unknown} err
 * @returns {boolean}
 */
export function isRetryableCompressError(err) {
  if (!err || typeof err !== 'object') return false;

  // Timeout = the transient/environmental case (D-174). Always retryable.
  if (err.category === 'haiku_timeout') return true;

  // Spawn-level failure (ENOENT / EACCES / EINVAL) — the binary/permissions are
  // wrong; re-spawning re-fails identically. Never retryable.
  if (typeof err.code === 'string' && /^E[A-Z]+$/.test(err.code)) return false;

  // Non-zero exit — conditional on WHY (the exit_code/stderr 161.6a captures).
  if (err.category === 'haiku_failed') {
    const stderr = String(err.stderr ?? '').toLowerCase();
    // Known-DETERMINISTIC classes: a re-call re-fails. Never retry these.
    // (Skill-review I-2: `not found` was DROPPED — it appears in transient
    // contexts too, e.g. a transient "host not found" / "upstream not found,
    // retrying"; a deterministic 404 from `claude --print` is unlikely, and the
    // conservative default below already catches a genuine unknown deterministic
    // failure. Keeping only HIGH-CONFIDENCE deterministic markers.)
    if (
      /auth|invalid[_ -]?(api[_ -]?)?key|unauthor|forbidden|permission|policy|invalid[_ -]?request|bad[_ -]?request/.test(
        stderr,
      )
    ) {
      return false;
    }
    // Known-TRANSIENT classes: server/overload/rate blips recover on a re-call.
    if (/overload|rate[_ -]?limit|429|5\d\d|timeout|timed[_ -]?out|temporar|unavailable|connection|network|reset/.test(stderr)) {
      return true;
    }
    // Unknown non-zero exit → conservative: do NOT retry (treat as deterministic).
    return false;
  }

  return false;
}

/**
 * Call `backend.compress(opts)` with a bounded, transient-only retry.
 *
 * @param {{compress: (opts: object) => Promise<any>}} backend
 * @param {object} opts                  — passed verbatim to backend.compress on every attempt.
 * @param {object} [config]
 * @param {number} [config.maxAttempts=2] — TOTAL attempts (1 = no retry; the ceiling-bound contract). Field range is 2–4; the kit uses ≤2 (one retry) to fit the budget.
 * @param {number} [config.baseBackoffMs=600] — exponential backoff base: wait `baseBackoffMs * 2**(attempt-1)` before attempt N+1. 0 disables the wait (tests).
 * @param {(err: unknown) => boolean} [config.isRetryable=isRetryableCompressError]
 * @param {(ms: number) => Promise<void>} [config.sleep] — injectable for tests.
 * @param {(info: {attempt: number, error: unknown}) => void} [config.onRetry] — fired once
 *   per retry (Task 161.12 observability), BEFORE the backoff, with the FAILED attempt
 *   number + the (transient) error. Callers use it to record a `retries` count on their
 *   compress.log entry so a frequent-retry rate (the degrading-environment signal D-174
 *   is about) is visible. Not fired on a first-try success or a non-retryable failure.
 * @returns {Promise<any>} the backend.compress result; reraises the last error after exhaustion.
 */
export async function compressWithRetry(
  backend,
  opts,
  {
    maxAttempts = 2,
    baseBackoffMs = 600,
    isRetryable = isRetryableCompressError,
    sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
    onRetry,
  } = {},
) {
  const attempts = Math.max(1, maxAttempts);
  let lastErr;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await backend.compress(opts);
    } catch (err) {
      lastErr = err;
      // Stop immediately if this is the last attempt OR the error isn't transient.
      if (attempt >= attempts || !isRetryable(err)) {
        throw err;
      }
      // We're going to retry — surface it for observability (161.12), before the wait.
      if (typeof onRetry === 'function') {
        try {
          onRetry({ attempt, error: err });
        } catch {
          // onRetry is best-effort instrumentation — never let it break the retry.
        }
      }
      // Exponential backoff before the next attempt (skip the wait when base is 0).
      const delay = baseBackoffMs > 0 ? baseBackoffMs * 2 ** (attempt - 1) : 0;
      if (delay > 0) await sleep(delay);
    }
  }
  // Unreachable (the loop either returns or throws), but satisfies control-flow analysis.
  throw lastErr;
}
