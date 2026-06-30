// heat.mjs — the capped-recurrence promotion score (Task 151.2, ADR-0016).
//
// A fact earns promotion to the persona by RECURRENCE, not by phrasing. The
// score blends how often a fact has re-surfaced (the earned signal, CAPPED) with
// how recently (a lazy exponential decay). The cap is load-bearing: recurrence
// is a tie-breaker, never the driver — a noisy-but-trivial fact must never
// outrank a once-stated durable decision.
//
//   heat = min(recurrence_count, RECUR_CAP) * W_REC  +  exp(-Δhours / τ)
//
// Shapes verified against real code (the 7-system study, D-228):
//   • recency = exp(-Δhours/τ), τ=24h  — MemoryOS `compute_recency`
//   • the cap = min(count, ceiling)    — MemOS `min(leaf_count*2, 20)`
//   • threshold 3                      — memclaw `min_cluster_size` (diversity
//                                        gate dropped: single-user, not a fleet)
//
// PURE: no I/O, no cron. Recency is computed AT READ from `now` + `lastAt`, so
// there is no background job mutating a stored heat value (D-169 — automatic,
// ritual-free). The caller passes `recurrence_count` (frontmatter, Task 151.1)
// and the fact's last-surfaced timestamp.

// The recurrence cap. Past this many recurrences, more adds nothing — recurrence
// is a tie-breaker, not a runaway driver (MemOS). Chosen so the recurrence band
// (0…RECUR_CAP·W_REC) is comparable to the recency band (0…1), keeping neither
// signal able to bury the other.
export const RECUR_CAP = 10;

// Weight on the (capped) recurrence term. RECUR_CAP·W_REC ≈ 1.0 so a maxed-out
// recurrence contributes about the same as a brand-new recency — the two signals
// are balanced, then the cap prevents recurrence from dominating.
export const W_REC = 0.1;

// Recency half-life-ish constant (hours). exp(-Δh/τ): at τ hours the recency
// term is e^-1 ≈ 0.368 of its fresh value. MemoryOS uses τ=24.
export const TAU_HOURS = 24;

// Promotion threshold: a fact promotes to the persona at this many recurrences
// (memclaw min-cluster-size; diversity gate dropped for single-user). "I've
// reached this same shape 3× → it's durable."
export const PROMOTE_THRESHOLD = 3;

/**
 * Compute a fact's promotion heat. Pure — no I/O.
 *
 * @param {object} o
 * @param {number} o.recurrenceCount  how many times this fact has surfaced (≥1)
 * @param {string|null} [o.lastAt]     ISO timestamp the fact last surfaced; null/garbage → recency 0
 * @param {number} [o.now]             ms epoch "now" (default Date.now()); injectable for tests
 * @returns {number} heat score (recurrence band + recency band)
 */
export function computeHeat({ recurrenceCount = 1, lastAt = null, now = Date.now() } = {}) {
  const count = Number.isFinite(recurrenceCount) && recurrenceCount > 0 ? recurrenceCount : 1;
  const recurrenceTerm = Math.min(count, RECUR_CAP) * W_REC;

  let recencyTerm = 0;
  if (lastAt) {
    const t = Date.parse(lastAt);
    if (Number.isFinite(t)) {
      const deltaHours = Math.max(0, (now - t) / 3_600_000); // clamp future skew → ≤1
      recencyTerm = Math.exp(-deltaHours / TAU_HOURS);
    }
  }
  return recurrenceTerm + recencyTerm;
}

/**
 * Does this fact clear the promotion threshold? (recurrence-only — the gate is
 * "seen ≥ N times", recency only orders WITHIN the promotable set.)
 *
 * @param {number} recurrenceCount
 * @returns {boolean}
 */
export function isPromotable(recurrenceCount) {
  return Number.isFinite(recurrenceCount) && recurrenceCount >= PROMOTE_THRESHOLD;
}
