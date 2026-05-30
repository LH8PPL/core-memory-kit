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

import { readFileSync } from 'node:fs';
import { ERROR_CATEGORIES, errorResult } from './result-shapes.mjs';
import { resolveTierRoot, resolveScratchpadPath } from './tier-paths.mjs';
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

// One classifier candidate per line. The consolidator's Haiku Step-3
// (Design B) emits, for each captured fact that is cross-project
// doctrine, a line of this exact shape. Project-specific facts are NOT
// surfaced. Free text is the trailing group (may contain '=' / '|').
const CANDIDATE_RE =
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

function buildClassifierInstructions() {
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
    '',
    'confidence=high only when the fact clearly generalizes beyond this project (explicit "always/every project/from now on" cues, or an unmistakable working-style rule). Otherwise medium/low.',
    '',
    'Output ONLY PERSONA CANDIDATE lines. No preamble, no commentary. If nothing is cross-project, output nothing.',
    '',
    '=== BEGIN CAPTURED PROJECT FACTS ===',
  ].join('\n');
}

function parseCandidates(outputText) {
  const candidates = [];
  for (const raw of (outputText ?? '').split('\n')) {
    const line = raw.trim();
    const m = CANDIDATE_RE.exec(line);
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

  const candidates = parseCandidates(result?.outputText);
  const userTierRoot = resolveTierRoot({ tier: 'U', userDir });

  const promoted = [];
  const queued = [];
  const superseded = [];
  const conflicts = [];
  for (const c of candidates) {
    if (!VALID_TARGETS.has(c.target)) continue; // defensive: drop bad routing
    if (c.confidence !== 'high') {
      // Confidence gate (not a manual gate): low/medium route to the
      // auto-drained review queue. Queue-file write lands in the next
      // increment (45.6 queue routing); for now we surface them in the
      // response so callers + tests see the routing decision.
      queued.push({ target: c.target, section: c.section, text: c.text, reason: `confidence-${c.confidence}` });
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
    const conflict = detectConflicts({
      newText: c.text,
      newTrust: 'medium',
      scratchpadPath,
      sectionTitle: c.section,
    });

    const common = {
      tier: 'U',
      scratchpad: c.target,
      section: c.section,
      text: c.text,
      trust: 'medium', // system-derived, not user-attested (45.6)
      source: 'persona-synthesis',
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
        queued.push({ target: c.target, section: c.section, text: c.text, reason: `not-superseded-${res.errorCategory ?? res.action}` });
        continue;
      }
      appendAuditEntry(userTierRoot, {
        ts,
        action: 'persona-supersede',
        tier: 'U',
        id: res.newId,
        reasonCode: REASON_CODES.PERSONA_SUPERSEDED,
        reasonText: `${c.target} § ${c.section} (superseded ${res.oldId})`,
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
      queued.push({ target: c.target, section: c.section, text: c.text, reason: `not-promoted-${res.errorCategory ?? res.action}` });
      continue;
    }

    appendAuditEntry(userTierRoot, {
      ts,
      action: 'persona-promote',
      tier: 'U',
      id: res.id,
      reasonCode: REASON_CODES.PERSONA_PROMOTED,
      reasonText: `${c.target} § ${c.section}`,
      paths: { after: res.path },
    });

    promoted.push({ id: res.id, target: c.target, section: c.section, text: c.text, trust: 'medium' });
  }

  const duration_ms = Date.now() - t0;
  // A supersede IS a promotion outcome (the user tier changed). 'promoted'
  // when anything landed in the tier; otherwise 'skipped' (candidates may
  // still have been staged as conflicts / queued — surfaced in the arrays).
  if (promoted.length === 0 && superseded.length === 0) {
    return { action: 'skipped', reason: 'no-promotions', promoted, queued, superseded, conflicts, duration_ms };
  }
  return { action: 'promoted', promoted, queued, superseded, conflicts, duration_ms };
}
