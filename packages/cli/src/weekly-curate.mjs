// Weekly curate (Task 34, T-029).
//
// Companion to Task 33's daily-distill. Once a week (cron-scheduled
// at Sun 09:00 per §1.4), rotate every today-{YYYY-MM-DD}.md older
// than 7 days into archive.md, dedupe bullets across days, and
// rebuild recent.md from the current week's files via dailyDistill.
//
// Public boundary:
//   weeklyCurate({projectRoot, backend, now, cooldownMs?,
//                 archiveMaxBytes?, recentMaxBytes?, skipRecentRebuild?})
//     → {action: 'curated' | 'skipped' | 'error', archivedDays?,
//        currentDays?, archivedPath?, recentPath?, bytesIn?, bytesOut?,
//        duration_ms, errorCategory?, errors?}
//
// Composes on:
//   - cooldown.mjs — shared 120s Haiku gate (same marker daily-distill /
//     compress-session / auto-extract touch)
//   - compressor.mjs — CompressorBackend interface; bin wrapper passes
//     HaikuViaAnthropicApi
//   - daily-distill.mjs — inline call to refresh recent.md from current
//     week (cooldownMs=0 override per §8.7.2 composition)
//   - canonicalize package — bullet-level dedup (Task 5 primitive that
//     Task 10's mergeFacts itself uses; we reuse it at the scratchpad
//     bullet level since today-*.md bullets have no per-bullet ids)
//   - result-shapes.mjs — errorResult + ERROR_CATEGORIES
//
// Per design §8.7 + tasks.md 34.

import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  unlinkSync,
} from 'node:fs';
import { join } from 'node:path';
import { canonicalize } from '@lh8ppl/cmk-canonicalize';
import { nowIso } from './audit-log.mjs';
import { ERROR_CATEGORIES, errorResult } from './result-shapes.mjs';
import { HaikuTimeoutError } from './compressor.mjs';
import {
  DEFAULT_COOLDOWN_MS,
  isCooldownActive,
  touchCooldownMarker,
} from './cooldown.mjs';
import { dailyDistill } from './daily-distill.mjs';

const DEFAULT_ARCHIVE_MAX_BYTES = 4096;
const DEFAULT_RECENT_MAX_BYTES = 4096;
const SESSIONS_REL = ['context', 'sessions'];
const ARCHIVE_MD_REL = ['context', 'sessions', 'archive.md'];
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

const TODAY_RE = /^today-(\d{4}-\d{2}-\d{2})\.md$/;

function buildCurateInstructions(archiveMaxBytes) {
  return [
    'You are a memory archivist for claude-memory-kit. The input below is a series of daily session summaries (one per day, oldest first) that are now older than 7 days. Consolidate them into a compact archive section.',
    '',
    'Output ONLY the consolidated Markdown. Do not write preamble. Do not acknowledge the task. Begin your response with the first heading.',
    '',
    'REQUIRED FORMAT:',
    '',
    'Group consolidated entries by ISO week start (Monday). Each week begins with:',
    '',
    '## Week of YYYY-MM-DD',
    '',
    'Under each week heading, emit bullets that summarize the work across the days in that week. Each bullet is a single line ≤120 chars. Bullets within a week appear in chronological order.',
    '',
    'HARD RULES:',
    '  1. Preserve every citation ID matching /#[ULP]-[A-Z0-9]{6,8}/ verbatim. Never invent new IDs.',
    `  2. Total output ≤ ${archiveMaxBytes} bytes.`,
    '  3. Deduplicate aggressively: if the same fact appears across multiple days, emit it ONCE. The deterministic dedup pass after your output will collapse exact-after-canonical duplicates; YOUR job is to catch the looser semantic duplicates (paraphrases, restatements).',
    '  4. No prose between bullets — only the bulleted list per week section.',
    '  5. Your output goes directly into archive.md. Do not address the user, do not refer to yourself.',
    '',
    '=== BEGIN OLD DAILY SUMMARIES TO ARCHIVE ===',
  ].join('\n');
}

