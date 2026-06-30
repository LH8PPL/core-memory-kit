// trust-score.mjs — the evolving PROTECTION field (Task 151.6+, ADR-0016 §20.2).
//
// `trust_score` is a FLOAT per fact, stored in the REBUILDABLE INDEX (the
// index-db `observations.trust_score` column), NOT in committed frontmatter
// (D-218: a moving value in a committed .md = git-diff noise; markdown-as-truth
// keeps committed files clean). It is reconstructed on every full reindex.
//
// Two trust signals, two homes (the kit's deliberate split — MemOS proves a
// single unified score lets a noisy fact rank high):
//   - `trust` ENUM (high/medium/low) — committed frontmatter, the CURATED signal
//     a human/classifier assigned; it gates promotion-protection coarsely and is
//     the INIT seed here.
//   - `trust_score` FLOAT — this module, the rebuildable index; it EVOLVES from
//     passive outcomes (151.7 update rule + 151.8 signals) so a fact that keeps
//     getting contradicted sinks and a fact that keeps getting restated rises,
//     with NO ritual (D-169).
//
// 151.6 ships ONLY the INIT (source-based seed). 151.7 adds the asymmetric,
// clamped, floored update rule; 151.8 wires the three passive signals.

// The floor (memclaw `_adjust_weights`): trust_score never reaches zero, so a
// fact is never auto-deleted purely by trust decay — demote-not-evict (§20.3).
export const TRUST_SCORE_FLOOR = 0.05;
// The ceiling: cap below 1.0 so a maxed-out fact still has reinforcement headroom
// and the init never starts at the top.
export const TRUST_SCORE_CEIL = 0.95;

// Base score per committed trust enum — the curated coarse signal.
const TRUST_ENUM_BASE = { high: 0.8, medium: 0.5, low: 0.3 };
const DEFAULT_ENUM_BASE = 0.5; // unknown enum → treat as medium

// Source adjustment: a USER-ATTESTED write (the user stated/curated it) starts
// higher than a MACHINE-DERIVED one at the same enum — the design's
// "user-explicit > auto-extract" (memory-os source-based init). `imported` is
// neutral (provenance unknown); `seed` is a scaffold placeholder, slightly low.
const SOURCE_ADJUST = {
  'user-explicit': +0.1,
  'manual-edit': +0.1,
  imported: 0,
  'auto-extract': -0.05,
  compressor: -0.05,
  seed: -0.1,
};
const DEFAULT_SOURCE_ADJUST = 0; // unknown source → neutral

// Recurrence contribution to the SEED (Task 151.8 — the research fix). A re-stated
// fact seeds HIGHER, and durably: this is reconstructed from the committed
// `recurrence_count` (151.1) on every reindex, so the "restatement reinforcement"
// can never be wiped by a reseed (unlike a fragile overlay delta would be). This
// is the MemoryOS/MemOS/honcho pattern — the recurrence COUNT is a TERM in the
// score, NOT a separate event. The cap is LOAD-BEARING (MemOS `min(count·w, 2)`):
// recurrence is a tie-breaker, never a runaway driver — a high-recurrence LOW-trust
// fact must never outrank a once-stated HIGH-trust one (the value-blind-LFU bug).
const RECUR_WEIGHT = 0.02; // per recurrence beyond the first
const RECUR_CONTRIB_CAP = 0.1; // max total recurrence lift (5 recurrences = full)

function recurrenceTerm(recurrenceCount) {
  const n = Number.isFinite(recurrenceCount) && recurrenceCount > 1 ? recurrenceCount : 1;
  return Math.min((n - 1) * RECUR_WEIGHT, RECUR_CONTRIB_CAP);
}

function clamp(n) {
  if (!Number.isFinite(n)) return DEFAULT_ENUM_BASE;
  return Math.min(TRUST_SCORE_CEIL, Math.max(TRUST_SCORE_FLOOR, n));
}

/**
 * Initial trust_score for a fact, from its committed signals (Task 151.6 + .8).
 * Pure + deterministic — same inputs, same score; reconstructed on every full
 * reindex. A user-attested source outranks a machine-derived one at the same
 * trust enum; a re-stated fact (higher `recurrenceCount`) seeds higher, CAPPED;
 * the result is clamped to [FLOOR, CEIL].
 *
 * @param {object} o
 * @param {string} [o.trust]            the committed trust enum (high|medium|low)
 * @param {string} [o.writeSource]      the committed write source (user-explicit|…)
 * @param {number} [o.recurrenceCount]  the committed recurrence_count (151.1); a
 *                                      re-stated fact seeds higher (capped) — the
 *                                      DURABLE restatement-reinforcement (151.8)
 * @returns {number} the seed trust_score in [FLOOR, CEIL]
 */
export function initTrustScore({ trust, writeSource, recurrenceCount } = {}) {
  const base = TRUST_ENUM_BASE[trust] ?? DEFAULT_ENUM_BASE;
  const adjust = SOURCE_ADJUST[writeSource] ?? DEFAULT_SOURCE_ADJUST;
  return clamp(base + adjust + recurrenceTerm(recurrenceCount));
}

// The asymmetric event deltas (Task 151.7; memclaw `evolve_service._adjust_weights`):
// a dampen moves MORE than a reinforce, so a contradicted/superseded fact sinks
// faster than a restated one rises — the conservative, fail-loud posture (a single
// failure outweighs a single success). Event-driven, NOT clock-driven.
export const REINFORCE_DELTA = +0.1;
export const DAMPEN_DELTA = -0.15;

// The event → delta map. An unknown event contributes 0 (no-op) so a future
// signal that isn't wired yet can't silently corrupt a score.
const EVENT_DELTA = {
  reinforce: REINFORCE_DELTA,
  dampen: DAMPEN_DELTA,
};

/**
 * Apply one passive-outcome event to a fact's trust_score (Task 151.7).
 * Pure + deterministic — the SAME (current, event) always yields the same result
 * (event-driven, NOT time-decayed; recency decay is a search-ranking concern
 * computed at read, never stored). The result is clamped to [FLOOR, CEIL]; the
 * floor is load-bearing — repeated dampens settle at 0.05, never zero, so a fact
 * is never auto-deleted by trust decay (demote-not-evict, §20.3). 151.8 maps the
 * three passive signals (contradiction / supersession / restatement) onto the
 * 'dampen' / 'reinforce' events.
 *
 * @param {number} current  the fact's current trust_score
 * @param {string} [event]  'reinforce' | 'dampen' (unknown → no-op)
 * @returns {number} the updated trust_score in [FLOOR, CEIL]
 */
export function updateTrustScore(current, event) {
  const base = Number.isFinite(current) ? current : DEFAULT_ENUM_BASE;
  const delta = EVENT_DELTA[event] ?? 0;
  return clamp(base + delta);
}
