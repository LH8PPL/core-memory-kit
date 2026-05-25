// Auto-extract subagent (Task 23, T-020).
//
// Pattern inspired by claude-remember (https://github.com/Digital-
// Process-Tools/claude-remember, Community License) — see
// docs/research/2026-05-25-claude-remember-code-dive.md and SOURCES.md
// for the absorbed ideas + license posture. Implementation written
// from scratch per design.md §6; no code or prompts copied verbatim.
//
// Spawned detached by Task 21's Stop hook (cmk-capture-turn). Reads
// the just-captured assistant turn from a temp file, asks a sandboxed
// Haiku to identify durable facts per the six writing triggers from
// design §6.4, then routes each candidate by trust:
//   high   → appended to context/MEMORY.md (Active Threads) via
//            appendScratchpadBullet (the canonical scratchpad writer
//            from Task 12). Task 24 will re-route this through the
//            memory-write skill so Poison_Guard runs pre-write; until
//            then, auto-extract writes go straight to MEMORY.md.
//   medium → appended to context/queues/review.md (user reviews via
//            `cmk queue review`).
//   low    → discarded; logged as skipped_reason "nothing_durable".
//
// Public boundary: runAutoExtract({turnFile, projectRoot, haikuBackend,
// now, sessionId}) → result. The bin wrapper at
// plugin/bin/cmk-auto-extract.mjs constructs a real
// HaikuViaAnthropicApi and calls this function with the turn file
// path passed in argv[2] from Task 21's spawn.

import {
  existsSync,
  mkdirSync,
  openSync,
  closeSync,
  writeSync,
  readFileSync,
  unlinkSync,
  appendFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { generateId } from '../../canonicalize/src/index.mjs';
import { appendScratchpadBullet } from './scratchpad.mjs';
import { nowIso } from './audit-log.mjs';
import { ERROR_CATEGORIES } from './result-shapes.mjs';

const LOCK_FILENAME = 'auto-extract.lock';
const NOW_MD_RELATIVE = ['context', 'sessions', 'now.md'];
const REVIEW_QUEUE_RELATIVE = ['context', 'queues', 'review.md'];
const EXTRACT_LOG_DIR_RELATIVE = ['context', 'sessions'];

// Noise tags absorbed from the code-dive note — generic markers Claude
// Code injects that aren't part of real exchanges and should never
// reach the extraction prompt.
const NOISE_TAG_PATTERNS = [
  /<system-reminder>[\s\S]*?<\/system-reminder>/g,
  /<command-name>[\s\S]*?<\/command-name>/g,
  /<local-command-stdout>[\s\S]*?<\/local-command-stdout>/g,
  /<local-command-stderr>[\s\S]*?<\/local-command-stderr>/g,
  /<local-command-output>[\s\S]*?<\/local-command-output>/g,
];

// Force-save tag from design §6.6 — content wrapped in <retain> is kept
// at trust:high regardless of what Haiku decided.
const RETAIN_RE = /<retain>([\s\S]*?)<\/retain>/g;

// Trust labels Haiku emits in our prompt's response format. Anything
// not matching a label is ignored (resilient against minor format drift).
const CANDIDATE_LINE_RE = /^TRUST_(HIGH|MEDIUM|LOW):\s*(.+)$/i;
const SKIP_LINE_RE = /^\s*SKIP\s*$/i;

// --- Lock file primitives -------------------------------------------

function acquireLock(lockPath) {
  mkdirSync(dirname(lockPath), { recursive: true });
  // O_CREAT | O_EXCL: atomic-create-or-fail. The 'wx' flag in Node
  // maps to that combination — exactly the noclobber semantics from
  // claude-remember's bash pattern.
  try {
    const fd = openSync(lockPath, 'wx');
    writeSync(fd, String(process.pid), 0, 'utf8');
    closeSync(fd);
    return { acquired: true };
  } catch (err) {
    if (err.code !== 'EEXIST') {
      return { acquired: false, reason: 'lock-error', error: err };
    }
  }
  // Lock exists. Check if the holding PID is alive.
  let pid = null;
  try {
    pid = parseInt(readFileSync(lockPath, 'utf8').trim(), 10);
  } catch {
    // Lock file unreadable — treat as stale.
  }
  if (pid && pidIsAlive(pid)) {
    return { acquired: false, reason: 'pid-alive', pid };
  }
  // Stale lock. Remove + retry once. (No infinite loop — at most two
  // attempts so an unrelated concurrent kill races doesn't deadlock.)
  try {
    unlinkSync(lockPath);
  } catch (err) {
    // Another process beat us to the cleanup; treat as contention.
    if (err.code !== 'ENOENT') {
      return { acquired: false, reason: 'lock-cleanup-failed', error: err };
    }
  }
  try {
    const fd = openSync(lockPath, 'wx');
    writeSync(fd, String(process.pid), 0, 'utf8');
    closeSync(fd);
    return { acquired: true, recoveredStale: true };
  } catch (err) {
    return { acquired: false, reason: 'lock-error-after-recovery', error: err };
  }
}

function pidIsAlive(pid) {
  // process.kill with signal 0 is a permission check — doesn't actually
  // signal. ESRCH → no such process; EPERM → process exists but we
  // can't signal it; success → exists and we can signal. Either of the
  // last two means "alive".
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === 'EPERM';
  }
}