function listAllTodayFiles(projectRoot) {
  const sessionsDir = join(projectRoot, ...SESSIONS_REL);
  if (!existsSync(sessionsDir)) return [];
  const matches = [];
  for (const name of readdirSync(sessionsDir)) {
    const m = TODAY_RE.exec(name);
    if (!m) continue;
    matches.push({ name, date: m[1], path: join(sessionsDir, name) });
  }
  matches.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return matches;
}

function splitByAge(files, now) {
  const cutoffMs = new Date(now).getTime() - SEVEN_DAYS_MS;
  const old = [];
  const current = [];
  for (const f of files) {
    const fileMs = new Date(f.date + 'T00:00:00Z').getTime();
    if (Number.isFinite(fileMs) && fileMs < cutoffMs) old.push(f);
    else current.push(f);
  }
  return { old, current };
}

function readBuffer(files) {
  return files
    .map((f) => `## ${f.date}\n\n${readFileSync(f.path, 'utf8')}`)
    .join('\n\n');
}

// Bullet-level dedup pass. Parses the Haiku output, finds bullets whose
// canonicalize() output matches across days, collapses duplicates into
// a single bullet with a `merged_from` HTML-comment line appended.
//
// The v0.1.0 contract for "merge high-similarity bullets via task 10"
// (tasks.md 34.2): Task 10's mergeFacts API operates on per-fact files
// under <tier>/memory/<id>.md — today-*.md bullets have no per-bullet
// ids, so direct mergeFacts use is not the right tool. Instead the kit
// reuses the canonicalize primitive (the same one Task 10 uses to
// detect merge collisions) at the bullet text level. Looser semantic-
// similarity dedup remains Haiku's responsibility per the prompt.
//
// Input: archive Markdown (sections of `## Week of ...` headers
// followed by `- bullet` lines) + the list of source-date strings the
// input came from.
//
// Output: same shape, with consecutive same-canonical bullets within a
// week collapsed and a `<!-- merged_from: ['YYYY-MM-DD', ...] -->`
// comment line appended after the consolidated bullet.
//
// SCOPE CONTRACT (skill-review I1, 2026-05-28): dedup only triggers
// INSIDE a `## Week of ...` section. Bullets that appear BEFORE the
// first such heading (e.g., Haiku ignores the prompt format and emits
// bullets without a week wrapper) pass through verbatim with NO dedup.
// This is intentional: without a section to scope-attribute the merge,
// the merged_from comment would lose its provenance meaning. If a
// future Haiku response shape needs implicit-section dedup, lift this
// behavior here + add a corresponding test pinning the new shape.
export function dedupBullets(archiveText, sourceDates) {
  const lines = archiveText.split('\n');
  const out = [];
  const buffer = []; // pending bullets within current week
  let inWeekSection = false;

  function flushBuffer() {
    if (buffer.length === 0) return;
    // Group by canonical form. Preserve first-occurrence order.
    const byCanonical = new Map();
    const order = [];
    for (const b of buffer) {
      const key = canonicalize(b.text);
      if (!key) {
        // Empty after canonical — skip noise lines
        continue;
      }
      if (!byCanonical.has(key)) {
        byCanonical.set(key, { bullets: [], firstLine: b.line });
        order.push(key);
      }
      byCanonical.get(key).bullets.push(b);
    }
    for (const key of order) {
      const group = byCanonical.get(key);
      const first = group.bullets[0];
      out.push(first.line);
      if (group.bullets.length > 1) {
        // Collapsed multiple bullets into one. Record merged_from
        // with the source dates the bullets came from. If the input
        // bullet didn't carry a date attribution (rare — Haiku
        // groups by week and our prompt tells it to dedup looser
        // duplicates), fall back to "all source dates within this
        // week section". v0.1.0 uses the simpler: every merged
        // group attributes to the full set of sourceDates the
        // weekly-curate call was given. This is conservative but
        // correct — the audit trail says "these source days
        // contributed to this consolidated bullet" without
        // requiring per-bullet date tags Haiku may not emit.
        const dates = sourceDates.slice().sort();
        out.push(`<!-- merged_from: [${dates.map((d) => `'${d}'`).join(', ')}] -->`);
      }
    }
    buffer.length = 0;
  }

  for (const line of lines) {
    if (/^## Week of /.test(line)) {
      flushBuffer();
      out.push(line);
      inWeekSection = true;
      continue;
    }
    // S5 fix: any other `## ` heading (e.g., `## Decisions` if Haiku
    // ignores the prompt format) ends the current week section. Without
    // this reset, bullets under the non-week heading would still buffer
    // into the prior week's dedup group — wrong attribution.
    if (/^## /.test(line)) {
      flushBuffer();
      out.push(line);
      inWeekSection = false;
      continue;
    }
    if (inWeekSection && /^-\s/.test(line)) {
      const text = line.replace(/^-\s+/, '');
      buffer.push({ line, text });
      continue;
    }
    if (inWeekSection && /^<!--/.test(line)) {
      // Comment lines from Haiku — pass through, don't buffer
      flushBuffer();
      out.push(line);
      continue;
    }
    // Section break or unrecognized line — flush + emit
    flushBuffer();
    out.push(line);
  }
  flushBuffer();
  return out.join('\n');
}

