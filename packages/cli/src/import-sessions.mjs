// `cmk import-sessions` (Task 225, D-326 — the v0.6.0 headline).
//
// Bootstrap the project memory from EXISTING Claude Code session history
// (~/.claude/projects/<slug>/<uuid>.jsonl), so day one isn't empty. Public
// boundary:
//
//   importSessions({projectRoot, backend, now, harnessRoot?, slug?,
//                   allProjects?, sinceIso?, maxSessions?, dryRun?,
//                   timeoutMs?, maxAttempts?})
//     → {action, discovered, alreadyImported, skippedActive, selected,
//        imported[], screened_out[], failed[], preview?, rawFloorProtected?}
//
//   readImportedSessionIds(projectRoot) → Set<sessionId>
//
// Per-session pipeline (oldest-first, each unit persisted as it completes —
// ADR-0020 incremental-resumable, NOT the run-once sentinel the origin
// creator's v3 uses; sentinel-once was considered + REJECTED in tasks.md 225
// because it can't recover a killed run and can't catch up later):
//
//   1. extractTranscript (38b) → raw markdown archived to the GITIGNORED
//      context/transcripts/imported/<uuid>.md floor (ADR-0010: raw preserved;
//      never committed, never indexed — unscreened content must not become
//      searchable, the 148.3 invariant).
//   2. compressor backend (agent-relative, Task 200/201) summarizes the one
//      session into the rolling-window day-file shape "as if captured live",
//      with the ADR-0019 privacy instruction carried in the SAME call (the
//      sessions-tier posture: judge-in-the-prompt + L1 mask, no second
//      Haiku call).
//   3. L1 maskPii + screenBeforeCommittedWrite (216, scope 'all') — nothing
//      unscreened lands on a committed tier. A rejected summary records the
//      session as screened (ledger + audit) and moves on.
//   4. Append to context/sessions/today-<date>.md with an
//      `imported-session:` provenance marker (Task 213 source pointer).
//   5. Ledger + audit: context/sessions/imported-sessions.md (committed,
//      single-writer, append-only) is the artifact-derived resume point —
//      it survives day-file rotation into archive.md, so a re-run imports
//      only new sessions forever. Day-file markers are the secondary guard
//      (covers a run killed between steps 4 and 5).
//   6. After the loop: best-effort transcript-chunk index sync so the
//      imported day files are searchable immediately (scope transcripts).
//
// Composition note (deliberate, documented): weekly-curate folds ALL
// >7-day-old day files through ONE archiveMaxBytes-capped compress — a bulk
// import of months gets coarser archive granularity than live capture would
// have. Mitigated by the DEFAULT_MAX_SESSIONS bound + compact per-session
// summaries (SUMMARY_MAX_BYTES); the durable floor is the raw extract
// (ADR-0010), and per-week-resumable curate is the ADR-0020 follow-up
// candidate (design §22).
//
// Per design §22 + tasks.md 225.

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  appendFileSync,
  statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { refreshGitignoreBlock } from './install.mjs';
import { appendAuditEntry, nowIso, REASON_CODES } from './audit-log.mjs';
import { ERROR_CATEGORIES, errorResult } from './result-shapes.mjs';
import { discoverSessions, extractTranscript, harnessSlugForPath } from './transcripts.mjs';
export { harnessSlugForPath };
import { appendToTodayMd } from './compress-session.mjs';
import { compressWithRetry, CEILING_FREE_TIMEOUT_MS, CEILING_FREE_BACKOFF_MS } from './compress-retry.mjs';
import { HaikuTimeoutError } from './compressor.mjs';
import { touchCooldownMarker } from './cooldown.mjs';
import { screenBeforeCommittedWrite } from './poison-guard.mjs';
import { maskPii, localUsernames, resolvePrivacyScreen } from './pii-patterns.mjs';

// Selection bound: newest-first cap when the user doesn't pass --max/--all.
// Bounds BOTH the Haiku spend of one run and the size of the day-file batch
// the next weekly-curate folds into archive.md (the composition note above).
export const DEFAULT_MAX_SESSIONS = 50;

// Per-session summary cap. Compact by design: a bulk import lands dozens of
// day files; distill/curate re-compress them under their own 4096-byte caps,
// so a fat per-session summary would only buy squash losses downstream.
export const SUMMARY_MAX_BYTES = 1200;

