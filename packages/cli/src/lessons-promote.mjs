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
import { findBulletScratchpad } from './bullet-lookup.mjs';
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
  // `lessons promote` carries a PROJECT observation to the user tier. Reject a
  // U-tier id (already user-tier — nothing to promote) and an L-tier id (local
  // is gitignored/machine-specific on purpose — promoting it to the
  // machine-global user tier would surface deliberately-unshared content in
  // every project's persona). Source must be the committed project tier.
  if (typeof id === 'string' && (id[0] === 'U' || id[0] === 'L')) {
    return errorResult({
      category: 'schema',
      errors: [`lessons promote moves a PROJECT-tier (P-) fact; got a ${id[0]}-tier id '${id}'`],
      id,
    });
  }

  const found = resolveFact({ id, projectRoot, userDir });
  if (found.state === 'not-found') {
    // The id might be a scratchpad BULLET (the common `cmk search` mix-up):
    // search surfaces bullet ids too, but promote carries FACTS. Say so.
    const bulletIn = findBulletScratchpad(id, { projectRoot, userDir });
    if (bulletIn) {
      return notFoundResult({
        errors: [
          `'${id}' is a scratchpad bullet in ${bulletIn}, not a graduated fact — \`cmk lessons promote\` carries facts (in context/memory/) to the user tier. In \`cmk search\` output, pick an id whose location is a context/memory/*.md file, not a ${bulletIn}:NN bullet.`,
        ],
        id,
      });
    }
    return notFoundResult({ errors: [`no fact with id '${id}'`], id });
  }
  if (found.state === 'tombstoned') {
    return notFoundResult({ errors: [`fact '${id}' is tombstoned (forgotten); cannot promote`], id });
  }

  // A scratchpad bullet is single-line (the provenance HTML-comment must sit on
  // the very next line). A RICH fact body is multi-line — `headline\n\n**Why:**
  // …\n\n**How to apply:** …` — which writeBullet rejects outright (newlines
  // break the 2-line bullet+comment shape). Flatten all whitespace to single
  // spaces so the rule + its rationale promote as one well-formed bullet (the
  // primary wedge case: an explicitly-captured rich architecture rule). The
  // scratchpad byte cap still applies downstream via memoryWrite.
  const text = (found.body ?? '').replace(/\s+/g, ' ').trim();
  if (!text) {
    return errorResult({ category: 'schema', errors: [`fact '${id}' has no body to promote`], id });
  }

  const candidate = {
    target: to,
    section: section || DEFAULT_SECTION[to],
    text,
    confidence: 'high', // explicit user action → clears the confidence gate (promotes, not queued)
  };

  // trust:'high' + source:'user-explicit' — a user-attested promotion is durable
  // (never aged out / auto-superseded by the maintenance passes — the 45.4
  // invariant). The auto path leaves these at the default medium.
  const res = promoteCandidatesToUserTier({
    candidates: [candidate],
    userDir,
    now,
    trust: 'high',
    source: 'user-explicit',
  });

  const promotedHit = res.promoted.find((p) => p.target === to);
  if (promotedHit) {
    return { action: 'promoted', id, target: to, section: candidate.section, newId: promotedHit.id ?? null };
  }
  // A supersede is ALSO success: the promotion replaced an existing same-topic
  // lesson with this updated one (common when the user re-promotes a refined rule).
  const supersededHit = res.superseded.find((s) => s.target === to);
  if (supersededHit) {
    return { action: 'promoted', id, target: to, section: candidate.section, newId: supersededHit.newId, superseded: supersededHit.oldId };
  }
  // Routed to the conflict queue (e.g. it clashes with a hand-curated entry the
  // kit won't silently overwrite) or otherwise didn't land — surface honestly.
  const conflictHit = res.conflicts.find((q) => q.target === to);
  if (conflictHit) {
    return { action: 'queued', id, target: to, section: candidate.section, reason: 'conflict' };
  }
  const queuedHit = res.queued.find((q) => q.target === to);
  return {
    action: 'queued',
    id,
    target: to,
    section: candidate.section,
    reason: queuedHit?.reason ?? 'not-promoted',
  };
}
