// install.mjs — implementation of `cmk install`.
//
// Public contract (tests assert this; internals can change freely):
//
//   install({
//     projectRoot,   // <repo> root for project + local tiers
//     userTier,      // resolved user-tier path (defaults via resolveUserTier())
//     force,         // currently unused; reserved for Task 4 CLAUDE.md downgrade override
//     dryRun,        // currently unused; print-only mode reserved for Task 32
//   }) → {
//     projectRoot,   // resolved
//     userTier,      // resolved
//     created: string[],   // absolute paths newly written
//     skipped: string[],   // absolute paths that already existed (untouched)
//     gitignore: { action: 'created' | 'replaced' | 'unchanged', path: string },
//     errors: { path: string, error: string }[],
//   }
//
// Design notes:
//   - Deep module: the boundary above is the only public surface. Internal
//     helpers walk the kit's template/ tree, strip .template suffixes,
//     and copy files. Tests verify the contract, not the internals.
//   - Never overwrites existing files in the target. If MEMORY.md (or any
//     other tier seed) already has user edits, we skip it and log to
//     `skipped`. This is what makes re-installs safe.
//   - The .gitignore block is delimited so re-runs refresh in place
//     without duplicating lines and without touching unrelated entries.
//   - In dev (running from the cloned repo), the kit's template/ lives
//     at repo root. When packaged for npm publish (Task 36), template/
//     ships inside @claude-memory-kit/cli — `resolveTemplateDir()`
//     handles both.

import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
  copyFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const CLI_SRC_DIR = dirname(__filename);
// Walk up: packages/cli/src → packages/cli → packages → repo root
const REPO_ROOT_DEV = resolve(CLI_SRC_DIR, '..', '..', '..');

const GITIGNORE_START = '# claude-memory-kit:gitignore:start v0.1.0';
const GITIGNORE_END = '# claude-memory-kit:gitignore:end';

/**
 * Locate the kit's template/ directory.
 *
 * Two scenarios:
 *   1. Dev (running from cloned repo): template/ at repo root.
 *   2. Published (Task 36): template/ shipped inside the cli package.
 *
 * For v0.1.0 dev, scenario 1 is the only working path. Scenario 2 is
 * handled with a fallback so a future npm-published install still works
 * after Task 36 wires the publish step.
 */
export function resolveTemplateDir() {
  const devPath = join(REPO_ROOT_DEV, 'template');
  if (existsSync(devPath) && statSync(devPath).isDirectory()) return devPath;

  // Published-package fallback: template/ alongside the cli package's src.
  const packagedPath = resolve(CLI_SRC_DIR, '..', 'template');
  if (existsSync(packagedPath) && statSync(packagedPath).isDirectory()) return packagedPath;

  throw new Error(
    `cmk install: could not locate template/ (checked ${devPath} and ${packagedPath}). ` +
      `If you are running from a checkout, ensure template/ exists at the repo root.`
  );
}

/**
 * Resolve the user-tier path.
 *
 * Precedence:
 *   1. $MEMORY_KIT_USER_DIR if set (any non-empty value).
 *   2. ~/.claude-memory-kit/  (default).
 *
 * Per design §1.1: "User-tier path override: the user tier path defaults
 * to ~/.claude-memory-kit/ but can be overridden via the MEMORY_KIT_USER_DIR
 * environment variable."
 */
export function resolveUserTier() {
  const env = process.env.MEMORY_KIT_USER_DIR;
  if (env && env.trim().length > 0) return env;
  return join(homedir(), '.claude-memory-kit');
}

/* ------------------------------------------------------------------ */
/* Internal helpers (not exported; tests don't depend on these names) */
/* ------------------------------------------------------------------ */

/**
 * Walk a directory recursively, returning a list of file entries.
 * Each entry: { absSrc, relPath, isGitkeep }
 */
function walkFiles(rootDir) {
  const out = [];
  function recurse(current) {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) {
        recurse(full);
      } else if (entry.isFile()) {
        out.push({
          absSrc: full,
          relPath: relative(rootDir, full).replace(/\\/g, '/'),
          isGitkeep: entry.name === '.gitkeep',
        });
      }
    }
  }
  recurse(rootDir);
  return out;
}

/**
 * Compute the target file name from a kit-template source name.
 *   "SOUL.md.template"  → "SOUL.md"
 *   "INDEX.md.template" → "INDEX.md"
 *   "machine-paths.md.template" → "machine-paths.md"
 *   (.gitkeep files are filtered out before this is called)
 */
function targetName(srcName) {
  if (srcName.endsWith('.template')) return srcName.slice(0, -'.template'.length);
  return srcName;
}

