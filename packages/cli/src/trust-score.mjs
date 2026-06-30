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

function clamp(n) {
  if (!Number.isFinite(n)) return DEFAULT_ENUM_BASE;
  return Math.min(TRUST_SCORE_CEIL, Math.max(TRUST_SCORE_FLOOR, n));
}

/**
 * Initial trust_score for a fact, from its committed signals (Task 151.6).
 * Pure + deterministic — same inputs, same score; reconstructed on every full
 * reindex. A user-attested source outranks a machine-derived one at the same
 * trust enum; the result is clamped to [FLOOR, CEIL].
 *
 * @param {object} o
 * @param {string} [o.trust]        the committed trust enum (high|medium|low)
 * @param {string} [o.writeSource]  the committed write source (user-explicit|…)
 * @returns {number} the seed trust_score in [FLOOR, CEIL]
 */
export function initTrustScore({ trust, writeSource } = {}) {
  const base = TRUST_ENUM_BASE[trust] ?? DEFAULT_ENUM_BASE;
  const adjust = SOURCE_ADJUST[writeSource] ?? DEFAULT_SOURCE_ADJUST;
  return clamp(base + adjust);
}
