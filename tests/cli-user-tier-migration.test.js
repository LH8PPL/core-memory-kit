// @doors: 1, 2
// Door 2: the migration's whole job is a filesystem side-effect (copy) — the
//         state assertions (new dir populated, old dir intact, marker written)
//         are the point.
// Door 3 N/A: in-process; no subprocess spawn.
// Door 4 N/A: no message-queue interaction.
// Door 5 N/A: no NDJSON log (the one-line install notice is a return value, tested here).

// Task 195 (ADR-0021) — the user-tier config-dir migration:
// ~/.claude-memory-kit → ~/.core-memory-kit, COPY-not-move, marker-gated,
// keep-the-old. The single highest-risk line of the rename, so it ships as its
// own tested unit BEFORE any corpus find-replace.
//
// Two surfaces, deliberately split:
//   defaultUserDir(env)          — PURE resolver: which path to USE. No I/O
//                                  beyond existsSync; never copies. The hot
//                                  path (~15 callers) stays side-effect-free.
//   migrateUserTierIfNeeded(env) — the EXPLICIT one-time copy, called only at
//                                  production entry points (install + hook
//                                  bins). Idempotent; returns what happened so
//                                  `cmk install` can print the one-line notice.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  defaultUserDir,
  migrateUserTierIfNeeded,
  MIGRATION_MARKER,
  OLD_USER_DIR_NAME,
  NEW_USER_DIR_NAME,
} from '../packages/cli/src/tier-paths.mjs';

let home;

// A fake $HOME so we never touch the real ~/.claude-memory-kit. The migration
// functions take an `env`; we point HOME at a temp dir and pass the same env
// (no MEMORY_KIT_USER_DIR so the home-relative default path is exercised).
function envWithHome(h) {
  return { HOME: h, USERPROFILE: h }; // USERPROFILE = Windows home
}

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'cmk-home-'));
});

afterEach(() => {
  rmSync(home, { recursive: true, force: true });
});

const oldDir = () => join(home, OLD_USER_DIR_NAME);
const newDir = () => join(home, NEW_USER_DIR_NAME);

function seedOldTier() {
  mkdirSync(join(oldDir(), 'fragments'), { recursive: true });
  writeFileSync(join(oldDir(), 'HABITS.md'), '# Habits\n\n- always use uv\n', 'utf8');
  writeFileSync(join(oldDir(), 'fragments', 'U-ABCDEFGH.md'), 'a promoted lesson\n', 'utf8');
}

describe('Task 195 — defaultUserDir (pure resolver, no copy)', () => {
  it('the explicit MEMORY_KIT_USER_DIR override always wins, unconditionally', () => {
    const custom = join(home, 'custom-tier');
    expect(defaultUserDir({ ...envWithHome(home), MEMORY_KIT_USER_DIR: custom })).toBe(custom);
    // …even when both old and new dirs exist.
    seedOldTier();
    mkdirSync(newDir(), { recursive: true });
    expect(defaultUserDir({ ...envWithHome(home), MEMORY_KIT_USER_DIR: custom })).toBe(custom);
  });

  it('resolves to the NEW dir when it exists (already migrated / fresh install)', () => {
    mkdirSync(newDir(), { recursive: true });
    expect(defaultUserDir(envWithHome(home))).toBe(newDir());
  });

  it('resolves to the OLD dir when only it exists (pre-migration read; NEVER copies)', () => {
    seedOldTier();
    expect(defaultUserDir(envWithHome(home))).toBe(oldDir());
    // PURE: resolving must not have created the new dir (no side-effect).
    expect(existsSync(newDir())).toBe(false);
  });

  it('resolves to the NEW dir for a brand-new user (neither exists)', () => {
    expect(defaultUserDir(envWithHome(home))).toBe(newDir());
    expect(existsSync(newDir())).toBe(false); // still no side-effect
  });
});