function releaseLock(lockPath) {
  try {
    unlinkSync(lockPath);
  } catch {
    // Best-effort; if the lock is already gone, fine.
  }
}

// --- Turn-file sanitization -----------------------------------------

function stripNoiseTags(text) {
  let out = text;
  for (const re of NOISE_TAG_PATTERNS) {
    out = out.replace(re, '');
  }
  return out;
}

function extractRetainSegments(text) {
  const segments = [];
  let m;
  RETAIN_RE.lastIndex = 0;
  while ((m = RETAIN_RE.exec(text)) !== null) {
    segments.push(m[1].trim());
  }
  return segments;
}

// --- Dedup context --------------------------------------------------

function readLastEntryFromNowMd(projectRoot) {
  const nowMd = join(projectRoot, ...NOW_MD_RELATIVE);
  if (!existsSync(nowMd)) return '';
  let body;
  try {
    body = readFileSync(nowMd, 'utf8');
  } catch {
    return '';
  }
  // Find the last `## ` heading and return everything from it to end.
  const lines = body.split('\n');
  let lastHeadingIdx = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (/^##\s/.test(lines[i])) {
      lastHeadingIdx = i;
      break;
    }
  }
  if (lastHeadingIdx === -1) return '';
  return lines.slice(lastHeadingIdx).join('\n').trim();
}

// --- Prompt construction --------------------------------------------

// Written from scratch per design §6.4 — no text copied from claude-
// remember's prompts. The six writing triggers are our own
// paraphrase; the constrained output format (TRUST_HIGH/MEDIUM/LOW
// prefix lines) is our own design.
function buildExtractionInstructions() {
  return [
    'You are a memory-extraction agent for claude-memory-kit.',
    'You read a captured assistant turn and identify durable facts worth saving.',
    '',
    'Save when the turn reveals any of the six writing triggers:',
    '  1. User corrections — "don\'t do that again", "use this instead".',
    '  2. Discovered preferences — patterns across multiple turns.',
    '  3. Environment facts — tool versions, paths, configurations.',
    '  4. Project conventions — discovered through code inspection.',
    '  5. Completed complex workflows — 5+ tool calls; the approach is worth recording.',
    '  6. Tool quirks and workarounds — non-obvious findings.',
    '',
    'Skip: conversational chatter, trivial info, raw data dumps, session-specific ephemera.',
    '',
    'Output format (one candidate per line; any other lines are ignored):',
    '  TRUST_HIGH: <short bullet text>     — for vetted, durable facts the user clearly asserted.',
    '  TRUST_MEDIUM: <short bullet text>   — for inferred or pattern-based facts that deserve user review.',
    '  TRUST_LOW: <short bullet text>      — for weakly-signaled facts (will be discarded; only emit if you think it MIGHT be useful).',
    '  SKIP                                — emit on its own line if nothing in the turn is worth saving.',
    '',
    'Constraints:',
    '  - Each bullet ≤ 200 chars.',
    '  - No prose around the labels.',
    '  - Do not invent facts; only restate what the turn shows.',
    '  - If a previous entry context is included below, do NOT re-emit facts already in it.',
  ].join('\n');
}

