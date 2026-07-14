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
// rather than queuing). NEVER hand-edit ~/.core-memory-kit/*.md.
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

// Task 151.9 — the offline TOPIC-router (fixes Hole C, §20.4). Before this, every
// no-arg `cmk lessons promote` funnelled into LESSONS § Cross-Project Lessons →
// single-section overflow. routeTopic spreads promotes across the three user-tier
// files by CONTENT, using auto-persona's taxonomy (USER=identity/preferences,
// HABITS=working-style, LESSONS=cross-project lessons) — but OFFLINE + deterministic
// (NO Haiku: the explicit command stays instant + network-free; the Haiku
// classifier stays on the AUTOMATIC path, which already runs an LLM. The two paths
// each topic-route, each by the router that fits — D-238-style two-mechanism split).
// Ordered most-specific → fallback; LESSONS is the safe catch-all for a
// cross-project fact. Each route's default section is per-file below.
const ROUTE_RULES = [
  // identity / preferences → USER.md
  { target: 'USER.md', section: 'Preferences', re: /\b(i ?a?m a |i'?m a |my name|my role|i'?m an? |i prefer|i like|i dislike|i favou?r|i'?m the|as a developer|i work as)\b/i },
  // working-style / process / cadence → HABITS.md
  { target: 'HABITS.md', section: 'Working Style', re: /\b(i always|i never|from now on|going forward|how i work|my workflow|my process|my cadence|i (commit|branch|review|test|deploy|lint|format)|always .{0,30}before|never .{0,30}without)\b/i },
  // cross-project lessons / tooling gotchas → LESSONS.md
  { target: 'LESSONS.md', section: 'Tooling Lessons', re: /\b(learned|lesson|gotcha|til\b|the hard way|turns out|pitfall|caveat|watch out|footgun|bug:|broke)\b/i },
];

/**
 * Route a promote to {target, section} by content (Task 151.9). Pure + offline +
 * deterministic — no LLM. Falls back to LESSONS § Cross-Project Lessons (the safe
 * cross-project catch-all) when nothing matches.
 *
 * @param {string} [text] the fact body
 * @returns {{target:string, section:string}}
 */
export function routeTopic(text) {
  const t = String(text ?? '');
  for (const rule of ROUTE_RULES) {
    if (rule.re.test(t)) return { target: rule.target, section: rule.section };
  }
  return { target: 'LESSONS.md', section: DEFAULT_SECTION['LESSONS.md'] };
}

// Task 151.11 — the recurrence at which a promotion is worth an optional MENTION.
// A one-off promote stays silent; a fact that has RECURRED this many times earns a
// fire-and-forget heads-up. Matches the promotion gate floor (heat.PROMOTE_THRESHOLD
// = 3) — "seen ≥3× → durable enough to be worth a word."
export const MENTION_RECURRENCE = 3;

/**
 * Build the optional in-conversation MENTION for a high-recurrence promotion
 * (Task 151.11, awrshift warmth, §20.4). Returns a short heads-up STRING Claude
 * MAY relay — or `null` below the recurrence threshold (stay silent). It is NOT a
 * gate: it frames the post-hoc revert ("say so if wrong" / `cmk forget`), never
 * asks a blocking question (D-169 — no human-in-the-loop). Pure.
 *
 * @param {object} o
 * @param {string} [o.text]            the promoted fact text (trimmed into the note)
 * @param {number} [o.recurrenceCount] how many times the fact has recurred
 * @param {string} [o.target]          the user-tier file it landed in
 * @returns {string|null}
 */
export function buildPromotionMention({ text, recurrenceCount, target } = {}) {
  const n = Number.isFinite(recurrenceCount) ? recurrenceCount : 0;
  if (n < MENTION_RECURRENCE) return null;
  const snippet = String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, 80);
  const where = target ? ` (now in your ${target} persona)` : '';
  // A statement + a revert offer — never a question (would re-introduce the gate).
  return `Noticed "${snippet}" has recurred ${n}× across your work — promoted it to your cross-project persona${where}. Tell me to forget it if that's wrong.`;
}

/**
 * Promote a project-tier fact to the user tier through the safe path.
 *
 * @param {object} opts
 * @param {string} opts.id          citation id of the project fact (e.g. P-XXXXXXXX)
 * @param {string} opts.projectRoot project root (for resolving the source fact)
 * @param {string} opts.userDir     user-tier dir (~/.core-memory-kit)
 * @param {string} [opts.to]        target user-tier file (default LESSONS.md)
 * @param {string} [opts.section]   landing section (default per-target)
 * @param {string} [opts.now]       ISO timestamp override (tests)
 * @returns {{action:string, id?:string, target?:string, section?:string, ...}}
 */
export function lessonsPromote({ id, projectRoot, userDir, to, section, now } = {}) {
  if (!userDir) {
    return errorResult({ category: 'schema', errors: ['userDir is required (lessons promote writes to the user tier)'] });
  }
  // An EXPLICIT `to` is validated up front; an absent `to` is filled by the 151.9
  // topic-router below (after the fact body is known), so the no-arg promote spreads
  // across USER/HABITS/LESSONS by content instead of funnelling to one section.
  if (to !== undefined && !VALID_TARGETS.has(to)) {
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

  // Task 151.9 — TOPIC-route when the user didn't pin a target (fixes Hole C).
  // An explicit `--to` (and/or `--section`) always wins; otherwise the offline
  // router picks target+section by content so no-arg promotes spread across
  // USER/HABITS/LESSONS instead of piling into one section.
  const routed = to === undefined ? routeTopic(text) : { target: to, section: DEFAULT_SECTION[to] };
  const finalTarget = routed.target;
  const finalSection = section || routed.section;

  const candidate = {
    target: finalTarget,
    section: finalSection,
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

  // Task 151.11 — optional heads-up on a HIGH-RECURRENCE promotion. Fire-and-
  // forget: it rides on the SUCCESS result for Claude to optionally relay; it
  // never gates or blocks (null below the threshold → silent, the D-169 default).
  const mention = buildPromotionMention({
    text,
    recurrenceCount: found.frontmatter?.recurrence_count,
    target: finalTarget,
  });

  const promotedHit = res.promoted.find((p) => p.target === finalTarget);
  if (promotedHit) {
    return { action: 'promoted', id, target: finalTarget, section: candidate.section, newId: promotedHit.id ?? null, ...(mention ? { mention } : {}) };
  }
  // A supersede is ALSO success: the promotion replaced an existing same-topic
  // lesson with this updated one (common when the user re-promotes a refined rule).
  const supersededHit = res.superseded.find((s) => s.target === finalTarget);
  if (supersededHit) {
    return { action: 'promoted', id, target: finalTarget, section: candidate.section, newId: supersededHit.newId, superseded: supersededHit.oldId, ...(mention ? { mention } : {}) };
  }
  // Routed to the conflict queue (e.g. it clashes with a hand-curated entry the
  // kit won't silently overwrite) or otherwise didn't land — surface honestly.
  const conflictHit = res.conflicts.find((q) => q.target === finalTarget);
  if (conflictHit) {
    return { action: 'queued', id, target: finalTarget, section: candidate.section, reason: 'conflict' };
  }
  const queuedHit = res.queued.find((q) => q.target === finalTarget);
  return {
    action: 'queued',
    id,
    target: finalTarget,
    section: candidate.section,
    reason: queuedHit?.reason ?? 'not-promoted',
  };
}
