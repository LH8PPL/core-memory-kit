// state-label.mjs — deterministic temporal-state projection at SERIALIZATION
// time (Task 209, A-TMA arXiv 2607.01935's QA-level mechanism; D-308).
//
// The kit COMPUTES and STORES state (Task 66 validity windows, superseded_by,
// expires_at, tombstones) but never TOLD Claude at recall time — search
// results and the snapshot rendered facts as undifferentiated bullets, so when
// a superseded/expired fact legitimately surfaced, Claude had to infer
// currency from prose. A-TMA's Case Study 1: IDENTICAL retrieved evidence
// flips from wrong to correct answer with deterministic state labels + a
// one-line instruction alone — pure labeling, zero retrieval change.
//
// Constraint edges honored: this LABELS, it never RE-RANKS (the inject hot
// path stays enum-ordered per design §20.3; the Task-194 blend is a separate,
// gated concern); the projection is a PURE function of already-known metadata
// — no LLM, no DB, no clock state beyond an injectable `now` — so it is safe
// on the 500ms inject path.
//
// The common case (current-active) returns null and stays UNLABELED — zero
// noise for healthy facts; labels appear only where state ≠ current.

/** The fixed serialization vocabulary (A-TMA's deterministic label projection,
 * the kit's states). `current` is deliberately ABSENT — current facts carry no
 * label; the envelope instruction defines unlabeled = current. */
export const STATE_LABELS = Object.freeze({
  superseded: '[superseded — kept for history]',
  expired: '[expired]',
  retracted: '[retracted]',
});

/** The one-line envelope instruction (A-TMA's prompt half — their conflict-
 * accuracy driver was labels + this line together). Emitted with search
 * results / the snapshot ONLY when at least one labeled row is present. */
export const STATE_INSTRUCTION =
  'State labels: unlabeled facts are CURRENT; [superseded]/[expired]/[retracted] entries are history — answer from the current fact unless the question asks about the past.';

// Epoch-ms coercion for the mixed reality of the fields: the index stores
// epoch ms (INTEGER columns); frontmatter stores ISO strings; tests inject
// either. Anything unparseable → null (treated as absent, never mislabeled).
function toMs(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const parsed = Date.parse(v);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Project a fact's temporal state from its already-known metadata.
 * Pure + deterministic — same inputs, same verdict.
 *
 * Precedence (strongest claim wins): retracted (the user deleted it) >
 * superseded (a newer fact replaced it) > expired (its declared shelf-life
 * passed). `expires_at == now` is already expired (the 66.3 exclusive-end
 * convention, matching the search filter's `expires_at > @now_ms`).
 *
 * @param {object} o
 * @param {number|string} [o.deletedAt]    tombstone timestamp (epoch ms or ISO)
 * @param {string}        [o.supersededBy] the replacing fact's id
 * @param {number|string} [o.expiresAt]    declared validity end (epoch ms or ISO)
 * @param {number|string} [o.now]          clock injection (tests); default wall clock
 * @returns {'retracted'|'superseded'|'expired'|null} null = current-active (unlabeled)
 */
export function projectStateLabel({ deletedAt, supersededBy, expiresAt, now } = {}) {
  if (toMs(deletedAt) !== null || (typeof deletedAt === 'string' && deletedAt.length > 0)) {
    return 'retracted';
  }
  if (supersededBy) return 'superseded';
  const exp = toMs(expiresAt);
  if (exp !== null) {
    const nowMs = toMs(now) ?? Date.now();
    if (exp <= nowMs) return 'expired';
  }
  return null;
}

/**
 * Convenience for result-row serialization: `{ state: '…' }` to spread into a
 * row when the fact is NOT current, `{}` when it is — so healthy rows carry no
 * `state` key at all (the zero-noise contract).
 */
export function stateFieldFor(row, now) {
  const state = projectStateLabel({
    deletedAt: row.deleted_at,
    supersededBy: row.superseded_by,
    expiresAt: row.expires_at,
    now,
  });
  return state ? { state } : {};
}
