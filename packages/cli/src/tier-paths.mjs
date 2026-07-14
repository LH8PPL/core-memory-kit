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

import { existsSync, realpathSync, cpSync, writeFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

// Canonicalize a path for comparison: resolve 8.3 short names (Windows
// `TAMIR~1.BN-`) + symlinks to their real long form, so a short-name path and
// its long-name twin compare equal. Falls back to `resolve(p)` if the path
// doesn't exist (realpathSync throws on a missing path). Exported so the project
// discovery in inject-context.mjs shares ONE implementation (Task 168 — the
// home-boundary + canonicalize logic must not drift across the two walkers).
export function canonicalPath(p) {
  try {
    return realpathSync.native ? realpathSync.native(p) : realpathSync(p);
  } catch {
    return resolve(p);
  }
}

/**
 * Walk up from `cwd` to the nearest ancestor that has one of the `markers`
 * subdirs (a kit-installed project), STOPPING at the home directory — a stray
 * `~/context/` (test debris, or a `cmk` run that scaffolded in home) must NOT be
 * served as a project from an unrelated subdir (Task 168). Returns the discovered
 * root, or `resolve(cwd)` if none found below home.
 *
 * @param {string} cwd            starting directory
 * @param {string[]} markers      subdir names that mark a project root (e.g.
 *                                ['context'] or ['context', 'context.local'])
 */
export function discoverRootUpward(cwd, markers = ['context']) {
  const home = canonicalPath(homedir());
  let dir = resolve(cwd);
  // Defensive bound: walk no more than 64 ancestors.
  for (let i = 0; i < 64; i++) {
    const atHome = canonicalPath(dir) === home;
    if (!atHome && markers.some((m) => existsSync(join(dir, m)))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break; // reached the filesystem root
    if (atHome) break; // do not climb above $HOME into a stray ancestor context/
    dir = parent;
  }
  return resolve(cwd); // last resort
}

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

  // Walk up to the nearest `context/`-bearing project, STOPPING at home (Task 168
  // — a stray `~/context/` must not be served from an unrelated subdir; a real
  // project's context/ lives below home, or via the explicit CLAUDE_PROJECT_DIR
  // handled above). Shared with inject-context's discoverProjectRoot via the
  // single discoverRootUpward implementation.
  return discoverRootUpward(cwd, ['context']);
}

// Matches IDs produced by @lh8ppl/cmk-canonicalize.generateId(). Tier prefix +
// 8 chars from the custom 32-char base32 alphabet that excludes the six
// ambiguous chars (0, O, 1, l, I, 8). See design §3.1.
export const ID_PATTERN = /^[PUL]-[2345679ABCDEFGHJKLMNPQRSTUVWXYZa]{8}$/;

// The user-tier directory names (Task 195 / ADR-0021 — the core-memory-kit
// rename). NEW is the post-rename home; OLD is what pre-rename installs used.
// The rename keeps `cmk` + `MEMORY_KIT_USER_DIR` verbatim (agent-neutral,
// ADR-0012 §75) — only the on-disk default dir name changed, and it MIGRATES
// (copy-not-move), it is never a blind text swap.
export const NEW_USER_DIR_NAME = '.core-memory-kit';
export const OLD_USER_DIR_NAME = '.claude-memory-kit';
// The sentinel written into the NEW dir after a successful copy — its presence
// means "migration already ran, never re-copy from OLD" (marker-gated so a
// later edit to OLD can't silently clobber NEW).
export const MIGRATION_MARKER = '.migrated-from-claude-memory-kit';

// Resolve $HOME from an injectable env (HOME, or Windows USERPROFILE) so the
// migration functions are testable against a fake home without touching the
// real user tier. Falls back to os.homedir() when neither is set.
function homeOf(env) {
  return env.HOME ?? env.USERPROFILE ?? homedir();
}

// The user tier's production default (env override → home) — the same
// fallback resolveTierRoot applies. Call it at PRODUCTION ENTRY POINTS
// (CLI actions, hook bins, cron binaries) to make the U tier explicit for
// downstream walk decisions; never as a silent default inside a library
// function — a library-level homedir() reach makes any test that omits
// userDir touch the REAL user tier (the D-69 round-tripped-real-persona
// class; the Task-66 skill review caught a weeklyCurate-internal default
// doing exactly that).
//
// PURE RESOLVER (Task 195): this only DECIDES which path to use — it performs
// NO copy and NO scaffolding (the ~15 hot-path callers must stay
// side-effect-free). The one-time OLD→NEW copy is the SEPARATE, explicit
// `migrateUserTierIfNeeded`, called only at install + the hook-bin entry
// points. Resolution order: explicit override > NEW (migrated/fresh) > OLD
// (pre-migration read, so an un-migrated user still finds their memory) > NEW
// (brand-new user).
export function defaultUserDir(env = process.env) {
  if (env.MEMORY_KIT_USER_DIR) return env.MEMORY_KIT_USER_DIR;
  const home = homeOf(env);
  const newDir = join(home, NEW_USER_DIR_NAME);
  if (existsSync(newDir)) return newDir;
  const oldDir = join(home, OLD_USER_DIR_NAME);
  if (existsSync(oldDir)) return oldDir; // pre-migration: read where the memory actually is
  return newDir; // brand-new user — the NEW name is the default going forward
}

/**
 * One-time user-tier migration (Task 195 / ADR-0021): copy the pre-rename
 * `~/.claude-memory-kit` to `~/.core-memory-kit`, KEEP the old dir as a backup,
 * and write a marker so it never re-copies. Idempotent + BEST-EFFORT — it never
 * throws (a copy failure must never break `cmk install` or a hook bin).
 *
 * Call ONLY at production entry points (install + the hook bins), never inside
 * a hot-path resolver. The `env` is injectable for tests (fake HOME).
 *
 * @param {object} [env=process.env]
 * @returns {{action:'migrated'|'already-migrated'|'skipped-new-exists'|'skipped-override'|'nothing-to-migrate'|'failed', from?, to?, notice?, error?}}
 */
export function migrateUserTierIfNeeded(env = process.env) {
  // An explicit override means the user chose their own path — never touch the
  // default home dirs.
  if (env.MEMORY_KIT_USER_DIR) return { action: 'skipped-override' };

  const home = homeOf(env);
  const newDir = join(home, NEW_USER_DIR_NAME);
  const oldDir = join(home, OLD_USER_DIR_NAME);
  const marker = join(newDir, MIGRATION_MARKER);

  try {
    if (existsSync(newDir)) {
      // NEW already there: migrated once (marker present) OR a fresh install
      // scaffolded it. Either way, do NOT copy OLD over it — first write wins.
      return { action: existsSync(marker) ? 'already-migrated' : 'skipped-new-exists' };
    }
    // NEW absent. Only migrate if a real OLD DIRECTORY exists.
    if (!existsSync(oldDir)) return { action: 'nothing-to-migrate' };
    if (!statSync(oldDir).isDirectory()) {
      // OLD path exists but isn't a directory (corrupt/unexpected) — refuse to
      // copy; surface as failed so a caller can log, never crash.
      return { action: 'failed', error: `old user dir is not a directory: ${oldDir}` };
    }

    // Copy-not-move: OLD stays intact as the user's backup.
    cpSync(oldDir, newDir, { recursive: true });
    // Marker AFTER a successful copy (crash-safe: no marker → next run retries).
    writeFileSync(marker, `migrated from ${OLD_USER_DIR_NAME} by the core-memory-kit rename (ADR-0021)\n`, 'utf8');
    return {
      action: 'migrated',
      from: oldDir,
      to: newDir,
      notice:
        `Migrated your cross-project memory to ${newDir}. ` +
        `Your old ${oldDir} is kept as a backup — delete it whenever you like.`,
    };
  } catch (err) {
    // BEST-EFFORT: never break the caller. The OLD dir is untouched (copy-not-
    // move), so a failed migration loses nothing — the pure resolver still
    // reads OLD until a later run succeeds.
    return { action: 'failed', error: err?.message ?? String(err) };
  }
}

export function resolveTierRoot({ tier, projectRoot, userDir }) {
  if (tier === 'P') return join(projectRoot ?? process.cwd(), 'context');
  if (tier === 'L') return join(projectRoot ?? process.cwd(), 'context.local');
  return userDir ?? defaultUserDir();
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
  L: new Set(['machine-paths.md', 'overrides.md', 'private.md']),
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
  'private.md': 1500,
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
  // Task 148.5 (design §6.10): sensitive-but-useful facts the auto-extract
  // sensitivity screen routes local-only. Gitignored; never committed.
  'private.md': ['Private Notes', 'Sensitive Context', 'Personal Details'],
});
