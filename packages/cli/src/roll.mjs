// `cmk roll` (Task 39, T-033, parts 39.4–39.5).
//
// Public boundary:
//   async runRoll({projectRoot, scope: 'now'|'today'|'recent', backend, now})
//     → {action, scope, delegatedTo, result, duration_ms}
//
// Manually trigger one of the kit's compression pipelines on demand:
//   - 'now'     : task 22 compress-session — compresses now.md to today-{date}.md (DEFAULT)
//   - 'today'   : task 33 daily-distill — rolls today-*.md into recent.md
//   - 'recent'  : task 34 weekly-curate — archives today-*.md >7d into archive.md
//
// All three pipelines already implement the Haiku call + cooldown +
// audit-log discipline. This dispatcher passes the backend through to
// the appropriate one. `cooldownMs: 0` override because `cmk roll`
// is an explicit user-invoked operation — the user opted in, and the
// shared 120s cooldown shouldn't gate a manual command.
//
// Per design §8 + tasks.md 39.4–39.5.

import { ERROR_CATEGORIES, errorResult } from './result-shapes.mjs';
import { nowIso } from './audit-log.mjs';

export const ROLL_SCOPES = Object.freeze({
  NOW: 'now',
  TODAY: 'today',
  RECENT: 'recent',
});

/**
 * Public boundary: run the roll pipeline.
 *
 * @param {object} opts
 * @param {string} opts.projectRoot
 * @param {string} [opts.scope]  'now' (default) | 'today' | 'recent'
 * @param {object} opts.backend  CompressorBackend (HaikuViaAnthropicApi or MockHaikuBackend)
 * @param {string} [opts.now]
 * @returns {Promise<object>}
 *
 * Note: I2 fix (skill-review 2026-05-28) dropped the v0.1.0 `userDir`
 * forward-compat parameter. The underlying pipelines (compress-session,
 * daily-distill, weekly-curate) all operate purely on projectRoot — none
 * take userDir. When user-tier roll operations land (v0.1.x), the param
 * lands at that PR alongside the actual consumer.
 */
export async function runRoll({
  projectRoot,
  scope = ROLL_SCOPES.NOW,
  backend,
  now,
} = {}) {
  const ts = now ?? nowIso();
  const t0 = Date.now();
  if (!projectRoot) {
    return errorResult({
      category: ERROR_CATEGORIES.MISSING_PROJECT_ROOT,
      errors: ['projectRoot is required'],
      duration_ms: Date.now() - t0,
    });
  }
  if (!backend || typeof backend.compress !== 'function') {
    return errorResult({
      category: ERROR_CATEGORIES.MISSING_BACKEND,
      errors: ['backend (CompressorBackend) is required'],
      duration_ms: Date.now() - t0,
    });
  }
  if (!Object.values(ROLL_SCOPES).includes(scope)) {
    return errorResult({
      category: ERROR_CATEGORIES.SCHEMA,
      errors: [`invalid scope: ${scope}; expected 'now' | 'today' | 'recent'`],
      duration_ms: Date.now() - t0,
    });
  }

  // Lazy-load the underlying pipeline modules so this module's
  // public surface stays narrow + import-cost stays low.
  let result;
  let delegatedTo;
  if (scope === ROLL_SCOPES.NOW) {
    const { compressSession } = await import('./compress-session.mjs');
    delegatedTo = 'compress-session';
    result = await compressSession({
      projectRoot,
      backend,
      now: ts,
      cooldownMs: 0, // user-explicit invocation bypasses 120s gate
    });
  } else if (scope === ROLL_SCOPES.TODAY) {
    const { dailyDistill } = await import('./daily-distill.mjs');
    delegatedTo = 'daily-distill';
    result = await dailyDistill({
      projectRoot,
      backend,
      now: ts,
      cooldownMs: 0,
    });
  } else {
    const { weeklyCurate } = await import('./weekly-curate.mjs');
    delegatedTo = 'weekly-curate';
    result = await weeklyCurate({
      projectRoot,
      backend,
      now: ts,
      cooldownMs: 0,
    });
  }

  return {
    action: 'completed',
    scope,
    delegatedTo,
    result,
    duration_ms: Date.now() - t0,
  };
}
