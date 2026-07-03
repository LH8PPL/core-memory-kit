// Auto-persona generation (Task 45, T-014) — v0.2 Phase 2.
//
// The friend-handoff gate. The 2026-05-30 self-test (finding #2)
// reproduced design §16.16's predicted failure: cross-project doctrine
// ("how I work everywhere" — venv-3.13, layered-backend) was captured
// but filed PROJECT-tier; the USER tier stayed empty, collapsing the
// 3-tier value prop to project+local. The user won't hand-curate the user
// tier ("too much of a hassle"), so the user tier must fill itself.
//
// Posture (tasks.md 45.6 — supersedes 45.2/45.3's manual gate):
// OPTIMISTIC AUTO-PROMOTE. The user (2026-05-30): "i dont want to do
// anything, i want it to be automatic." A synthesized doctrine that
// applies beyond the current project is auto-promoted to the user tier
// at trust:medium — no manual `cmk persona accept` step. A confidence
// gate (not a manual gate) routes only LOW-confidence candidates to the
// review queue, which the daily/weekly passes auto-drain.
//
// Design B (chosen): piggyback Task 34's weekly-curate consolidator —
// it already runs the CompressorBackend (Haiku) with no extra API call.
// The backend classifies each captured fact as cross-project doctrine
// (or not), names a user-tier target + section, and a confidence.
//
// Public boundary:
//   autoPersona({projectRoot, userDir, backend, now, cooldownMs?,
//                autoPromote?, settings?})
//     → {action: 'promoted' | 'skipped' | 'error',
//        promoted: [{id, target, section, text, trust}],
//        queued:   [{id, text, target, section, reason}],
//        superseded: [{oldId, newId, target}],
//        conflicts:  [{id, text, target, section}],
//        duration_ms, errorCategory?, errors?}
//
// Trust: auto-promoted entries land at trust:medium (system-derived,
// not user-attested); a `cmk persona accept` (45.2, still available)
// promotes to high. Write source: 'compressor' (Haiku-backend synthesis).
//
// Composes on: tier-paths, scratchpad (appendScratchpadBullet — the
// promotion primitive), audit-log, result-shapes, cooldown, compressor.
// Per design §16.16 + §6.2 (conflict) + §6.8 (auto-drain) + §8.3 + tasks.md 45.