function buildExtractionPrompt({ turnBody, dedupContext }) {
  const sections = [];
  if (dedupContext) {
    sections.push('# Previous entry (do not re-emit facts already here)');
    sections.push(dedupContext);
    sections.push('');
  }
  sections.push('# Captured assistant turn');
  sections.push(turnBody);
  return sections.join('\n');
}

function parseCandidates(haikuOutput) {
  if (!haikuOutput || typeof haikuOutput !== 'string') return [];
  const lines = haikuOutput.split('\n');
  const candidates = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (SKIP_LINE_RE.test(trimmed)) continue;
    const m = trimmed.match(CANDIDATE_LINE_RE);
    if (!m) continue;
    const trust = m[1].toLowerCase();
    const text = m[2].trim();
    if (text === '') continue;
    candidates.push({ trust, text });
  }
  return candidates;
}

// Force-promote any candidate whose text overlaps substantively with a
// <retain> segment from the original turn. Per design §6.6: <retain>
// is the force-save signal that overrides Haiku's trust judgment.
//
// Match semantics (deliberately conservative, per code-review B1 fix):
//   - Forward-only: the candidate text must CONTAIN the retain segment.
//     The reverse direction (retain contains candidate) was rejected
//     because it lets a small retain segment promote any candidate that
//     happens to contain a tiny common substring (e.g. <retain>x</retain>
//     would promote anything with an "x").
//   - Minimum length: the matching retain segment must be at least
//     MIN_RETAIN_MATCH_CHARS long. Stops trivially-short retain segments
//     from grabbing unrelated candidates.
const MIN_RETAIN_MATCH_CHARS = 20;

function applyRetainOverride(candidates, retainSegments) {
  if (retainSegments.length === 0) return candidates;
  return candidates.map((c) => {
    const matched = retainSegments.some(
      (seg) => seg.length >= MIN_RETAIN_MATCH_CHARS && c.text.includes(seg),
    );
    return matched ? { ...c, trust: 'high', retainOverride: true } : c;
  });
}

// --- Routing --------------------------------------------------------

function routeHigh({ candidate, projectRoot, ts, sessionId }) {
  // Auto-extract writes go to the project tier's MEMORY.md, Active
  // Threads section. The scratchpad writer enforces caps + dedup; this
  // module passes the documented provenance fields per design §6.6.
  //
  // KNOWN GAP (closed by Task 24): this write bypasses Poison_Guard.
  // Task 24 will route auto-extract through the memory-write skill,
  // which applies the regex secret/injection filter before any disk
  // write. Until then, auto-extracted high-trust content lands in
  // MEMORY.md unfiltered. Users SHOULD NOT enable real auto-extract
  // in committed-tier scenarios until Task 24 merges.
  //
  // Provenance sha1: real SHA-1 of the bullet text. The retain-vs-
  // haiku origin is recorded on the in-memory result struct
  // (candidate.retainOverride), not in provenance — sha1 is a
  // content hash, not an origin marker.
  const sha1 = createHash('sha1').update(candidate.text, 'utf8').digest('hex');
  return appendScratchpadBullet({
    tier: 'P',
    scratchpad: 'MEMORY.md',
    section: 'Active Threads',
    text: candidate.text,
    projectRoot,
    provenance: {
      source: `auto-extract-${sessionId ?? 'session'}`,
      source_line: 1,
      sha1,
      write: 'auto-extract',
      trust: 'high',
      at: ts,
    },
    now: ts,
  });
}

