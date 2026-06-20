// SessionEnd compression (Task 22, T-019).
//
// Public boundary: compressSession({projectRoot, backend, now,
// cooldownMs, maxOutputBytes}) — invoked by the SessionEnd hook
// (plugin/bin/cmk-compress-session.mjs). Reads
// context/sessions/now.md, compresses via the injected
// CompressorBackend using the design §8.4 prompt, appends the result
// to context/sessions/today-{YYYY-MM-DD}.md, then truncates now.md
// so the next session starts fresh.
//
// The CompressorBackend interface (see compressor.mjs) lets tests
// inject a MockHaikuBackend without spawning the real `claude`
// binary; the real-binary spawn smoke for the SessionEnd code path
// lives in tests/spawn-smoke-compress-session.test.js per design §17.
//
// Cooldown (design §8.2): if `<projectRoot>/context/.locks/
// last-haiku-call.ts` mtime is within `cooldownMs` of `now`, skip
// the compression (the auto-extract subagent may have just spent the
// budget on a Stop-hook fire). Default cooldownMs = 120_000.
//
// Error semantics (tasks.md 22.5): backend.compress() throw → action
// 'error', now.md UNTOUCHED, today-{date}.md NOT written, log entry
// with success:false + error_category:'compress_failed'. The bin
// wrapper exits 0 either way — a crashed SessionEnd hook would block
// the user from closing their terminal.

import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  appendFileSync,
  renameSync,
  unlinkSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { nowIso } from './audit-log.mjs';
import { ERROR_CATEGORIES } from './result-shapes.mjs';
import { HaikuTimeoutError } from './compressor.mjs';
import { compressWithRetry } from './compress-retry.mjs';
import {
  DEFAULT_COOLDOWN_MS,
  isCooldownActive,
  touchCooldownMarker,
} from './cooldown.mjs';

const DEFAULT_MAX_OUTPUT_BYTES = 4096;

const NOW_MD_RELATIVE = ['context', 'sessions', 'now.md'];
const SESSIONS_DIR_RELATIVE = ['context', 'sessions'];
// Task 106 (§16.27): the live buffer is CLAIMED by an atomic rename to this
// suffix before compression, so concurrent PostToolUse/capture-turn appends
// land on a fresh now.md without racing the truncate.
const ROLLING_SUFFIX = '.rolling-';

// Compression prompt (design §8.4). Written from scratch per the
// licensing posture in SOURCES.md (claude-remember's prompts are not
// copied verbatim — only the structural pattern of "instructions go
// in --append-system-prompt / our `instructions` field; the live
// buffer goes in the user message / our `input` field" is absorbed).
//
// The four-section structure (Decisions / Open Questions / Files
// Touched / Active Threads) is the §8.4 contract. The citation-ID
// preservation rule (`/#[ULP]-[A-Z0-9]{6,8}/`) is the §3.1 contract
// — Haiku must NEVER invent IDs and must preserve any it sees.
//
// Prompt-engineering note: compressor.mjs concatenates
// `${instructions}\n\n${input}` into a single user-side message. The
// earlier prompt phrasing ("You receive a live session buffer...")
// invited Haiku to read the whole thing as a meta-configuration
// conversation and respond with "OK, ready to compress — send me the
// buffer." Surfaced by tests/spawn-smoke-compress-session.test.js in
// the full-suite run on 2026-05-25 (the isolated run got lucky on
// stochastic Haiku output; under cache-cold/full-suite conditions it
// took the meta-conversation path). Fix: (a) imperative voice with
// an explicit forward-reference to the buffer that follows, (b)
// SESSION_BUFFER_DELIMITER markers around the buffer so the model
// has an unambiguous boundary between directive and input, and
// (c) explicit ban on preamble / clarifying questions / "I
// understand" acknowledgments.
const SESSION_BUFFER_DELIMITER = '=== BEGIN SESSION BUFFER (compress this) ===';
const SESSION_BUFFER_END_DELIMITER = '=== END SESSION BUFFER ===';

