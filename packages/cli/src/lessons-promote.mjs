// lessons-promote.mjs — `cmk lessons promote <id>`: move a project-tier fact
// into the user tier (LESSONS.md by default) through the SAFE promote path.
//
// This is the EXPLICIT half of the wedge (D-27/D-30): a project observation the
// user wants to carry across ALL their projects. Before this, the subcommand
// was a stub and the memory-write skill hand-edited LESSONS.md — bypassing
// home-path sanitization, Poison_Guard, dedup, and the audit trail.
//
// It routes through promoteCandidatesToUserTier (D-13) at confidence:'high'
// (an explicit user action is the highest-trust signal there is, so it promotes
// rather than queuing). NEVER hand-edit ~/.claude-memory-kit/*.md.
//
// Composes on: forget.resolveFact (read a project fact by id) +
// auto-persona.promoteCandidatesToUserTier (safe user-tier write).

import { resolveFact } from './forget.mjs';
import { promoteCandidatesToUserTier } from './auto-persona.mjs';
import { errorResult, notFoundResult } from './result-shapes.mjs';

const VALID_TARGETS = new Set(['USER.md', 'HABITS.md', 'LESSONS.md']);

// Sensible default landing section per target. Each name passes
// auto-persona's SAFE_SECTION_NAME guard; ensureSectionExists creates it if the
// user's scaffold doesn't already have it.
const DEFAULT_SECTION = Object.freeze({
  'LESSONS.md': 'Cross-Project Lessons',
  'HABITS.md': 'Working Style',
  'USER.md': 'Profile',
});

/**
 * Promote a project-tier fact to the user tier through the safe path.
 *
 * @param {object} opts
 * @param {string} opts.id          citation id of the project fact (e.g. P-XXXXXXXX)
 * @param {string} opts.projectRoot project root (for resolving the source fact)
 * @param {string} opts.userDir     user-tier dir (~/.claude-memory-kit)
 * @param {string} [opts.to]        target user-tier file (default LESSONS.md)
 * @param {string} [opts.section]   landing section (default per-target)
 * @param {string} [opts.now]       ISO timestamp override (tests)
 * @returns {{action:string, id?:string, target?:string, section?:string, ...}}
 */
export function lessonsPromote({ id, projectRoot, userDir, to = 'LESSONS.md', section, now } = {}) {
  if (!userDir) {
    return errorResult({ category: 'schema', errors: ['userDir is required (lessons promote writes to the user tier)'] });
  }
  if (!VALID_TARGETS.has(to)) {
    return errorResult({ category: 'schema', errors: [`invalid target '${to}' (expected USER.md | HABITS.md | LESSONS.md)`] });
  }

  const found = resolveFact({ id, projectRoot, userDir });
  if (found.state === 'not-found') {
    return notFoundResult({ errors: [`no fact with id '${id}'`], id });
  }
  if (found.state === 'tombstoned') {
    return notFoundResult({ errors: [`fact '${id}' is tombstoned (forgotten); cannot promote`], id });
  }

  const text = (found.body ?? '').trim();
  if (!text) {
    return errorResult({ category: 'schema', errors: [`fact '${id}' has no body to promote`], id });
  }

  const candidate = {
    target: to,
    section: section || DEFAULT_SECTION[to],
    text,
    confidence: 'high', // explicit user action → highest trust → promotes, not queued
  };

  const res = promoteCandidatesToUserTier({ candidates: [candidate], userDir, now });

  const promotedHit = res.promoted.find((p) => p.target === to);
  if (promotedHit) {
    return { action: 'promoted', id, target: to, section: candidate.section, path: promotedHit.path ?? null };
  }
  const queuedHit = res.queued.find((q) => q.target === to);
  if (queuedHit) {
    return { action: 'queued', id, target: to, section: candidate.section, reason: queuedHit.reason };
  }
  // conflict / superseded — surface as queued so the caller knows it didn't land cleanly
  return { action: 'queued', id, target: to, section: candidate.section, reason: 'not-promoted' };
}
