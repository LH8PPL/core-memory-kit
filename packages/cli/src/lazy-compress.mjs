// Lazy compression fallback (Task 35, T-030).
//
// For environments where cron / launchd / Task Scheduler isn't available
// (corporate Windows without Task Scheduler access, restricted CI runners,
// ephemeral dev containers), the kit falls back to lazy-on-read compression
// triggered by the SessionStart hook (inject-context.mjs).
//
// Two public boundaries:
//
//   detectStaleness({projectRoot, now, dailyTtlMs?, weeklyTtlMs?})
//     → cheap (<5ms) inline check at SessionStart. Returns the
//       work-needed verdict; inject-context.mjs uses it to decide
//       whether to spawn `cmk compress --lazy`.
//
//   async runLazyCompress({projectRoot, backend, now, cooldownMs?, dailyTtlMs?, weeklyTtlMs?})
//     → the actual work. Composes on dailyDistill (Task 33) or
//       weeklyCurate (Task 34) depending on staleness verdict.
//
// Cron-detection sentinel:
//   <projectRoot>/context/.locks/cron-registered — marker file
//   written by registerCron, removed by unregisterCron. When
//   present, detectStaleness returns 'cron-active' so cmk compress
//   --lazy becomes a no-op.
//
// Per design §8.2.1 + §8.2.2 + tasks.md 35.

import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
  unlinkSync,
} from 'node:fs';
import { join } from 'node:path';
import { nowIso } from './audit-log.mjs';
import { ERROR_CATEGORIES, errorResult } from './result-shapes.mjs';
import {
  DEFAULT_COOLDOWN_MS,
  isCooldownActive,
} from './cooldown.mjs';
import { dailyDistill } from './daily-distill.mjs';
import { weeklyCurate } from './weekly-curate.mjs';
import { compressSession } from './compress-session.mjs';
import { CEILING_FREE_TIMEOUT_MS, CEILING_FREE_BACKOFF_MS } from './compress-retry.mjs';
import { syncDecisionsJournal } from './decisions-journal.mjs';
import {
  isCompactionNeeded,
  recordCronHeartbeat,
  cronHeartbeatPath,
} from './compaction-state.mjs';

const DEFAULT_DAILY_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const DEFAULT_WEEKLY_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const LOCKS_REL = ['context', '.locks'];
const LAZY_LOG_REL = ['context', '.locks', 'lazy-compress.log'];

// Task 167 (D-206/D-207): the cron-liveness gate moved from a presence-only
// `cron-registered` sentinel to an anacron-style `cron-heartbeat` (in
// compaction-state.mjs), gated on AGE not existence — a registered-but-dead cron
// no longer disables the lazy roll. These three exports are kept as thin
// back-compat shims so existing callers (register-crons / doctor / subcommands /
// tests) keep working; they now operate on the heartbeat.
//
// **Decision-trail (the retired sentinel):** the old `cron-registered` marker
// recorded "a cron was REGISTERED" (written once at register-crons time, never
// updated). detectStaleness short-circuited to 'cron-active' on its mere
// existence — so a cron that never actually fired (laptop asleep at 23:00)
// disabled the lazy fallback forever and now.md grew to 410 KB (the v0.4.0
// dogfood). The heartbeat records "a run HAPPENED" and is re-stamped each fire.

/**
 * Back-compat alias for the cron-liveness marker path. Now points at the
 * `cron-heartbeat` stamp (was `cron-registered`). Retained for callers that still
 * import it; prefer `cronHeartbeatPath` from compaction-state.mjs in new code.
 */
export function cronSentinelPath(projectRoot) {
  return cronHeartbeatPath(projectRoot);
}

/**
 * Record that the cron is alive. Now writes the anacron-style heartbeat (was: a
 * one-time registration sentinel). `register-crons` calls it on registration so a
 * just-registered cron reads alive until its first real run re-stamps it; the
 * cron BINS also call `recordCronHeartbeat` on each fire (the durable liveness
 * signal). Both go to the same stamp.
 */
export function markCronRegistered({ projectRoot }) {
  recordCronHeartbeat({ projectRoot });
}

/**
 * Remove the cron-liveness heartbeat (on unregister). Best-effort — a missing
 * stamp is already the desired "no live cron" state.
 */
