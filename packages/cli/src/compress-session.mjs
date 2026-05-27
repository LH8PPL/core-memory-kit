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
  truncateSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { nowIso } from './audit-log.mjs';
import { ERROR_CATEGORIES } from './result-shapes.mjs';
import { HaikuTimeoutError } from './compressor.mjs';
import {
  DEFAULT_COOLDOWN_MS,
  isCooldownActive,
  touchCooldownMarker,
} from './cooldown.mjs';

const DEFAULT_MAX_OUTPUT_BYTES = 4096;

const NOW_MD_RELATIVE = ['context', 'sessions', 'now.md'];
const SESSIONS_DIR_RELATIVE = ['context', 'sessions'];

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
    '## Files Touched',
    '- path: <relative path> — <verb summary> (cites: [#P-XXXXXXXX])',
    '',
    '## Active Threads',
    '- <one bullet per work-in-progress thread the next session should resume, ≤80 chars>',
    '',
    'HARD RULES:',
    '  1. Preserve every citation ID matching /#[ULP]-[A-Z0-9]{6,8}/ verbatim. Never invent new IDs.',
    `  2. Total output ≤ ${maxOutputBytes} bytes.`,
    '  3. If a section has no entries, omit the heading entirely (do not emit an empty heading).',
    '  4. No prose around the headings — only the bulleted list per section.',
    '  5. Your output goes directly into the next session\'s memory. Do not address the user, do not refer to yourself, do not narrate.',
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

function readNowBuffer(projectRoot) {
  const p = readNowMdPath(projectRoot);
  if (!existsSync(p)) return '';
  try {
    return readFileSync(p, 'utf8');
  } catch {
    return '';
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

function truncateNowMd(projectRoot) {
  const p = readNowMdPath(projectRoot);
  if (!existsSync(p)) return;
  try {
    truncateSync(p, 0);
  } catch {
    // Best-effort. If truncate fails (perm error etc.), the next
    // session compresses a slightly-larger buffer — not a data-loss
    // event.
  }
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

  // 2. Read live buffer; no-op if empty (tasks.md 22.1).
  const buffer = readNowBuffer(projectRoot);
  if (buffer.trim() === '') {
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

  // 3. Invoke backend. On throw: leave now.md intact (22.5).
  //
  // Subprocess timeout: 50_000 ms. Sits under the 60s SessionEnd
  // hook ceiling (design §5.1) so on timeout the catch + log write
  // complete BEFORE Claude Code kills the parent. now.md is left
  // intact in the timeout case (the truncate step is reached only
  // on the success path), so the next session-end retries naturally.
  // See design §8.5 for the composition rationale.
  let result;
  try {
    result = await backend.compress({
      input: wrapBufferForPrompt(buffer),
      instructions,
      preserveCitationIds: true,
      maxOutputBytes,
      timeoutMs: 50_000,
    });
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

  // 5. Truncate now.md (22.3).
  truncateNowMd(projectRoot);

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
