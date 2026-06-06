// bullet-lookup.mjs — "is this id a scratchpad BULLET (not a graduated fact)?"
//
// Why this exists (the cut-gate F-3/F-7 finding, 2026-06-06): `cmk search`
// surfaces ids for BOTH graduated facts (context/memory/<type>_<slug>.md) AND
// scratchpad bullets (a `- (ID) …` line in MEMORY.md / SOUL.md / the user-tier
// persona). But `cmk lessons promote` and `cmk forget` operate on FACTS only —
// so pasting a bullet id from `cmk search` into either returns a flat, unhelpful
// "no matching fact for ID", even though the id is right there in a scratchpad.
//
// findBulletScratchpad turns that dead end into an actionable error: the caller,
// on a fact-not-found, asks "but is it a bullet?" and if so explains what the id
// actually is and where the fact ids live. Pure read-only lookup; no mutation.

import { existsSync, readFileSync } from 'node:fs';
import {
  VALID_TIERS,
  SCRATCHPADS_BY_TIER,
  resolveScratchpadPath,
} from './tier-paths.mjs';

/**
 * Find the scratchpad that holds `id` as a bullet, if any.
 *
 * Scans only the id's OWN tier (the tier prefix is authoritative — a P- id can
 * only be a project-tier bullet), across that tier's scratchpad files, for a
 * line beginning `- (ID)` (the canonical bullet shape, matching the writer in
 * scratchpad.mjs / provenance.mjs).
 *
 * @param {string} id  citation id, e.g. "P-XXXXXXXX"
 * @param {object} [opts]
 * @param {string} [opts.projectRoot]
 * @param {string} [opts.userDir]
 * @returns {string|null} the scratchpad filename (e.g. "MEMORY.md") or null
 */
export function findBulletScratchpad(id, { projectRoot, userDir } = {}) {
  if (typeof id !== 'string' || id.length < 2) return null;
  const tier = id[0];
  if (!VALID_TIERS.has(tier)) return null;
  const scratchpads = SCRATCHPADS_BY_TIER[tier];
  if (!scratchpads) return null;

  const needle = `- (${id})`;
  for (const scratchpad of scratchpads) {
    const path = resolveScratchpadPath({ tier, scratchpad, projectRoot, userDir });
    if (!path || !existsSync(path)) continue;
    let text;
    try {
      text = readFileSync(path, 'utf8');
    } catch {
      continue; // unreadable scratchpad — skip, not a hard error
    }
    // Bullet lines start at column 0 with "- (ID)"; a line-anchored prefix scan
    // avoids matching the id where it appears inside a provenance comment or body.
    if (text.split('\n').some((line) => line.startsWith(needle))) {
      return scratchpad;
    }
  }
  return null;
}
