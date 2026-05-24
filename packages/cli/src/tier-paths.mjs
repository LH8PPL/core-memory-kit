// Shared tier-path resolution for every cmk module that touches the 3-tier
// filesystem. Per the Layer-2 review's I1 finding, this used to live in
// triplicated form inside write-fact / reindex / forget / merge-facts —
// any future change to the user-tier default path had to update four files.
//
// Public surface (used by all packages/cli/src/*.mjs that touch facts):
//   VALID_TIERS  — Set of tier prefixes (U, P, L)
//   ID_PATTERN   — RegExp for the kit's custom-alphabet citation ID format
//   resolveTierRoot({tier, projectRoot, userDir}) → absolute path
//   resolveFactDir(tier, tierRoot) → absolute path to <memory|fragments>

import { homedir } from 'node:os';
import { join } from 'node:path';

export const VALID_TIERS = new Set(['U', 'P', 'L']);

// Matches IDs produced by @cmk/canonicalize.generateId(). Tier prefix +
// 8 chars from the custom 32-char base32 alphabet that excludes the six
// ambiguous chars (0, O, 1, l, I, 8). See design §3.1.
export const ID_PATTERN = /^[PUL]-[2345679ABCDEFGHJKLMNPQRSTUVWXYZa]{8}$/;

export function resolveTierRoot({ tier, projectRoot, userDir }) {
  if (tier === 'P') return join(projectRoot ?? process.cwd(), 'context');
  if (tier === 'L') return join(projectRoot ?? process.cwd(), 'context.local');
  return (
    userDir ??
    process.env.MEMORY_KIT_USER_DIR ??
    join(homedir(), '.claude-memory-kit')
  );
}

export function resolveFactDir(tier, tierRoot) {
  return tier === 'U' ? join(tierRoot, 'fragments') : join(tierRoot, 'memory');
}

// Scratchpads live at the tier root (no subdir). Filename is the scratchpad
// canonical name (e.g. 'MEMORY.md', 'USER.md'). Per design §1.1 + §2.1.
export function resolveScratchpadPath({ tier, scratchpad, projectRoot, userDir }) {
  return join(resolveTierRoot({ tier, projectRoot, userDir }), scratchpad);
}

// Allow-list of scratchpads per tier, per design §1.1.
export const SCRATCHPADS_BY_TIER = Object.freeze({
  P: new Set(['SOUL.md', 'MEMORY.md']),
  L: new Set(['machine-paths.md', 'overrides.md']),
  U: new Set(['USER.md', 'HABITS.md', 'LESSONS.md']),
});

// Hardcoded scratchpad cap defaults (chars). Tunable via settings.json per
// design §2.1; defaults are the fallback when no settings.json override exists.
export const DEFAULT_SCRATCHPAD_CAPS = Object.freeze({
  'SOUL.md': 1800,
  'MEMORY.md': 2500,
  'USER.md': 1375, // Hermes-verified
  'HABITS.md': 1800,
  'LESSONS.md': 1800,
  'machine-paths.md': 1000,
  'overrides.md': 1000,
});
