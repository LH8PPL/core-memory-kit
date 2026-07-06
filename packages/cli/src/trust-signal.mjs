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

import { join } from 'node:path';
import { openIndexDb } from './index-db.mjs';
import { updateTrustScore } from './trust-score.mjs';
import { appendAuditEntry, nowIso } from './audit-log.mjs';
import { screenSignal, logSignal } from './feedback-screen.mjs';

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
    // ── FEEDBACK-SCREEN (Task 193, ADR-0017 Phase 1d) ──────────────────────
    // Poison_Guard screens writes; this screens UTILITY MUTATIONS — the
    // second unscreened input channel. Per-fact rate-limit + burst-hold
    // quarantine, decided over the .locks/trust-signals.log state. FAIL-OPEN
    // inside screenSignal (state unreadable → allow). Needs projectRoot for
    // the state file; all four production callers pass it (a shared-db call
    // without projectRoot is a test-only shape and skips the screen —
    // documented, not silent: the composition test pins the screened path).
    if (projectRoot) {
      const verdict = screenSignal(projectRoot, { id, event });
      if (!verdict.allow) {
        logSignal(projectRoot, { id, event, applied: false, reason: verdict.reason });
        return { action: verdict.reason === 'rate-limit' ? 'rate-limited' : 'quarantined', id };
      }
    }
    if (!db) db = openIndexDb({ projectRoot });
    const row = db.prepare(SELECT_TRUST_SCORE_SQL).get(id);
    if (!row) return { action: 'not-found', id };
    const next = updateTrustScore(row.trust_score, event);
    db.prepare(UPDATE_TRUST_SCORE_SQL).run(next, id);
    // Post-apply bookkeeping (best-effort): the signal log is the screen's
    // state + observability; the audit log is the canonical provenance-per-
    // mutation trail (Task 193 done-when). Each writer is isolated — a
    // bookkeeping failure must NOT corrupt the return (the UPDATE already
    // happened; falling into the outer catch would falsely report 'skipped').
    if (projectRoot) {
      logSignal(projectRoot, { id, event, applied: true, trust_score: next });
      try {
        appendAuditEntry(join(projectRoot, 'context'), {
          ts: nowIso(),
          action: 'trust-signal',
          tier: id[0],
          id,
          reasonCode: event,
          extra: { trust_score: next },
        });
      } catch {
        // best-effort audit — never disturb the applied result.
      }
    }
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
