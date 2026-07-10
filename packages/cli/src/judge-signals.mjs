// judge-signals.mjs — the Stop-hook JUDGE (Task 192, ADR-0017 Phase 1c;
// D-252). The full oracle-free passive-signal portfolio, all DETERMINISTIC
// detectors riding the EXISTING hooks (no new spawn, no LLM, no ritual —
// D-169). This is the organ that closes the loop 190/191/193 built the
// plumbing for: outcomes find their target memories (190's recall-log),
// resolve pre-registered expectations (191), and every trust delta routes
// through applyTrustSignal — i.e. through the 193 FEEDBACK-SCREEN
// (rate-limited, burst-held, audited). The judge inherits the guardrails;
// it cannot mass-dampen even if a detector misfires.
//
// The four signals (the surveyed portfolio):
//   TOOL-RESULT ±    a failed tool call this turn → dampen the ids the model
//                    recently SEARCHED (tight attribution — search ids, not
//                    the whole inject snapshot; a snapshot id the model never
//                    engaged with shouldn't eat a tool failure). An
//                    all-success turn WITH tool activity → weak reinforce.
//   USER-CORRECTION − the next user turn starts with a correction phrase →
//                    dampen the prior window's searched ids + resolve pending
//                    expectations MISS (REVERSAL on revert-phrasing — the
//                    strongest single-user causal signal).
//   RE-ASK −         a search returned ONLY ids the session's snapshot
//                    already carried → the injection failed the model.
//                    POLARITY (D-246, pinned by test): a re-surfacing fact is
//                    NEVER read as reinforcement — this emits DAMPEN.
//   SILENT-SUCCESS + an expectation still pending past the turn window with
//                    nothing fired → WEAK-POSITIVE (nudge only, never a
//                    replication — 191's evidence rules enforce that end).
//
// Attribution joins by TIMESTAMP window (TURN_WINDOW_MS), not session id —
// production search entries carry session:null (recall-log.mjs header).
// Best-effort everywhere: a judge failure must never break capture.

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { readRecallLog } from './recall-log.mjs';
import { readExpectations, resolveExpectation } from './expectations.mjs';
import { applyTrustSignal } from './trust-signal.mjs';

export const TURN_WINDOW_MS = 15 * 60 * 1000; // one working turn, generous
// I3 (skill-review): one red test among twenty green tool calls is the
// SIGNATURE of TDD (this repo's own binding discipline), not a failure
// outcome. Dampen only when failures dominate the turn.
export const FAILURE_RATIO_THRESHOLD = 0.5;

