// expiry-sweep.mjs — the expires_at curate-time sweep (Task 66.3, design
// §16.18 / D-258).
//
// A fact whose writer DECLARED a validity end (`expires_at` frontmatter,
// validated at write time by write-fact.mjs) is TOMBSTONED once that moment
// passes — audited + recoverable via `cmk get --include-tombstoned`, never
// hard-deleted (mem0/graphiti hide-don't-delete precedent; the kit's D-163
// posture). Semantics: expires_at is the FIRST moment the fact no longer
// holds — `now >= expires_at` → expired (exclusive end, matching ended_at).
//
// This sweep is HALF the enforcement: search.mjs filters expired facts at
// READ time (the immediate guarantee — LangGraph's no-sweep-configured =
// nothing-expires trap is exactly what the read-time half prevents); this
// sweep is the durable cleanup that runs with weekly-curate's deterministic
// (non-Haiku) pass, next to the queue auto-drain.
//
// Uses shared modules per CLAUDE.md: tier-paths (dirs), frontmatter (parse),
// forget (the tombstone path — its own audit entry + index scrub included).
// `yes: true` on forget is deliberate: the human decision was made at WRITE
// time when the expiry was declared; the sweep executes it.

import { forget } from './forget.mjs';
import { nowIso, asIsoString } from './audit-log.mjs';
// The shared fact walk (Task 241). `tiersFor` — "P + L always, U only when a
// userDir is supplied" — used to be defined HERE and re-inlined in three other
// modules; it now lives beside the walker that consumes it.
import { eachLiveFact } from './fact-store.mjs';

/**
 * Sweep all fact tiers for facts past their declared expires_at and
 * tombstone each through forget() (audited, recoverable).
 *
 * @param {object} opts
 * @param {string} opts.projectRoot  project root (tiers P + L)
 * @param {string} [opts.userDir]    user tier root (tier U), optional
 * @param {string} [opts.now]        ISO timestamp for determinism; defaults to wall clock
 * @returns {{action: 'swept', count: number, swept: Array<{id: string, tier: string, expiresAt: string}>, skipped_malformed: number, errors: string[]}}
 */
export function sweepExpiredFacts({ projectRoot, userDir, now } = {}) {
  const ts = now ?? nowIso();
  const nowMs = Date.parse(ts);
  const swept = [];
  const errors = [];
  let skippedMalformed = 0;

  for (const { id, tier, frontmatter } of eachLiveFact({ projectRoot, userDir })) {
    if (frontmatter.expires_at === undefined || frontmatter.expires_at === null) continue;

    // asIsoString: the kit's frontmatter.mjs uses CORE_SCHEMA, which keeps ISO
    // strings as STRINGS (it deliberately does not resolve timestamps) — its
    // Date branch guards files touched by a non-kit YAML parser, not our own.
    const raw = asIsoString(frontmatter.expires_at);
    const expiresMs = Date.parse(raw);
    if (Number.isNaN(expiresMs)) {
      // A hand-edited/corrupted value: never sweep what we can't read;
      // count it so doctor/curate output can surface the drift.
      skippedMalformed++;
      continue;
    }
    if (nowMs < expiresMs) continue; // still valid

    const r = forget({
      idOrQuery: id,
      projectRoot,
      userDir,
      reason: `expired: declared expires_at ${raw} passed (swept at ${ts})`,
      deletedBy: 'expiry-sweep',
      yes: true,
      now: ts,
    });
    if (r.action === 'tombstoned') {
      swept.push({ id, tier, expiresAt: raw });
    } else {
      errors.push(`${id}: ${r.action}${r.errors ? ' — ' + r.errors.join('; ') : ''}`);
    }
  }

  return {
    action: 'swept',
    count: swept.length,
    swept,
    skipped_malformed: skippedMalformed,
    errors,
  };
}
