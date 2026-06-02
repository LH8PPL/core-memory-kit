// Auto-persona generation (Task 45, T-014) — v0.2 Phase 2.
//
// The friend-handoff gate. The 2026-05-30 self-test (finding #2)
// reproduced design §16.16's predicted failure: cross-project doctrine
// ("how I work everywhere" — venv-3.13, layered-backend) was captured
// but filed PROJECT-tier; the USER tier stayed empty, collapsing the
// 3-tier value prop to project+local. Lior won't hand-curate the user
// tier ("too much of a hassle"), so the user tier must fill itself.
//
// Posture (tasks.md 45.6 — supersedes 45.2/45.3's manual gate):
// OPTIMISTIC AUTO-PROMOTE. Lior 2026-05-30: "i dont want to do
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

import { readFileSync, appendFileSync, mkdirSync } from 'node:fs';
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
function assembleProjectCorpus({ projectRoot, userDir }) {
  const sources = listObservationSources({ projectRoot, userDir });
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
      const title = frontmatter?.title ?? frontmatter?.id ?? '';
      parts.push(`### ${title}\n${(body ?? '').trim()}`);
    } else {
      parts.push((content ?? '').trim());
    }
  }
  return parts.filter(Boolean).join('\n\n');
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

export function buildClassifierInstructions() {
  return [
    'You are a persona archivist for claude-memory-kit. The input below is a set of facts captured while the user worked on ONE project.',
    '',
    'Your job: identify ONLY the facts that express CROSS-PROJECT doctrine — how this user works EVERYWHERE (tooling habits, architecture preferences, communication style, process rules). IGNORE anything project-specific (this app\'s port, this repo\'s file names, one-off task state).',
    '',
    'For EACH cross-project fact, emit exactly one line, nothing else, in this EXACT format:',
    'PERSONA CANDIDATE | target=<FILE> | section=<SECTION> | confidence=<high|medium|low> | <one-line restatement>',
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
    '=== BEGIN CAPTURED PROJECT FACTS ===',
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
      text: text.trim(),
    });
  }
  return candidates;
}

/**
 * Run auto-persona synthesis: classify project-tier captured facts,
 * auto-promote cross-project doctrine into the user tier (trust:medium).
 *
 * @returns {Promise<object>} action: 'promoted' | 'skipped' | 'error'
 */
export async function autoPersona(opts = {}) {
  const t0 = Date.now();
  const { projectRoot, userDir, backend, now, settings, cooldownMs = DEFAULT_COOLDOWN_MS } = opts;

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

  const corpus = assembleProjectCorpus({ projectRoot, userDir });
  if (!corpus) {
    return { action: 'skipped', reason: 'no-facts', promoted: [], queued: [], duration_ms: Date.now() - t0 };
  }

  let result;
  try {
    result = await backend.compress({
      input: corpus,
      instructions: buildClassifierInstructions(),
      preserveCitationIds: false,
      maxOutputBytes: 4096,
      timeoutMs: 50_000,
    });
    // Spent a Haiku call — refresh the shared cooldown marker so the next
    // gated caller backs off. (touch even on cooldownMs:0 cycles: the call
    // happened, so the marker should reflect it for any LATER gated caller.)
    touchCooldownMarker({ projectRoot, now: ts });
  } catch (err) {
    touchCooldownMarker({ projectRoot, now: ts });
    return errorResult({
      category: ERROR_CATEGORIES.COMPRESS_FAILED,
      errors: [err?.message ?? String(err)],
      duration_ms: Date.now() - t0,
    });
  }

  const candidates = parsePersonaCandidates(result?.outputText);
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
 * (auto-supersede on conflict; never overwrite a hand-curated trust:high rule
 * — the 45.4 invariant); low/medium → surfaced in `queued`.
 *
 * @returns {{promoted:Array, queued:Array, superseded:Array, conflicts:Array}}
 */
// Persist low/medium-confidence (and otherwise-not-promoted) candidates to a
// durable review-queue FILE at <userDir>/queues/persona-review.md, so they are
// not lost when only returned in the response (Lior 2026-05-31: "response
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
  appendFileSync(queuePath, `${header}\n${blocks.join('\n')}\n\n`, 'utf8');
  return queuePath;
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
    if (c.confidence !== 'high') {
      // Confidence gate (not a manual gate): low/medium route to the review
      // queue. They are returned in `queued` AND written to the durable
      // queue FILE below (appendPersonaReviewQueue) so they survive past the
      // response — the daily/weekly auto-drain (or a manual review) acts on them.
      queued.push({ target: c.target, section: c.section, text: c.text, confidence: c.confidence, reason: `confidence-${c.confidence}` });
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
      // `cmk lessons promote` (user-explicit) from an auto-synthesis promote.
      reasonText: `${c.target} § ${c.section} (${source})`,
      paths: { after: res.path },
    });

    promoted.push({ id: res.id, target: c.target, section: c.section, text: c.text, trust });
  }

  // Persist the queued (low/medium-confidence + not-promoted) candidates to
  // the durable review-queue file so they survive past this response.
  const reviewQueuePath = appendPersonaReviewQueue({ userDir, entries: queued, now: ts });

  return { promoted, queued, superseded, conflicts, reviewQueuePath };
}
