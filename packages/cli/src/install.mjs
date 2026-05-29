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
//     ships inside @lh8ppl/claude-memory-kit — `resolveTemplateDir()`
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
import { injectClaudeMdBlock } from './claude-md.mjs';
import { writeKitHooks } from './settings-hooks.mjs';
import { appendAuditEntry, nowIso, REASON_CODES } from './audit-log.mjs';

const __filename = fileURLToPath(import.meta.url);
const CLI_SRC_DIR = dirname(__filename);
// Walk up: packages/cli/src → packages/cli → packages → repo root
const REPO_ROOT_DEV = resolve(CLI_SRC_DIR, '..', '..', '..');
const CLI_PKG_DIR = resolve(CLI_SRC_DIR, '..');

const GITIGNORE_START = '# claude-memory-kit:gitignore:start v0.1.0';
const GITIGNORE_END = '# claude-memory-kit:gitignore:end';

/**
 * Read the kit version from the cli package's package.json.
 * Used as the default version for the CLAUDE.md marker.
 */
export function getKitVersion() {
  const pkg = JSON.parse(readFileSync(join(CLI_PKG_DIR, 'package.json'), 'utf8'));
  return pkg.version;
}

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
  const force = !!options.force;
  const version = options.version || getKitVersion();

  const templateDir = resolveTemplateDir();

  const created = [];
  const skipped = [];
  const errors = [];

  installTier(join(templateDir, 'project'), join(projectRoot, 'context'), { created, skipped, errors });
  installTier(join(templateDir, 'local'), join(projectRoot, 'context.local'), { created, skipped, errors });
  installTier(join(templateDir, 'user'), userTier, { created, skipped, errors });

  const gitignore = injectGitignore(projectRoot, buildGitignoreBlock(templateDir));

  // CLAUDE.md loader block — Task 4. Read the block content from the kit's
  // template/ and inject (or refresh) it inside marker delimiters. Never
  // touches content outside the markers.
  const claudeMdTemplatePath = join(templateDir, 'CLAUDE.md.template');
  let claudeMd = { action: 'skipped', path: join(projectRoot, 'CLAUDE.md') };
  if (existsSync(claudeMdTemplatePath)) {
    const content = readFileSync(claudeMdTemplatePath, 'utf8');
    try {
      claudeMd = injectClaudeMdBlock({ projectRoot, content, version, force });
    } catch (err) {
      errors.push({
        path: join(projectRoot, 'CLAUDE.md'),
        error: err && err.message ? err.message : String(err),
      });
    }
  } else {
    errors.push({
      path: claudeMdTemplatePath,
      error: 'CLAUDE.md.template missing from kit template/',
    });
  }

  // Hook wiring — Task 49. This is what makes `npm install -g
  // @lh8ppl/claude-memory-kit` + `cmk install` a COMPLETE entry point
  // (no separate `/plugin install` step needed). Writes the npm-route
  // hooks block (PATH-resolved bare bin names, shell form) into
  // <projectRoot>/.claude/settings.json via the shared writeKitHooks
  // boundary — same boundary `cmk repair --hooks` uses, so install and
  // repair never drift. Idempotent: a re-run with already-canonical
  // hooks is a no-op. Opt out with {noHooks:true} (CLI: --no-hooks) for
  // scaffold-only installs.
  let hooks = { action: 'skipped', path: join(projectRoot, '.claude', 'settings.json') };
  if (!options.noHooks) {
    const settingsPath = join(projectRoot, '.claude', 'settings.json');
    const r = writeKitHooks(settingsPath);
    if (r.error) {
      errors.push({ path: settingsPath, error: r.error });
      hooks = { action: 'error', path: settingsPath, error: r.error };
    } else {
      hooks = {
        action: r.changed ? 'wired' : 'unchanged',
        path: settingsPath,
        events: r.events,
      };
      // Door-4 audit entry — install wires user-visible Claude Code
      // config; a "cmk install changed my settings.json" report needs a
      // trail. Emitted ONLY when something actually changed: a no-op
      // re-install has nothing to audit, and emitting on no-op would make
      // the append-only audit.log grow on every run, breaking install's
      // idempotency guarantee (re-run = byte-identical project tree).
      // Best-effort: never block install on an audit-log failure.
      if (r.changed) {
        try {
          appendAuditEntry(join(projectRoot, 'context'), {
            ts: nowIso(),
            action: 'install',
            tier: 'P',
            id: 'P-NSTLHKWR', // synthetic stable id for install-hooks events (base32 alphabet)
            reasonCode: REASON_CODES.INSTALL_HOOKS_WIRED,
            extra: { settingsPath, events: r.events },
          });
        } catch {
          // best-effort
        }
      }
    }
  }

  return { projectRoot, userTier, created, skipped, gitignore, claudeMd, hooks, errors };
}

/**
 * `cmk init-user-tier` — user-tier-only install. Task 14.
 *
 * Scaffolds the user-tier seeds (USER.md, HABITS.md, LESSONS.md, fragments/)
 * at the resolved user-tier path. Does NOT touch project tier, local tier,
 * .gitignore, or CLAUDE.md. Useful when:
 *   - A user wants to set up user-tier independently of any project install
 *   - A user wants to refresh user-tier seeds without re-running `cmk install`
 *     (which would also re-evaluate project tier + CLAUDE.md block)
 *
 * Path precedence (same as install()): explicit option > $MEMORY_KIT_USER_DIR
 * > ~/.claude-memory-kit/. Re-runs are idempotent — existing files are
 * skipped, not overwritten.
 *
 * Returns {userTier, created, skipped, errors}.
 */
export function initUserTier(options = {}) {
  const userTier = options.userTier
    ? resolve(options.userTier)
    : resolveUserTier();
  const templateDir = resolveTemplateDir();
  const created = [];
  const skipped = [];
  const errors = [];
  installTier(join(templateDir, 'user'), userTier, { created, skipped, errors });
  return { userTier, created, skipped, errors };
}