function buildCompressionInstructions(maxOutputBytes) {
  return [
    'You are a memory compressor for claude-memory-kit. Your task is to compress the session buffer that appears below into a four-section Markdown summary.',
    '',
    'Output ONLY the compressed Markdown. Do not write preamble. Do not acknowledge the task. Do not ask clarifying questions. Do not include any meta-commentary. Begin your response with the first applicable section heading.',
    '',
    'REQUIRED FORMAT (emit these section headings exactly, in this order; omit any heading whose section would have no entries):',
    '',
    '## Decisions',
    '- <one bullet per concrete decision the session reached, ≤80 chars>',
    '',
    '## Open Questions',
    '- <one bullet per unresolved question raised during the session, ≤80 chars>',
    '',
    '## Active Threads',
    '- <one bullet per work-in-progress thread the next session should resume, ≤80 chars>',
    '',
    'HARD RULES:',
    '  1. Every bullet must be grounded in the session buffer below. Do not infer or guess any fact not explicitly stated in the buffer. Do not carry forward content from earlier summaries. When the buffer corrects, replaces, or reverses something stated earlier, keep ONLY the latest version of that fact — never list the superseded one alongside it (this resolves contradictions, NOT coexisting facts on different points). If unsure, omit it.',
    '  2. Preserve every citation ID matching /#[ULP]-[A-Z0-9]{6,8}/ verbatim. Never invent new IDs.',
    `  3. Total output ≤ ${maxOutputBytes} bytes.`,
    '  4. If a section has no entries, omit the heading entirely (do not emit an empty heading).',
    '  5. No prose around the headings — only the bulleted list per section.',
    '  6. Your output goes directly into the next session\'s memory. Do not address the user, do not refer to yourself, do not narrate.',
    '',
    `The session buffer to compress appears below between the ${SESSION_BUFFER_DELIMITER} and ${SESSION_BUFFER_END_DELIMITER} markers.`,
  ].join('\n');
}

function wrapBufferForPrompt(buffer) {
  return `${SESSION_BUFFER_DELIMITER}\n${buffer}\n${SESSION_BUFFER_END_DELIMITER}`;
}

function readNowMdPath(projectRoot) {
  return join(projectRoot, ...NOW_MD_RELATIVE);
}

function todayMdPath(projectRoot, date) {
  return join(projectRoot, ...SESSIONS_DIR_RELATIVE, `today-${date}.md`);
}

function compressLogPath(projectRoot, date) {
  return join(projectRoot, ...SESSIONS_DIR_RELATIVE, `${date}.compress.log`);
}

function dateFromIso(ts) {
  // ISO 8601 first 10 chars are YYYY-MM-DD; safe for both
  // '2026-05-26T10:00:00Z' and the nowIso() shape.
  return ts.slice(0, 10);
}

// Task 106 (§16.27 file-rename pattern). ATOMICALLY claim the live buffer:
// rename now.md → now.md.rolling-{ts}, then read the claimed copy. The rename is
// atomic on POSIX (rename(2)) + NTFS (MoveFileEx), so a concurrent appender
// (PostToolUse/capture-turn) that fires DURING the ~5–10s Haiku call lands on a
// fresh now.md with zero contention — its content is never inside the
// read→clear window the old `read then truncate(0)` left open. Returns the
// claimed buffer + the rolling path (null when now.md is absent / the rename
// raced, which the caller treats as an empty buffer).
//
// Bonus property — the rename also SERIALIZES concurrent rolls. compressSession
// is gated by the 120s cooldown, but the marker is only touched on success, so
// two callers (a SessionEnd + the Task 105 SessionStart-lazy roll) can both pass
// the cooldown gate and reach here. Only ONE renameSync wins; the other gets
// ENOENT (now.md already claimed) → returns an empty buffer → skips. No lock
// needed; the atomic rename IS the mutex.
function claimNowBuffer(projectRoot, ts) {
  const nowPath = readNowMdPath(projectRoot);
  if (!existsSync(nowPath)) return { buffer: '', rollingPath: null };
  const rollingPath = nowPath + ROLLING_SUFFIX + String(ts).replace(/[:.]/g, '-');
  try {
    renameSync(nowPath, rollingPath);
  } catch {
    // now.md vanished or the rename lost a race — nothing to roll.
    return { buffer: '', rollingPath: null };
  }
  let buffer = '';
  try {
    buffer = readFileSync(rollingPath, 'utf8');
  } catch {
    buffer = '';
  }
  return { buffer, rollingPath };
}

