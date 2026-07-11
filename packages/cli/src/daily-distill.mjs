// Daily distill (Task 33, T-028).
//
// Reads the last 7 days of `context/sessions/today-{date}.md`, sends
// them to Haiku as a single consolidation prompt, and writes the
// distilled summary to `context/sessions/recent.md`. Honors the kit's
// 120s Haiku cooldown via the shared `cooldown.mjs` module.
//
// Public boundary: `dailyDistill({projectRoot, backend, now, cooldownMs?, maxOutputBytes?})`.
//
// Composes on top of:
//   - cooldown.mjs (Task 28 B2 + Task 22) — shared `isCooldownActive` /
//     `touchCooldownMarker` to honor the kit's 120s Haiku budget
//   - compressor.mjs (Task 22) — CompressorBackend interface; the bin
//     wrapper passes HaikuViaAnthropicApi
//   - result-shapes.mjs — errorResult + ERROR_CATEGORIES
//
// Per design §1.4 + §8.1 + tasks.md 33.

import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { nowIso } from './audit-log.mjs';
import { ERROR_CATEGORIES } from './result-shapes.mjs';
import { HaikuTimeoutError } from './compressor.mjs';
import { compressWithRetry, CEILING_FREE_TIMEOUT_MS, CEILING_FREE_BACKOFF_MS } from './compress-retry.mjs';
import {
  DEFAULT_COOLDOWN_MS,
  isCooldownActive,
  touchCooldownMarker,
} from './cooldown.mjs';
import { autoDrainQueues } from './auto-drain.mjs';

const DEFAULT_MAX_OUTPUT_BYTES = 4096;
const SESSIONS_REL = ['context', 'sessions'];
const RECENT_MD_REL = ['context', 'sessions', 'recent.md'];

// Match `today-YYYY-MM-DD.md` exactly so other files in sessions/ don't
// get pulled into the distill (e.g., now.md, *.compress.log, *.extract.log).
const TODAY_RE = /^today-(\d{4}-\d{2}-\d{2})\.md$/;

function buildDistillInstructions(maxOutputBytes) {
  return [
    'You are a memory consolidator for claude-memory-kit. Your task is to combine the daily session summaries below into a single weekly-or-shorter rolling summary.',
    '',
    'Output ONLY the consolidated Markdown. Do not write preamble. Do not acknowledge the task. Begin your response with the first section heading.',
    '',
    'REQUIRED FORMAT (emit headings exactly, in this order; omit any heading whose section would have no entries):',
    '',
    '## Decisions',
    '- <one bullet per concrete decision across all days, ≤80 chars>',
    '',
    '## Open Questions',
    '- <one bullet per unresolved question, ≤80 chars>',
    '',
    '## Active Threads',
    '- <one bullet per active work-in-progress thread, ≤80 chars>',
    '',
    'HARD RULES:',
    '  1. Every bullet must be grounded in the daily summaries below. Do not infer or add any fact not explicitly present in them. When the summaries show a fact was later corrected, replaced, or reversed, keep ONLY the latest version of that fact — never list the superseded one alongside it (this resolves contradictions, NOT coexisting facts on different points). If unsure, omit it.',
    '  2. Preserve every citation ID matching /#[ULP]-[A-Z0-9]{6,8}/ verbatim. Never invent new IDs.',
    `  3. Total output ≤ ${maxOutputBytes} bytes.`,
    '  4. If a section has no entries, omit the heading entirely.',
    '  5. No prose around the headings — only the bulleted list per section.',
    '  6. Deduplicate aggressively: if the same decision appears across multiple days, list it ONCE.',
    '  7. Your output goes directly into the next session\'s memory. Do not address the user, do not refer to yourself.',
    '',
    '=== BEGIN DAILY SUMMARIES TO CONSOLIDATE ===',
  ].join('\n');
}

function listTodayFiles(projectRoot, now) {
  const sessionsDir = join(projectRoot, ...SESSIONS_REL);
  if (!existsSync(sessionsDir)) return [];
  const cutoffMs = new Date(now).getTime() - 7 * 24 * 60 * 60 * 1000;
  const matches = [];
  for (const name of readdirSync(sessionsDir)) {
    const m = TODAY_RE.exec(name);
    if (!m) continue;
    const fileDate = m[1];
    const fileMs = new Date(fileDate + 'T00:00:00Z').getTime();
    if (Number.isFinite(fileMs) && fileMs >= cutoffMs) {
      matches.push({ name, date: fileDate, path: join(sessionsDir, name) });
    }
  }
  // Chronological order (oldest first) so Haiku sees days in sequence.
  matches.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return matches;
}

