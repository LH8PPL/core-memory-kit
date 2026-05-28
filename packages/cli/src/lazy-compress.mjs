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
  writeFileSync,
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

const DEFAULT_DAILY_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const DEFAULT_WEEKLY_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const SESSIONS_REL = ['context', 'sessions'];
const LOCKS_REL = ['context', '.locks'];
const RECENT_MD_REL = ['context', 'sessions', 'recent.md'];
const CRON_SENTINEL_REL = ['context', '.locks', 'cron-registered'];
const LAZY_LOG_REL = ['context', '.locks', 'lazy-compress.log'];

const TODAY_RE = /^today-(\d{4}-\d{2}-\d{2})\.md$/;

/**
 * Path helper for the cron-registered sentinel marker file. Public so
 * register-crons.mjs can write/remove it without re-deriving the path.
 */
export function cronSentinelPath(projectRoot) {
  return join(projectRoot, ...CRON_SENTINEL_REL);
}

/**
 * Write the cron-registered sentinel marker. Called by registerCron
 * after a successful host-scheduler registration.
 */
export function markCronRegistered({ projectRoot }) {
  if (!projectRoot) return;
  const locksDir = join(projectRoot, ...LOCKS_REL);
  mkdirSync(locksDir, { recursive: true });
  writeFileSync(cronSentinelPath(projectRoot), nowIso() + '\n', 'utf8');
}

/**
 * Remove the cron-registered sentinel marker. Called by unregisterCron.
 * Best-effort — if the marker is missing, that's already the desired state.
 */
export function unmarkCronRegistered({ projectRoot }) {
  if (!projectRoot) return;
  const path = cronSentinelPath(projectRoot);
  if (existsSync(path)) {
    try {
      unlinkSync(path);
    } catch {
      // best-effort
    }
  }
}

function listTodayFiles(projectRoot) {
  const sessionsDir = join(projectRoot, ...SESSIONS_REL);
  if (!existsSync(sessionsDir)) return [];
  const matches = [];
  for (const name of readdirSync(sessionsDir)) {
    const m = TODAY_RE.exec(name);
    if (!m) continue;
    matches.push({ name, date: m[1], path: join(sessionsDir, name) });
  }
  return matches;
}

function recentMdMtimeMs(projectRoot) {
  const p = join(projectRoot, ...RECENT_MD_REL);
  if (!existsSync(p)) return null;
  try {
    return statSync(p).mtimeMs;
  } catch {
    return null;
  }
}

/**
 * Cheap inline staleness check. Runs in <5ms — one stat + a few existsSync.
 *
 * Verdict semantics:
 *   - 'cron-active'   : sentinel exists; cron will handle staleness. No-op.
 *   - 'no-context-dir': context/sessions/ doesn't exist. No-op (kit not installed).
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
  if (!projectRoot) {
    return { action: 'no-context-dir', reason: 'missing-project-root' };
  }
  // Cron sentinel short-circuits everything.
  if (existsSync(cronSentinelPath(projectRoot))) {
    return { action: 'cron-active', reason: 'cron-sentinel-present' };
  }
  const sessionsDir = join(projectRoot, ...SESSIONS_REL);
  if (!existsSync(sessionsDir)) {
    return { action: 'no-context-dir', reason: 'sessions-dir-missing' };
  }

  const ts = now ?? nowIso();
  const nowMs = new Date(ts).getTime();
  const files = listTodayFiles(projectRoot);

  // Weekly check: any today-*.md older than weeklyTtlMs by its date stamp
  // (NOT mtime — the file's date is the canonical age signal; mtime can
  // drift if someone touched the file).
  const weeklyCutoffMs = nowMs - weeklyTtlMs;
  const hasOldToday = files.some((f) => {
    const fileMs = new Date(f.date + 'T00:00:00Z').getTime();
    return Number.isFinite(fileMs) && fileMs < weeklyCutoffMs;
  });
  if (hasOldToday) {
    return { action: 'stale-weekly', reason: 'today-file-older-than-7d' };
  }

  // Daily check: recent.md missing OR older than dailyTtlMs.
  const mtimeMs = recentMdMtimeMs(projectRoot);
  if (mtimeMs === null) {
    // recent.md missing AND we have today-*.md files → daily-distill needed.
    // If we also have no today files, there's nothing to compress.
    if (files.length === 0) {
      return { action: 'fresh', reason: 'no-input' };
    }
    return { action: 'stale-daily', reason: 'recent-md-missing' };
  }
  if (nowMs - mtimeMs > dailyTtlMs) {
    return { action: 'stale-daily', reason: 'recent-md-older-than-ttl' };
  }
  return { action: 'fresh', reason: 'within-ttl' };
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

  // verdict.action is 'stale-daily' or 'stale-weekly'.
  // Delegate to the appropriate cycle, passing cooldownMs=0 because we
  // already gated above; the inner call shouldn't gate a second time on
  // the same marker (which they would not touch yet).
  let result;
  if (verdict.action === 'stale-weekly') {
    result = await weeklyCurate({
      projectRoot,
      backend,
      now: ts,
      cooldownMs: 0,
    });
  } else {
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
      delegated_to: verdict.action === 'stale-weekly' ? 'weekly-curate' : 'daily-distill',
      duration_ms,
      success: result?.action !== 'error',
      ...(result?.errorCategory ? { error_category: result.errorCategory } : {}),
    },
  });
  return {
    ...result,
    verdict: verdict.action,
    delegatedTo:
      verdict.action === 'stale-weekly' ? 'weekly-curate' : 'daily-distill',
    duration_ms,
  };
}