// Door-3.5-pinned detector patterns (skill-review I1 hardening):
// - corrections are start-anchored AND exclude bare "No <word>" openers —
//   "No worries" / "No problem" / "No rush" are approvals, not corrections;
//   only "No," / "No." (the corrective pause) counts.
// - "actually" alone is neutral ("Actually, great idea") — it counts only
//   when followed by an explicitly corrective clause.
export const CORRECTION_PATTERNS = [
  /^no[,.]/i,
  /^actually,? (no\b|that'?s (wrong|not)|it'?s not|it should(n'?t| not)?)/i,
  /^that'?s (wrong|not right|incorrect)/i,
  /^you'?re wrong/i,
  /^incorrect[,.]/i,
  /^not what i/i,
];
// Reversals are START-anchored imperatives (skill-review I1): a mid-sentence
// "before we go back to the main task" is topic flow, not a method revert.
// Residual accepted FP: a start-anchored "go back to <topic>" topic-switch
// still matches — bounded by the 193 screen and recorded in D-289.
export const REVERSAL_PATTERNS = [
  /^(please |ok,? |okay,? )?(go|switch|revert) back to\b/i,
  /^(please |ok,? |okay,? )?revert to\b/i,
];

/** Pure: count failures/successes in a turn's tool calls. */
export function detectToolFailures(toolCalls = []) {
  let failures = 0;
  let successes = 0;
  for (const c of toolCalls) {
    if (c && c.isError === true) failures += 1;
    else if (c) successes += 1;
  }
  return { failures, successes };
}

/** Pure: classify a user prompt. @returns 'reversal' | 'correction' | null */
export function detectCorrection(prompt) {
  if (typeof prompt !== 'string' || prompt.trim() === '') return null;
  const t = prompt.trim();
  if (REVERSAL_PATTERNS.some((re) => re.test(t))) return 'reversal';
  if (CORRECTION_PATTERNS.some((re) => re.test(t))) return 'correction';
  return null;
}

/** Pure: were the search's ids ALL already in the injected set? */
export function detectReask(injectedIds = [], searchIds = []) {
  if (searchIds.length === 0) return false;
  const injected = new Set(injectedIds);
  return searchIds.every((id) => injected.has(id));
}

// B1 (skill-review): the judge WATERMARK. Without it, every recall entry is
// re-judged on every subsequent Stop within the window — a fact's trust delta
// would measure TURN CADENCE, not evidence (one search converting into +5
// reinforces on ordinary turns; the 193 rate-limit is an abuse guard, not the
// dedup mechanism). The watermark persists the last-judged recall ts; each
// judge pass processes ONLY newer entries. Same .locks state class as the
// screen's log.
function judgeStatePath(projectRoot) {
  return join(projectRoot, 'context', '.locks', 'judge.state');
}
function readWatermark(projectRoot) {
  try {
    const raw = readFileSync(judgeStatePath(projectRoot), 'utf8');
    const st = JSON.parse(raw);
    return typeof st.lastJudgedTs === 'number' ? st.lastJudgedTs : 0;
  } catch {
    return 0;
  }
}
function writeWatermark(projectRoot, ts) {
  try {
    mkdirSync(join(projectRoot, 'context', '.locks'), { recursive: true });
    writeFileSync(judgeStatePath(projectRoot), `${JSON.stringify({ lastJudgedTs: ts })}\n`, 'utf8');
  } catch {
    /* best-effort — worst case a re-judge, bounded by the screen */
  }
}

// The UNJUDGED search entries inside the turn window (B1: > watermark).
function unjudgedSearchEntries(projectRoot, nowMs, watermark) {
  const cutoff = nowMs - TURN_WINDOW_MS;
  const out = [];
  for (const e of readRecallLog(projectRoot)) {
    if (e.source !== 'search') continue;
    const ts = Date.parse(e.ts ?? '');
    if (Number.isNaN(ts) || ts < cutoff || ts <= watermark) continue;
    out.push({ ...e, tsMs: ts });
  }
  return out;
}

function dampenAll(projectRoot, ids, signals, kind) {
  for (const id of ids) {
    const r = applyTrustSignal({ projectRoot, id, event: 'dampen' });
    signals.push({ kind, id, result: r.action });
  }
}

/**
 * The Stop-hook judge (wired from captureTurn). Deterministic, best-effort.
 *
 * @param {object} o
 * @param {string} o.projectRoot
 * @param {string} [o.session]
 * @param {Array}  [o.toolCalls]  [{name, result, isError}] from turn-tools
 * @param {number} [o.now]        epoch ms (tests)
 * @returns {{signals: Array<{kind, id?, result?}>}}
 */
export function judgeTurn({ projectRoot, session, toolCalls = [], now } = {}) {
  const signals = [];
  try {
    // M2 (skill-review): explicit non-kit gate — the judges only read, but
    // make the posture deliberate rather than emergent.
    if (!existsSync(join(projectRoot, 'context'))) return { signals };
    const nowMs = now ?? Date.now();
    const watermark = readWatermark(projectRoot);
    const fresh = unjudgedSearchEntries(projectRoot, nowMs, watermark);
    let maxTs = watermark;

    // 1. TOOL-RESULT ± — attributed to the UNJUDGED search ids (B1) of the
    //    turn window. I3: dampen only when failures DOMINATE (a lone red test
    //    among green calls is TDD, not an outcome).
    const { failures, successes } = detectToolFailures(toolCalls);
    const freshIds = [...new Set(fresh.flatMap((e) => e.ids ?? []))];
    if ((failures > 0 || successes > 0) && freshIds.length > 0) {
      const total = failures + successes;
      if (failures > 0 && failures / total >= FAILURE_RATIO_THRESHOLD) {
        dampenAll(projectRoot, freshIds, signals, 'tool-failure');
      } else if (failures === 0) {
        for (const id of freshIds) {
          const r = applyTrustSignal({ projectRoot, id, event: 'reinforce' });
          signals.push({ kind: 'tool-success', id, result: r.action });
        }
      }
      // mixed-but-below-threshold: no signal — ambiguous turns stay silent.
    }

    // 2. RE-ASK − — B2 (skill-review): the inject baseline is THIS SESSION's
    //    snapshot (inject entries carry session); only when session is
    //    unknown fall back to the turn window. Never the log's lifetime —
    //    a mature project's whole corpus would eventually read as re-ask.
    const injectEntries = readRecallLog(projectRoot).filter((e) => e.source === 'inject');
    const scoped = session != null
      ? injectEntries.filter((e) => e.session === session)
      : injectEntries.filter((e) => {
          const ts = Date.parse(e.ts ?? '');
          return !Number.isNaN(ts) && nowMs - ts <= TURN_WINDOW_MS;
        });
    const injectedIds = scoped.flatMap((e) => e.ids ?? []);
    for (const e of fresh) {
      if (detectReask(injectedIds, e.ids ?? [])) {
        // POLARITY (D-246): re-surfacing = DAMPEN, never reinforcement.
        dampenAll(projectRoot, e.ids, signals, 're-ask');
      }
      if (e.tsMs > maxTs) maxTs = e.tsMs;
    }
    // B1: even signal-less fresh entries are now judged — advance the mark.
    for (const e of fresh) if (e.tsMs > maxTs) maxTs = e.tsMs;
    if (maxTs > watermark) writeWatermark(projectRoot, maxTs);

    // 3. SILENT-SUCCESS weak-+ — expectations pending past the window.
    for (const exp of readExpectations(projectRoot, { pendingOnly: true })) {
      const ts = Date.parse(exp.ts ?? '');
      if (Number.isNaN(ts) || nowMs - ts < TURN_WINDOW_MS) continue;
      resolveExpectation(projectRoot, {
        id: exp.id,
        verdict: 'WEAK-POSITIVE',
        observed: 'nothing fired before the window closed (silent success)',
      });
      signals.push({ kind: 'silent-success', id: exp.id });
    }
  } catch {
    // best-effort: the judge must never break the capture hook.
  }
  return { signals };
}

/**
 * The UserPromptSubmit judge (wired from capturePrompt). A correction in the
 * user's opening words dampens the prior window's surfaced ids and resolves
 * pending expectations MISS/REVERSAL.
 *
 * @returns {{signals: Array<{kind, id?}>}}
 */
export function judgeUserPrompt({ projectRoot, session, prompt, now } = {}) {
  // `session` is reserved for session-scoped attribution; joins are
  // time-based today (production search entries carry session:null — see
  // recall-log.mjs).
  const signals = [];
  try {
    if (!existsSync(join(projectRoot, 'context'))) return { signals }; // M2
    const verdictKind = detectCorrection(prompt);
    if (!verdictKind) return { signals };
    const nowMs = now ?? Date.now();

    const cutoff = nowMs - TURN_WINDOW_MS;
    const ids = [...new Set(
      readRecallLog(projectRoot)
        .filter((e) => e.source === 'search')
        .filter((e) => {
          const ts = Date.parse(e.ts ?? '');
          return !Number.isNaN(ts) && ts >= cutoff;
        })
        .flatMap((e) => e.ids ?? []),
    )];
    dampenAll(projectRoot, ids, signals, 'correction');

    const verdict = verdictKind === 'reversal' ? 'REVERSAL' : 'MISS';
    // D-312 (over-mutation fix): resolve ONLY expectations pre-registered within
    // this turn window — a correction about the login fix must not lock every
    // pending expectation in the project (incl. a two-day-old deploy prediction)
    // to MISS/REVERSAL, the sticky verdicts. Scope like the dampenAll above +
    // the silent-success loop, which both already gate on TURN_WINDOW_MS. An
    // undated/unparseable expectation ts is NOT resolved (fail-closed — a MISS
    // is the hard-to-undo direction, so require positive in-window evidence).
    for (const exp of readExpectations(projectRoot, { pendingOnly: true })) {
      const expTs = Date.parse(exp.ts ?? exp.created_at ?? '');
      if (Number.isNaN(expTs) || nowMs - expTs > TURN_WINDOW_MS) continue;
      resolveExpectation(projectRoot, {
        id: exp.id,
        verdict,
        observed: `user ${verdictKind}: ${String(prompt).slice(0, 120)}`,
      });
      signals.push({ kind: verdictKind, id: exp.id });
    }
  } catch {
    // best-effort — never break the prompt hook.
  }
  return { signals };
}