// Per-session summarize-INPUT cap (live-test finding: a real marathon session's
// jsonl was 64 MB — even text-only extraction can dwarf the backend's context
// and budget). Oversized extracts send only their TAIL (a session's end carries
// its conclusions/decisions), with an honest truncation marker so the
// summarizer knows it saw a suffix. The raw floor keeps the FULL extract.
export const IMPORT_INPUT_MAX_BYTES = 262_144; // 256 KiB

const LEDGER_REL = ['context', 'sessions', 'imported-sessions.md'];
const RAW_IMPORT_REL = ['context', 'transcripts', 'imported'];
const SESSIONS_REL = ['context', 'sessions'];

// ONE id shape for BOTH resume-point reads (skill-review M1): discovery
// accepts any 36-char [0-9a-f-] basename (transcripts.mjs UUID_RE), so the
// ledger scan and the day-file marker scan must accept the same — a stricter
// ledger regex would re-import a loose-shaped id forever once its day file
// rotates. Ledger scan is anchored to the written line format.
const LEDGER_LINE_RE = /^- \S+ ([0-9a-f-]{36}) slug:/gim;
const MARKER_RE = /<!-- imported-session: ([0-9a-f-]{36})/gi;

// Skill-review M3: a session whose jsonl changed within this window is
// (very likely) STILL RUNNING — importing it would summarize a partial
// transcript, permanently ledger it, and duplicate what the live Stop-hook
// pipeline is already capturing. Skip it un-ledgered; it imports whole once
// it goes quiet.
export const ACTIVE_SESSION_GRACE_MS = 5 * 60 * 1000;

// Skill-review I1: an empty or refusal-shaped backend output must FAIL the
// unit (not ledgered → retried next run) — otherwise a claude-CLI hiccup
// that exits 0 with empty stdout permanently consumes the session with a
// marker-only day block. Sibling precedent: daily-distill banks only
// non-empty output; transcript-screen has outputPassesRejectGate.
const REFUSAL_OPENERS = ["i'm sorry", 'i apologize', 'as an ai'];
const REFUSAL_CANT_RE = /^i\s*(?:can\s*not|can'?t|am\s+unable|'m\s+unable)/;

function looksLikeRefusal(text) {
  const head = text.slice(0, 32).toLowerCase();
  return REFUSAL_OPENERS.some((p) => head.startsWith(p)) || REFUSAL_CANT_RE.test(head);
}

const LEDGER_HEADER = [
  '# Imported sessions — `cmk import-sessions`',
  '',
  '<!-- Provenance ledger: one line per processed session. This file is the',
  '     artifact-derived resume point (ADR-0020) — it survives day-file',
  '     rotation into archive.md, so a re-run imports only NEW sessions.',
  '     Single-writer (import-sessions only), append-only. Do not edit. -->',
  '',
].join('\n');

export function ledgerPath(projectRoot) {
  return join(projectRoot, ...LEDGER_REL);
}

function rawImportDir(projectRoot) {
  return join(projectRoot, ...RAW_IMPORT_REL);
}

function buildImportInstructions(date, maxOutputBytes) {
  return [
    'You are a memory consolidator for core-memory-kit. The input below is the transcript of ONE past working session, dated ' + date + '. Summarize it into the kit\'s daily-session format, as if it had been captured live that day.',
    '',
    'Output ONLY the consolidated Markdown. Do not write preamble. Do not acknowledge the task. Begin your response with the first section heading.',
    '',
    'REQUIRED FORMAT (emit headings exactly, in this order; omit any heading whose section would have no entries):',
    '',
    '## Decisions',
    '- <one bullet per concrete decision in the session, ≤80 chars>',
    '',
    '## Open Questions',
    '- <one bullet per unresolved question, ≤80 chars>',
    '',
    '## Active Threads',
    '- <one bullet per work-in-progress thread, ≤80 chars>',
    '',
    'HARD RULES:',
    '  1. Every bullet must be grounded in the transcript below. Do not infer or add any fact not explicitly present in it. If unsure, omit it.',
    `  2. Total output ≤ ${maxOutputBytes} bytes.`,
    '  3. If a section has no entries, omit the heading entirely.',
    '  4. PRIVACY: never include personal names, email addresses, phone numbers, physical addresses, health details, or credentials in the output. Refer to people by role ("the user", "a teammate"). This output lands in a git-committed file.',
    '  5. No prose around the headings — only the bulleted list per section.',
    '  6. Your output goes directly into the project\'s memory. Do not address the user, do not refer to yourself.',
    '',
    '=== BEGIN SESSION TRANSCRIPT ===',
  ].join('\n');
}

function collectIdsFromFile(path, re, ids) {
  let text = '';
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    return;
  }
  for (const m of text.matchAll(re)) ids.add(m[1].toLowerCase());
}

