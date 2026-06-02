// Auto-extract subagent (Task 23, T-020).
//
// Pattern inspired by claude-remember (https://github.com/Digital-
// Process-Tools/claude-remember, Community License) — see
// docs/research/2026-05-25-claude-remember-code-dive.md and SOURCES.md
// for the absorbed ideas + license posture. Implementation written
// from scratch per design.md §6; no code or prompts copied verbatim.
//
// Spawned detached by Task 21's Stop hook (cmk-capture-turn). Reads
// the just-captured turn pair (user prompt + assistant response) from
// a temp file, asks a sandboxed Haiku to identify durable facts per
// the six writing triggers from design §6.4, then routes each
// candidate by trust:
//   high   → memoryWrite({action:'add', tier:'P', ...}) — same public
//            boundary the user-explicit memory-write Skill uses. The
//            write goes through Poison_Guard (design §6.7) before
//            touching MEMORY.md (Active Threads). Task 24 closed the
//            documented Poison_Guard bypass that Task 23 left open.
//   medium → appended to context/queues/review.md (user reviews via
//            `cmk queue review`).
//   low    → discarded; logged as skipped_reason "nothing_durable".
//
// Bi-turn extraction (2026-05-26 amendment, see design §6.4 +
// docs/journey/2026-05-26-live-test-findings.md): the temp file
// carries BOTH turns with explicit USER_TURN: / ASSISTANT_TURN:
// markers. Haiku tags each candidate with origin (user|assistant);
// assistant-origin candidates demote one trust level (HIGH → MEDIUM,
// MEDIUM → LOW, LOW → discarded) so assistant inferences land in the
// review queue for user confirmation rather than auto-applying. The
// <retain> override beats demotion (force-promotes to HIGH).
// Within-call dedup by canonical-ID keeps the higher-trust candidate
// when the user states a fact and the assistant echoes it.
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
import { join, dirname } from 'node:path';
import { generateId } from '@lh8ppl/cmk-canonicalize';
import { memoryWrite } from './memory-write.mjs';
import { HaikuTimeoutError } from './compressor.mjs';
import { pidIsAlive } from './lock-discipline.mjs';
import { nowIso } from './audit-log.mjs';
import { ERROR_CATEGORIES } from './result-shapes.mjs';
import { touchCooldownMarker } from './cooldown.mjs';
// Task 61 — inline cross-project promotion. Reuse auto-persona's classifier
// directive, parser, and promote-to-user-tier path so the SAME per-turn Haiku
// call that extracts project facts ALSO promotes cross-project doctrine to the
// user tier immediately (vs waiting for the weekly auto-persona janitor).
import { parsePersonaCandidates, promoteCandidatesToUserTier, PERSONA_CONFIDENCE_RULE } from './auto-persona.mjs';

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
// Shape: `TRUST_<HIGH|MEDIUM|LOW> <user|assistant>: <text>`
const CANDIDATE_LINE_RE = /^TRUST_(HIGH|MEDIUM|LOW)\s+(user|assistant):\s*(.+)$/i;
const SKIP_LINE_RE = /^\s*SKIP\s*$/i;

// Demotion map for assistant-origin candidates (design §6.4 amendment).
// HIGH → MEDIUM → LOW → discarded. Discarded candidates never reach the
// router; they're dropped immediately and counted toward
// `skipped_reason: nothing_durable` if everything demotes away.
const ASSISTANT_DEMOTION = Object.freeze({
  high: 'medium',
  medium: 'low',
  low: 'discarded',
});

// Trust ranking for the within-call dedup tiebreak. Higher = stronger.
const TRUST_RANK = Object.freeze({
  high: 3,
  medium: 2,
  low: 1,
  discarded: 0,
});

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

// pidIsAlive is consolidated in lock-discipline.mjs — same probe is
// used by cmk doctor HC-9 + this module's stale-recovery path.
// Importing instead of inlining eliminates drift risk (the kit's
// shared-modules rule, CLAUDE.md §1.3).

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

// --- Turn-file parser (bi-turn) -------------------------------------

// Parse the temp-file format Task 21's capture-turn writes:
//   USER_TURN:
//   <user body>
//
//   ASSISTANT_TURN:
//   <assistant body>
// Either section may be empty. If no USER_TURN: / ASSISTANT_TURN:
// markers are present, fall back to "the whole file is the assistant
// turn" so old-format temp files (pre-2026-05-26) still work — useful
// when running auto-extract against a turn buffer that pre-dates this
// amendment (unlikely after the rollout, but defensive).
const USER_TURN_RE = /^[ \t]*USER_TURN:\s*\n([\s\S]*?)(?=^[ \t]*ASSISTANT_TURN:|\Z)/m;
const ASSISTANT_TURN_RE = /^[ \t]*ASSISTANT_TURN:\s*\n([\s\S]*)$/m;

