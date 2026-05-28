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
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { nowIso } from './audit-log.mjs';
import { ERROR_CATEGORIES } from './result-shapes.mjs';
import { HaikuTimeoutError } from './compressor.mjs';
import {
  DEFAULT_COOLDOWN_MS,
  isCooldownActive,
  touchCooldownMarker,
} from './cooldown.mjs';

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
    '## Files Touched',
    '- path: <relative path> — <verb summary across days>',
    '',
    '## Active Threads',
    '- <one bullet per active work-in-progress thread, ≤80 chars>',
    '',
    'HARD RULES:',
    '  1. Preserve every citation ID matching /#[ULP]-[A-Z0-9]{6,8}/ verbatim. Never invent new IDs.',
    `  2. Total output ≤ ${maxOutputBytes} bytes.`,
    '  3. If a section has no entries, omit the heading entirely.',
    '  4. No prose around the headings — only the bulleted list per section.',
    '  5. Deduplicate aggressively: if the same decision appears across multiple days, list it ONCE.',
    '  6. Your output goes directly into the next session\'s memory. Do not address the user, do not refer to yourself.',
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
    return { action: 'skipped', reason: 'cooldown', duration_ms };
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
    return { action: 'skipped', reason: 'no-input', duration_ms };
  }

  const buffer = readBuffer(files);
  const input_bytes = Buffer.byteLength(buffer, 'utf8');
  const instructions = buildDistillInstructions(maxOutputBytes);

  let result;
  try {
    result = await backend.compress({
      input: buffer,
      instructions,
      preserveCitationIds: true,
      maxOutputBytes,
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
    writeDistillLogEntry({
      projectRoot, date,
      entry: {
        ts, scope: 'daily-distill', input_bytes, output_bytes: 0,
        model_id: typeof backend.modelId === 'function' ? backend.modelId() : null,
        cost_usd: 0, duration_ms, success: false, error_category: errorCategory,
      },
    });
    return {
      action: 'error', error_category: errorCategory, duration_ms,
      errorMessage: err?.message ?? String(err),
    };
  }

  const output = result?.outputText ?? '';
  const output_bytes = Buffer.byteLength(output, 'utf8');

  // Overwrite recent.md atomically: write to a temp file then rename.
  // For v0.1.0 a direct overwrite is fine (single-writer assumption);
  // atomic-rename would be a v0.1.x hardening if cron + manual roll
  // ever overlap.
  const path = recentMdPath(projectRoot);
  mkdirSync(join(projectRoot, ...SESSIONS_REL), { recursive: true });
  writeFileSync(path, output, 'utf8');

  const duration_ms = Date.now() - t0;
  writeDistillLogEntry({
    projectRoot, date,
    entry: {
      ts, scope: 'daily-distill', input_bytes, output_bytes,
      model_id:
        result?.modelId ??
        (typeof backend.modelId === 'function' ? backend.modelId() : null),
      cost_usd: result?.costUSD ?? 0,
      duration_ms, success: true, source_days: files.length,
    },
  });
  return {
    action: 'distilled',
    outputPath: path,
    bytesIn: input_bytes,
    bytesOut: output_bytes,
    sourceDays: files.length,
    duration_ms,
  };
}
