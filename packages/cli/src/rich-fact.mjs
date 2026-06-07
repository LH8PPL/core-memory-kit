// Rich-fact body + slug shaping — the single source of truth for HOW a rich
// fact's file body and filename slug are built (Task 103).
//
// Extracted from subcommands.mjs so the TWO rich-capture paths build identical
// fact files (the shared-modules / no-drift rule, CLAUDE.md §1.3):
//   1. explicit  — `cmk remember --why/--how` → runRememberRich (subcommands.mjs)
//   2. automatic — the Stop-hook auto-extract synthesizing rich facts on the
//                  native-immune path (auto-extract.mjs, Task 103)
// Both call writeFact() with a body produced here, so an auto-extracted fact
// reads the same as an explicitly-captured one.

/**
 * Build a slug for a rich fact's filename from its title.
 *
 * Collapse every run of non-alphanumerics to a single '-' (so dashes are never
 * doubled), cap at 60 chars, then trim a leading/trailing dash without a regex
 * quantifier (static analysis flags trailing `-+$` as ReDoS-prone; a single
 * dash is all that can remain after the collapse, so string ops suffice).
 *
 * @param {string} s - the source text (typically the fact title).
 * @returns {string} a `[a-z0-9][a-z0-9_-]*`-safe slug, or 'fact' if empty.
 */
export function slugifyFact(s) {
  let base = String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 60);
  if (base.startsWith('-')) base = base.slice(1);
  if (base.endsWith('-')) base = base.slice(0, -1);
  return base || 'fact';
}

/**
 * Assemble the rich fact body in the v0.1.1 shape: headline + Why + How.
 * The headline/body may itself be multi-line markdown (a structured breakdown);
 * Why/How are appended as labelled blocks only when present.
 *
 * @param {object} opts
 * @param {string} opts.text - the headline / body (may be multi-line markdown).
 * @param {string} [opts.why] - the rationale → `**Why:**` block.
 * @param {string} [opts.how] - how to apply → `**How to apply:**` block.
 * @returns {string} the assembled markdown body for writeFact().
 */
export function buildRichFactBody({ text, why, how }) {
  const parts = [String(text).trim()];
  if (why && String(why).trim()) parts.push(`**Why:** ${String(why).trim()}`);
  if (how && String(how).trim()) parts.push(`**How to apply:** ${String(how).trim()}`);
  return parts.join('\n\n');
}