function parseTurnFile(rawTurn) {
  const userMatch = rawTurn.match(USER_TURN_RE);
  const assistantMatch = rawTurn.match(ASSISTANT_TURN_RE);
  if (!userMatch && !assistantMatch) {
    // Old-format / unlabeled — treat whole content as assistant.
    return { userTurn: '', assistantTurn: rawTurn.trim() };
  }
  return {
    userTurn: (userMatch?.[1] ?? '').trim(),
    assistantTurn: (assistantMatch?.[1] ?? '').trim(),
  };
}

// --- Prompt construction --------------------------------------------

// Written from scratch per design §6.4 — no text copied from claude-
// remember's prompts. Output format encodes origin so the routing
// layer can apply the assistant-demotion rule (§6.4 amendment, 2026-05-26).
export function buildExtractionInstructions() {
  return [
    'You are a memory-extraction agent for claude-memory-kit.',
    'You read a captured turn pair (the user prompt + the assistant response) and identify durable facts worth saving.',
    '',
    'The user is the authority on facts about themselves and their preferences.',
    'The assistant is inferring or echoing — treat its observations as proposals to confirm later, not as ground truth.',
    '',
    'Save when EITHER turn reveals any of the six writing triggers:',
    '  1. User corrections — "don\'t do that again", "use this instead".',
    '  2. Discovered preferences — patterns across multiple turns.',
    '  3. Environment facts — tool versions, paths, configurations.',
    '  4. Project conventions — discovered through code inspection.',
    '  5. Completed complex workflows — 5+ tool calls; the approach is worth recording.',
    '  6. Tool quirks and workarounds — non-obvious findings.',
    '',
    'Skip: conversational chatter, trivial info, raw data dumps, session-specific ephemera.',
    '',
    'Output format (one candidate per line; tag each with origin = user OR assistant):',
    '  TRUST_HIGH user: <text>          — user clearly stated this; high confidence',
    '  TRUST_MEDIUM user: <text>        — user mentioned this but ambiguously',
    '  TRUST_LOW user: <text>           — barely a signal (rarely emit)',
    '  TRUST_HIGH assistant: <text>     — assistant inferred this with high confidence',
    '  TRUST_MEDIUM assistant: <text>   — assistant\'s weaker inference',
    '  TRUST_LOW assistant: <text>      — barely a signal (rarely emit)',
    '  SKIP                             — emit alone if nothing in either turn is worth saving',
    '',
    'Constraints:',
    '  - Each bullet ≤ 200 chars.',
    '  - No prose around the labels.',
    '  - Do not invent facts; only restate what the turns show.',
    '  - If a previous-entry context is included below, do NOT re-emit facts already in it.',
    '',
    'Note: assistant-origin candidates are auto-demoted one trust level before routing (HIGH → MEDIUM → LOW → discarded). This is intentional — assistant inferences need user review. Emit your honest trust assessment; the routing layer handles demotion.',
    '',
    'ALSO — cross-project doctrine: if a fact expresses how this user works in EVERY project (tooling habits, architecture preferences, communication/process style — NOT this-project specifics like a port number or file name), emit one ADDITIONAL line for it (in addition to its TRUST_ line above), in this EXACT format:',
    '  PERSONA CANDIDATE | target=<HABITS.md|LESSONS.md|USER.md> | section=<Section> | confidence=<high|medium|low> | <one-line restatement>',
    '    - HABITS.md  → sections: Iteration Cadence | Destructive Operations | Communication Style',
    '    - LESSONS.md → sections: Tooling Lessons | Process Lessons | Anti-patterns',
    '    - USER.md    → sections: About | Preferences | Working Style',
    '  PREFER an existing section above — route to the closest fit. Only if NONE genuinely fits may you name a new short Title-Case section (2-4 words, letters/spaces only, e.g. "Architecture Preferences"). Never invent a new section when an existing one fits.',
    PERSONA_CONFIDENCE_RULE,
    '  Emit no PERSONA CANDIDATE line if nothing is cross-project.',
  ].join('\n');
}

function buildExtractionPrompt({ userTurn, assistantTurn, dedupContext }) {
  const sections = [];
  if (dedupContext) {
    sections.push('# Previous entry (do not re-emit facts already here)');
    sections.push(dedupContext);
    sections.push('');
  }
  sections.push('# USER_TURN');
  sections.push(userTurn || '(no user turn captured)');
  sections.push('');
  sections.push('# ASSISTANT_TURN');
  sections.push(assistantTurn || '(no assistant turn captured)');
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
    const origin = m[2].toLowerCase();
    const text = m[3].trim();
    if (text === '') continue;
    candidates.push({ trust, origin, text });
  }
  return candidates;
}