/**
 * Install one tier: copy every non-.gitkeep file from srcDir into destDir,
 * stripping the .template suffix. Skips existing files.
 *
 * Side effects:
 *   - Creates destDir + any needed subdirs
 *   - Writes new files
 *   - Mutates the supplied `created` / `skipped` / `errors` arrays
 */
function installTier(srcDir, destDir, { created, skipped, errors }) {
  if (!existsSync(srcDir)) {
    errors.push({ path: srcDir, error: 'template tier missing from kit' });
    return;
  }

  // Ensure root destDir exists (covers fresh installs).
  mkdirSync(destDir, { recursive: true });

  for (const file of walkFiles(srcDir)) {
    if (file.isGitkeep) {
      // .gitkeep marks an empty kit dir; mirror just the directory in target.
      const targetDir = join(destDir, dirname(file.relPath));
      mkdirSync(targetDir, { recursive: true });
      continue;
    }

    const targetRel = join(dirname(file.relPath), targetName(file.relPath.split('/').pop()));
    const targetAbs = join(destDir, targetRel);

    if (existsSync(targetAbs)) {
      skipped.push(targetAbs);
      continue;
    }

    try {
      mkdirSync(dirname(targetAbs), { recursive: true });
      copyFileSync(file.absSrc, targetAbs);
      created.push(targetAbs);
    } catch (err) {
      errors.push({ path: targetAbs, error: err && err.message ? err.message : String(err) });
    }
  }
}

/**
 * Build the canonical .gitignore managed block from template/.gitignore.fragment.
 * Adds start/end markers around the fragment so we can refresh in place.
 */
function buildGitignoreBlock(templateDir) {
  const fragmentPath = join(templateDir, '.gitignore.fragment');
  const fragment = existsSync(fragmentPath)
    ? readFileSync(fragmentPath, 'utf8').trim()
    : 'context.local/\ncontext/.index/\ncontext/.locks/';
  return `${GITIGNORE_START}\n${fragment}\n${GITIGNORE_END}\n`;
}

/**
 * Inject (or refresh) the managed .gitignore block in `<projectRoot>/.gitignore`.
 *
 * Algorithm:
 *   - No .gitignore: create one containing only the managed block.
 *   - Has .gitignore, no markers: append the managed block at EOF.
 *   - Has .gitignore, markers present: replace the marker-delimited block
 *     in place (refresh). Everything outside the markers is byte-preserved.
 *
 * Returns: { action: 'created' | 'replaced' | 'unchanged', path: string }
 */
function injectGitignore(projectRoot, block) {
  const giPath = join(projectRoot, '.gitignore');
  const startRe = /# claude-memory-kit:gitignore:start[^\n]*\n/;
  const endRe = /# claude-memory-kit:gitignore:end\n?/;

  if (!existsSync(giPath)) {
    writeFileSync(giPath, block, 'utf8');
    return { action: 'created', path: giPath };
  }

  const existing = readFileSync(giPath, 'utf8');
  const startMatch = existing.match(startRe);
  const endMatch = existing.match(endRe);

  if (!startMatch || !endMatch || startMatch.index > endMatch.index) {
    // No managed block (or markers malformed) — append.
    const sep = existing.endsWith('\n') ? '\n' : '\n\n';
    writeFileSync(giPath, existing + sep + block, 'utf8');
    return { action: 'created', path: giPath };
  }

  // Markers present — replace the slice between (and including) them.
  const before = existing.slice(0, startMatch.index);
  const after = existing.slice(endMatch.index + endMatch[0].length);
  const next = before + block + after;

  if (next === existing) {
    return { action: 'unchanged', path: giPath };
  }
  writeFileSync(giPath, next, 'utf8');
  return { action: 'replaced', path: giPath };
}

/* ------------------------------------------------------------------ */
/* Public entry point                                                  */
/* ------------------------------------------------------------------ */

/**
 * Install the kit scaffold into a project + user tier.
 * Idempotent. Never overwrites existing target files. Refreshes the
 * managed .gitignore block in place when re-run.
 */
export async function install(options = {}) {
  const projectRoot = options.projectRoot
    ? resolve(options.projectRoot)
    : resolve(process.cwd());
  const userTier = options.userTier ? resolve(options.userTier) : resolveUserTier();

  const templateDir = resolveTemplateDir();

  const created = [];
  const skipped = [];
  const errors = [];

  installTier(join(templateDir, 'project'), join(projectRoot, 'context'), { created, skipped, errors });
  installTier(join(templateDir, 'local'), join(projectRoot, 'context.local'), { created, skipped, errors });
  installTier(join(templateDir, 'user'), userTier, { created, skipped, errors });

  const gitignore = injectGitignore(projectRoot, buildGitignoreBlock(templateDir));

  return { projectRoot, userTier, created, skipped, gitignore, errors };
}