import { readFileSync, writeFileSync, appendFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { generateId } from '@lh8ppl/cmk-canonicalize';
import { ERROR_CATEGORIES, errorResult } from './result-shapes.mjs';
import { resolveTierRoot, resolveScratchpadPath } from './tier-paths.mjs';
import { ensureSectionExists } from './scratchpad.mjs';
import { listObservationSources } from './index-rebuild.mjs';
import { parse } from './frontmatter.mjs';
import { memoryWrite } from './memory-write.mjs';
import { detectConflicts } from './conflict-queue.mjs';
import { appendAuditEntry, REASON_CODES } from './audit-log.mjs';
import { DEFAULT_COOLDOWN_MS, isCooldownActive, touchCooldownMarker } from './cooldown.mjs';
import { PROMOTE_THRESHOLD } from './heat.mjs';
// Wedge-from-empty (D-262): scaffold the user tier on first gated promote when a
// brand-new user has none yet. install.mjs is cycle-safe here — it imports only
// audit-log/claude-md/native-binding/settings-hooks, none of which import this.
import { initUserTier } from './install.mjs';

// User-tier scratchpads auto-persona is allowed to promote into. A
// classifier-named target outside this set is dropped defensively (the
// backend is Haiku — never trust its routing blindly; §NFR-9 spirit).
const VALID_TARGETS = new Set(['USER.md', 'HABITS.md', 'LESSONS.md']);

// F2 (Task 64): a section name we're willing to CREATE on the user tier. Must
// read like a heading — starts with a letter, then letters/digits/spaces and a
// few mild separators (& / -), bounded length. Rejects path traversal, markdown
// metachars (`#`), punctuation noise, and overlong strings so Haiku can't inject
// a junk or unsafe heading. (c.section is already `.trim()`-ed by the parser.)
const SAFE_SECTION_NAME = /^[A-Za-z][A-Za-z0-9 &/-]{1,48}$/;

// One classifier candidate per line. The consolidator's Haiku Step-3
// (Design B) emits, for each captured fact that is cross-project
// doctrine, a line of this exact shape. Project-specific facts are NOT
// surfaced. Free text is the trailing group (may contain '=' / '|').
export const PERSONA_CANDIDATE_RE =
  /^PERSONA CANDIDATE \| target=(.+?) \| section=(.+?) \| confidence=(\w+) \| (.+)$/;

// Assemble the PROJECT-tier captured facts (granular fact files +
// MEMORY.md scratchpad bullets) into one corpus the backend classifies.
// userDir is passed through to listObservationSources purely to keep the
// U-tier resolution sandbox-scoped (never walk the real home dir —
// design §16.36); we then filter to tier P, the synthesis SOURCE.
// Byte budget for the `facts` persona corpus (Task 111 / F-2). Bounds the Haiku
// classifier input so a large project's whole-memory sweep can't blow the timeout.
// Generous (facts are high-signal) but bounded; whole facts only (see below).
export const PERSONA_CORPUS_BYTES = 60_000;

// Assemble the tier-P fact corpus AND the cite-and-sum recurrence index (151.3).
// Returns { corpus, factIndex }:
//   - corpus: the classifier input. Each fact is headed `### [P-XXXXXXXX] title`
//     so the classifier has a stable HANDLE to cite in `source_fact_ids=[…]`.
//   - factIndex: Map<id, recurrence_count> for the facts ACTUALLY in the corpus
//     (an id dropped by the byte cap isn't citable — the LLM never saw it — so it
//     isn't in the index either). resolveRecurrenceSum uses this to validate cited
//     ids + sum their real recurrence_count (the gate — code counts, LLM doesn't).
// Scratchpad bullets have no per-bullet id/recurrence_count, so they appear in the
// corpus (still useful synthesis context) but contribute no citable index entries.
export function assembleProjectCorpus({ projectRoot, userDir }) {
  const sources = listObservationSources({ projectRoot, userDir });
  // {part, id, recurrenceCount}; id/recurrenceCount null for scratchpad parts.
  const parts = [];
  for (const s of sources) {
    if (s.tier !== 'P') continue;
    let content;
    try {
      content = readFileSync(s.path, 'utf8');
    } catch {
      continue;
    }
    if (s.kind === 'fact') {
      const { frontmatter, body } = parse(content);
      const id = frontmatter?.id ?? null;
      const title = frontmatter?.title ?? id ?? '';
      // 151.1: recurrence_count is the gate signal; a fact predating the field
      // (or with a bad value) counts as 1 — a single occurrence.
      const rc = frontmatter?.recurrence_count;
      const recurrenceCount = Number.isFinite(rc) && rc > 0 ? rc : 1;
      // Lead the heading with the citable id so the classifier can echo it.
      const head = id ? `### [${id}] ${title}` : `### ${title}`;
      parts.push({ part: `${head}\n${(body ?? '').trim()}`, id, recurrenceCount });
    } else {
      parts.push({ part: (content ?? '').trim(), id: null, recurrenceCount: null });
    }
  }
  // Task 111 (F-2): BOUND the corpus. Previously this joined EVERY tier-P fact
  // + scratchpad with no cap, so on a real project with substantial memory the
  // classifier prompt grew unbounded and the Haiku `claude --print` call blew the
  // timeout (the reported "did not return within 50000ms"). Accumulate WHOLE
  // facts up to a byte budget (never split a fact mid-body) and mark truncation.
  // KNOWN LIMITATION (mirrors TRANSCRIPT_WINDOW_BYTES): facts past the budget are
  // dropped in file-iteration order — a doctrine fact in the tail can be missed
  // on one pass, but the weekly janitor re-runs, and some doctrine beats a
  // timed-out zero. A value-ordered (trust/recency-first) accumulation is the
  // follow-up if a large corpus drops doctrine.
  const out = [];
  const factIndex = new Map();
  let used = 0;
  let truncated = false;
  for (const { part, id, recurrenceCount } of parts.filter((p) => p.part)) {
    const cost = Buffer.byteLength(part, 'utf8') + 2; // +2 for the '\n\n' join
    if (used + cost > PERSONA_CORPUS_BYTES) {
      truncated = true;
      break;
    }
    out.push(part);
    used += cost;
    // Index only facts that actually made it into the corpus (citable).
    if (id) factIndex.set(id, recurrenceCount);
  }
  if (truncated) out.push('### …\n(corpus truncated — additional project facts omitted for this pass)');
  return { corpus: out.join('\n\n'), factIndex };
}

// Default size of the recent-transcript window handed to the SessionEnd persona
// classifier (Task 86c / D-44). Bounded — like hermes' "conversation snapshot"
// and claude-mem's last-message — so the focused Haiku call stays cheap and the
// MOST RECENT turns dominate. The classifier maxOutputBytes is 4096; input larger.
//
// RECALL vs PRECISION tradeoff (86c skill-review I1): a standing rule stated EARLY
// in a long session ("from now on …" at turn 2, then 40 more turns) can scroll out
// of the window — and the usual backstops don't recover it (the inline per-turn
// path is what drops under load, the reason this dedicated pass exists; the fact
// corpus already lost the cross-project signal per D-44). So the window must be
// generous enough to hold a typical full session, not just the last few turns.
// 40k chars ≈ a long session's worth of turns ≈ ~10k tokens — trivial cost for a
// once-per-session call, and the classifier prompt's "IGNORE anything specific to
// this ONE project" instruction guards precision at the larger size (live test:
// clean 2/2, no false promotes). The exact bound is a live-test-9 tuning item.
// KNOWN LIMITATION (documented, not yet fixed): only the most-recent date-named
// file is read, so a session spanning midnight loses the pre-midnight turns. Rare;
// a multi-file read is the follow-up if it bites.
export const TRANSCRIPT_WINDOW_BYTES = 40_000;

// Assemble the recent-conversation window for the persona classifier (Task 86c).
// Reads the most-recent date-named transcript (`context/transcripts/{date}.md`,
// written per-turn by capture-turn) and returns its tail, snapped FORWARD to a
// `## ` turn boundary so the window never starts mid-line. Returns '' when no
// transcript exists (a no-turn session — nothing to classify).
//
// WHY the transcript, not the fact corpus (D-44, primary-source-verified):
// auto-extract distills a user's universal rule into project-scoped fact text
// ("Use uv … pip is not used in THIS PROJECT"), stripping the cross-project
// signal the classifier needs. The verbatim signal ("from now on …", "in every
// project") survives only in the transcript. hermes' background_review reviews
// "the conversation above"; claude-mem's summarize reads transcriptPath — both
// classify the raw conversation, never distilled memory.
//
// Injection posture (86c skill-review NOTE): the transcript is privacy-sanitized
// at write time (capture-turn → sanitizePrivacyTags) but NOT prompt-structure
// sanitized, so a user could type a literal "PERSONA CANDIDATE | …" line that the
// classifier echoes. The blast radius is bounded: it's the user's OWN single-user
// conversation, and the promote path (promoteCandidatesToUserTier → memoryWrite)
// is gated by VALID_TARGETS + the section-name guard + the confidence gate. A
// self-authored persona entry is the feature, not a third-party threat.
export function assembleTranscriptWindow({ projectRoot, maxBytes = TRANSCRIPT_WINDOW_BYTES }) {
  const dir = join(projectRoot, 'context', 'transcripts');
  if (!existsSync(dir)) return '';
  let files;
  try {
    // Explicit CODE-UNIT comparator (S2871) — deliberately NOT localeCompare:
    // date-named transcript files must order identically on every machine,
    // and locale-aware collation varies by user locale.
    files = readdirSync(dir)
      .filter((f) => f.endsWith('.md'))
      .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  } catch {
    return '';
  }
  if (files.length === 0) return '';
  // Date-named (YYYY-MM-DD) → lexical sort = chronological; take the latest.
  const latest = files[files.length - 1];
  let text;
  try {
    text = readFileSync(join(dir, latest), 'utf8');
  } catch {
    return '';
  }
  if (!text.trim()) return '';
  if (text.length <= maxBytes) return text;
  let tail = text.slice(text.length - maxBytes);
  // Snap forward to the first whole turn so we don't begin mid-sentence.
  const boundary = tail.indexOf('\n## ');
  if (boundary !== -1) tail = tail.slice(boundary + 1);
  return tail;
}

// Shared persona grading rule (Task 78 — the wedge's AUTO half). The
// `confidence` axis encodes EXPLICIT-vs-INFERRED, which drives BOTH the promote
// gate (only `high` promotes; medium/low queue) AND the write trust on the
// inline path (an explicitly-stated rule is user-attested → trust:high). The
// live-test gap (D-30): the user STATED a universal rule but the classifier
// under-graded it to medium → it queued instead of landing in the user tier, so
// the cross-project persona never filled on its own. This rule makes the
// stated-vs-observed distinction explicit. Kept in ONE place so the inline
// (auto-extract) and weekly (classifier) prompts can never drift apart.
export const PERSONA_CONFIDENCE_RULE = [
  'GRADE confidence by whether the user STATED it as a standing rule vs you INFERRED it from behavior:',
  '  - confidence=high   → the user EXPLICITLY STATED a standing, cross-project rule: an imperative with universal scope — "always …", "never …", "in every project", "from now on", "going forward, in all my projects", "as a rule I …". Use high ONLY for a rule the user actually stated.',
  '  - confidence=medium → you are INFERRING the doctrine from how they worked this session (they did it, but did NOT declare it as a standing rule).',
  '  - When unsure whether it was stated-as-a-rule or merely-observed, use medium.',
].join('\n');

// `source` selects the INPUT framing (Task 86c / D-44):
//   - 'transcript' (SessionEnd path): the input is the raw recent conversation,
//     where standing-rule statements ("from now on …", "in every project") are
//     verbatim — the reliable cross-project signal. This is the mature-product
//     shape (hermes reviews "the conversation above"; claude-mem reads the
//     transcript).
//   - 'facts' (default; weekly-curate + manual `cmk persona generate`): the input
//     is the distilled project fact corpus — appropriate for a whole-project
//     sweep, but lossy for cross-project signal (D-44), so NOT used at SessionEnd.
// Only the framing lines differ; the routing + confidence rule are shared so the
// two paths can never drift apart.
export function buildClassifierInstructions(source = 'facts') {
  const isTranscript = source === 'transcript';
  const opener = isTranscript
    ? 'You are a persona archivist for claude-memory-kit. The input below is the RECENT CONVERSATION (user and assistant turns) from ONE project session.'
    : 'You are a persona archivist for claude-memory-kit. The input below is a set of facts captured while the user worked on ONE project.';
  const jobLine = isTranscript
    ? 'Your job: identify ONLY the things the user REVEALED or STATED that express CROSS-PROJECT doctrine — how this user works EVERYWHERE (tooling habits, how they structure their work, communication style, process rules). IGNORE anything specific to this ONE project (a particular value, name, or detail that would not carry to their other projects; one-off task state).'
    : 'Your job: identify ONLY the facts that express CROSS-PROJECT doctrine — how this user works EVERYWHERE (tooling habits, how they structure their work, communication style, process rules). IGNORE anything specific to this ONE project (a particular value, name, or detail that would not carry to their other projects; one-off task state).';
  const beginMarker = isTranscript
    ? '=== BEGIN RECENT CONVERSATION ==='
    : '=== BEGIN CAPTURED PROJECT FACTS ===';
  // 151.3 (cite-and-sum, D-230): on the FACTS path each input fact is headed
  // `### [P-XXXXXXXX] title`, so the classifier can CITE the facts it synthesized
  // a trait from. It cites — it does NOT count. Code resolves the cited ids and
  // sums their real recurrence_count (the gate). The transcript path has no
  // citable ids, so it keeps the simpler line + the confidence fast-path only.
  const outputFormat = isTranscript
    ? 'PERSONA CANDIDATE | target=<FILE> | section=<SECTION> | confidence=<high|medium|low> | <one-line restatement>'
    : 'PERSONA CANDIDATE | target=<FILE> | section=<SECTION> | confidence=<high|medium|low> | <one-line restatement> | source_fact_ids=[<the [P-...] ids of the facts you synthesized THIS trait from>]';
  const citeBlock = isTranscript
    ? []
    : [
        '',
        'CITING SOURCE FACTS (required on every line):',
        '  - Each input fact is headed `### [P-XXXXXXXX] <title>`. In source_fact_ids, list the [P-...] ids of the facts THIS trait was synthesized from — copy them EXACTLY as shown.',
        '  - CITE the facts; do NOT count anything and do NOT invent a number. The kit sums the cited facts\' real recurrence on its own.',
        '  - Cite ONLY ids that appear in the input. Never invent an id.',
        '  - Example: `… | source_fact_ids=[P-AAAAAAAA, P-BBBBBBBB]`',
      ];
  return [
    opener,
    '',
    jobLine,
    '',
    'For EACH cross-project fact, emit exactly one line, nothing else, in this EXACT format:',
    outputFormat,
    ...citeBlock,
    '',
    'Routing:',
    '  - target=HABITS.md  → working-style habits. sections: Iteration Cadence | Destructive Operations | Communication Style',
    '  - target=LESSONS.md → cross-project lessons. sections: Tooling Lessons | Process Lessons | Anti-patterns',
    '  - target=USER.md    → identity/preferences. sections: About | Preferences | Working Style',
    '  PREFER an existing section above — route to the closest fit. Only if NONE genuinely fits may you name a new short Title-Case section (2-4 words, letters/spaces only). Never invent a new section when an existing one fits.',
    '',
    PERSONA_CONFIDENCE_RULE,
    '',
    'Output ONLY PERSONA CANDIDATE lines. No preamble, no commentary. If nothing is cross-project, output nothing.',
    '',
    beginMarker,
  ].join('\n');
}

export function parsePersonaCandidates(outputText) {
  const candidates = [];
  for (const raw of (outputText ?? '').split('\n')) {
    const line = raw.trim();
    const m = PERSONA_CANDIDATE_RE.exec(line);
    if (!m) continue;
    const [, target, section, confidence, text] = m;
    candidates.push({
      target: target.trim(),
      section: section.trim(),
      confidence: confidence.trim().toLowerCase(),
      ...splitSourceFactIds(text.trim()),
    });
  }
  return candidates;
}

// The cite-and-sum suffix the classifier appends to a candidate line (151.3,
// ADR-0016 / D-230): `… | source_fact_ids=[P-AAAAAAAA, P-BBBBBBBB]`. It cites the
// PROJECT facts the trait was synthesized from — NOT a recurrence COUNT (5/5
// bridge-study systems reject the LLM counting; the LLM groups, code counts).
// Optional + trailing so a line WITHOUT it still parses (back-compat: the
// transcript path has no fact ids to cite, and an older classifier prompt omits
// it) — such a candidate gets `sourceFactIds: []` and can only promote via the
// explicit-imperative (confidence=high) fast-path.
const SOURCE_FACT_IDS_RE = /\s*\|\s*source_fact_ids=\[([^\]]*)\]\s*$/;