// Demote assistant-origin candidates one trust level. User-origin
// candidates pass through unchanged — they're authoritative.
// Order: must run BEFORE applyRetainOverride so the override beats
// demotion (an assistant-origin candidate inside a <retain> still
// force-promotes to HIGH).
function applyOriginDemotion(candidates) {
  return candidates.map((c) => {
    if (c.origin !== 'assistant') return c;
    const demoted = ASSISTANT_DEMOTION[c.trust] ?? c.trust;
    return { ...c, trust: demoted, demotedFrom: c.trust };
  });
}

// Group by canonical id of text; keep the highest-trust candidate per
// group. Handles the "user states X; assistant echoes X" duplicate
// problem. Note: canonical-id dedup is LITERAL — semantically-similar
// phrasings with different canonical forms slip through here and are
// resolved by Task 25's conflict queue at write time.
function dedupByCanonicalId(candidates) {
  const byId = new Map();
  for (const c of candidates) {
    const id = generateId('P', c.text);
    const existing = byId.get(id);
    if (!existing || (TRUST_RANK[c.trust] ?? 0) > (TRUST_RANK[existing.trust] ?? 0)) {
      byId.set(id, c);
    }
  }
  return [...byId.values()];
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

// Classifies a memoryWrite result for observation-counting purposes.
//
// Three categories of memoryWrite outcome that auto-extract cares about:
//   - 'memory'   — bullet appended to MEMORY.md (or other scratchpad)
//   - 'conflict' — bullet routed to queues/conflicts.md (the queue-route
//                  in memory-write.doAdd, when new.trust < existing.trust)
//   - 'rejected' — Poison_Guard / schema / cap-exceeded rejection
//
// At trust:high (where auto-extract calls memoryWrite) the queue-route
// is unreachable today: detectConflicts returns action:'supersede' when
// new.trust >= existing.trust. The explicit 'conflict' branch is
// defensive — if a v0.1.x change lowers auto-extract trust or alters
// supersede semantics, a 'queued' return would otherwise be silently
// misclassified as 'rejected'. observation_count counts both 'memory'
// AND 'conflict' since both are successful writes (just to different
// scratchpads).
//
// Exported for direct unit-testing — the queue-route is unreachable
// from the live auto-extract flow today (see above), so pinning the
// discriminator's behavior on each possible action value requires
// calling it with literal inputs.
export function classifyHighTrustWrite(r) {
  if (r?.action === 'appended') return 'memory';
  if (r?.action === 'queued') return 'conflict';
  return 'rejected';
}

function routeHigh({ candidate, projectRoot, ts, sessionId }) {
  // Auto-extract writes go to the project tier's MEMORY.md, Active
  // Threads section via memoryWrite() — the same public boundary the
  // user-explicit Skill uses. This routes the auto-extract write
  // through Poison_Guard (design §6.7), which was the KNOWN GAP
  // documented in Task 23 (rejected secrets / injection patterns
  // now blocked before they reach disk).
  //
  // memoryWrite() composes:
  //   1. Poison_Guard regex filter (rejects secrets + injections,
  //      logs to .locks/poison-guard.log with redacted excerpt).
  //   2. appendScratchpadBullet (cap + dedup + audit + ID derivation).
  //
  // The retain-vs-haiku origin is recorded on the in-memory result
  // struct (candidate.retainOverride), not in provenance — sha1 is a
  // content hash, not an origin marker.
  return memoryWrite({
    action: 'add',
    text: candidate.text,
    tier: 'P',
    scratchpad: 'MEMORY.md',
    section: 'Active Threads',
    source: 'auto-extract',
    sessionId: sessionId ?? 'session',
    trust: 'high',
    projectRoot,
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
  // `phase: 'extract'` discriminator added 2026-05-27 (PR-D2b) to
  // compose with capture-turn.mjs's `phase: 'spawn'` spawn-failed
  // entries. Both shapes coexist in the same NDJSON file; readers
  // route by `phase`. Pre-D2b entries WITHOUT a `phase` field can be
  // treated as `extract` by convention (the spawn-phase entries only
  // exist post-D2b).
  appendFileSync(logPath, JSON.stringify({ phase: 'extract', ...entry }) + '\n', 'utf8');
  return logPath;
}

// --- Public boundary ------------------------------------------------

export async function runAutoExtract({
  turnFile,
  projectRoot,
  haikuBackend,
  now,
  sessionId,
  userDir, // Task 61: when present, cross-project candidates promote to the user tier inline
  settings,
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
    //    (for the override). Both apply across BOTH turn bodies —
    //    <retain> in either user or assistant turn triggers the
    //    override.
    const retainSegments = extractRetainSegments(rawTurn);
    const sanitized = stripNoiseTags(rawTurn);
    const { userTurn, assistantTurn } = parseTurnFile(sanitized);

    // 3. Build prompt with dedup context (last `## ` entry from now.md).
    const dedupContext = readLastEntryFromNowMd(projectRoot);
    const instructions = buildExtractionInstructions();
    const promptBody = buildExtractionPrompt({
      userTurn,
      assistantTurn,
      dedupContext,
    });

    // 4. Call Haiku.
    //
    // Subprocess timeout: 25_000 ms. Sits comfortably under the 30s
    // Stop hook ceiling (design §5.1) so on timeout the catch +
    // finally + extract.log write all complete BEFORE Claude Code
    // kills the parent. Without this, a hung claude --print call
    // would leak the auto-extract.lock file and skip the NDJSON
    // log entry — see design §8.5 for the composition rationale.
    let haikuResult;
    try {
      haikuResult = await haikuBackend.compress({
        input: promptBody,
        instructions,
        maxOutputBytes: 2000,
        preserveCitationIds: false,
        // 90s, not 25s: the real `claude --print` extraction (full turn +
        // instructions) consistently exceeded a 25s ceiling on a live machine
        // and was KILLED mid-call (extract.log: success:false, haiku_timeout,
        // duration ≈ 25000ms = hitting the cap, not finishing) → automatic
        // capture + persona promotion (F2) silently never ran. This call is
        // DETACHED (fire-and-forget, never blocks the session), so a generous
        // ceiling is free. Live-test finding (2026-06-01, lior-test-4 baseline).
        timeoutMs: 90_000,
      });
      // Touch the cooldown marker IMMEDIATELY after the Haiku call
      // resolves — this is the "we spent the budget" signal that
      // compress-session.mjs reads to skip its own Haiku call within
      // 120s of ours. Touching on success only (not in the catch below)
      // would mean a failing Haiku in the auto-extract path doesn't
      // block compress-session — which would then re-spend the budget
      // on the failure. The catch path below also touches.
      touchCooldownMarker({ projectRoot, now: ts });
    } catch (err) {
      // Spent the Haiku budget (succeeded OR failed); touch the
      // cooldown so compress-session skips within 120s.
      touchCooldownMarker({ projectRoot, now: ts });
      // Route on the error TYPE — distinguishes "took too long"
      // (HAIKU_TIMEOUT) from "subprocess exited non-zero"
      // (HAIKU_FAILED). Using `instanceof HaikuTimeoutError`
      // rather than `err.category === 'haiku_timeout'` because the
      // string-comparison contract is fragile: a future error class
      // that happens to set `.category` to a colliding value, or a
      // rename of the string at one end but not the other, would
      // silently misroute. The instanceof check is type-anchored.
      const category = err instanceof HaikuTimeoutError
        ? ERROR_CATEGORIES.HAIKU_TIMEOUT
        : ERROR_CATEGORIES.HAIKU_FAILED;
      const entry = {
        ...baseEntry,
        success: false,
        error_category: category,
        duration_ms: Date.now() - t0,
      };
      const logPath = writeExtractLogEntry({ projectRoot, ts, entry });
      return {
        action: 'error',
        error_category: category,
        observation_count: 0,
        duration_ms: entry.duration_ms,
        logPath,
        candidates: [],
        errorMessage: err?.message ?? String(err),
      };
    }

    // 5. Parse → demote assistant-origin → apply <retain> override
    //    → dedup-within-call. Order matters: demotion runs BEFORE
    //    retain so an assistant-origin candidate inside a <retain>
    //    still force-promotes to HIGH; dedup runs last so same-id
    //    candidates collapse to the highest-trust survivor.
    let candidates = parseCandidates(haikuResult.outputText);
    candidates = applyOriginDemotion(candidates);
    candidates = applyRetainOverride(candidates, retainSegments);
    candidates = dedupByCanonicalId(candidates);

    // Task 61 — inline cross-project promotion. The SAME Haiku output may
    // carry PERSONA CANDIDATE lines (cross-project doctrine); promote them to
    // the user tier THIS run (vs the weekly auto-persona janitor). No second
    // LLM call — same outputText. Runs BEFORE the project-empty check so a
    // turn that is ONLY cross-project doctrine still promotes.
    let persona = null;
    if (userDir) {
      // Inline persona promotion is SECONDARY to project extraction — a bug in
      // the cross-project path must never take down the primary job (project
      // facts + extract.log). Isolate it: on throw, record the error on the
      // result and continue routing project candidates normally.
      try {
        const personaCandidates = parsePersonaCandidates(haikuResult.outputText);
        if (personaCandidates.length > 0) {
          // Task 78 — the wedge's AUTO half. Only confidence=high candidates
          // clear the promote gate, and (post-Task-78 grading) confidence=high
          // means the user EXPLICITLY STATED a standing rule THIS turn → it is
          // user-attested, so promote at trust:high (durable; won't be clobbered
          // by a later inferred-medium entry). Inferred (medium) candidates still
          // queue to persona-review. The weekly janitor stays at the default
          // medium (45.6) — it synthesizes from accumulated facts, not a fresh
          // statement.
          persona = promoteCandidatesToUserTier({
            candidates: personaCandidates,
            userDir,
            now: ts,
            settings,
            trust: 'high',
            source: 'user-explicit',
          });
        }
      } catch (err) {
        persona = { promoted: [], queued: [], superseded: [], conflicts: [], error: err?.message ?? String(err) };
      }
    }
    const personaLanded =
      !!persona && ((persona.promoted?.length ?? 0) + (persona.superseded?.length ?? 0)) > 0;
    // Door 4 (observability): when the inline persona pass ran, the
    // extract.log entry carries the promotion counts so a later debugger
    // can see cross-project doctrine landed in the user tier without
    // re-running the turn. Empty object when no userDir / no persona pass.
    const personaLogFields = persona
      ? {
          persona_promoted: persona.promoted?.length ?? 0,
          persona_superseded: persona.superseded?.length ?? 0,
          persona_queued: persona.queued?.length ?? 0,
          persona_conflicts: persona.conflicts?.length ?? 0,
          ...(persona.error ? { persona_error: persona.error } : {}),
        }
      : {};

    if (candidates.length === 0 && !personaLanded) {
      const entry = {
        ...baseEntry,
        ...personaLogFields,
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
        persona,
      };
    }

    // 6. Route each candidate. Low-trust candidates are discarded.
    //    High-trust candidates go through memoryWrite() which may
    //    REJECT them at the Poison_Guard / schema / cap_exceeded
    //    layer — in that case the candidate is marked
    //    written:'rejected' so it doesn't count toward
    //    observation_count, and `rejected_category` carries the
    //    distinguishing error category so analytics can separate
    //    "secret leak averted" from "scratchpad full" from
    //    "validation failed".
    const writes = [];
    for (const candidate of candidates) {
      if (candidate.trust === 'high') {
        const r = routeHigh({ candidate, projectRoot, ts, sessionId });
        const written = classifyHighTrustWrite(r);
        const writeRecord = { ...candidate, written, result: r };
        if (written === 'rejected') {
          writeRecord.rejected_category = r?.errorCategory ?? 'unknown';
        }
        writes.push(writeRecord);
      } else if (candidate.trust === 'medium') {
        const r = routeMedium({ candidate, projectRoot, ts });
        writes.push({ ...candidate, written: 'review', result: r });
      } else {
        writes.push({ ...candidate, written: 'discarded' });
      }
    }

    const observation_count = writes.filter(
      (w) => w.written === 'memory' || w.written === 'review' || w.written === 'conflict',
    ).length;

    // Persona-only turn: no project candidate landed, but cross-project
    // doctrine promoted to the user tier this run. That IS a durable
    // extraction — fall through to the 'extracted' return (observation_count
    // stays 0; `persona` carries the user-tier result + Door 4 log fields).
    if (observation_count === 0 && !personaLanded) {
      const entry = {
        ...baseEntry,
        ...personaLogFields,
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
        persona,
      };
    }

    const entry = {
      ...baseEntry,
      ...personaLogFields,
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
      persona,
    };
  } finally {
    // Cleanup order: turn-file FIRST (frees disk), lock LAST (releases
    // the mutex so a subsequent invocation can start). Both swallow
    // errors — the lock release is best-effort because EEXIST on Windows
    // can transiently fire if the watcher hasn't released the handle;
    // the turn-file cleanup is best-effort because (a) the missing_turn
    // path means it's already absent, (b) Windows can refuse unlink if
    // a virus scanner has the file briefly open. The next Stop hook
    // overwrites the path, so a leaked turn-file is harmless beyond
    // disk noise.
    if (existsSync(turnFile)) {
      try {
        unlinkSync(turnFile);
      } catch {
        // ignored — see comment above
      }
    }
    releaseLock(lockPath);
  }
}