export function unmarkCronRegistered({ projectRoot }) {
  if (!projectRoot) return;
  const path = cronHeartbeatPath(projectRoot);
  if (existsSync(path)) {
    try {
      unlinkSync(path);
    } catch {
      // best-effort
    }
  }
}

// Task 105 (D-75): does now.md carry prior-session content? The now→today
// roll (compressSession) fires only at SessionEnd, and Claude Code fires
// SessionEnd ONLY on a clean window-close — so a never-cleanly-closed session
// leaves now.md growing unbounded with no today-*.md/recent.md built. We detect
// a non-empty now.md at SessionStart and let the lazy worker roll it. At
// SessionStart now.md can only hold PRIOR-session turns (this session's
// capture-turn writes haven't fired yet), so non-empty ⇒ stale. Emptiness must
// match compressSession's own `buffer.trim() === ''` check so the spawn verdict
// and the actual roll agree (else we'd spawn for a roll that immediately skips).
// Task 167 (D-207): nowMdHasContent / recentMdMtimeMs / listTodayFiles + the
// now/daily/weekly derive logic moved to compaction-state.mjs (the deep module
// that owns the verdict). detectStaleness now delegates there; only isJournalStale
// (an INDEPENDENT signal, not part of the compaction verdict) stays here.

const MEMORY_REL = ['context', 'memory'];
const DECISIONS_MD_REL = ['context', 'DECISIONS.md'];

/**
 * Task 159 (D-169): is the decision journal behind the captured decision facts?
 *
 * INDEPENDENT of compress staleness — a compress-fresh session can still have
 * new `type:project` decision facts that aren't yet rendered into DECISIONS.md.
 * So this is its OWN boolean (NOT a competing detectStaleness verdict, which can
 * only return ONE action and would suppress compress work). Used as an ADDITIONAL
 * spawn condition in inject-context, and the journal is synced unconditionally
 * inside runLazyCompress.
 *
 * **O(1) — runs inline on EVERY SessionStart, so it must compose with the 500ms
 * NFR-1 budget.** It uses `context/memory/INDEX.md` as the freshness proxy:
 * `write-fact.mjs` rewrites INDEX.md on every fact write, so `INDEX.md` mtime ≥
 * the newest fact file always (verified). Comparing two file mtimes is O(1) — vs
 * stat-every-fact, which was ~130ms on a 307-fact corpus and grew linearly (a
 * self-review find; that approach would blow the budget on a large repo).
 *
 * Stale ⇔ a `project_*.md` fact exists (short-circuit on the first one — no stat)
 * AND (DECISIONS.md is missing OR older than INDEX.md). Trade-off: INDEX.md
 * covers ALL fact types, so a feedback-only write can flag the journal stale →
 * one spurious detached sync (~175ms, idempotent, never a correctness issue) —
 * acceptable for an O(1) check on the hot SessionStart path. Defensive: any
 * throw → false (never block SessionStart on a stat error).
 *
 * @param {string} projectRoot
 * @returns {boolean}
 */
export function isJournalStale(projectRoot) {
  if (!projectRoot) return false;
  try {
    const memDir = join(projectRoot, ...MEMORY_REL);
    if (!existsSync(memDir)) return false;
    // Any project (decision) fact at all? Short-circuit on the first — no stat,
    // just the dirent name. No project facts → nothing to journal → not stale.
    const hasDecisionFact = readdirSync(memDir).some(
      (name) => name.startsWith('project_') && name.endsWith('.md'),
    );
    if (!hasDecisionFact) return false;
    const journalPath = join(projectRoot, ...DECISIONS_MD_REL);
    if (!existsSync(journalPath)) return true; // facts exist, journal missing → stale
    // INDEX.md is the O(1) freshness proxy (rewritten on every fact write). If
    // it's absent (pre-index repo), fall back to "facts exist + journal exists"
    // → treat as fresh (a reindex will create INDEX.md; the session-end sync
    // covers the journal regardless).
    const indexPath = join(memDir, 'INDEX.md');
    if (!existsSync(indexPath)) return false;
    return statSync(indexPath).mtimeMs > statSync(journalPath).mtimeMs;
  } catch {
    return false;
  }
}

