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

import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

export const VALID_TIERS = new Set(['U', 'P', 'L']);

/**
 * Normalize a project path that may arrive in a unix/git-bash form. kiro-cli's
 * model sometimes emits a `/c/Temp/proj` style path (git-bash) for `--project`,
 * which Windows `resolve()` mangles. Convert a leading `/<drive>/` → `<DRIVE>:/`.
 * A normal Windows or POSIX absolute path passes through unchanged. Used by
 * `cmk remember`/`cmk search` --project (the kiro-cli explicit-memory path).
 */
export function normalizeProjectPath(p) {
  if (typeof p !== 'string') return p;
  const m = /^\/([a-zA-Z])\/(.*)$/.exec(p); // /c/Temp/proj  →  c , Temp/proj
  if (m) return `${m[1].toUpperCase()}:/${m[2]}`;
  return p;
}

/**
 * Resolve which project `cmk mcp serve` should serve (the Claude Code + Kiro IDE
 * MCP path — kiro-cli doesn't use MCP). The MCP server is a long-lived child the
 * agent launches, so it can't just trust cwd.
 *
 * Precedence: CLAUDE_PROJECT_DIR (Claude Code sets it in the spawned env) → walk
 * UP from cwd to the nearest `context/` ancestor → cwd (last resort). Pure (env +
 * cwd injected) so it's unit-testable without spawning.
 *
 * @param {object} [opts]
 * @param {Record<string,string|undefined>} [opts.env=process.env]
 * @param {string} [opts.cwd=process.cwd()]
 * @returns {string} the resolved project root (absolute)
 */
export function resolveMcpProjectRoot({ env = process.env, cwd = process.cwd() } = {}) {
  const fromClaude = env.CLAUDE_PROJECT_DIR;
  if (fromClaude && fromClaude.trim() !== '') return resolve(fromClaude);

  // walk up from cwd to the nearest dir that has a context/ subdir (an installed
  // kit project), stopping at the filesystem root.
  let dir = resolve(cwd);
  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (existsSync(join(dir, 'context'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break; // reached the root
    dir = parent;
  }

  return resolve(cwd); // last resort
}

// Matches IDs produced by @lh8ppl/cmk-canonicalize.generateId(). Tier prefix +
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
  'machine-paths.md': 1500,
  'overrides.md': 1500,
});

// Canonical 3 fixed sections per scratchpad (Task 14 / design §2.1). Each seed
// template MUST emit exactly these `## <section>` headings; appendScratchpadBullet
// callers MUST pass one of these exact section names. The test in
// tests/cli-seed-templates.test.js asserts that every shipped seed contains
// all 3 documented sections.
export const SCRATCHPAD_DOCUMENTED_SECTIONS = Object.freeze({
  'SOUL.md': ['Tone and Disposition', 'Operating Defaults', 'Boundary Rules'],
  'MEMORY.md': ['Active Threads', 'Environment Notes', 'Pending Decisions'],
  'USER.md': ['About', 'Preferences', 'Working Style'],
  'HABITS.md': ['Iteration Cadence', 'Destructive Operations', 'Communication Style'],
  'LESSONS.md': ['Tooling Lessons', 'Process Lessons', 'Anti-patterns'],
  'machine-paths.md': ['Tool Paths', 'Project Paths', 'Misc Paths'],
  'overrides.md': ['Tool Overrides', 'Behavior Overrides', 'Path Overrides'],
});