function listDayFiles(sessionsDir) {
  try {
    return readdirSync(sessionsDir).filter((n) => n.startsWith('today-') && n.endsWith('.md'));
  } catch {
    return [];
  }
}

/**
 * Every session id this project has already processed (imported, screened,
 * or skipped-empty). Primary artifact: the committed ledger. Secondary:
 * `imported-session:` markers in the day files — covers a run killed between
 * the day-file append and the ledger append (ADR-0020 step ordering).
 *
 * @returns {Set<string>} lowercase session UUIDs
 */
export function readImportedSessionIds(projectRoot) {
  const ids = new Set();
  const ledger = ledgerPath(projectRoot);
  if (existsSync(ledger)) collectIdsFromFile(ledger, LEDGER_LINE_RE, ids);
  const sessionsDir = join(projectRoot, ...SESSIONS_REL);
  for (const name of listDayFiles(sessionsDir)) {
    collectIdsFromFile(join(sessionsDir, name), MARKER_RE, ids);
  }
  return ids;
}

function appendLedgerLine(projectRoot, { ts, sessionId, slug, date, status }) {
  const path = ledgerPath(projectRoot);
  mkdirSync(dirname(path), { recursive: true });
  const line = `- ${ts} ${sessionId} slug:${slug} date:${date ?? '?'} status:${status}\n`;
  if (!existsSync(path)) {
    appendFileSync(path, LEDGER_HEADER + line, 'utf8');
  } else {
    appendFileSync(path, line, 'utf8');
  }
}

function auditImport(projectRoot, { ts, sessionId, reasonCode, extra }) {
  try {
    appendAuditEntry(join(projectRoot, 'context'), {
      ts,
      action: 'import-session',
      tier: 'P',
      id: sessionId,
      reasonCode,
      extra,
    });
  } catch {
    // Best-effort observability — an audit failure never blocks the import.
  }
}

function sessionDateFor(extractResult, mtimeMs) {
  const iso = extractResult?.sessionEnd || extractResult?.sessionStart;
  if (iso && /^\d{4}-\d{2}-\d{2}/.test(iso)) return iso.slice(0, 10);
  return new Date(mtimeMs).toISOString().slice(0, 10);
}

// Best-effort: make the freshly-written day files searchable now instead of
// at the next session boot. Lazy import keeps the sqlite dependency out of
// the hot path when nothing was imported.
async function syncSearchIndex(projectRoot) {
  try {
    const { openIndexDb } = await import('./index-db.mjs');
    const { syncTranscriptChunks } = await import('./transcript-index.mjs');
    const db = openIndexDb({ projectRoot });
    try {
      syncTranscriptChunks({ db, projectRoot });
    } finally {
      db.close();
    }
    return true;
  } catch {
    return false; // next reindexBoot self-heals
  }
}

// Discovery → dedup vs the resume artifacts → active-session deferral →
// newest-first cap → oldest-first processing order.
function selectSessions({ projectRoot, scopeSlug, sinceIso, harnessRoot, ts, maxSessions }) {
  const discovered = discoverSessions({ slug: scopeSlug, sinceIso, harnessRoot });
  const done = readImportedSessionIds(projectRoot);
  const notDone = discovered.filter((s) => !done.has(s.sessionId.toLowerCase()));
  const activeCutoffMs = new Date(ts).getTime() - ACTIVE_SESSION_GRACE_MS;
  const fresh = notDone.filter((s) => s.mtimeMs <= activeCutoffMs);
  // discoverSessions sorts newest-first: the cap keeps the NEWEST history
  // (the most valuable on day one), then we process oldest-first so day
  // files build chronologically and a killed run resumes forward.
  const selected = fresh.slice(0, Math.max(0, maxSessions));
  selected.reverse();
  return {
    discovered: discovered.length,
    alreadyImported: discovered.length - notDone.length,
    skippedActive: notDone.length - fresh.length,
    selected,
  };
}

function buildDryRunPreview(selected, backend) {
  return selected.map((s) => {
    let bytes = 0;
    try {
      bytes = statSync(s.jsonlPath).size;
    } catch {
      bytes = 0;
    }
    return {
      sessionId: s.sessionId,
      slug: s.slug,
      mtime: new Date(s.mtimeMs).toISOString(),
      jsonlBytes: bytes,
      estimatedCostUSD:
        backend && typeof backend.estimatedCostPerCall === 'function'
          ? backend.estimatedCostPerCall(bytes)
          : null,
    };
  });
}