function archiveMdPath(projectRoot) {
  return join(projectRoot, ...ARCHIVE_MD_REL);
}

function curateLogPath(projectRoot, date) {
  return join(projectRoot, ...SESSIONS_REL, `${date}.curate.log`);
}

function writeCurateLogEntry({ projectRoot, date, entry }) {
  const path = curateLogPath(projectRoot, date);
  mkdirSync(join(projectRoot, ...SESSIONS_REL), { recursive: true });
  appendFileSync(path, JSON.stringify(entry) + '\n', 'utf8');
  return path;
}

/**
 * Run the weekly curate cycle.
 *
 * @returns {Promise<object>} action: 'curated' | 'skipped' | 'error'
 */
export async function weeklyCurate({
  projectRoot,
  backend,
  now,
  cooldownMs = DEFAULT_COOLDOWN_MS,
  archiveMaxBytes = DEFAULT_ARCHIVE_MAX_BYTES,
  recentMaxBytes = DEFAULT_RECENT_MAX_BYTES,
  skipRecentRebuild = false,
} = {}) {
  const ts = now ?? nowIso();
  const date = ts.slice(0, 10);
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

  const sessionsDir = join(projectRoot, ...SESSIONS_REL);
  if (!existsSync(sessionsDir)) {
    return {
      action: 'skipped',
      reason: 'no-context-dir',
      duration_ms: Date.now() - t0,
    };
  }

  if (isCooldownActive({ projectRoot, now: ts, cooldownMs })) {
    const duration_ms = Date.now() - t0;
    writeCurateLogEntry({
      projectRoot,
      date,
      entry: {
        ts,
        scope: 'weekly-curate',
        input_bytes: 0,
        output_bytes: 0,
        // I2 fix: null model_id on the cooldown-skip path. Haiku was
        // never called — recording the backend's modelId would
        // mis-attribute the (non-existent) call in NDJSON analytics.
        model_id: null,
        cost_usd: 0,
        duration_ms,
        success: true,
        skipped_reason: 'cooldown',
      },
    });
    return { action: 'skipped', reason: 'cooldown', duration_ms };
  }

  const files = listAllTodayFiles(projectRoot);
  const { old, current } = splitByAge(files, ts);

  // No old files → nothing to archive; we still rebuild recent.md
  // from current (idempotent no-op if it was just rebuilt by daily
  // cron, since dailyDistill writes the same output deterministically).
  if (old.length === 0) {
    const duration_ms = Date.now() - t0;
    writeCurateLogEntry({
      projectRoot,
      date,
      entry: {
        ts,
        scope: 'weekly-curate',
        input_bytes: 0,
        output_bytes: 0,
        model_id:
          typeof backend.modelId === 'function' ? backend.modelId() : null,
        cost_usd: 0,
        duration_ms,
        success: true,
        skipped_reason: 'no-old-files',
        current_days: current.length,
      },
    });
    return {
      action: 'skipped',
      reason: 'no-old-files',
      currentDays: current.length,
      duration_ms,
    };
  }

  const buffer = readBuffer(old);
  const input_bytes = Buffer.byteLength(buffer, 'utf8');
  const instructions = buildCurateInstructions(archiveMaxBytes);
  const sourceDates = old.map((f) => f.date);

  let result;
  try {
    result = await backend.compress({
      input: buffer,
      instructions,
      preserveCitationIds: true,
      maxOutputBytes: archiveMaxBytes,
      timeoutMs: 50_000,
    });
    touchCooldownMarker({ projectRoot, now: ts });
  } catch (err) {
    touchCooldownMarker({ projectRoot, now: ts });
    const errorCategory =
      err instanceof HaikuTimeoutError
        ? ERROR_CATEGORIES.HAIKU_TIMEOUT
        : ERROR_CATEGORIES.COMPRESS_FAILED;
    const duration_ms = Date.now() - t0;
    writeCurateLogEntry({
      projectRoot,
      date,
      entry: {
        ts,
        scope: 'weekly-curate',
        input_bytes,
        output_bytes: 0,
        model_id:
          typeof backend.modelId === 'function' ? backend.modelId() : null,
        cost_usd: 0,
        duration_ms,
        success: false,
        error_category: errorCategory,
      },
    });
    return errorResult({
      category: errorCategory,
      errors: [err?.message ?? String(err)],
      duration_ms,
    });
  }

  const rawOutput = result?.outputText ?? '';
  const dedupedOutput = dedupBullets(rawOutput, sourceDates);
  const output_bytes = Buffer.byteLength(dedupedOutput, 'utf8');

  // Append to archive.md (NOT overwrite — archive is append-only history).
  const archivePath = archiveMdPath(projectRoot);
  mkdirSync(join(projectRoot, ...SESSIONS_REL), { recursive: true });
  const suffix = dedupedOutput.endsWith('\n') ? '' : '\n';
  appendFileSync(archivePath, dedupedOutput + suffix + '\n', 'utf8');

  // Delete OLD today-*.md files (audit retention via git history;
  // committed tier per .gitignore.fragment).
  // M3 fix: track per-file deletion errors in the NDJSON entry so ops
  // can detect partial-deletion events (Windows file lock, race
  // condition). Self-healing — next week's curate re-archives any
  // surviving OLD file — but observability matters.
  const deletionErrors = [];
  for (const f of old) {
    try {
      unlinkSync(f.path);
    } catch (err) {
      deletionErrors.push({ path: f.path, error: err?.message ?? String(err) });
    }
  }

  // Rebuild recent.md from current week via dailyDistill (cooldownMs=0
  // override per §8.7.2 — both Haiku calls belong to a single curate
  // cycle, not two independent invocations).
  let recentPath;
  let recentResult;
  if (!skipRecentRebuild && current.length > 0) {
    recentResult = await dailyDistill({
      projectRoot,
      backend,
      now: ts,
      cooldownMs: 0,
      maxOutputBytes: recentMaxBytes,
    });
    if (recentResult?.outputPath) recentPath = recentResult.outputPath;
  }

  const duration_ms = Date.now() - t0;
  writeCurateLogEntry({
    projectRoot,
    date,
    entry: {
      ts,
      scope: 'weekly-curate',
      input_bytes,
      output_bytes,
      model_id:
        result?.modelId ??
        (typeof backend.modelId === 'function' ? backend.modelId() : null),
      cost_usd: result?.costUSD ?? 0,
      duration_ms,
      success: true,
      archived_days: old.length,
      current_days: current.length,
      recent_rebuild_action: recentResult?.action ?? 'skipped',
      ...(deletionErrors.length > 0 ? { deletion_errors: deletionErrors } : {}),
    },
  });

  return {
    action: 'curated',
    archivedDays: old.length,
    currentDays: current.length,
    archivedPath: archivePath,
    recentPath,
    bytesIn: input_bytes,
    bytesOut: output_bytes,
    duration_ms,
  };
}