// Split a candidate's free-text tail into {text, sourceFactIds}. The ids are
// peeled off the END (the classifier appends them last), leaving the human-
// readable restatement as `text`. Ids are UPPER-CASED (canonical ids are always
// uppercase `P-…`; a lowercase echo from Haiku — despite "copy EXACTLY" — would
// otherwise miss the Map lookup) + de-noised; the real corpus-resolution
// (rejecting hallucinations) happens in resolveRecurrenceSum.
function splitSourceFactIds(tail) {
  const m = SOURCE_FACT_IDS_RE.exec(tail);
  if (!m) return { text: tail, sourceFactIds: [] };
  const text = tail.slice(0, m.index).trim();
  const sourceFactIds = m[1]
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  return { text, sourceFactIds };
}

/**
 * THE cite-and-sum gate arithmetic (151.3, ADR-0016 / D-230). Given the ids the
 * classifier CITED and the project corpus's real `{id → recurrence_count}` index,
 * resolve the cited ids against the corpus (DROP any the LLM hallucinated) and SUM
 * their real recurrence_count. That deterministic sum — never an LLM count — gates
 * promotion. Repeated cited ids are de-duplicated (a fact cited twice counts once).
 *
 * PURE: no I/O. The factIndex is assembled by assembleProjectCorpus.
 *
 * @param {object} o
 * @param {string[]} [o.sourceFactIds]      ids the classifier cited
 * @param {Map<string,number>} [o.factIndex] real corpus `id → recurrence_count`
 * @returns {{sum:number, resolved:string[], rejected:string[]}}
 */
