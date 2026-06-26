// Compaction-state deep module (Task 167, D-206/D-207).
//
// Owns the single question "does memory need compacting right now, and is the
// scheduled cron alive?" — replacing the old detectStaleness gating that
// short-circuited to 'cron-active' on the mere EXISTENCE of a cron-registered
// sentinel (so a registered-but-dead cron disabled the lazy roll and now.md grew
// unbounded — the v0.4.0 dogfood's 410 KB freeze).
//
// Two public methods (the deep interface — Q3):
//
//   isCompactionNeeded({projectRoot, now, dailyTtlMs?, weeklyTtlMs?})
//     → {verdict, cronStale, heartbeatAge}
//        verdict: 'fresh' | 'stale-now' | 'stale-daily' | 'stale-weekly'
//               | 'cron-active' | 'no-context-dir'
//        cronStale: boolean   — a cron IS registered but its heartbeat is stale
//        heartbeatAge: number|null — ms since the last cron run, null if no cron
//
//   recordCronHeartbeat({projectRoot, now})  — the ONLY writer; the cron bins
//     (cmk-daily-distill / cmk-weekly-curate) call it on each fire so the gate
//     keys off "a run HAPPENED recently" (age), not "a scheduler is registered"
//     (existence). The anacron model — see docs/research/2026-06-25-cron-liveness.
//
// Marker-vs-derive = HYBRID (Q2; the GNU make "Empty Target Files" rule): the
// now/daily/weekly verdicts are DERIVED from the artifacts the work already
// rewrites (now.md content, recent.md mtime, today-*.md dates — no new marker,
// ADR-0002); only cron-liveness gets a stamp, because no artifact expresses "is
// the background scheduler alive".

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';

export const DEFAULT_DAILY_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
export const DEFAULT_WEEKLY_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// The cron heartbeat is considered alive within ~2× the daily cron interval
// (the anacron model: a registered cron that hasn't run in 2 days is dead — the
// machine was asleep, the registration silently failed, etc.). 2× the 24h daily
// cadence gives one full grace period before the lazy roll takes over.
export const DEFAULT_HEARTBEAT_TTL_MS = 2 * DEFAULT_DAILY_TTL_MS; // 48 hours

const SESSIONS_REL = ['context', 'sessions'];
const NOW_MD_REL = ['context', 'sessions', 'now.md'];
const RECENT_MD_REL = ['context', 'sessions', 'recent.md'];
const HEARTBEAT_REL = ['context', '.locks', 'cron-heartbeat'];

const TODAY_RE = /^today-(\d{4}-\d{2}-\d{2})\.md$/;

/**
 * Path to the cron-heartbeat stamp. Public so register-crons.mjs + the cron bins
 * can write it without re-deriving the path.
 */
export function cronHeartbeatPath(projectRoot) {
  return join(projectRoot, ...HEARTBEAT_REL);
}

/**
 * Record that the scheduled cron actually RAN (the anacron stamp). The ONLY
 * writer of the heartbeat — called by the cron bins on each fire (success OR
 * benign no-op; "ran and did nothing" still proves the cron is alive). Best-effort
 * + atomic-enough (mkdir then touch); mtime is the load-bearing signal.
 */
export function recordCronHeartbeat({ projectRoot, now }) {
  if (!projectRoot) return;
  const marker = cronHeartbeatPath(projectRoot);
  mkdirSync(dirname(marker), { recursive: true });
  if (!existsSync(marker)) {
    writeFileSync(marker, '', 'utf8');
  }
  const ts = new Date(now ?? Date.now());
  try {
    utimesSync(marker, ts, ts);
  } catch {
    // utimes can fail on exotic filesystems; existence + a write timestamp are
    // the load-bearing signal, and writeFileSync already stamped it on create.
  }
}

/** ms since the cron last ran, or null if no cron heartbeat exists. */
function heartbeatAgeMs(projectRoot, nowMs) {
  const marker = cronHeartbeatPath(projectRoot);
  if (!existsSync(marker)) return null;
  try {
    return nowMs - statSync(marker).mtimeMs;
  } catch {
    return null;
  }
}

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

/**
 * The deep read: does memory need compacting, and is the cron alive?
 *
 * Verdict precedence (Q2): no-context-dir > stale-now > cron-active(fresh) >
 * stale-weekly > stale-daily > fresh. Note 'cron-active' NO LONGER short-circuits
 * above the bloat check — a stale-now (un-rolled prior-session content) ALWAYS
 * wins, because correctness > deferring to a possibly-dead cron ("we're in the
 * memory business", Q4). Only a FRESH cron defers the derived daily/weekly work.
 */
export function isCompactionNeeded({
  projectRoot,
  now,
  dailyTtlMs = DEFAULT_DAILY_TTL_MS,
  weeklyTtlMs = DEFAULT_WEEKLY_TTL_MS,
  heartbeatTtlMs = DEFAULT_HEARTBEAT_TTL_MS,
} = {}) {
  const nowMs = new Date(now ?? Date.now()).getTime();

  if (!projectRoot) {
    return { verdict: 'no-context-dir', reason: 'missing-project-root', cronStale: false, heartbeatAge: null };
  }

  // Cron liveness — by AGE, never existence (the 167.A fix). A registered cron
  // whose heartbeat is older than the TTL is DEAD; treat it as no cron so the
  // lazy roll takes over.
  const hbAge = heartbeatAgeMs(projectRoot, nowMs);
  const cronRegistered = hbAge !== null;
  const cronAlive = cronRegistered && hbAge < heartbeatTtlMs;
  const cronStale = cronRegistered && !cronAlive;

  const base = { cronStale, heartbeatAge: hbAge };

  const sessionsDir = join(projectRoot, ...SESSIONS_REL);
  if (!existsSync(sessionsDir)) {
    return { verdict: 'no-context-dir', reason: 'sessions-dir-missing', ...base };
  }

  // stale-now wins over cron-active (Q4): un-rolled now.md content must drain
  // THIS session regardless of whether a (possibly dead, possibly alive) cron is
  // registered — the correctness-over-deferral rule.
  if (nowMdHasContent(projectRoot)) {
    return { verdict: 'stale-now', reason: 'now-md-has-prior-session-content', ...base };
  }

  // A LIVE cron owns the remaining (daily/weekly) levels — defer to it.
  if (cronAlive) {
    return { verdict: 'cron-active', reason: 'cron-heartbeat-fresh', ...base };
  }

  const files = listTodayFiles(projectRoot);

  // Weekly: any today-*.md older than weeklyTtlMs by its date stamp.
  const weeklyCutoffMs = nowMs - weeklyTtlMs;
  const hasOldToday = files.some((f) => {
    const fileMs = new Date(f.date + 'T00:00:00Z').getTime();
    return Number.isFinite(fileMs) && fileMs < weeklyCutoffMs;
  });
  if (hasOldToday) {
    return { verdict: 'stale-weekly', reason: 'today-file-older-than-7d', ...base };
  }

  // No today files at all → nothing to compress → fresh (Task 36 I1).
  if (files.length === 0) {
    return { verdict: 'fresh', reason: 'no-input', ...base };
  }

  // Daily: recent.md missing OR older than dailyTtlMs.
  const mtimeMs = recentMdMtimeMs(projectRoot);
  if (mtimeMs === null) {
    return { verdict: 'stale-daily', reason: 'recent-md-missing', ...base };
  }
  if (nowMs - mtimeMs > dailyTtlMs) {
    return { verdict: 'stale-daily', reason: 'recent-md-older-than-ttl', ...base };
  }
  return { verdict: 'fresh', reason: 'within-ttl', ...base };
}
