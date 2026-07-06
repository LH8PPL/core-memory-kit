// expectations.mjs — expectation pre-registration (Task 191, ADR-0017 Phase
// 1b; D-252). The study's core honesty rule: NO pre-registered expectation →
// NO better-than claim. Before acting on a recalled method, the assistant
// states a one-line checkable EXPECTED outcome (`PREDICTION: …` in the turn
// text); the kit captures it as PENDING; Task 192's next-turn signals resolve
// it HIT/MISS — and the resolution is what earns a judgment its evidence.
//
// Capture RIDES the existing Stop-hook capture path (captureTurn calls
// capturePredictions on the sanitized turn — no new spawn, no ritual, the
// D-169 automatic-path rule). Vague predictions are REJECTED at the gate
// ("works", "better" — not checkable): a prediction must be specific enough
// to fail.
//
// State: NDJSON at context/.locks/expectations.log (the same gitignored
// .locks diagnostic class as recall.log / trust-signals.log; rotation rides
// design §16.13). Event-sourced: a resolution APPENDS a line; the reader
// folds by id, last status wins — nothing is ever rewritten.

import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { appendJudgmentEvidence } from './judgment.mjs';

// A prediction line: everything after `PREDICTION:` to end-of-line.
const PREDICTION_RE = /PREDICTION:\s*([^\n]+)/g;
// The specificity gate: fewer than 4 words cannot state a checkable outcome
// ("works", "it is better") — the study's vague-doesn't-count rule.
const MIN_WORDS = 4;

export function expectationsLogPath(projectRoot) {
  return join(projectRoot, 'context', '.locks', 'expectations.log');
}

/** Extract the SPECIFIC predictions from a turn's text. @returns {string[]} */
export function scanForPredictions(text) {
  if (typeof text !== 'string' || text.length === 0) return [];
  // M2 (skill-review): strip fenced code blocks first - a turn PASTING code
  // or tests that mention PREDICTION: (this repo dogfoods itself) must not
  // register junk expectations.
  text = text.replace(/```[\s\S]*?```/g, '');
  const found = [];
  for (const m of text.matchAll(PREDICTION_RE)) {
    const candidate = m[1].trim();
    if (candidate.split(/\s+/).length >= MIN_WORDS) found.push(candidate);
  }
  return found;
}

/**
 * Capture a turn's predictions as PENDING expectations. Best-effort (never
 * throws — it runs inside the Stop hook) and never scaffolds a non-kit
 * project (the M8 gate: no context/, no write).
 *
 * @returns {{ok: boolean, captured: number}}
 */
export function capturePredictions(projectRoot, { text, session } = {}) {
  try {
    if (!existsSync(join(projectRoot, 'context'))) return { ok: false, captured: 0 };
    const predictions = scanForPredictions(text);
    if (predictions.length === 0) return { ok: true, captured: 0 };
    mkdirSync(join(projectRoot, 'context', '.locks'), { recursive: true });
    const path = expectationsLogPath(projectRoot);
    for (const p of predictions) {
      const entry = {
        id: `exp-${randomUUID().slice(0, 8)}`,
        ts: new Date().toISOString(),
        session: session ?? null,
        text: p,
        status: 'pending',
      };
      appendFileSync(path, `${JSON.stringify(entry)}\n`, 'utf8');
    }
    return { ok: true, captured: predictions.length };
  } catch {
    return { ok: false, captured: 0 };
  }
}

/**
 * Read expectations, folded by id (event-sourced: the LAST line for an id
 * wins, so a resolution overrides the pending entry).
 *
 * @param {string} projectRoot
 * @param {object} [opts]
 * @param {boolean} [opts.pendingOnly]
 * @returns {Array<object>}
 */
export function readExpectations(projectRoot, { pendingOnly } = {}) {
  const path = expectationsLogPath(projectRoot);
  if (!existsSync(path)) return [];
  let raw;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    return [];
  }
  const byId = new Map();
  for (const line of raw.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    try {
      const e = JSON.parse(t);
      if (!e || typeof e !== 'object' || !e.id) continue;
      byId.set(e.id, { ...(byId.get(e.id) ?? {}), ...e });
    } catch {
      /* skip corrupt line */
    }
  }
  const all = [...byId.values()];
  return pendingOnly ? all.filter((e) => e.status === 'pending') : all;
}

/**
 * Resolve one pending expectation (Task 192 calls this from its detectors).
 * Appends a resolution line; optionally routes the outcome into a judgment's
 * evidence log (the earn step).
 *
 * @param {string} projectRoot
 * @param {object} o
 * @param {string} o.id
 * @param {string} o.verdict     HIT | MISS | REVERSAL | WEAK-POSITIVE
 * @param {string} [o.observed]
 * @param {string} [o.judgmentId] when set, appendJudgmentEvidence is called
 * @returns {{action:'resolved'|'not-found'|'error'}}
 */
export function resolveExpectation(projectRoot, { id, verdict, observed, judgmentId } = {}) {
  const pending = readExpectations(projectRoot).find((e) => e.id === id);
  if (!pending) return { action: 'not-found' };
  // B2 (skill-review): a second resolve of the same id must be a NO-OP -
  // otherwise repeated resolutions inflate a judgment's n_episodes and can
  // fake 'corroborated' from ONE real episode, gutting the >=3-replication
  // honesty guard this module exists to enforce.
  // I2 refinement (Task 192 review): a WEAK-POSITIVE is a NUDGE by its own
  // definition - a real MISS/REVERSAL arriving later (the user's correction
  // at minute 20 after a premature silent-success at minute 16) OVERRIDES it.
  // Hard verdicts never flip; weak ones yield to evidence.
  const overridesWeak = (verdict === 'MISS' || verdict === 'REVERSAL') && pending.verdict === 'WEAK-POSITIVE';
  if (pending.status !== 'pending' && !overridesWeak) return { action: 'already-resolved', id };
  try {
    appendFileSync(
      expectationsLogPath(projectRoot),
      `${JSON.stringify({ id, ts: new Date().toISOString(), status: 'resolved', verdict, observed: observed ?? null })}\n`,
      'utf8',
    );
  } catch {
    return { action: 'error' };
  }
  if (judgmentId) {
    appendJudgmentEvidence({
      projectRoot,
      id: judgmentId,
      verdict,
      predicted: pending.text,
      observed,
    });
  }
  return { action: 'resolved' };
}
