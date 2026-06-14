// Auto-drain the review + conflict queues (v0.2 Phase 2, decision-log D-6).
//
// The "i dont want to do anything, i want it to be automatic" posture: the
// daily-distill / weekly-curate maintenance passes resolve the queues with
// AUTOMATIC resolvers, instead of waiting for the user to run
// `cmk queue review` / `cmk queue conflicts`. Those manual verbs still work
// for anyone who wants explicit control — they are just no longer REQUIRED.
//
// Resolvers (optimistic):
//   - Review queue — medium-trust auto-extractions awaiting blessing →
//     **auto-promote**. Optimistic: trust the capture. Mistakes self-correct:
//     a later contradicting fact auto-supersedes (the conflict path), and the
//     14-day medium-trust staleness drop + consolidation clean up noise.
//   - Conflict queue — a new LOWER-trust write that contradicted an existing
//     HIGHER-trust fact (that's the only thing that lands here; equal-or-higher
//     trust auto-supersedes upstream and never reaches the queue) →
//     **keep-old**. Protect the established/hand-curated higher-trust fact; the
//     lower-trust contradiction is discarded (logged via the resolver's audit).
//     Optimism never lets noise override an established fact.
//
// Per design §6.2 (review queue) + §6.8 (conflict queue) + §8.7 (cron passes).

import { resolveReviewQueue } from './review-queue.mjs';
import { resolveConflictQueue } from './conflict-queue.mjs';
import { resolvePersonaReviewQueue } from './auto-persona.mjs';
import { mergeFacts } from './merge-facts.mjs';

// Stateless optimistic resolvers (no per-entry judgement — that's the point).
const AUTO_PROMOTE = async () => 'promote';
const KEEP_OLD = async () => 'keep-old';

/**
 * Drain a tier's review + conflict queues with the optimistic auto-resolvers.
 * Safe to call when the queues are absent/empty (the resolvers return
 * zero-count results, not errors).
 *
 * @param {object} opts
 * @param {'P'|'U'|'L'} [opts.tier='P']
 * @param {string} [opts.projectRoot]
 * @param {string} [opts.userDir]
 * @param {string} [opts.scratchpad]  review-queue promotion target (default MEMORY.md)
 * @param {string} [opts.section]     review-queue promotion section (default Active Threads)
 * @returns {Promise<{review: object, conflict: object}>}
 */
export async function autoDrainQueues({ tier = 'P', projectRoot, userDir, scratchpad, section } = {}) {
  const reviewOpts = { tier, projectRoot, userDir, prompter: AUTO_PROMOTE };
  if (scratchpad) reviewOpts.scratchpad = scratchpad;
  if (section) reviewOpts.section = section;
  const review = await resolveReviewQueue(reviewOpts);

  const conflict = await resolveConflictQueue({
    tier,
    projectRoot,
    userDir,
    prompter: KEEP_OLD,
    mergeFn: mergeFacts, // never invoked under KEEP_OLD; wired for correctness
  });

  // Persona-review queue (D-154): the medium-confidence cross-project persona
  // candidates that were ROUTED here with the promise of an auto-drain that was
  // never implemented — so they stranded (the v0.3.1 cold-open found the user's
  // architecture philosophy stuck here). Drain it optimistically like the review
  // queue (sync; userDir-scoped so it runs regardless of `tier`). Best-effort: a
  // persona-drain hiccup must not fail the project-tier review/conflict drain.
  let persona = { promoted: 0, drained: 0, queuePath: null };
  if (userDir) {
    try {
      persona = resolvePersonaReviewQueue({ userDir });
    } catch {
      // best-effort; the queue file survives for the next pass
    }
  }

  return { review, conflict, persona };
}