function readBuffer(files) {
  return files
    .map((f) => `## ${f.date}\n\n${readFileSync(f.path, 'utf8')}`)
    .join('\n\n');
}

// --- Resumability (Task 204 / ADR-0020) ---------------------------------
//
// The pre-204 distill read ALL 7 days into one compress() and wrote recent.md
// at the end — all-or-nothing: a run killed at day 4 of 7 lost everything and
// re-did the whole (larger) corpus next run (D-298: recent.md 5 days stale, the
// cron killed mid-compress five nights running with zero forward progress).
//
// The resumable design: distill each today-<date>.md into a per-day artifact
// today-<date>.distilled.md AS WE GO (persisted immediately — a killed run
// keeps every day it finished), then assemble recent.md from those artifacts.
// The resume point is DERIVED FROM THE ARTIFACTS (ADR-0002: no new sentinel):
// a day whose .distilled.md exists AND is at least as new as its today-*.md is
// already done and skipped. A run killed after 3 of 7 keeps those 3; the next
// run does the remaining 4. Safe because today-*.md is a derived buffer over
// the durable transcript tier (P-6M26BR9S) — re-runs never corrupt truth.

// today-YYYY-MM-DD.distilled.md — the per-day resumable artifact.
function distilledDayPath(projectRoot, date) {
  return join(projectRoot, ...SESSIONS_REL, `today-${date}.distilled.md`);
}

// A day is already-distilled iff its .distilled.md exists AND is at least as new
// as the source today-*.md (an edited source day re-distills). mtime is the
// artifact-derived resume signal — no separate watermark file.
function dayNeedsDistill(projectRoot, file) {
  const outPath = distilledDayPath(projectRoot, file.date);
  if (!existsSync(outPath)) return true;
  try {
    return statSync(outPath).mtimeMs < statSync(file.path).mtimeMs;
  } catch {
    return true; // stat failure → safest is to re-distill
  }
}

function readDistilledDay(projectRoot, date) {
  const p = distilledDayPath(projectRoot, date);
  try {
    return existsSync(p) ? readFileSync(p, 'utf8') : '';
  } catch {
    return '';
  }
}

// Assemble recent.md from the per-day distilled artifacts (chronological),
// each under its `## <date>` heading. This is the resumable output — it reflects
// exactly the days completed so far, so a partial run still produces a valid
// (shorter) recent.md rather than nothing.
//
// Capped to maxOutputBytes (skill-review D-313): the per-day budget alone does
// NOT bound the assembled whole (n days × perDay + headers can exceed the cap,
// and the 512-byte per-day floor defeats it outright for many-section weeks).
// recent.md's whole role is a BOUNDED rolling summary, so re-cap here by
// dropping the OLDEST `## <date>` sections first (newest days are the most
// relevant to the next session) until the whole fits. A single section that
// itself exceeds the cap is kept (truncating mid-section would corrupt it — the
// per-day budget already bounds an individual day).
function assembleRecent(projectRoot, files, maxOutputBytes = DEFAULT_MAX_OUTPUT_BYTES) {
  const sections = files
    .map((f) => {
      const body = readDistilledDay(projectRoot, f.date).trim();
      return body ? `## ${f.date}\n\n${body}` : '';
    })
    .filter(Boolean);
  if (sections.length === 0) return '';
  // Drop oldest-first (sections are chronological, oldest at index 0) until the
  // joined output fits. Never drop the last (newest) section.
  let kept = sections;
  while (
    kept.length > 1 &&
    Buffer.byteLength(kept.join('\n\n') + '\n', 'utf8') > maxOutputBytes
  ) {
    kept = kept.slice(1);
  }
  return kept.join('\n\n') + '\n';
}

function distillLogPath(projectRoot, date) {
  return join(projectRoot, ...SESSIONS_REL, `${date}.distill.log`);
}

function writeDistillLogEntry({ projectRoot, date, entry }) {
  const path = distillLogPath(projectRoot, date);
  mkdirSync(join(projectRoot, ...SESSIONS_REL), { recursive: true });
  appendFileSync(path, JSON.stringify(entry) + '\n', 'utf8');
  return path;
}

function recentMdPath(projectRoot) {
  return join(projectRoot, ...RECENT_MD_REL);
}

/**
 * Run the daily distill cycle.
 *
 * @returns {Promise<object>} action: 'distilled' | 'skipped' | 'error'
 */