export function resolveRecurrenceSum({ sourceFactIds = [], factIndex } = {}) {
  const index = factIndex instanceof Map ? factIndex : new Map();
  const resolved = [];
  const rejected = [];
  const seen = new Set();
  let sum = 0;
  for (const rawId of sourceFactIds ?? []) {
    const id = String(rawId).trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    if (index.has(id)) {
      resolved.push(id);
      const n = index.get(id);
      // Floor again here (assembleProjectCorpus already floors): this helper is
      // exported + pure, so a direct caller could pass a junk Map — a real fact is
      // always worth ≥1.
      sum += Number.isFinite(n) && n > 0 ? n : 1;
    } else {
      rejected.push(id); // hallucinated / not in the synthesis corpus → contributes 0
    }
  }
  return { sum, resolved, rejected };
}

/**
 * Run auto-persona synthesis: classify project-tier captured facts,
 * auto-promote cross-project doctrine into the user tier (trust:medium).
 *
 * @returns {Promise<object>} action: 'promoted' | 'skipped' | 'error'
 */
export async function autoPersona(opts = {}) {
  const t0 = Date.now();
  const { projectRoot, userDir, backend, now, settings, cooldownMs = DEFAULT_COOLDOWN_MS, source = 'facts', timeoutMs = 50_000 } = opts;

  if (!projectRoot) {
    return errorResult({
      category: ERROR_CATEGORIES.MISSING_PROJECT_ROOT,
      errors: ['projectRoot is required'],
      duration_ms: Date.now() - t0,
    });
  }
  if (!userDir) {
    return errorResult({
      category: ERROR_CATEGORIES.SCHEMA,
      errors: ['userDir is required (auto-persona promotes to the user tier)'],
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

  const ts = now ?? new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

  // Shared 120s Haiku cooldown (same marker daily-distill / weekly-curate /
  // auto-extract touch). cooldownMs:0 override lets a caller run auto-persona
  // inside an already-gated cycle (e.g. weekly-curate, per §8.7.2 — both Haiku
  // calls belong to one cycle, not two independent invocations).
  if (cooldownMs > 0 && isCooldownActive({ projectRoot, now: ts, cooldownMs })) {
    return { action: 'skipped', reason: 'cooldown', promoted: [], queued: [], duration_ms: Date.now() - t0 };
  }

  // Task 86c (D-44): the SessionEnd path classifies the RAW TRANSCRIPT (where a
  // user's standing rule survives verbatim); the default 'facts' path classifies
  // the distilled project corpus (whole-project sweep — weekly/manual).
  // 151.3: the facts path ALSO returns a factIndex (id → recurrence_count) for the
  // cite-and-sum gate. The transcript path has no citable fact ids — its candidates
  // promote only via the explicit-imperative (confidence=high) fast-path, which is
  // exactly the verbatim "from now on …" signal a transcript carries (D-44).
  let corpus;
  let factIndex = new Map();
  if (source === 'transcript') {
    corpus = assembleTranscriptWindow({ projectRoot });
  } else {
    ({ corpus, factIndex } = assembleProjectCorpus({ projectRoot, userDir }));
  }
  if (!corpus) {
    const reason = source === 'transcript' ? 'no-transcript' : 'no-facts';
    return { action: 'skipped', reason, promoted: [], queued: [], duration_ms: Date.now() - t0 };
  }

  let result;
  try {
    result = await backend.compress({
      input: corpus,
      instructions: buildClassifierInstructions(source),
      preserveCitationIds: false,
      maxOutputBytes: 4096,
      // Task 111 (F-2): the timeout is caller-supplied. The SessionEnd hook path
      // keeps the 50_000 default (it composes with the 60s SessionEnd ceiling per
      // design §8.5 / D-42). The CLI `cmk persona generate` has NO outer hook
      // ceiling, so it passes a generous value — the explicit command can wait.
      timeoutMs,
    });
    // Spent a Haiku call SUCCESSFULLY — refresh the shared cooldown marker so the
    // next gated caller backs off. (touch even on cooldownMs:0 cycles: the call
    // happened, so the marker should reflect it for any LATER gated caller.)
    touchCooldownMarker({ projectRoot, now: ts });
  } catch (err) {
    // Task 167.F (D-207, Q5): do NOT touch the cooldown on FAILURE — a failed
    // Haiku call did not successfully spend the budget, and blocking the next
    // needed compress for 120s after a transient failure is the wrong gate
    // (correctness > cost; a transient failure must be free to retry). Original
    // pre-167 behavior touched here too; preserved as decision-trail.
    return errorResult({
      category: ERROR_CATEGORIES.COMPRESS_FAILED,
      errors: [err?.message ?? String(err)],
      duration_ms: Date.now() - t0,
    });
  }

  // 151.3 (cite-and-sum, D-230): resolve each candidate's cited source_fact_ids
  // against the corpus factIndex (rejecting hallucinated ids) and attach the
  // arithmetic recurrence SUM. THAT sum — computed in code, never by the LLM —
  // is the promotion gate inside promoteCandidatesToUserTier (a medium/inferred
  // trait promotes iff its cited facts recur ≥ PROMOTE_THRESHOLD). The transcript
  // path's factIndex is empty, so its candidates carry sum 0 and promote only via
  // the confidence=high fast-path (the verbatim stated rule a transcript holds).
  const candidates = parsePersonaCandidates(result?.outputText).map((c) => ({
    ...c,
    recurrenceSum: resolveRecurrenceSum({ sourceFactIds: c.sourceFactIds, factIndex }).sum,
  }));
  const { promoted, queued, superseded, conflicts, reviewQueuePath } = promoteCandidatesToUserTier({
    candidates,
    userDir,
    now: ts,
    settings,
  });

  const duration_ms = Date.now() - t0;
  // A supersede IS a promotion outcome (the user tier changed).
  if (promoted.length === 0 && superseded.length === 0) {
    return { action: 'skipped', reason: 'no-promotions', promoted, queued, superseded, conflicts, reviewQueuePath, duration_ms };
  }
  return { action: 'promoted', promoted, queued, superseded, conflicts, reviewQueuePath, duration_ms };
}

/**
 * Promote classified PERSONA CANDIDATE rows into the user tier. Shared by
 * autoPersona (the weekly janitor) and auto-extract (Task 61 — inline at
 * capture time). High-confidence → memoryWrite to the user-tier scratchpad
 * (auto-supersede on conflict); low/medium → surfaced in `queued`.
 *
 * Trust posture (the `trust`/`source` params):
 *   - DEFAULT (no params) → trust:'medium', source:'persona-synthesis'. The
 *     SYSTEM-DERIVED posture (45.6) used by the weekly janitor and any
 *     inferred promotion. **45.4 invariant (original, pre-2026-06-02):** a
 *     medium write never overwrites a hand-curated trust:high rule — a
 *     same-topic collision against a high entry routes to the review queue
 *     (medium < high → queue), so hand-curated highs are protected from
 *     inferred noise. This still holds for every medium/inferred write.
 *   - trust:'high' (explicit path — Task 76 `cmk lessons promote` + Task 78
 *     inline grading of an EXPLICITLY-STATED rule). **45.4 REFINEMENT
 *     (2026-06-02, D-32 — the user chose "latest explicit wins"):** an explicit,
 *     user-attested rule at trust:high MAY supersede an equal-trust same-topic
 *     entry (high >= high → supersede). The newest explicit statement wins,
 *     even over a hand-curated high. The original protection is unchanged for
 *     non-explicit (medium) writes; only an explicit high can replace a high.
 *
 * @returns {{promoted:Array, queued:Array, superseded:Array, conflicts:Array}}
 */
// Persist low/medium-confidence (and otherwise-not-promoted) candidates to a
// durable review-queue FILE at <userDir>/queues/persona-review.md, so they are
// not lost when only returned in the response (the user, 2026-05-31: "response
// object can get lost — i dont like it"). Dedup by canonical id against what's
// already in the file so repeated synthesis passes don't pile up duplicates.
// Returns the queue path (or null when there's nothing to write).
export function appendPersonaReviewQueue({ userDir, entries, now }) {
  if (!entries || entries.length === 0) return null;
  const ts = now ?? new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  const userTierRoot = resolveTierRoot({ tier: 'U', userDir });
  const queuePath = join(userTierRoot, 'queues', 'persona-review.md');
  mkdirSync(dirname(queuePath), { recursive: true });

  let existing = '';
  try {
    existing = readFileSync(queuePath, 'utf8');
  } catch {
    // file not created yet — fine.
  }

  const blocks = [];
  for (const e of entries) {
    const id = generateId('U', e.text);
    if (existing.includes(`(${id})`)) continue; // already queued in a prior pass
    blocks.push(
      `- (${id}) [${e.target} § ${e.section}] ${e.text}\n` +
        `  <!-- target: ${e.target}, section: ${e.section}, confidence: ${e.confidence ?? 'unknown'}, reason: ${e.reason ?? 'pending-review'}, source: persona-synthesis, at: ${ts} -->`,
    );
  }
  if (blocks.length === 0) return queuePath;

  const header = `## ${ts} — persona-synthesis (pending review)`;
  // Blank line below the heading (MD022). SAFE: parsePersonaReviewQueue keys on
  // the bullet line + its i+1 meta-comment, not on heading adjacency; the blank
  // is between heading and the first bullet, never inside the bullet↔comment pair.
  appendFileSync(queuePath, `${header}\n\n${blocks.join('\n')}\n\n`, 'utf8');
  return queuePath;
}

// Parse persona-review.md back into candidate objects. The queue lines are
//   - (U-XXXXXXXX) [TARGET § SECTION] <text>
//     <!-- target: TARGET, section: SECTION, confidence: C, reason: ..., ... -->
// The HTML comment is authoritative for target/section/confidence (the bracket
// prefix is human-readable redundancy); fall back to the bracket if absent.
// ReDoS-safe: NEGATED character classes (not lazy `.+?...+?` pairs) so the regex
// is linear — each group matches "anything but the delimiter that ends it", which
// cannot backtrack across that delimiter (the canonicalize stripTrailingPunct
// lesson — Task 140 / D-143 — applied at write).
const PERSONA_QUEUE_LINE_RE = /^- \([UPL]-[^)]+\)\s+\[([^§\]]+)§([^\]]+)\]\s+(\S.*)$/;
// No `\s*` sits adjacent to a `[^,]+` capture: `\s*` and `[^,]+` both match a
// space, and that overlap is the super-linear-backtracking ambiguity Sonar
// flags. Each value is captured by `[^,]+` (which absorbs leading/trailing
// space — we `.trim()` below), with the `,` and label as fixed delimiters.
const PERSONA_QUEUE_META_RE = /target:([^,]+),\s*section:([^,]+),\s*confidence:\s*(\w+)/;
export function parsePersonaReviewQueue(text) {
  const lines = (text ?? '').split(/\r?\n/);
  const candidates = [];
  for (let i = 0; i < lines.length; i++) {
    const m = PERSONA_QUEUE_LINE_RE.exec(lines[i].trim());
    if (!m) continue;
    let [, target, section, body] = m;
    let confidence = 'medium';
    const meta = PERSONA_QUEUE_META_RE.exec(lines[i + 1] ?? '');
    if (meta) {
      target = meta[1].trim();
      section = meta[2].trim();
      confidence = meta[3].trim().toLowerCase();
    }
    candidates.push({ target: target.trim(), section: section.trim(), confidence, text: body.trim() });
  }
  return candidates;
}

