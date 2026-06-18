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
  readFileSync,
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
import { compressSession } from './compress-session.mjs';
import { syncDecisionsJournal } from './decisions-journal.mjs';

const DEFAULT_DAILY_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const DEFAULT_WEEKLY_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const SESSIONS_REL = ['context', 'sessions'];
const LOCKS_REL = ['context', '.locks'];
const NOW_MD_REL = ['context', 'sessions', 'now.md'];
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

// Task 105 (D-75): does now.md carry prior-session content? The now→today
// roll (compressSession) fires only at SessionEnd, and Claude Code fires
// SessionEnd ONLY on a clean window-close — so a never-cleanly-closed session
// leaves now.md growing unbounded with no today-*.md/recent.md built. We detect
// a non-empty now.md at SessionStart and let the lazy worker roll it. At
// SessionStart now.md can only hold PRIOR-session turns (this session's
// capture-turn writes haven't fired yet), so non-empty ⇒ stale. Emptiness must
// match compressSession's own `buffer.trim() === ''` check so the spawn verdict
// and the actual roll agree (else we'd spawn for a roll that immediately skips).
function nowMdHasContent(projectRoot) {
  const p = join(projectRoot, ...NOW_MD_REL);
  if (!existsSync(p)) return false;
  try {
    return readFileSync(p, 'utf8').trim() !== '';
  } catch {
    return false;
  }
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

  // Task 105 (D-75): a non-empty now.md is the now→today roll the SessionEnd
  // hook would have done. It takes PRECEDENCE over daily/weekly because it's
  // the FIRST pipeline level (now → today → recent → archive) — roll it this
  // SessionStart; the today→recent + weekly levels cascade on subsequent
  // SessionStarts once now.md is drained. (cron-active above still wins — a
  // registered cron owns the whole pipeline.)
  if (nowMdHasContent(projectRoot)) {
    return { action: 'stale-now', reason: 'now-md-has-prior-session-content' };
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

  // Task 36 I1 fix: if there are NO today-*.md files at all, the
  // pipeline has nothing to compress — return fresh regardless of
  // recent.md mtime. Previously this check only fired when recent.md
  // was MISSING; for the stale-but-no-input case (e.g., right after
  // weeklyCurate archived every today file), the daily-stale branch
  // would fire and the SessionStart hook would spawn lazy-compress
  // forever (no new today file means no work; dailyDistill would
  // return skipped:no-input but not touch recent.md, so the next
  // SessionStart sees the same stale verdict).
  if (files.length === 0) {
    return { action: 'fresh', reason: 'no-input' };
  }

  // Daily check: recent.md missing OR older than dailyTtlMs.
  const mtimeMs = recentMdMtimeMs(projectRoot);
  if (mtimeMs === null) {
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