/**
 * Cheap inline staleness check. Runs in <5ms — one stat + a few existsSync.
 *
 * Verdict semantics (precedence: cron > no-context-dir > now > weekly > daily > fresh):
 *   - 'cron-active'   : sentinel exists; cron will handle staleness. No-op.
 *   - 'no-context-dir': context/sessions/ doesn't exist. No-op (kit not installed).
 *   - 'stale-now'     : now.md carries prior-session content (Task 105/D-75) — the
 *                       now→today roll the SessionEnd hook would have done.
 *   - 'stale-weekly'  : ANY today-*.md older than 7d exists. Weekly curate needed.
 *   - 'stale-daily'   : no OLD today files, but recent.md is missing OR older than dailyTtlMs.
 *   - 'fresh'         : recent.md exists + younger than dailyTtlMs AND no OLD today files.
 *
 * weekly takes precedence over daily — weekly-curate also rebuilds recent.md
 * (per §8.7.2), so doing weekly when both are stale handles both.
 */
export function detectStaleness({
  projectRoot,
  now,
  dailyTtlMs = DEFAULT_DAILY_TTL_MS,
  weeklyTtlMs = DEFAULT_WEEKLY_TTL_MS,
} = {}) {
  // Task 167 (D-207): delegate to the compaction-state deep module. This is a
  // thin back-compat adapter — it maps the rich `{verdict, cronStale,
  // heartbeatAge}` return onto the legacy `{action, reason}` shape callers
  // (inject-context, runLazyCompress) already consume. The KEY behavior change
  // vs the old body: `cron-active` is now gated on heartbeat FRESHNESS (age), not
  // sentinel existence, so a dead cron falls through to the stale verdicts.
  const r = isCompactionNeeded({ projectRoot, now, dailyTtlMs, weeklyTtlMs });
  return { action: r.verdict, reason: r.reason, cronStale: r.cronStale, heartbeatAge: r.heartbeatAge };
}

function writeLazyLogEntry({ projectRoot, entry }) {
  const path = join(projectRoot, ...LAZY_LOG_REL);
  mkdirSync(join(projectRoot, ...LOCKS_REL), { recursive: true });
  appendFileSync(path, JSON.stringify(entry) + '\n', 'utf8');
  return path;
}

/**
 * Run the lazy-compress cycle. Dispatches to dailyDistill or weeklyCurate
 * based on detectStaleness verdict.
 *
 * @returns {Promise<object>}
 */