/**
 * Auto-drain the persona-review queue (the down-payment for Task 151 / D-154).
 *
 * The medium-confidence persona candidates were ROUTED to persona-review.md with
 * the documented promise that "the daily/weekly auto-drain acts on them" — but
 * that drain was never implemented, so they STRANDED (the v0.3.1 cold-open found
 * the user's architecture philosophy stuck here, never reaching the persona).
 * This makes the promise real: the same optimistic auto-promote the review queue
 * already gets (D-6) — trust the synthesis, mistakes self-correct via `cmk forget`
 * (the post-hoc-reversibility model every surveyed memory system uses instead of
 * a pre-promotion human gate). NOT a manual command: runs inside autoDrainQueues
 * on the daily/weekly maintenance passes. The full recurrence-scored redesign is
 * Task 151 (v0.4); this just stops the stranding.
 *
 * @returns {{promoted: number, drained: number, queuePath: string|null}}
 */
export function resolvePersonaReviewQueue({ userDir, now, settings } = {}) {
  const userTierRoot = resolveTierRoot({ tier: 'U', userDir });
  const queuePath = join(userTierRoot, 'queues', 'persona-review.md');
  let text;
  try {
    text = readFileSync(queuePath, 'utf8');
  } catch {
    return { promoted: 0, drained: 0, queuePath: null }; // no queue → nothing to drain
  }
  const candidates = parsePersonaReviewQueue(text);
  if (candidates.length === 0) return { promoted: 0, drained: 0, queuePath };

  // Re-feed through the SAME promote path the synthesis uses (home-path sanitize
  // + Poison_Guard + dedup + audit all inherited). OPTIMISTIC AUTO-DRAIN: these
  // candidates already SURVIVED a synthesis pass without being superseded; the
  // drain IS the decision to promote them (the field-standard "auto-promote then
  // post-hoc revert via cmk forget" posture — see the persona-promotion research
  // note). So force confidence:'high' to clear promoteCandidatesToUserTier's
  // confidence gate — otherwise they'd re-queue forever (the gate that stranded
  // them in the first place). The full recurrence-scored model is Task 151 (v0.4).
  const promotable = candidates.map((c) => ({ ...c, confidence: 'high' }));
  const r = promoteCandidatesToUserTier({ candidates: promotable, userDir, now, settings });
  const promoted = r.promoted?.length ?? 0;

  // Clear the queue — the candidates are now resolved (promoted or de-duped into
  // existing persona). Leave a tombstone header so the file isn't silently empty.
  const ts = now ?? new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  writeFileSync(
    queuePath,
    `<!-- persona-review queue — auto-drained ${ts}: ${candidates.length} candidate(s) promoted to the persona. -->\n`,
    'utf8',
  );
  return { promoted, drained: candidates.length, queuePath };
}