// B1 (skill-review, fail-closed): the raw floor holds UN-screened text on a
// path only the v0.6.0 gitignore fragment covers — an upgraded-but-not-
// reinstalled project's old managed block would let `git add context/`
// commit it. Refresh the managed block via the install machinery, then
// VERIFY coverage; unverifiable → raw extracts go to a temp dir instead
// (the summaries still flow — the floor is skipped, honestly reported).
function resolveRawDir(projectRoot) {
  refreshGitignoreBlock(projectRoot);
  let rawFloorProtected = false;
  try {
    const giText = readFileSync(join(projectRoot, '.gitignore'), 'utf8');
    rawFloorProtected =
      giText.includes('context/transcripts/imported/') ||
      /^context\/transcripts\/\s*$/m.test(giText);
  } catch {
    rawFloorProtected = false;
  }
  const rawDir = rawFloorProtected
    ? rawImportDir(projectRoot)
    : mkdtempSync(join(tmpdir(), 'cmk-import-raw-'));
  return { rawDir, rawFloorProtected };
}

// Oversized extracts send only their tail (IMPORT_INPUT_MAX_BYTES) — the
// full text stays on the raw floor. Tail starts at a line boundary so the
// summarizer never sees a torn line (or a torn multi-byte char from the
// byte slice).
function boundSummarizeInput(input) {
  const inputBytes = Buffer.byteLength(input, 'utf8');
  if (inputBytes <= IMPORT_INPUT_MAX_BYTES) return input;
  const buf = Buffer.from(input, 'utf8');
  let tail = buf.subarray(buf.length - IMPORT_INPUT_MAX_BYTES).toString('utf8');
  const nl = tail.indexOf('\n');
  if (nl !== -1) tail = tail.slice(nl + 1);
  return (
    `[transcript truncated for summarization — kept the final ${Math.round(IMPORT_INPUT_MAX_BYTES / 1024)} KB of ${Math.round(inputBytes / 1024)} KB; the full extract is preserved on the raw floor]\n\n` +
    tail
  );
}

// One session through steps 1–5. Returns a tagged outcome; the caller
// routes it into the run's result arrays. `ctx` = the per-run invariants.
async function importOneSession(s, ctx) {
  const { projectRoot, backend, ts, rawDir, privacyOn, timeoutMs, maxAttempts } = ctx;
  const sessionId = s.sessionId.toLowerCase();

  // 1. Raw floor (ADR-0010).
  const rawPath = join(rawDir, `${sessionId}.md`);
  const extracted = extractTranscript({ inputPath: s.jsonlPath, outputPath: rawPath });
  if (extracted.action !== 'completed') {
    return { type: 'failed', entry: { sessionId, error_category: extracted.errorCategory ?? 'extract-failed' } };
  }
  const date = sessionDateFor(extracted, s.mtimeMs);

  if (extracted.turnsKept === 0) {
    appendLedgerLine(projectRoot, { ts, sessionId, slug: s.slug, date, status: 'skipped-empty' });
    auditImport(projectRoot, {
      ts, sessionId,
      reasonCode: REASON_CODES.IMPORT_SKIPPED_EMPTY,
      extra: { slug: s.slug, date },
    });
    return { type: 'empty' };
  }

  // 2. Summarize (one agent-relative backend call; privacy judged in-prompt
  //    per the ADR-0019 sessions-tier posture).
  const input = boundSummarizeInput(readFileSync(rawPath, 'utf8'));
  let result;
  try {
    result = await compressWithRetry(
      backend,
      {
        input,
        instructions: buildImportInstructions(date, SUMMARY_MAX_BYTES),
        preserveCitationIds: false,
        maxOutputBytes: SUMMARY_MAX_BYTES,
        timeoutMs,
      },
      { maxAttempts, baseBackoffMs: CEILING_FREE_BACKOFF_MS },
    );
    touchCooldownMarker({ projectRoot, now: ts });
  } catch (err) {
    touchCooldownMarker({ projectRoot, now: ts });
    const error_category =
      err instanceof HaikuTimeoutError
        ? ERROR_CATEGORIES.HAIKU_TIMEOUT
        : ERROR_CATEGORIES.COMPRESS_FAILED;
    // NOT ledgered — the next run retries this session.
    return { type: 'failed', entry: { sessionId, error_category } };
  }

  // I1: empty/refusal output = FAILURE (not ledgered → retried next run),
  // never a permanently-consumed session with a marker-only day block.
  let summary = String(result.outputText ?? '').trim();
  if (summary === '' || looksLikeRefusal(summary)) {
    return { type: 'failed', entry: { sessionId, error_category: 'empty-summary' } };
  }

  // 3. L1 mask + the committed-write screen (216).
  if (privacyOn) {
    summary = maskPii(summary, { usernames: localUsernames() }).text;
  }
  const guard = screenBeforeCommittedWrite(summary, { projectRoot, source: 'import-sessions', ts });
  if (guard.rejected) {
    appendLedgerLine(projectRoot, { ts, sessionId, slug: s.slug, date, status: 'screened' });
    auditImport(projectRoot, {
      ts, sessionId,
      reasonCode: REASON_CODES.IMPORT_SCREENED,
      extra: { slug: s.slug, date, pattern_id: guard.pattern_id },
    });
    return { type: 'screened', entry: { sessionId, pattern_id: guard.pattern_id } };
  }

  // 4. Day-file append with the Task-213 provenance marker.
  const marker = `<!-- imported-session: ${sessionId} slug: ${s.slug} spans: ${extracted.sessionStart ?? '?'} → ${extracted.sessionEnd ?? '?'} -->`;
  const dayPath = appendToTodayMd({ projectRoot, date, body: `${marker}\n${summary}\n` });

  // 5. Ledger + audit — the unit is durable from here (ADR-0020).
  appendLedgerLine(projectRoot, { ts, sessionId, slug: s.slug, date, status: 'imported' });
  auditImport(projectRoot, {
    ts, sessionId,
    reasonCode: REASON_CODES.IMPORT_APPLIED,
    extra: { slug: s.slug, date, turnsKept: extracted.turnsKept },
  });
  return {
    type: 'imported',
    entry: {
      sessionId,
      slug: s.slug,
      date,
      dayFile: dayPath,
      turnsKept: extracted.turnsKept,
      summaryBytes: Buffer.byteLength(summary, 'utf8'),
    },
  };
}