export async function runLazyCompress({
  projectRoot,
  backend,
  now,
  cooldownMs = DEFAULT_COOLDOWN_MS,
  dailyTtlMs = DEFAULT_DAILY_TTL_MS,
  weeklyTtlMs = DEFAULT_WEEKLY_TTL_MS,
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

  // Task 159 (D-169): sync the decision journal UNCONDITIONALLY, before any
  // compress gate. This is the SessionStart fallback path for sessions that never
  // cleanly closed (Claude Code fires SessionEnd only on clean window-close — the
  // Task-105/D-75 class), where the primary session-end sync never ran. It must
  // run regardless of the compress verdict (cooldown / cron-active / fresh) — a
  // cron-active or compress-fresh session can still have new decisions. Cheap pure
  // file I/O (~175ms), idempotent (a no-change run rewrites nothing), best-effort
  // (syncDecisionsJournal has its own try/catch + soft-error return). It does NOT
  // touch the Haiku cooldown — that gate is for the LLM compress passes only.
  // Door 4: log the outcome to lazy-compress.log so a silent fallback-path
  // failure (e.g. a DECISIONS.md permissions error) leaves a trace — the rest of
  // this function is fully NDJSON-observable, and the journal sync must be too.
  const journalResult = syncDecisionsJournal({ projectRoot, now: ts });
  writeLazyLogEntry({
    projectRoot,
    entry: {
      ts,
      scope: 'journal-sync',
      action: journalResult?.error ? 'error' : journalResult?.written ? 'written' : 'no-change',
      written: journalResult?.written ?? false,
      appended: journalResult?.appended ?? 0,
      ...(journalResult?.error ? { error: journalResult.error } : {}),
    },
  });

  // Cooldown gate up front — composes with shared 120s marker.
  if (isCooldownActive({ projectRoot, now: ts, cooldownMs })) {
    const duration_ms = Date.now() - t0;
    writeLazyLogEntry({
      projectRoot,
      entry: {
        ts,
        scope: 'lazy-compress',
        action: 'skipped',
        reason: 'cooldown',
        // M1 fix: include verdict + delegated_to with null sentinels so
        // every NDJSON entry shares the same schema (downstream `cmk
        // doctor` HC-6 parsing can rely on key presence). The Haiku
        // call was gated, so verdict was never computed and delegation
        // never happened.
        verdict: null,
        delegated_to: null,
        duration_ms,
      },
    });
    return { action: 'skipped', reason: 'cooldown', duration_ms };
  }

  const verdict = detectStaleness({
    projectRoot,
    now: ts,
    dailyTtlMs,
    weeklyTtlMs,
  });

  if (verdict.action === 'cron-active') {
    const duration_ms = Date.now() - t0;
    writeLazyLogEntry({
      projectRoot,
      entry: {
        ts,
        scope: 'lazy-compress',
        action: 'skipped',
        reason: 'cron-active',
        duration_ms,
      },
    });
    return { action: 'skipped', reason: 'cron-active', duration_ms };
  }

  if (verdict.action === 'no-context-dir' || verdict.action === 'fresh') {
    const duration_ms = Date.now() - t0;
    writeLazyLogEntry({
      projectRoot,
      entry: {
        ts,
        scope: 'lazy-compress',
        action: 'skipped',
        reason: verdict.reason,
        verdict: verdict.action,
        duration_ms,
      },
    });
    return { action: 'skipped', reason: verdict.reason, duration_ms };
  }

  // verdict.action is 'stale-now', 'stale-daily', or 'stale-weekly'.
  // Delegate to the matching pipeline stage, passing cooldownMs=0 because we
  // already gated above; the inner call shouldn't gate a second time on the
  // same marker. Task 105: 'stale-now' rolls now.md → today-*.md via
  // compressSession (the level the SessionEnd hook owns); the today→recent +
  // weekly levels cascade on the next SessionStart once now.md is drained.
  let result;
  let delegatedTo;
  if (verdict.action === 'stale-now') {
    delegatedTo = 'compress-session';
    result = await compressSession({
      projectRoot,
      backend,
      now: ts,
      cooldownMs: 0,
      // Task 161 / D-175: the lazy path is a DETACHED SessionStart child with NO 60s
      // hook ceiling, so it opts into the one retry the hook path can't afford. This
      // is where the SessionEnd-hook's failed roll (which restored now.md, D-79) gets
      // its real bounded retry.
      maxAttempts: 2,
      // Ceiling-free (detached child, no 60s ceiling) → the generous timeout + the 5s
      // backoff so a retry lands AFTER the slow-Haiku window (D-92/F-2 + D-179; matches
      // daily-distill / weekly-curate). compressSession forwards both to compressWithRetry.
      timeoutMs: CEILING_FREE_TIMEOUT_MS,
      baseBackoffMs: CEILING_FREE_BACKOFF_MS,
    });
  } else if (verdict.action === 'stale-weekly') {
    delegatedTo = 'weekly-curate';
    result = await weeklyCurate({
      projectRoot,
      backend,
      now: ts,
      cooldownMs: 0,
    });
  } else {
    delegatedTo = 'daily-distill';
    result = await dailyDistill({
      projectRoot,
      backend,
      now: ts,
      cooldownMs: 0,
    });
  }

  const duration_ms = Date.now() - t0;
  writeLazyLogEntry({
    projectRoot,
    entry: {
      ts,
      scope: 'lazy-compress',
      action: result?.action ?? 'unknown',
      verdict: verdict.action,
      delegated_to: delegatedTo,
      duration_ms,
      success: result?.action !== 'error',
      ...(result?.errorCategory ? { error_category: result.errorCategory } : {}),
      // compress-session reports its error via error_category (snake) — pass it
      // through too so the lazy log captures either shape.
      ...(result?.error_category ? { error_category: result.error_category } : {}),
    },
  });
  return {
    ...result,
    verdict: verdict.action,
    delegatedTo,
    duration_ms,
  };
}
