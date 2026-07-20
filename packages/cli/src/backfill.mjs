// Git-history backfill (Task 174, D-215/D-372) — reconstruct a working day's
// session log when commits exist but no `sessions/today-{date}.md` was written.
//
// WHY THIS EXISTS (measured, not assumed)
// ---------------------------------------
// `daily-distill` only compresses what is ALREADY in `now.md`. Nothing ever
// goes back and fills a day the capture path missed — a Stop-hook misfire, a
// crashed session, or a day worked entirely in another tool. Probed on the
// kit's own repo before building: **15 of 40 dogfood days (37.5%) have commits
// but NO session record.** Every one is durable work the memory has no trace
// of — the kit's core promise failing quietly on its own repository.
//
// THE AUTOMATIC PATH IS THE DELIVERABLE (D-169)
// ---------------------------------------------
// `cmk backfill` is the manual OVERRIDE. The real fix is the sweep on the
// `daily-distill` cron: the gap gets filled with no user command. A feature
// whose only path is a command a user must remember to run is the exact
// failure D-169 names.
//
// HONESTY CONTRACT
// ----------------
// A reconstruction is NOT a captured session. Every backfilled day carries
// BACKFILL_MARKER so a reader (and any later curation pass) can tell a
// git-derived summary from something the kit actually observed. And a REAL
// log always wins: backfill never overwrites one.
//
// Idea borrowed from awrshift/claude-memory-kit's `/close-day` (D-215); the
// automatic sweep + the never-overwrite rule are ours.

import { existsSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { compareCodeUnits } from './audit-log.mjs';

const SESSIONS_REL = ['context', 'sessions'];

// Stamped into every reconstructed day file. Load-bearing: it is both the
// honesty signal to a reader AND the idempotency key (a day already carrying
// it is not a gap).
export const BACKFILL_MARKER =
  '<!-- cmk: reconstructed from git history — not a captured session (Task 174) -->';

// Bound the sweep. A long-neglected repo must not stall the cron: each run
// does a bounded slice and reports what remains (the ADR-0020 incremental
// rule — persist as you go, resume next run).
export const DEFAULT_WINDOW_DAYS = 14;
export const DEFAULT_MAX_PER_RUN = 3;

// Every git read is bounded (design §8.5). This runs on the distill cron, so an
// unbounded `git log` on a pathological repo would hang the cron itself — the
// exact starvation class D-298 documented. Generous enough for a large history,
// short enough that a hang degrades to "no backfill this pass" rather than a
// wedged cron (the whole module is fail-open).
const GIT_TIMEOUT_MS = 10_000;

const TODAY_RE = /^today-(\d{4}-\d{2}-\d{2})\.md$/;
const ISO_DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

function sessionsDir(projectRoot) {
  return join(projectRoot, ...SESSIONS_REL);
}

function dayFilePath(projectRoot, date) {
  return join(sessionsDir(projectRoot), `today-${date}.md`);
}

/** Dates that already have a day file, and whether each is a real capture. */
function existingDayFiles(projectRoot) {
  const out = new Map();
  const dir = sessionsDir(projectRoot);
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const m = TODAY_RE.exec(name);
    if (!m) continue;
    let body = '';
    try {
      body = readFileSync(join(dir, name), 'utf8');
    } catch {
      /* unreadable — treat as present so we never clobber it */
    }
    out.set(m[1], { backfilled: body.includes(BACKFILL_MARKER) });
  }
  return out;
}

/**
 * Days (YYYY-MM-DD) with commits inside the window. Fail-open: a non-repo, a
 * missing git, or any git error yields [] rather than throwing — this runs on
 * a cron and must never wedge it.
 *
 * @param {string} projectRoot
 * @param {number} windowDays
 * @returns {string[]} unique dates, newest first
 */
export function commitDays(projectRoot, windowDays = DEFAULT_WINDOW_DAYS) {
  try {
    const out = execFileSync(
      'git',
      ['log', `--since=${windowDays}.days.ago`, '--date=short', '--format=%ad'],
      { cwd: projectRoot, encoding: 'utf8', windowsHide: true, timeout: GIT_TIMEOUT_MS, stdio: ['ignore', 'pipe', 'ignore'] },
    );
    const days = out.split(/\r?\n/).map((l) => l.trim()).filter((l) => ISO_DAY_RE.test(l));
    // Explicit code-unit comparator (sonar S2871). Deliberately NOT
    // localeCompare: these are ISO-8601 day keys, and locale collation would
    // make the resume order machine-dependent. Code-unit order on ISO dates IS
    // chronological order, and it is identical on every machine.
    return [...new Set(days)].sort(compareCodeUnits).reverse();
  } catch {
    return [];
  }
}