/**
 * Import existing Claude Code session history into the project memory.
 * See the module header for the per-session pipeline.
 */
export async function importSessions({
  projectRoot,
  backend,
  now,
  harnessRoot,
  slug,
  allProjects = false,
  sinceIso,
  maxSessions = DEFAULT_MAX_SESSIONS,
  dryRun = false,
  timeoutMs = CEILING_FREE_TIMEOUT_MS,
  maxAttempts = 2,
} = {}) {
  const errors = [];
  if (!projectRoot) errors.push('projectRoot: required');
  if (!dryRun && !backend) errors.push('backend: required');
  if (errors.length > 0) {
    return errorResult({ category: ERROR_CATEGORIES.SCHEMA, errors });
  }
  const ts = now ?? nowIso();

  const scopeSlug = allProjects ? undefined : (slug ?? harnessSlugForPath(projectRoot));
  const sel = selectSessions({ projectRoot, scopeSlug, sinceIso, harnessRoot, ts, maxSessions });
  if (sel.discovered === 0) {
    return {
      action: 'skipped',
      reason: 'no-sessions',
      discovered: 0,
      alreadyImported: 0,
      selected: 0,
      imported: [],
      screened_out: [],
      failed: [],
    };
  }

  const base = {
    discovered: sel.discovered,
    alreadyImported: sel.alreadyImported,
    skippedActive: sel.skippedActive,
    selected: sel.selected.length,
  };

  if (dryRun) {
    return {
      action: 'dry-run',
      ...base,
      imported: [],
      screened_out: [],
      failed: [],
      preview: buildDryRunPreview(sel.selected, backend),
    };
  }

  const imported = [];
  const screenedOut = [];
  const failed = [];
  const { rawDir, rawFloorProtected } = resolveRawDir(projectRoot);
  const ctx = {
    projectRoot,
    backend,
    ts,
    rawDir,
    privacyOn: resolvePrivacyScreen({ projectRoot }) === 'on',
    timeoutMs,
    maxAttempts,
  };

  for (const s of sel.selected) {
    const outcome = await importOneSession(s, ctx);
    if (outcome.type === 'imported') imported.push(outcome.entry);
    else if (outcome.type === 'screened') screenedOut.push(outcome.entry);
    else if (outcome.type === 'failed') failed.push(outcome.entry);
    // 'empty' is ledgered + audited inside the unit; nothing to collect.
  }

  // 6. Searchable immediately (best-effort; reindexBoot self-heals).
  let indexSynced = false;
  if (imported.length > 0) {
    indexSynced = await syncSearchIndex(projectRoot);
  }

  return {
    action: 'completed',
    ...base,
    imported,
    screened_out: screenedOut,
    failed,
    indexSynced,
    rawFloorProtected,
  };
}