export function promoteCandidatesToUserTier({ candidates, userDir, now, settings, trust = 'medium', source = 'persona-synthesis' }) {
  // `trust`/`source` default to the AUTO-persona posture (medium, system-derived
  // — 45.6). The EXPLICIT path (`cmk lessons promote`) passes trust:'high' +
  // source:'user-explicit' so a user-attested promotion is durable (the
  // maintenance passes never age out / auto-supersede a trust:high entry — the
  // 45.4 invariant) instead of decaying like an inferred preference.
  const ts = now ?? new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  const userTierRoot = resolveTierRoot({ tier: 'U', userDir });
  const promoted = [];
  const queued = [];
  const superseded = [];
  const conflicts = [];
  for (const c of candidates) {
    if (!VALID_TARGETS.has(c.target)) continue; // defensive: drop bad routing
    // 151.3 — THE RECURRENCE GATE (ADR-0016, D-230), replacing the pure form
    // gate. A candidate promotes if EITHER:
    //   (a) confidence=high — an EXPLICITLY-STATED standing rule (the fast-path:
    //       a user-attested rule promotes immediately, recurrence irrelevant); OR
    //   (b) its cited facts' recurrence SUM ≥ PROMOTE_THRESHOLD — a DEMONSTRATED-
    //       but-not-declared trait that has recurred enough to be durable.
    // (b) is the Hole-A fix: pre-151.3 a demonstrated philosophy stranded here
    // because it lacked "always/never" phrasing (D-177). The sum is arithmetic on
    // real recurrence_count (the LLM cites; code counts). recurrenceSum is attached
    // by autoPersona; callers that don't attach it (inline/explicit/drain) leave it
    // undefined → those paths rely on the confidence=high clause, unchanged.
    const recurrenceSum = c.recurrenceSum ?? 0;
    const promotesByRecurrence = recurrenceSum >= PROMOTE_THRESHOLD;
    // Door 4: name WHY this trait promoted, so a debugger can tell a recurrence-
    // gated promotion (the new 151.3 path) from the explicit-imperative fast-path.
    const promotedVia = c.confidence === 'high' ? 'confidence-high' : `recurrence-${recurrenceSum}`;
    if (c.confidence !== 'high' && !promotesByRecurrence) {
      // Not promotable: low/medium confidence AND under the recurrence threshold.
      // Route to the review queue — returned in `queued` AND written to the durable
      // queue FILE below (appendPersonaReviewQueue) so they survive past the
      // response — the daily/weekly auto-drain (or a manual review) acts on them.
      const reason = recurrenceSum > 0 ? `recurrence-${recurrenceSum}-below-${PROMOTE_THRESHOLD}` : `confidence-${c.confidence}`;
      queued.push({ target: c.target, section: c.section, text: c.text, confidence: c.confidence, reason });
      continue;
    }

    // D-13: promote THROUGH memoryWrite so the write inherits home-path
    // sanitization (privacy — finding #1 class), Poison_Guard, dedup,
    // cap/consolidation, and audit — none of which a raw scratchpad
    // append would carry. We pre-detect conflicts ourselves only to pick
    // the verb: memoryWrite's v0.1.0 'supersede' path merely appends, so
    // for the auto-supersede contract (45.6) we issue an explicit
    // `replace`; the `queue` case (new<existing, e.g. vs a trust:high
    // hand-curated rule — the 45.4 invariant) is left to memoryWrite's
    // own conflict-queue routing via a plain `add`.
    const scratchpadPath = resolveScratchpadPath({ tier: 'U', scratchpad: c.target, userDir });

    // F2 (Task 64): the user tier grows sections organically. If Haiku routes a
    // candidate to a sane-but-not-yet-existing section (the live test: HABITS.md
    // § "Architecture Preferences"), CREATE the heading instead of letting
    // memoryWrite schema-fail to the review queue → empty HABITS.md. Guard the
    // name first so a malformed/unsafe section can't inject a junk heading.
    // NB: the guard also gates an *existing* but unsafe-named section (e.g. a
    // hand-edited weird heading) → such a candidate queues rather than promotes;
    // acceptable, since every section the kit itself creates is guard-valid.
    if (!SAFE_SECTION_NAME.test(c.section)) {
      queued.push({ target: c.target, section: c.section, text: c.text, confidence: c.confidence, reason: 'not-promoted-bad-section-name' });
      continue;
    }
    // Wedge-from-empty (D-262): a brand-new user has NO user tier on their first
    // cross-project rule, so the target scratchpad (HABITS/LESSONS/USER.md) does
    // not exist yet — pre-fix `ensureSectionExists` returned `{error:'no-file'}`
    // and the rule routed to `not-promoted-no-file`, so the persona could never
    // bootstrap from empty (the whole B3/B4 premise). SCAFFOLD the user tier here,
    // on first gated promote — this fires ONLY after the confidence/recurrence
    // gate above passed, so the tier materializes exactly when a GATED candidate
    // is being written (a later divert — section error, conflict queue, dedup —
    // can still not-land THIS candidate; the bootstrapped tier then serves the
    // next promote), never speculatively (the D-74 "don't touch the user's
    // system without cause" posture). initUserTier is idempotent (skip-existing),
    // so this is a no-op once the tier exists.
    if (!existsSync(scratchpadPath)) {
      try {
        initUserTier({ userTier: userTierRoot });
      } catch {
        // If scaffolding fails, fall through — ensureSectionExists will report
        // no-file and the candidate queues (the pre-fix behavior), never a crash.
      }
    }
    // Heading-creation is intentionally cap-exempt: it's ~30 bytes and the
    // memoryWrite below enforces the scratchpad byte cap on the bullet (§7.1).
    const ensured = ensureSectionExists(scratchpadPath, c.section);
    if (ensured.error) {
      queued.push({ target: c.target, section: c.section, text: c.text, confidence: c.confidence, reason: `not-promoted-${ensured.error}` });
      continue;
    }
    if (ensured.created) {
      // Door 4: a new section is a structural change to a committed/shared
      // scratchpad — record it so "why did HABITS.md grow this section?" is
      // answerable from the audit log, not just inferred from the bullet below.
      appendAuditEntry(userTierRoot, {
        ts,
        action: 'persona-section-created',
        tier: 'U',
        // A deterministic id for the structural event (there's no bullet id yet
        // — the bullet is written below); audit-log requires a non-null id.
        id: generateId('U', `section:${c.target}:${c.section}`),
        reasonCode: REASON_CODES.PERSONA_SECTION_CREATED,
        reasonText: `${c.target} § ${c.section}`,
        paths: { after: scratchpadPath },
      });
    }

    const conflict = detectConflicts({
      newText: c.text,
      newTrust: trust,
      scratchpadPath,
      sectionTitle: c.section,
    });

    const common = {
      tier: 'U',
      scratchpad: c.target,
      section: c.section,
      text: c.text,
      trust, // 'medium' (auto, 45.6) | 'high' (explicit `cmk lessons promote`)
      source, // 'persona-synthesis' (auto) | 'user-explicit' (explicit promote)
      userDir,
      now: ts,
      settings,
    };

    if (conflict.conflict === true && conflict.action === 'supersede') {
      // New medium-trust persona fact contradicts an existing same-or-
      // lower-trust one → replace it (no duplicate; closes finding #3
      // Gap B). doReplace needs the old bullet's exact text.
      // doReplace returns {action:'replaced', oldId, newId, path}.
      const res = memoryWrite({ action: 'replace', oldText: conflict.existingText, ...common });
      if (res.action !== 'replaced') {
        queued.push({ target: c.target, section: c.section, text: c.text, confidence: c.confidence, reason: `not-superseded-${res.errorCategory ?? res.action}` });
        continue;
      }
      appendAuditEntry(userTierRoot, {
        ts,
        action: 'persona-supersede',
        tier: 'U',
        id: res.newId,
        reasonCode: REASON_CODES.PERSONA_SUPERSEDED,
        // Carry `source` so the audit trail distinguishes an explicit
        // `cmk lessons promote` (user-explicit) from an auto-synthesis promote.
        reasonText: `${c.target} § ${c.section} (superseded ${res.oldId}; ${source})`,
        paths: { after: res.path },
      });
      superseded.push({ oldId: res.oldId, newId: res.newId, target: c.target, section: c.section });
      continue;
    }

    const res = memoryWrite({ action: 'add', ...common });

    if (res.action === 'queued') {
      // memoryWrite routed to queues/conflicts.md (new<existing trust —
      // never overwrite a hand-curated trust:high rule, the 45.4 invariant).
      conflicts.push({ id: res.id, target: c.target, section: c.section, text: c.text, conflictsWith: res.conflictsWith });
      continue;
    }
    if (res.action !== 'appended') {
      // Bad section / cap / dedup-skip — surface, don't silently lose.
      queued.push({ target: c.target, section: c.section, text: c.text, confidence: c.confidence, reason: `not-promoted-${res.errorCategory ?? res.action}` });
      continue;
    }

    appendAuditEntry(userTierRoot, {
      ts,
      action: 'persona-promote',
      tier: 'U',
      id: res.id,
      reasonCode: REASON_CODES.PERSONA_PROMOTED,
      // Carry `source` so the audit trail distinguishes an explicit
      // `cmk lessons promote` (user-explicit) from an auto-synthesis promote, and
      // `promotedVia` so a recurrence-gated promotion (151.3) is distinguishable
      // from the explicit-imperative fast-path.
      reasonText: `${c.target} § ${c.section} (${source}; via ${promotedVia})`,
      paths: { after: res.path },
    });

    promoted.push({ id: res.id, target: c.target, section: c.section, text: c.text, trust });
  }

  // Persist the queued (low/medium-confidence + not-promoted) candidates to
  // the durable review-queue file so they survive past this response.
  const reviewQueuePath = appendPersonaReviewQueue({ userDir, entries: queued, now: ts });

  return { promoted, queued, superseded, conflicts, reviewQueuePath };
}