function routeMedium({ candidate, projectRoot, ts }) {
  const reviewPath = join(projectRoot, ...REVIEW_QUEUE_RELATIVE);
  mkdirSync(dirname(reviewPath), { recursive: true });
  const id = generateId('P', candidate.text);
  const block = [
    `## ${ts} — auto-extract (medium-trust, pending review)`,
    `- (${id}) ${candidate.text}`,
    `  <!-- proposed_trust: medium, write: auto-extract, at: ${ts} -->`,
    '',
  ].join('\n');
  appendFileSync(reviewPath, block, 'utf8');
  return { action: 'queued', id, path: reviewPath };
}

// --- NDJSON extract.log ---------------------------------------------

function writeExtractLogEntry({ projectRoot, ts, entry }) {
  const date = ts.slice(0, 10);
  const logPath = join(projectRoot, ...EXTRACT_LOG_DIR_RELATIVE, `${date}.extract.log`);
  mkdirSync(dirname(logPath), { recursive: true });
  appendFileSync(logPath, JSON.stringify(entry) + '\n', 'utf8');
  return logPath;
}

// --- Public boundary ------------------------------------------------

export async function runAutoExtract({
  turnFile,
  projectRoot,
  haikuBackend,
  now,
  sessionId,
} = {}) {
  const ts = now ?? nowIso();
  const t0 = Date.now();
  const baseEntry = {
    ts,
    success: false,
    error_category: null,
    observation_count: 0,
    skipped_reason: null,
    duration_ms: 0,
  };

  if (!projectRoot) {
    return {
      action: 'error',
      error_category: ERROR_CATEGORIES.MISSING_PROJECT_ROOT,
      observation_count: 0,
      duration_ms: Date.now() - t0,
      logPath: null,
      candidates: [],
    };
  }
  if (!haikuBackend || typeof haikuBackend.compress !== 'function') {
    return {
      action: 'error',
      error_category: ERROR_CATEGORIES.MISSING_BACKEND,
      observation_count: 0,
      duration_ms: Date.now() - t0,
      logPath: null,
      candidates: [],
    };
  }

  const lockPath = join(projectRoot, 'context', '.locks', LOCK_FILENAME);
  const lock = acquireLock(lockPath);
  if (!lock.acquired) {
    // Per code-review I3: set only error_category here, not
    // skipped_reason — concurrent_run is a transient error (retry on
    // the next Stop event), not a "Haiku said nothing durable" skip.
    const entry = {
      ...baseEntry,
      success: false,
      error_category: ERROR_CATEGORIES.CONCURRENT_RUN,
      duration_ms: Date.now() - t0,
    };
    const logPath = writeExtractLogEntry({ projectRoot, ts, entry });
    return {
      action: 'concurrent',
      error_category: ERROR_CATEGORIES.CONCURRENT_RUN,
      observation_count: 0,
      duration_ms: entry.duration_ms,
      logPath,
      candidates: [],
    };
  }

  try {
    // 1. Read turn file.
    if (!existsSync(turnFile)) {
      const entry = {
        ...baseEntry,
        success: false,
        error_category: ERROR_CATEGORIES.MISSING_TURN,
        duration_ms: Date.now() - t0,
      };
      const logPath = writeExtractLogEntry({ projectRoot, ts, entry });
      return {
        action: 'error',
        error_category: ERROR_CATEGORIES.MISSING_TURN,
        observation_count: 0,
        duration_ms: entry.duration_ms,
        logPath,
        candidates: [],
      };
    }
    const rawTurn = readFileSync(turnFile, 'utf8');
    if (rawTurn.trim() === '') {
      const entry = {
        ...baseEntry,
        success: true,
        skipped_reason: 'empty_turn',
        duration_ms: Date.now() - t0,
      };
      const logPath = writeExtractLogEntry({ projectRoot, ts, entry });
      return {
        action: 'skipped',
        skipped_reason: 'empty_turn',
        observation_count: 0,
        duration_ms: entry.duration_ms,
        logPath,
        candidates: [],
      };
    }

    // 2. Sanitize: strip noise tags + extract <retain> segments
    //    (for the override).
    const retainSegments = extractRetainSegments(rawTurn);
    const sanitized = stripNoiseTags(rawTurn);

    // 3. Build prompt with dedup context.
    const dedupContext = readLastEntryFromNowMd(projectRoot);
    const instructions = buildExtractionInstructions();
    const promptBody = buildExtractionPrompt({
      turnBody: sanitized,
      dedupContext,
    });

    // 4. Call Haiku.
    let haikuResult;
    try {
      haikuResult = await haikuBackend.compress({
        input: promptBody,
        instructions,
        maxOutputBytes: 2000,
        preserveCitationIds: false,
      });
    } catch (err) {
      const entry = {
        ...baseEntry,
        success: false,
        error_category: ERROR_CATEGORIES.HAIKU_FAILED,
        duration_ms: Date.now() - t0,
      };
      const logPath = writeExtractLogEntry({ projectRoot, ts, entry });
      return {
        action: 'error',
        error_category: ERROR_CATEGORIES.HAIKU_FAILED,
        observation_count: 0,
        duration_ms: entry.duration_ms,
        logPath,
        candidates: [],
        errorMessage: err?.message ?? String(err),
      };
    }

    // 5. Parse + apply <retain> override.
    let candidates = parseCandidates(haikuResult.outputText);
    candidates = applyRetainOverride(candidates, retainSegments);

    if (candidates.length === 0) {
      const entry = {
        ...baseEntry,
        success: true,
        skipped_reason: 'nothing_durable',
        duration_ms: Date.now() - t0,
      };
      const logPath = writeExtractLogEntry({ projectRoot, ts, entry });
      return {
        action: 'skipped',
        skipped_reason: 'nothing_durable',
        observation_count: 0,
        duration_ms: entry.duration_ms,
        logPath,
        candidates: [],
      };
    }

    // 6. Route each candidate. Low-trust candidates are discarded
    //    (counted toward "nothing durable" if they were the only
    //    output; otherwise just dropped from the writes).
    const writes = [];
    for (const candidate of candidates) {
      if (candidate.trust === 'high') {
        const r = routeHigh({ candidate, projectRoot, ts, sessionId });
        writes.push({ ...candidate, written: 'memory', result: r });
      } else if (candidate.trust === 'medium') {
        const r = routeMedium({ candidate, projectRoot, ts });
        writes.push({ ...candidate, written: 'review', result: r });
      } else {
        writes.push({ ...candidate, written: 'discarded' });
      }
    }

    const observation_count = writes.filter(
      (w) => w.written === 'memory' || w.written === 'review',
    ).length;

    if (observation_count === 0) {
      const entry = {
        ...baseEntry,
        success: true,
        skipped_reason: 'nothing_durable',
        duration_ms: Date.now() - t0,
      };
      const logPath = writeExtractLogEntry({ projectRoot, ts, entry });
      return {
        action: 'skipped',
        skipped_reason: 'nothing_durable',
        observation_count: 0,
        duration_ms: entry.duration_ms,
        logPath,
        candidates: writes,
      };
    }

    const entry = {
      ...baseEntry,
      success: true,
      observation_count,
      duration_ms: Date.now() - t0,
    };
    const logPath = writeExtractLogEntry({ projectRoot, ts, entry });
    return {
      action: 'extracted',
      observation_count,
      duration_ms: entry.duration_ms,
      logPath,
      candidates: writes,
    };
  } finally {
    releaseLock(lockPath);
  }
}
