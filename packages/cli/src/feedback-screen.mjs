// feedback-screen.mjs — Poison_Guard for the LOOP (Task 193, ADR-0017 Phase
// 1d / Decision #4 "a prerequisite, not an option"; D-252). Poison_Guard
// screens WRITES; this screens UTILITY MUTATIONS — the second unscreened
// input channel. Without it, a systemically-wrong judge (a broken test suite
// reddening everything for a week) or a manufactured failure-signal could
// dampen GOOD memories without touching a file. Precedent: A-MemGuard's
// set-level defense (screen the batch, not just the item).
//
// The screen sits INSIDE applyTrustSignal (trust-signal.mjs) — the single
// trust_score mutation gate (verified: 4 callers, zero bypass writers) — so
// every signal, present and future (Task 192's judge), routes through it.
// One path, no bypass.
//
// Three rules (constants exported for tests + future config):
//   1. RATE-LIMIT — max N applied deltas per fact per UTC day. A feedback
//      loop hammering one fact is either a bug or an attack; either way the
//      fact's score freezes for the day.
//   2. BURST-HOLD — when today's signal volume is high AND overwhelmingly
//      negative (>= BURST_MIN_SIGNALS with > BURST_NEGATIVE_FRACTION
//      dampens), further DAMPENS are quarantined (logged applied:false,
//      reason 'burst-hold', NOT applied). Reinforces still pass — positive
//      signals are not the attack surface. The quarantine entries in the
//      signal log are the surfacing (doctor can read the same log later).
//   3. AUDIT — every APPLIED delta also lands in the canonical audit.log
//      (action 'trust-signal', provenance per mutation).
//
// State: an NDJSON log at <projectRoot>/context/.locks/trust-signals.log —
// the same gitignored .locks diagnostic class as recall.log/audit.log; it is
// BOTH the screen's memory (today's counts) and its observability. FAIL-OPEN:
// if the state can't be read or written (no context/, fs error), the signal
// applies unscreened — a broken diagnostic must never break the primary
// write (the pre-193 contract, preserved).
//
// The floor (TRUST_SCORE_FLOOR = 0.05) is enforced downstream in
// updateTrustScore — demote-not-evict is arithmetic, not policy; the screen
// never needs to re-implement it.

import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const RATE_LIMIT_PER_FACT_PER_DAY = 5;
export const BURST_MIN_SIGNALS = 10;
export const BURST_NEGATIVE_FRACTION = 0.8;

export function signalLogPath(projectRoot) {
  return join(projectRoot, 'context', '.locks', 'trust-signals.log');
}

/** Read the signal log (all entries, oldest first; corrupt lines skipped). */
export function readSignalLog(projectRoot) {
  const path = signalLogPath(projectRoot);
  if (!existsSync(path)) return [];
  let raw;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    return [];
  }
  const entries = [];
  for (const line of raw.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    try {
      const parsed = JSON.parse(t);
      // Only plain objects survive: a stray `null`/scalar line would otherwise
      // throw inside screenSignal's date filter and fail the screen OPEN on
      // every future call (skill-review M4).
      if (parsed && typeof parsed === 'object') entries.push(parsed);
    } catch {
      /* skip corrupt line */
    }
  }
  return entries;
}

/**
 * The screen verdict for one incoming signal. Pure decision over today's
 * entries — the caller (trust-signal.mjs) applies or refuses accordingly.
 *
 * @returns {{allow: boolean, reason?: 'rate-limit'|'burst-hold'}}
 */
export function screenSignal(projectRoot, { id, event }) {
  let today;
  try {
    const dayKey = new Date().toISOString().slice(0, 10);
    today = readSignalLog(projectRoot).filter((e) => (e.ts ?? '').slice(0, 10) === dayKey);
  } catch {
    return { allow: true }; // fail-open — see module header
  }

  // Rule 1: per-fact rate limit (count only APPLIED deltas — refusals don't
  // consume budget, or a storm could freeze a fact forever).
  const factToday = today.filter((e) => e.id === id && e.applied === true);
  if (factToday.length >= RATE_LIMIT_PER_FACT_PER_DAY) {
    return { allow: false, reason: 'rate-limit' };
  }

  // Rule 2: burst-hold — only gates DAMPENS.
  if (event === 'dampen') {
    const applied = today.filter((e) => e.applied === true);
    if (applied.length >= BURST_MIN_SIGNALS) {
      const negatives = applied.filter((e) => e.event === 'dampen').length;
      if (negatives / applied.length > BURST_NEGATIVE_FRACTION) {
        return { allow: false, reason: 'burst-hold' };
      }
    }
  }

  return { allow: true };
}

/** Append one screen-log entry (best-effort — never throws). */
export function logSignal(projectRoot, { id, event, applied, reason, trust_score }) {
  try {
    // Never scaffold context/ in a non-kit project (the same gate as the
    // recall-log's inject side — skill-review M8): no context/, no log.
    if (!existsSync(join(projectRoot, 'context'))) return { ok: false };
    const entry = { ts: new Date().toISOString(), id, event, applied };
    if (reason) entry.reason = reason;
    if (trust_score !== undefined) entry.trust_score = trust_score;
    mkdirSync(join(projectRoot, 'context', '.locks'), { recursive: true });
    appendFileSync(signalLogPath(projectRoot), `${JSON.stringify(entry)}\n`, 'utf8');
    return { ok: true };
  } catch {
    return { ok: false };
  }
}