export async function dailyDistill({
  projectRoot,
  backend,
  now,
  cooldownMs = DEFAULT_COOLDOWN_MS,
  maxOutputBytes = DEFAULT_MAX_OUTPUT_BYTES,
  skipDrain = false,
} = {}) {
  const ts = now ?? nowIso();
  const date = ts.slice(0, 10);
  const t0 = Date.now();

  if (!projectRoot) {
    return { action: 'error', error_category: ERROR_CATEGORIES.MISSING_PROJECT_ROOT };
  }
  if (!backend || typeof backend.compress !== 'function') {
    return { action: 'error', error_category: ERROR_CATEGORIES.MISSING_BACKEND };
  }

  // Project must be installed (sessions/ exists). If not, no-op silently.
  const sessionsDir = join(projectRoot, ...SESSIONS_REL);
  if (!existsSync(sessionsDir)) {
    return { action: 'skipped', reason: 'no-context-dir', duration_ms: Date.now() - t0 };
  }

  // Auto-drain the project-tier review + conflict queues (v0.2 Phase 2, D-6).
  // Non-Haiku file IO — runs on EVERY pass regardless of the Haiku cooldown
  // below, so queues drain even when the distill itself is cooled down.
  // skipDrain: weeklyCurate calls dailyDistill internally AFTER it already
  // drained, so it passes skipDrain to avoid a redundant (idempotent) drain.
  const drained = skipDrain ? null : await autoDrainQueues({ tier: 'P', projectRoot });

  // Cooldown gate per design §8.2.
  if (isCooldownActive({ projectRoot, now: ts, cooldownMs })) {
    const duration_ms = Date.now() - t0;
    const entry = {
      ts, scope: 'daily-distill',
      input_bytes: 0, output_bytes: 0,
      model_id: typeof backend.modelId === 'function' ? backend.modelId() : null,
      cost_usd: 0, duration_ms, success: true, skipped_reason: 'cooldown',
    };
    writeDistillLogEntry({ projectRoot, date, entry });
    return { action: 'skipped', reason: 'cooldown', drained, duration_ms };
  }

  // Read last 7 days of today-*.md.
  const files = listTodayFiles(projectRoot, ts);
  if (files.length === 0) {
    // Task 36 Door-4 fix (skill-review during checkpoint, 2026-05-28):
    // emit an NDJSON entry on the no-input skip path so ops have
    // observability + so the spawn-smoke chain test can prove
    // projectRoot was correctly resolved from argv. Same posture as
    // weekly-curate's no-old-files path.
    const duration_ms = Date.now() - t0;
    writeDistillLogEntry({
      projectRoot,
      date,
      entry: {
        ts,
        scope: 'daily-distill',
        input_bytes: 0,
        output_bytes: 0,
        model_id: null,
        cost_usd: 0,
        duration_ms,
        success: true,
        skipped_reason: 'no-input',
      },
    });
    return { action: 'skipped', reason: 'no-input', drained, duration_ms };
  }

  const input_bytes = files.reduce(
    (n, f) => n + Buffer.byteLength(readFileSync(f.path, 'utf8'), 'utf8'),
    0,
  );
  // Per-day output budget: split the total across the days (a floor of 512 keeps
  // a single day usable). This bounds each DAY; the assembled recent.md is
  // separately re-capped to maxOutputBytes by assembleRecent (drop-oldest-first)
  // — the floor means n×512 can exceed the cap, so the assembly-time cap is the
  // real bound, not this per-day split (skill-review D-313: the earlier comment
  // claimed a "final consolidation pass" that didn't exist; assembleRecent now IS it).
  const perDayMaxBytes = Math.max(512, Math.floor(maxOutputBytes / files.length));
  const dayInstructions = buildDistillInstructions(perDayMaxBytes);

  mkdirSync(join(projectRoot, ...SESSIONS_REL), { recursive: true });

  // --- Resumable per-day distill (Task 204 / ADR-0020) -------------------
  // Distill each day that isn't already done, persisting today-<date>.distilled.md
  // AS WE GO so a kill/timeout mid-loop keeps every completed day. Resume = skip
  // days whose artifact is already fresh (dayNeedsDistill, artifact-mtime-derived).
  let retries = 0; // Task 161.12: count retries so the log shows the retry RATE.
  let distilledThisRun = 0;
  let skippedResumed = 0;
  for (const f of files) {
    if (!dayNeedsDistill(projectRoot, f)) {
      skippedResumed += 1; // already done in a prior (possibly killed) run
      continue;
    }
    let result;
    try {
      // Task 161 / D-175: ceiling-free path (cron/detached child, NO 60s hook
      // ceiling) → bounded transient-only retry, one day at a time. A killed run
      // between days keeps the days already written — the D-298 starvation fix.
      result = await compressWithRetry(
        backend,
        {
          input: `## ${f.date}\n\n${readFileSync(f.path, 'utf8')}`,
          instructions: dayInstructions,
          preserveCitationIds: true,
          maxOutputBytes: perDayMaxBytes,
          // Ceiling-free (cron / detached lazy child, NO 60s hook ceiling) → the
          // generous ceiling-free timeout, NOT the hook-sized 50s (D-92/F-2 + D-179).
          timeoutMs: CEILING_FREE_TIMEOUT_MS,
        },
        // 5s backoff between the 2 attempts (NOT the 600ms default) so a retry lands
        // AFTER the transient slow-Haiku window, not inside it (D-179).
        { maxAttempts: 2, baseBackoffMs: CEILING_FREE_BACKOFF_MS, onRetry: () => { retries += 1; } },
      );
      touchCooldownMarker({ projectRoot, now: ts });
    } catch (err) {
      touchCooldownMarker({ projectRoot, now: ts });
      const errorCategory =
        err instanceof HaikuTimeoutError
          ? ERROR_CATEGORIES.HAIKU_TIMEOUT
          : ERROR_CATEGORIES.COMPRESS_FAILED;
      const duration_ms = Date.now() - t0;
      writeDistillLogEntry({
        projectRoot, date,
        entry: {
          ts, scope: 'daily-distill', input_bytes, output_bytes: 0,
          model_id: typeof backend.modelId === 'function' ? backend.modelId() : null,
          cost_usd: 0, duration_ms, success: false, error_category: errorCategory,
          // Task 204: the day that failed + the days already banked this run — a
          // failure now leaves FORWARD PROGRESS (the resumable property, observable).
          failed_day: f.date,
          distilled_this_run: distilledThisRun,
          skipped_resumed: skippedResumed,
          // Task 161 (D-173 observability): structured failure reason.
          ...(err?.exitCode != null ? { exit_code: err.exitCode } : {}),
          ...(err?.stderr ? { error_detail: String(err.stderr).slice(0, 500) } : {}),
          ...(retries > 0 ? { retries } : {}),
        },
      });
      // Assemble recent.md from whatever days ARE done (incl. this run's banked
      // days + prior-run artifacts) BEFORE returning the error — so a partial
      // run still advances recent.md's freshness instead of leaving it stale.
      const partial = assembleRecent(projectRoot, files, maxOutputBytes);
      const recentPath = recentMdPath(projectRoot);
      if (partial.trim()) writeFileSync(recentPath, partial, 'utf8');
      return {
        action: 'error', error_category: errorCategory, duration_ms,
        errorMessage: err?.message ?? String(err),
        distilledThisRun, skippedResumed,
        // partial forward progress: recent.md reflects the completed days.
        outputPath: partial.trim() ? recentPath : undefined,
      };
    }
    // Persist THIS day's distilled artifact immediately (the 80%-survives write).
    // Skill-review (D-313): only bank a NON-EMPTY result. A backend that returns
    // empty/whitespace (a soft hiccup, not an error) must NOT write a blank
    // artifact — dayNeedsDistill would then see it as "done" and skip the day
    // forever, silently dropping it from recent.md. An empty result leaves no
    // artifact → the day re-distills next run (treated like a transient miss).
    const dayOut = (result?.outputText ?? '').trim();
    if (dayOut) {
      writeFileSync(distilledDayPath(projectRoot, f.date), dayOut + '\n', 'utf8');
      distilledThisRun += 1;
    }
  }

  // --- Assemble recent.md from the per-day artifacts ---------------------
  // recent.md is the chronological concatenation of the per-day distilled
  // summaries (each under `## <date>`), re-capped to maxOutputBytes. A run that
  // only completed some days still produces a valid, fresher recent.md — never
  // nothing (the D-298 fix).
  const output = assembleRecent(projectRoot, files, maxOutputBytes);
  const output_bytes = Buffer.byteLength(output, 'utf8');
  const path = recentMdPath(projectRoot);
  writeFileSync(path, output, 'utf8');

  const duration_ms = Date.now() - t0;
  writeDistillLogEntry({
    projectRoot, date,
    entry: {
      ts, scope: 'daily-distill', input_bytes, output_bytes,
      model_id:
        typeof backend.modelId === 'function' ? backend.modelId() : null,
      cost_usd: 0,
      duration_ms, success: true, source_days: files.length,
      // Task 204: how many days this run actually distilled vs resumed-skipped —
      // makes the resumability observable in the NDJSON trail.
      distilled_this_run: distilledThisRun,
      skipped_resumed: skippedResumed,
      ...(retries > 0 ? { retries } : {}), // 161.12: succeeded after a transient retry
    },
  });
  return {
    action: 'distilled',
    outputPath: path,
    bytesIn: input_bytes,
    bytesOut: output_bytes,
    sourceDays: files.length,
    distilledThisRun,
    skippedResumed,
    drained,
    duration_ms,
  };
}