describe('Task 195 — migrateUserTierIfNeeded (the explicit one-time copy)', () => {
  it('copies OLD → NEW, keeps OLD intact, writes the marker, returns migrated', () => {
    seedOldTier();
    const r = migrateUserTierIfNeeded(envWithHome(home));
    expect(r.action).toBe('migrated');
    expect(r.from).toBe(oldDir());
    expect(r.to).toBe(newDir());
    // NEW is populated (recursive copy — nested fragments too).
    expect(readFileSync(join(newDir(), 'HABITS.md'), 'utf8')).toContain('always use uv');
    expect(readFileSync(join(newDir(), 'fragments', 'U-ABCDEFGH.md'), 'utf8')).toContain('promoted lesson');
    // OLD is UNTOUCHED (the backup — copy-not-move).
    expect(readFileSync(join(oldDir(), 'HABITS.md'), 'utf8')).toContain('always use uv');
    // The marker gates re-copy.
    expect(existsSync(join(newDir(), MIGRATION_MARKER))).toBe(true);
    // A one-line notice for `cmk install` output.
    expect(r.notice).toMatch(/core-memory-kit/);
    expect(r.notice).toMatch(/backup/i);
  });

  it('is idempotent: a second call after the marker is a no-op (never re-copies)', () => {
    seedOldTier();
    migrateUserTierIfNeeded(envWithHome(home));
    // Mutate NEW, then re-run — the marker must prevent OLD from clobbering it.
    writeFileSync(join(newDir(), 'HABITS.md'), '# Habits\n\n- edited after migration\n', 'utf8');
    const r2 = migrateUserTierIfNeeded(envWithHome(home));
    expect(r2.action).toBe('already-migrated');
    expect(readFileSync(join(newDir(), 'HABITS.md'), 'utf8')).toContain('edited after migration');
  });

  it('NEW exists but has NO marker (fresh install, never had an old dir): no copy, no clobber', () => {
    // A brand-new user whose NEW dir was scaffolded by install — must not be
    // treated as needing migration even if an OLD dir later appears.
    mkdirSync(newDir(), { recursive: true });
    writeFileSync(join(newDir(), 'HABITS.md'), 'fresh install content\n', 'utf8');
    seedOldTier(); // an old dir exists too (unusual, but must be safe)
    const r = migrateUserTierIfNeeded(envWithHome(home));
    expect(r.action).toBe('skipped-new-exists');
    // The fresh NEW content is NOT overwritten by the OLD dir.
    expect(readFileSync(join(newDir(), 'HABITS.md'), 'utf8')).toContain('fresh install content');
  });

  it('no OLD dir + no NEW dir: nothing to migrate (brand-new user)', () => {
    const r = migrateUserTierIfNeeded(envWithHome(home));
    expect(r.action).toBe('nothing-to-migrate');
    expect(existsSync(newDir())).toBe(false); // migration doesn't scaffold — install does
  });

  it('honors MEMORY_KIT_USER_DIR: a custom path means no home-dir migration at all', () => {
    seedOldTier();
    const r = migrateUserTierIfNeeded({ ...envWithHome(home), MEMORY_KIT_USER_DIR: join(home, 'custom') });
    expect(r.action).toBe('skipped-override');
    expect(existsSync(newDir())).toBe(false); // never touched the default paths
  });

  it('best-effort: an unreadable OLD dir does not throw (never breaks install/hooks)', () => {
    // Simulate a copy failure by making OLD a FILE where a dir is expected on
    // the copy path — the migration must swallow it and report, not crash.
    writeFileSync(oldDir(), 'not a directory\n', 'utf8');
    const r = migrateUserTierIfNeeded(envWithHome(home));
    expect(r.action).toBe('failed');
    expect(r.error).toBeTruthy();
    // OLD (the file) is left as-is; NEW was not half-created.
    expect(existsSync(oldDir())).toBe(true);
  });
});

describe('Task 195 — cmk install runs the migration + prints the notice (integration)', () => {
  it('a first install with an old tier present populates the new tier + prints ONE notice', async () => {
    const { runInstall } = await import('../packages/cli/src/subcommands.mjs');
    seedOldTier();
    // migrationEnv points the migration at our fake HOME (no MEMORY_KIT_USER_DIR
    // → the home-relative path is exercised); userTier keeps the install's OWN
    // scaffold in a throwaway dir so the two concerns don't collide.
    const lines = [];
    const projectRoot = mkdtempSync(join(tmpdir(), 'cmk-mig-proj-'));
    const scaffoldTier = mkdtempSync(join(tmpdir(), 'cmk-mig-utier-'));
    try {
      await runInstall({
        cwd: projectRoot,
        userTier: scaffoldTier,
        migrationEnv: envWithHome(home),
        log: (l) => lines.push(l),
        logError: (l) => lines.push(l),
      });
      // The migration copied the persona into the new home dir…
      expect(readFileSync(join(newDir(), 'HABITS.md'), 'utf8')).toContain('always use uv');
      // …the old dir is intact (backup)…
      expect(existsSync(join(oldDir(), 'HABITS.md'))).toBe(true);
      // …and install printed the one-line notice.
      const text = lines.join('\n');
      expect(text).toMatch(/Migrated your cross-project memory/);
      expect(text).toMatch(/core-memory-kit/);
      expect(text).toMatch(/backup/i);
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
      rmSync(scaffoldTier, { recursive: true, force: true });
    }
  });

  it('a re-install (marker present) prints NO migration notice (idempotent, quiet)', async () => {
    const { runInstall } = await import('../packages/cli/src/subcommands.mjs');
    seedOldTier();
    migrateUserTierIfNeeded(envWithHome(home)); // first migration already done
    const lines = [];
    const projectRoot = mkdtempSync(join(tmpdir(), 'cmk-mig-proj2-'));
    const scaffoldTier = mkdtempSync(join(tmpdir(), 'cmk-mig-utier2-'));
    try {
      await runInstall({
        cwd: projectRoot,
        userTier: scaffoldTier,
        migrationEnv: envWithHome(home),
        log: (l) => lines.push(l),
        logError: (l) => lines.push(l),
      });
      expect(lines.join('\n')).not.toMatch(/Migrated your cross-project memory/);
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
      rmSync(scaffoldTier, { recursive: true, force: true });
    }
  });
});