// Success path: the claimed buffer is safely compressed into today-{date}.md.
// Drop the rolling file. now.md is owned by the (new) session's appenders now —
// we do NOT recreate or touch it, so a concurrent append is never clobbered.
function discardRolling(rollingPath) {
  if (!rollingPath) return;
  try {
    unlinkSync(rollingPath);
  } catch {
    // best-effort; a leaked rolling file is inert (the next roll claims now.md,
    // not now.md.rolling-*) and harmless beyond disk noise.
  }
}

// Error/timeout path: the claimed buffer was NOT compressed — restore it so the
// next roll retries it (the old impl's "leave now.md intact" contract). Prepend
// it to anything a concurrent session appended to the fresh now.md (the claimed
// content is OLDER, so it leads), preserving both with no truncate. Best-effort:
// if the restore write fails, the rolling file stays as a recovery breadcrumb.
function restoreRolling(projectRoot, rollingPath) {
  if (!rollingPath || !existsSync(rollingPath)) return;
  const nowPath = readNowMdPath(projectRoot);
  try {
    const claimed = readFileSync(rollingPath, 'utf8');
    const current = existsSync(nowPath) ? readFileSync(nowPath, 'utf8') : '';
    // Guarantee a newline boundary between the claimed (older) buffer and any
    // concurrent appends. String op, not a regex — a trailing-anchored `\n*$`
    // trips static-analysis's ReDoS heuristic (same convention as slugify in
    // rich-fact.mjs / graduation.mjs).
    const sep = claimed.endsWith('\n') ? '' : '\n';
    const merged = current ? claimed + sep + current : claimed;
    writeFileSync(nowPath, merged, 'utf8');
    unlinkSync(rollingPath);
  } catch {
    // best-effort — see above
  }
}

function appendToTodayMd({ projectRoot, date, body }) {
  const path = todayMdPath(projectRoot, date);
  mkdirSync(dirname(path), { recursive: true });
  // Append with a trailing newline so successive same-day appends
  // don't collide on a missing terminator.
  const suffix = body.endsWith('\n') ? '' : '\n';
  appendFileSync(path, body + suffix, 'utf8');
  return path;
}

function writeCompressLogEntry({ projectRoot, date, entry }) {
  const path = compressLogPath(projectRoot, date);
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, JSON.stringify(entry) + '\n', 'utf8');
  return path;
}

