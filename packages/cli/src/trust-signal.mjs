// trust-signal.mjs — apply a PASSIVE outcome event to a fact's trust_score
// (Task 151.8, ADR-0016 §20.2). The I/O half of the trust layer; the pure
// arithmetic is `updateTrustScore` in trust-score.mjs.
//
// The three passive signals (D-169, zero ritual — no `cmk` command):
//   - CONTRADICTION  (a write conflicts with an existing fact)   → dampen the existing
//   - SUPERSESSION   (`superseded_by` set / a replace)           → dampen the OLD fact
//   - RE-SURFACE     (the 151.1 recurrence bump)                 → reinforce the fact
// 151.8 wires these call sites to this helper.
//
// DURABILITY POSTURE (decided 2026-06-30, D-237 — research- + code-grounded):
// trust_score lives in the REBUILDABLE index (the `observations.trust_score`
// column), which the kit treats as a "regenerable read-cache" (index-db.mjs).
// So this is a RUNTIME OVERLAY: the delta survives the common path (reindexBoot
// skips unchanged files) → durable session-to-session on a machine; a FULL
// reindex (`cmk reindex --full` / repair) reseeds from the committed `trust`
// enum and resets the overlay — acceptable because trust_score is the LOCAL
// protection signal, while the committed `trust` enum is the PORTABLE one (the
// two-fields design). Every surveyed system that evolves trust (memclaw
// `_adjust_weights`, MemoryOS, honcho, EverOS, captain-claw) keeps it in the
// runtime DB store, not in a committed/replayed log — this matches them.
//
// BEST-EFFORT: a trust nudge must NEVER break the primary write. Every failure
// (no projectRoot, no DB, missing row, bad input) returns a benign result and
// NEVER throws — the caller (a write path) is unaffected.

import { openIndexDb } from './index-db.mjs';
import { updateTrustScore } from './trust-score.mjs';

const SELECT_TRUST_SCORE_SQL = 'SELECT trust_score FROM observations WHERE id = ?';
const UPDATE_TRUST_SCORE_SQL = 'UPDATE observations SET trust_score = ? WHERE id = ?';

/**
 * Apply one passive-outcome event to a fact's trust_score overlay (Task 151.8).
 * BEST-EFFORT — swallows every error, never throws.
 *
 * @param {object} o
 * @param {string} [o.projectRoot]  the project whose index-db holds the row
 *                                  (ignored when `db` is supplied)
 * @param {string} [o.id]           the affected fact's canonical id
 * @param {string} [o.event]        'reinforce' | 'dampen' (unknown → no-op write)
 * @param {object} [o.db]           an ALREADY-OPEN index-db handle to reuse — a
 *                                  caller that fires several signals in one op
 *                                  (e.g. a merge dampening idA+idB) passes one
 *                                  handle to avoid open/close per call. When given,
 *                                  this function does NOT close it (the caller owns
 *                                  its lifecycle). Omit → open + close our own.
 * @returns {{action:'updated'|'not-found'|'skipped', id?:string, trust_score?:number}}
 */
export function applyTrustSignal({ projectRoot, id, event, db: sharedDb } = {}) {
  if (!id || (!projectRoot && !sharedDb)) return { action: 'skipped' };
  let db = sharedDb;
  try {
    if (!db) db = openIndexDb({ projectRoot });
    const row = db.prepare(SELECT_TRUST_SCORE_SQL).get(id);
    if (!row) return { action: 'not-found', id };
    const next = updateTrustScore(row.trust_score, event);
    db.prepare(UPDATE_TRUST_SCORE_SQL).run(next, id);
    return { action: 'updated', id, trust_score: next };
  } catch {
    // best-effort: a trust overlay update must never break the primary write.
    return { action: 'skipped', id };
  } finally {
    // Only close a handle WE opened — never the caller's shared handle.
    if (!sharedDb && db) {
      try {
        db.close();
      } catch {
        // ignore close errors on a best-effort path
      }
    }
  }
}