/**
 * The gaps: days with commits but no session log at all.
 *
 * A day already carrying BACKFILL_MARKER is NOT a gap (idempotency), and a day
 * with a real log is NOT a gap (real always wins).
 *
 * @param {object} a
 * @param {string} a.projectRoot
 * @param {number} [a.windowDays]
 * @returns {Array<{date: string}>} newest first
 */
export function findBackfillGaps({ projectRoot, windowDays = DEFAULT_WINDOW_DAYS } = {}) {
  if (!projectRoot) return [];
  const have = existingDayFiles(projectRoot);
  return commitDays(projectRoot, windowDays)
    .filter((date) => !have.has(date))
    .map((date) => ({ date }));
}

/** That day's commit subjects + stat summary — the reconstruction input. */
function commitEvidence(projectRoot, date) {
  try {
    return execFileSync(
      'git',
      [
        'log',
        `--since=${date} 00:00:00`,
        `--until=${date} 23:59:59`,
        '--date=short',
        '--format=%h %s',
        '--stat',
      ],
      { cwd: projectRoot, encoding: 'utf8', windowsHide: true, timeout: GIT_TIMEOUT_MS, stdio: ['ignore', 'pipe', 'ignore'] },
    ).slice(0, 20000); // bound the summarize input (the D-355 64MB lesson)
  } catch {
    return '';
  }
}

function buildPrompt(date, evidence) {
  return [
    `Reconstruct a short work log for ${date} from these git commits.`,
    'Write only what the commits support — never invent motivation, discussion, or decisions',
    'that are not evidenced. If the commits are trivial, say so briefly.',
    '',
    'Format: markdown with `## Decisions` and/or `## Changes` headings, terse bullets.',
    '',
    'COMMITS:',
    evidence,
  ].join('\n');
}

/**
 * Fill the gaps. Bounded per run; persists each day as it completes so a killed
 * run keeps its progress (ADR-0020).
 *
 * @param {object} a
 * @param {string}  a.projectRoot
 * @param {object}  a.backend      CompressorBackend ({compress(text) → string})
 * @param {number} [a.windowDays]
 * @param {number} [a.maxPerRun]
 * @returns {Promise<{backfilled: string[], failed: string[], remaining: number, skipped: string[]}>}
 */
export async function runBackfill({
  projectRoot,
  backend,
  windowDays = DEFAULT_WINDOW_DAYS,
  maxPerRun = DEFAULT_MAX_PER_RUN,
} = {}) {
  const result = { backfilled: [], failed: [], remaining: 0, skipped: [] };
  if (!projectRoot) return result;
  if (!backend || typeof backend.compress !== 'function') {
    result.skipped.push('no-backend');
    return result;
  }

  const gaps = findBackfillGaps({ projectRoot, windowDays });
  const slice = gaps.slice(0, Math.max(0, maxPerRun));
  result.remaining = Math.max(0, gaps.length - slice.length);

  for (const { date } of slice) {
    const evidence = commitEvidence(projectRoot, date);
    if (!evidence.trim()) {
      result.skipped.push(date);
      continue;
    }
    let summary;
    try {
      summary = await backend.compress(buildPrompt(date, evidence));
    } catch {
      // Nothing is written on failure — a half-file would be a lie on disk.
      result.failed.push(date);
      continue;
    }
    if (!summary || !String(summary).trim()) {
      result.failed.push(date);
      continue;
    }

    // Re-check immediately before writing: a real capture may have landed
    // while we were summarizing. REAL ALWAYS WINS.
    const path = dayFilePath(projectRoot, date);
    if (existsSync(path)) {
      result.skipped.push(date);
      continue;
    }
    writeFileSync(path, `${BACKFILL_MARKER}\n\n${String(summary).trim()}\n`, 'utf8');
    result.backfilled.push(date);
  }

  return result;
}