export async function compressSession({
  projectRoot,
  backend,
  now,
  cooldownMs = DEFAULT_COOLDOWN_MS,
  maxOutputBytes = DEFAULT_MAX_OUTPUT_BYTES,
  // Task 161 / D-175: retry policy. DEFAULT 1 = NO retry — the SessionEnd-hook
  // contract: this fn runs under the 60s ceiling CONCURRENT with autoPersona, where
  // a 50s attempt + a 50s retry = 100s blows the ceiling. The ceiling-free LAZY
  // caller (runLazyCompress) passes maxAttempts:2 to opt into one retry; the hook
  // keeps its restore-on-failure (D-79) and delegates the retry to that lazy path.
  maxAttempts = 1,
  // DEFAULT 50s = the SessionEnd-hook budget (sized under the 60s ceiling, §8.5).
  // The ceiling-free LAZY caller (runLazyCompress, a detached SessionStart child
  // with NO outer ceiling) passes 120s so a slow-but-not-broken `claude --print`
  // window doesn't time out needlessly — the D-92/F-2 composition rule: a
  // ceiling-free caller must not inherit a ceiling-sized timeout.
  timeoutMs = 50_000,
} = {}) {
  const ts = now ?? nowIso();
  const date = dateFromIso(ts);
  const t0 = Date.now();

  if (!projectRoot) {
    return {
      action: 'error',
      error_category: ERROR_CATEGORIES.MISSING_PROJECT_ROOT,
      duration_ms: Date.now() - t0,
    };
  }
  if (!backend || typeof backend.compress !== 'function') {
    return {
      action: 'error',
      error_category: ERROR_CATEGORIES.MISSING_BACKEND,
      duration_ms: Date.now() - t0,
    };
  }

  // Project must have been `cmk install`-ed (context/sessions/
  // exists). If not, this is a no-op — we don't create directories
  // in projects that haven't opted in. Crucially, this skip does
  // NOT write a log entry; that would create the very directory we
  // just decided not to create. The scaffold test relies on this
  // (it invokes the bin handler from the repo root without a
  // context/ tree and expects no side effects).
  const sessionsDir = join(projectRoot, ...SESSIONS_DIR_RELATIVE);
  if (!existsSync(sessionsDir)) {
    return {
      action: 'skipped',
      reason: 'no-context-dir',
      duration_ms: Date.now() - t0,
    };
  }

  // 1. Cooldown gate (design §8.2). Checked BEFORE reading now.md so
  //    a stale buffer doesn't get retried within the 120s window —
  //    the next SessionEnd will re-trigger naturally.
  if (isCooldownActive({ projectRoot, now: ts, cooldownMs })) {
    const duration_ms = Date.now() - t0;
    const entry = {
      ts,
      scope: 'session-end',
      input_bytes: 0,
      output_bytes: 0,
      model_id: typeof backend.modelId === 'function' ? backend.modelId() : null,
      cost_usd: 0,
      duration_ms,
      success: true,
      skipped_reason: 'cooldown',
    };
    writeCompressLogEntry({ projectRoot, date, entry });
    return {
      action: 'skipped',
      reason: 'cooldown',
      duration_ms,
    };
  }

  // 2. CLAIM the live buffer by atomic rename (Task 106 / §16.27), then read it;
  //    no-op if empty (tasks.md 22.1). Claiming before the Haiku call is what
  //    closes the race — a concurrent append during compression lands on a
  //    fresh now.md, never inside a read→truncate window.
  const { buffer, rollingPath } = claimNowBuffer(projectRoot, ts);
  if (buffer.trim() === '') {
    discardRolling(rollingPath); // drop the (empty) claimed file if one was renamed
    const duration_ms = Date.now() - t0;
    const entry = {
      ts,
      scope: 'session-end',
      input_bytes: 0,
      output_bytes: 0,
      model_id: typeof backend.modelId === 'function' ? backend.modelId() : null,
      cost_usd: 0,
      duration_ms,
      success: true,
      skipped_reason: 'empty',
    };
    writeCompressLogEntry({ projectRoot, date, entry });
    return {
      action: 'skipped',
      reason: 'empty',
      duration_ms,
    };
  }

  const input_bytes = Buffer.byteLength(buffer, 'utf8');
  const instructions = buildCompressionInstructions(maxOutputBytes);

  // 3. Invoke backend. On throw: RESTORE the claimed buffer to now.md (22.5) so
  //    the next session-end retries it — the file-rename analogue of the old
  //    "leave now.md intact".
  //
  // Subprocess timeout: 50_000 ms. Sits under the 60s SessionEnd
  // hook ceiling (design §5.1) so on timeout the catch + log write
  // complete BEFORE Claude Code kills the parent — including the
  // restoreRolling call, so the buffer is never stranded in the rolling file.
  // See design §8.5 for the composition rationale.
  let result;
  let retries = 0; // Task 161.12: count retries (only the lazy maxAttempts:2 path can retry).
  try {
    // maxAttempts default 1 (hook contract: no retry); the lazy caller passes 2.
    // compressWithRetry is a no-op wrapper at maxAttempts:1 (single attempt, reraise).
    result = await compressWithRetry(
      backend,
      {
        input: wrapBufferForPrompt(buffer),
        instructions,
        preserveCitationIds: true,
        maxOutputBytes,
        timeoutMs,
      },
      { maxAttempts, onRetry: () => { retries += 1; } },
    );
  } catch (err) {
    // Distinguish HAIKU_TIMEOUT (slow Anthropic) from COMPRESS_FAILED
    // (non-zero subprocess exit / spawn ENOENT / etc). Analytics
    // treat them differently — timeouts retry naturally on the
    // next SessionEnd; failed exits often need investigation.
    // `instanceof HaikuTimeoutError` (not string match on
    // err.category) so the routing contract is type-anchored —
    // see compressor.mjs HaikuTimeoutError docstring for rationale.
    const errorCategory = err instanceof HaikuTimeoutError
      ? ERROR_CATEGORIES.HAIKU_TIMEOUT
      : ERROR_CATEGORIES.COMPRESS_FAILED;
    // The claimed buffer wasn't compressed — put it back so it isn't lost.
    restoreRolling(projectRoot, rollingPath);
    const duration_ms = Date.now() - t0;
    const entry = {
      ts,
      scope: 'session-end',
      input_bytes,
      output_bytes: 0,
      model_id: typeof backend.modelId === 'function' ? backend.modelId() : null,
      cost_usd: 0,
      duration_ms,
      success: false,
      error_category: errorCategory,
      // Task 161 (D-173 observability): capture the STRUCTURED failure reason
      // (subprocess exit code + stderr) so a `compress_failed` is diagnosable.
      // Pre-161 the log kept only error_category — the WHY was discarded, which
      // is why the kit's own 329-byte compress_failed could not be explained.
      ...(err?.exitCode != null ? { exit_code: err.exitCode } : {}),
      ...(err?.stderr ? { error_detail: String(err.stderr).slice(0, 500) } : {}),
      ...(retries > 0 ? { retries } : {}), // 161.12: failed AFTER retrying (lazy path)
    };
    writeCompressLogEntry({ projectRoot, date, entry });
    return {
      action: 'error',
      error_category: errorCategory,
      duration_ms,
      errorMessage: err?.message ?? String(err),
    };
  }

  const output = result?.outputText ?? '';
  const output_bytes = Buffer.byteLength(output, 'utf8');

  // 4. Write compressed output to today-{date}.md (append for same-day).
  const outputPath = appendToTodayMd({
    projectRoot,
    date,
    body: output,
  });

  // 5. The claimed buffer is safely in today-{date}.md — drop the rolling file
  //    (Task 106/§16.27). now.md is untouched: any turn the new session appended
  //    while we compressed stays put.
  discardRolling(rollingPath);

  // 6. Touch cooldown marker so the next caller within 120s skips.
  touchCooldownMarker({ projectRoot, now: ts });

  const duration_ms = Date.now() - t0;
  const entry = {
    ts,
    scope: 'session-end',
    input_bytes,
    output_bytes,
    model_id:
      result?.modelId ??
      (typeof backend.modelId === 'function' ? backend.modelId() : null),
    cost_usd: result?.costUSD ?? 0,
    duration_ms,
    success: true,
    ...(retries > 0 ? { retries } : {}), // 161.12: succeeded after a transient retry (lazy path)
  };
  writeCompressLogEntry({ projectRoot, date, entry });

  return {
    action: 'compressed',
    outputPath,
    bytesIn: input_bytes,
    bytesOut: output_bytes,
    duration_ms,
  };
}
