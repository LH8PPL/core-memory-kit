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

import { readRecallLog } from './recall-log.mjs';
import { readExpectations, resolveExpectation } from './expectations.mjs';
import { applyTrustSignal } from './trust-signal.mjs';

export const TURN_WINDOW_MS = 15 * 60 * 1000; // one working turn, generous

// Door-3.5-pinned detector patterns (start-anchored: a mid-sentence "no"
// must not read as a correction).
export const CORRECTION_PATTERNS = [
  /^no[,.\s]/i,
  /^actually[,\s]/i,
  /^that'?s (wrong|not right|incorrect)/i,
  /^you'?re wrong/i,
  /^incorrect[,.\s]/i,
  /^not what i/i,
];
export const REVERSAL_PATTERNS = [
  /\b(go|going|went) back to\b/i,
  /\brevert(ed|ing)? to\b/i,
  /\bswitch(ed|ing)? back\b/i,
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

// The recent recall window: search-surfaced ids inside the turn window.
function recentSearchIds(projectRoot, nowMs) {
  const cutoff = nowMs - TURN_WINDOW_MS;
  const ids = new Set();
  for (const e of readRecallLog(projectRoot)) {
    if (e.source !== 'search') continue;
    const ts = Date.parse(e.ts ?? '');
    if (Number.isNaN(ts) || ts < cutoff) continue;
    for (const id of e.ids ?? []) ids.add(id);
  }
  return [...ids];
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
    const nowMs = now ?? Date.now();

    // 1. TOOL-RESULT ± — attributed to the turn window's searched ids.
    const { failures, successes } = detectToolFailures(toolCalls);
    if (failures > 0 || successes > 0) {
      const ids = recentSearchIds(projectRoot, nowMs);
      if (ids.length > 0) {
        if (failures > 0) {
          dampenAll(projectRoot, ids, signals, 'tool-failure');
        } else {
          for (const id of ids) {
            const r = applyTrustSignal({ projectRoot, id, event: 'reinforce' });
            signals.push({ kind: 'tool-success', id, result: r.action });
          }
        }
      }
    }

    // 2. RE-ASK − — searches in the window whose ids the inject already had.
    const entries = readRecallLog(projectRoot);
    const cutoff = nowMs - TURN_WINDOW_MS;
    const injectedIds = entries
      .filter((e) => e.source === 'inject')
      .flatMap((e) => e.ids ?? []);
    for (const e of entries) {
      if (e.source !== 'search') continue;
      const ts = Date.parse(e.ts ?? '');
      if (Number.isNaN(ts) || ts < cutoff) continue;
      if (detectReask(injectedIds, e.ids ?? [])) {
        // POLARITY (D-246): re-surfacing = DAMPEN, never reinforcement.
        dampenAll(projectRoot, e.ids, signals, 're-ask');
      }
    }

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
  const signals = [];
  try {
    const verdictKind = detectCorrection(prompt);
    if (!verdictKind) return { signals };
    const nowMs = now ?? Date.now();

    const ids = recentSearchIds(projectRoot, nowMs);
    dampenAll(projectRoot, ids, signals, 'correction');

    const verdict = verdictKind === 'reversal' ? 'REVERSAL' : 'MISS';
    for (const exp of readExpectations(projectRoot, { pendingOnly: true })) {
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
