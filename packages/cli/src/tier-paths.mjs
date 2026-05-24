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
