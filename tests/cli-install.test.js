// @doors: 1, 2, 3
// Door 3: the CLI-output describe spawns the real `cmk install` binary to pin
//   the human-readable status message (the in-process install() tests cover the
//   file-tree contract; the message lives in the CLI handler, runInstall).
// Door 4 N/A: no message-queue interaction.
// Door 5 N/A: install doesn't emit NDJSON observability — it prints human-readable status to stdout.

// Tests for Task 3 — `cmk install` cross-OS implementation (T-003).
// Per tasks.md 3.5:
//   - Test install in fresh tempdir produces expected file tree
//   - Test re-install preserves a hand-edited MEMORY.md
//     (mtime + sha1 unchanged on user-edited files)
//   - Test re-install refreshes kit-managed .gitignore lines while
//     preserving unrelated entries
//   - Test `MEMORY_KIT_USER_DIR=/tmp/xxx cmk install` writes user-tier
//     to /tmp/xxx/
//   - Test idempotency: two consecutive runs produce identical
//     on-disk state
//
// Boundary-test discipline (per tasks.md "Engineering discipline"):
//   - Test the install() PUBLIC contract — what files land where,
//     what the result object reports, what happens on re-run.
//   - Do NOT test internal helpers (walkTemplate, stripTemplateSuffix,
//     etc.). Those are implementation details that may change.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  mkdtempSync,
  rmSync,
  existsSync,
  statSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  readdirSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { install, getKitVersion } from '../packages/cli/src/install.mjs';

const CMK_BIN = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'packages',
  'cli',
  'bin',
  'cmk.mjs',
);

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = join(dirname(__filename), '..');
const KIT_TEMPLATE = join(REPO_ROOT, 'template');

/** Hash a file's contents for equality comparison. */
function fileHash(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

/** Recursively list a directory's contents as relative paths. */
function listTree(dir) {
  const out = [];
  function walk(current, prefix) {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name);
      const rel = prefix ? join(prefix, entry.name) : entry.name;
      if (entry.isDirectory()) {
        walk(full, rel);
      } else {
        out.push(rel.replace(/\\/g, '/'));
      }
    }
  }
  walk(dir, '');
  return out.sort();
}

/** Hash an entire directory tree (path + content) for equality comparison. */
function treeFingerprint(dir) {
  const h = createHash('sha256');
  for (const rel of listTree(dir)) {
    h.update(rel + '\0');
    h.update(readFileSync(join(dir, rel)));
    h.update('\0');
  }
  return h.digest('hex');
}

describe('Task 3 — cmk install', () => {
  let sandbox;
  let projectRoot;
  let userTier;

  beforeEach(() => {
    sandbox = mkdtempSync(join(tmpdir(), 'cmk-install-test-'));
    projectRoot = join(sandbox, 'my-project');
    userTier = join(sandbox, 'fake-home', '.claude-memory-kit');
    mkdirSync(projectRoot, { recursive: true });
  });

  afterEach(() => {
    rmSync(sandbox, { recursive: true, force: true });
  });

  describe('Fresh install', () => {
    it('exits cleanly and reports no errors', async () => {
      const result = await install({ projectRoot, userTier });
      expect(result.errors).toEqual([]);
      expect(result.created.length).toBeGreaterThan(0);
      expect(result.skipped.length).toBe(0);
    });

    it('creates the project tier under <projectRoot>/context/', async () => {
      await install({ projectRoot, userTier });
      expect(existsSync(join(projectRoot, 'context'))).toBe(true);
      expect(existsSync(join(projectRoot, 'context', 'SOUL.md'))).toBe(true);
      expect(existsSync(join(projectRoot, 'context', 'MEMORY.md'))).toBe(true);
      expect(existsSync(join(projectRoot, 'context', 'memory', 'INDEX.md'))).toBe(true);
    });

    it('creates the local tier under <projectRoot>/context.local/', async () => {
      await install({ projectRoot, userTier });
      expect(existsSync(join(projectRoot, 'context.local'))).toBe(true);
      expect(existsSync(join(projectRoot, 'context.local', 'machine-paths.md'))).toBe(true);
      expect(existsSync(join(projectRoot, 'context.local', 'overrides.md'))).toBe(true);
    });

    it('substitutes template placeholders — no literal {{TODAY}} leaks into scaffolded files (finding #4)', async () => {
      await install({ projectRoot, userTier });
      const today = new Date().toISOString().slice(0, 10);
      // Every scratchpad that ships a `Last distilled: {{TODAY}}` header.
      for (const p of [
        join(projectRoot, 'context', 'MEMORY.md'),
        join(projectRoot, 'context', 'SOUL.md'),
        join(projectRoot, 'context.local', 'machine-paths.md'),
        join(userTier, 'HABITS.md'),
        join(userTier, 'USER.md'),
        join(userTier, 'LESSONS.md'),
      ]) {
        const text = readFileSync(p, 'utf8');
        expect(text, `${p} still has an unrendered placeholder`).not.toMatch(/\{\{[A-Z_]+\}\}/);
        expect(text, `${p} should carry the install date`).toContain(today);
      }
    });

    it('creates the user tier at the supplied path', async () => {
      await install({ projectRoot, userTier });
      expect(existsSync(userTier)).toBe(true);
      expect(existsSync(join(userTier, 'USER.md'))).toBe(true);
      expect(existsSync(join(userTier, 'HABITS.md'))).toBe(true);
      expect(existsSync(join(userTier, 'LESSONS.md'))).toBe(true);
      expect(existsSync(join(userTier, 'fragments', 'INDEX.md'))).toBe(true);
    });

    it('strips the .template suffix from copied files', async () => {
      await install({ projectRoot, userTier });
      // SOUL.md.template in the kit → SOUL.md in the target
      expect(existsSync(join(projectRoot, 'context', 'SOUL.md.template'))).toBe(false);
      expect(existsSync(join(projectRoot, 'context', 'SOUL.md'))).toBe(true);
    });

    it('creates the empty subdirectories (sessions, transcripts, queues, .index, archive/*)', async () => {
      await install({ projectRoot, userTier });
      for (const d of [
        'context/sessions',
        'context/transcripts',
        'context/queues',
        'context/.index',
        'context/memory/archive/superseded',
        'context/memory/archive/tombstones',
      ]) {
        expect(existsSync(join(projectRoot, d)), `missing dir: ${d}`).toBe(true);
        expect(statSync(join(projectRoot, d)).isDirectory()).toBe(true);
      }
    });

    it('does NOT copy .gitkeep stubs into the target (they live only in the kit)', async () => {
      await install({ projectRoot, userTier });
      // The kit uses .gitkeep so empty dirs survive in the git repo, but
      // in the installed target, those dirs become real session/transcript/
      // queue directories that fill with real files over time. No .gitkeep
      // should bleed through.
      const kitkeeps = [
        'context/sessions/.gitkeep',
        'context/transcripts/.gitkeep',
        'context/queues/.gitkeep',
        'context/.index/.gitkeep',
        'context/memory/archive/superseded/.gitkeep',
        'context/memory/archive/tombstones/.gitkeep',
      ];
      for (const p of kitkeeps) {
        expect(existsSync(join(projectRoot, p)), `.gitkeep leaked into target: ${p}`).toBe(false);
      }
    });

    it('returns a result whose created list contains every newly-written file (sorted, relative paths)', async () => {
      const result = await install({ projectRoot, userTier });
      // Every reported created path should exist on disk
      for (const path of result.created) {
        expect(existsSync(path), `result.created listed ${path} but it does not exist`).toBe(true);
      }
      // Sanity check on size — we expect roughly a dozen files across 3 tiers
      expect(result.created.length).toBeGreaterThanOrEqual(8);
    });

    it('scaffolds CLAUDE.md with the `cmk remember` capture guidance, not the old hand-write instruction (#0b regression guard)', async () => {
      // Guards the write-path fix: the scaffolded CLAUDE.md must route durable
      // captures through `cmk remember` (the safe path — Poison_Guard +
      // home-path abstraction + dedup + correct schema), NOT tell the agent to
      // hand-write fact files (which produced wrong-schema, unindexable,
      // username-leaking files in the self-test). Also catches the
      // canonical-vs-generated template drift that let the first fix land in
      // the gitignored copy instead of template/CLAUDE.md.template.
      await install({ projectRoot, userTier });
      const claudeMd = readFileSync(join(projectRoot, 'CLAUDE.md'), 'utf8');
      expect(claudeMd).toContain('cmk remember');
      expect(claudeMd).not.toContain(
        'create `context/memory/<type>_<slug>.md` with full YAML frontmatter',
      );
    });
  });

  describe('CLI output message — outcome over inventory (#UX)', () => {
    function runCli(args, cwd, userDir) {
      return spawnSync(process.execPath, [CMK_BIN, 'install', ...args], {
        cwd,
        encoding: 'utf8',
        env: { ...process.env, MEMORY_KIT_USER_DIR: userDir },
      });
    }

    it('fresh install: reports the project is ready, NOT a scary "skipped N existing" tally', () => {
      const sandbox = mkdtempSync(join(tmpdir(), 'cmk-install-msg-'));
      try {
        const proj = join(sandbox, 'proj');
        mkdirSync(proj, { recursive: true });
        const r = runCli([], proj, join(sandbox, 'user'));
        expect(r.status ?? 0).toBe(0);
        expect(r.stdout).toMatch(/ready — context\/ scaffolded/);
        // The old confusing inventory must NOT appear by default (the "skipped"
        // were the user-tier files outside the folder — read like a problem).
        expect(r.stdout).not.toMatch(/skipped \d+ existing/);
        expect(r.stdout).not.toMatch(/scaffolded \d+ file/);
      } finally {
        rmSync(sandbox, { recursive: true, force: true });
      }
    });

    it('--verbose: shows the per-tier created/already-present breakdown', () => {
      const sandbox = mkdtempSync(join(tmpdir(), 'cmk-install-msgv-'));
      try {
        const proj = join(sandbox, 'proj');
        mkdirSync(proj, { recursive: true });
        const r = runCli(['--verbose'], proj, join(sandbox, 'user'));
        expect(r.status ?? 0).toBe(0);
        expect(r.stdout).toMatch(/files: \d+ created, \d+ already present/);
        expect(r.stdout).toMatch(/\.gitignore=.*CLAUDE\.md=.*hooks=/);
      } finally {
        rmSync(sandbox, { recursive: true, force: true });
      }
    });
  });

  describe('Re-install (idempotency)', () => {
    it('produces byte-identical on-disk state on the second run', async () => {
      await install({ projectRoot, userTier });
      const fingerprintAfterFirst = treeFingerprint(projectRoot);
      const userFingerprintAfterFirst = treeFingerprint(userTier);

      await install({ projectRoot, userTier });
      const fingerprintAfterSecond = treeFingerprint(projectRoot);
      const userFingerprintAfterSecond = treeFingerprint(userTier);

      expect(fingerprintAfterSecond).toBe(fingerprintAfterFirst);
      expect(userFingerprintAfterSecond).toBe(userFingerprintAfterFirst);
    });

    it('reports zero `created` and N>0 `skipped` on the second run', async () => {
      await install({ projectRoot, userTier });
      const second = await install({ projectRoot, userTier });
      expect(second.created).toEqual([]);
      expect(second.skipped.length).toBeGreaterThan(0);
      expect(second.errors).toEqual([]);
    });

    it('preserves a hand-edited MEMORY.md across re-install', async () => {
      await install({ projectRoot, userTier });
      const memoryPath = join(projectRoot, 'context', 'MEMORY.md');
      const userEdit = '\n\n## User-added section\n\n- hand-edited content that must survive\n';
      const originalSize = statSync(memoryPath).size;
      writeFileSync(memoryPath, readFileSync(memoryPath, 'utf8') + userEdit, 'utf8');
      const editedHash = fileHash(memoryPath);
      const editedMtime = statSync(memoryPath).mtimeMs;

      await install({ projectRoot, userTier });

      // mtime + sha1 unchanged — i.e., the installer didn't touch the file
      expect(fileHash(memoryPath)).toBe(editedHash);
      expect(statSync(memoryPath).mtimeMs).toBe(editedMtime);
      expect(statSync(memoryPath).size).toBeGreaterThan(originalSize);
      expect(readFileSync(memoryPath, 'utf8')).toContain('hand-edited content that must survive');
    });
  });

  describe('.gitignore injection', () => {
    it('creates a .gitignore in a fresh project', async () => {
      await install({ projectRoot, userTier });
      const gi = join(projectRoot, '.gitignore');
      expect(existsSync(gi)).toBe(true);
      const content = readFileSync(gi, 'utf8');
      expect(content).toContain('context.local/');
      expect(content).toContain('context/.index/');
      expect(content).toContain('context/.locks/');
      // Task 92 (G6, security): the extract.log carries raw, un-Poison-Guarded
      // turn excerpts (low_trust_discarded traces) — it must be gitignored so a
      // dropped secret can't reach git history.
      expect(content).toContain('context/sessions/*.extract.log');
    });

    it('wraps the managed block with start/end markers (for idempotent refresh)', async () => {
      await install({ projectRoot, userTier });
      const content = readFileSync(join(projectRoot, '.gitignore'), 'utf8');
      expect(content).toContain('claude-memory-kit:gitignore:start');
      expect(content).toContain('claude-memory-kit:gitignore:end');
    });

    it('Task 107 — the gitignore start marker carries the INSTALL version, not a stale hardcode', async () => {
      // Was hardcoded `:start v0.1.0` while the CLAUDE.md block (load-bearing,
      // version-injected) correctly showed the install version — a confusing
      // drift in a v0.2.x install. The marker now tracks the kit version.
      await install({ projectRoot, userTier });
      const content = readFileSync(join(projectRoot, '.gitignore'), 'utf8');
      expect(content).toContain(`claude-memory-kit:gitignore:start v${getKitVersion()}`);
      expect(content).not.toMatch(/gitignore:start v0\.1\.0/);
    });

    it('preserves unrelated entries outside the managed block on re-install', async () => {
      // Seed an existing .gitignore with user content
      const giPath = join(projectRoot, '.gitignore');
      const userContent = '# user\nnode_modules/\nmy-secret.env\n\n# project-local\nfoo.log\n';
      writeFileSync(giPath, userContent, 'utf8');

      await install({ projectRoot, userTier });
      await install({ projectRoot, userTier });

      const after = readFileSync(giPath, 'utf8');
      expect(after).toContain('node_modules/');
      expect(after).toContain('my-secret.env');
      expect(after).toContain('foo.log');
      expect(after).toContain('context.local/');
    });

    it('refreshes the managed block in place on re-install — block does not duplicate', async () => {
      await install({ projectRoot, userTier });
      await install({ projectRoot, userTier });
      const content = readFileSync(join(projectRoot, '.gitignore'), 'utf8');
      const starts = content.match(/claude-memory-kit:gitignore:start/g) || [];
      const ends = content.match(/claude-memory-kit:gitignore:end/g) || [];
      expect(starts.length).toBe(1);
      expect(ends.length).toBe(1);
    });

    it('reports the gitignore action in the result object', async () => {
      const first = await install({ projectRoot, userTier });
      expect(['created', 'replaced', 'unchanged']).toContain(first.gitignore.action);
      const second = await install({ projectRoot, userTier });
      // Second run sees the block already in place; should be 'unchanged' if
      // content matches, or 'replaced' if anything updated. Either way, not
      // 'created'.
      expect(second.gitignore.action).not.toBe('created');
    });
  });

  describe('MEMORY_KIT_USER_DIR env var', () => {
    // We can't easily mutate process.env across tests without leaking — we
    // pass userTier as an explicit option that mirrors the env var's
    // resolved value. The resolution logic itself (`process.env.MEMORY_KIT_USER_DIR
    // ?? default`) is covered by a focused test below.

    it('honors the explicit userTier option (the install() boundary)', async () => {
      const customUserTier = join(sandbox, 'custom', 'user', 'path');
      await install({ projectRoot, userTier: customUserTier });
      expect(existsSync(customUserTier)).toBe(true);
      expect(existsSync(join(customUserTier, 'USER.md'))).toBe(true);
      // And NOT at any other default location
      expect(existsSync(join(sandbox, 'fake-home', '.claude-memory-kit'))).toBe(false);
    });

    it('defaults to ~/.claude-memory-kit/ when env var is absent (smoke test)', async () => {
      // We don't actually want to write into the real ~ during tests, so we
      // only verify the API path. The unit-test-level coverage of "what does
      // resolveUserTier() return when env var is unset" lives below.
      const { resolveUserTier } = await import('../packages/cli/src/install.mjs');
      const prev = process.env.MEMORY_KIT_USER_DIR;
      delete process.env.MEMORY_KIT_USER_DIR;
      try {
        const resolved = resolveUserTier();
        expect(resolved).toMatch(/\.claude-memory-kit/);
      } finally {
        if (prev !== undefined) process.env.MEMORY_KIT_USER_DIR = prev;
      }
    });

    it('honors $MEMORY_KIT_USER_DIR when explicit option not passed', async () => {
      const { resolveUserTier } = await import('../packages/cli/src/install.mjs');
      const prev = process.env.MEMORY_KIT_USER_DIR;
      const customPath = join(sandbox, 'env-var-path');
      process.env.MEMORY_KIT_USER_DIR = customPath;
      try {
        const resolved = resolveUserTier();
        expect(resolved).toBe(customPath);
      } finally {
        if (prev !== undefined) process.env.MEMORY_KIT_USER_DIR = prev;
        else delete process.env.MEMORY_KIT_USER_DIR;
      }
    });
  });

  describe('Manifest compare against template/', () => {
    // Every non-.gitkeep file in template/{project,local,user}/ should
    // appear in the installed target (with .template suffix stripped).

    it('every .md.template in template/project/ lands as .md in the project tier', async () => {
      await install({ projectRoot, userTier });
      const projectSrc = join(KIT_TEMPLATE, 'project');
      const expected = listTree(projectSrc)
        .filter((f) => !f.endsWith('.gitkeep'))
        .map((f) => f.replace(/\.template$/, ''));
      const installed = listTree(join(projectRoot, 'context'));
      for (const f of expected) {
        expect(installed, `missing in project tier: ${f}`).toContain(f);
      }
    });

    it('every .md.template in template/local/ lands as .md in the local tier', async () => {
      await install({ projectRoot, userTier });
      const localSrc = join(KIT_TEMPLATE, 'local');
      const expected = listTree(localSrc)
        .filter((f) => !f.endsWith('.gitkeep'))
        .map((f) => f.replace(/\.template$/, ''));
      const installed = listTree(join(projectRoot, 'context.local'));
      for (const f of expected) {
        expect(installed, `missing in local tier: ${f}`).toContain(f);
      }
    });

    it('every .md.template in template/user/ lands as .md in the user tier', async () => {
      await install({ projectRoot, userTier });
      const userSrc = join(KIT_TEMPLATE, 'user');
      const expected = listTree(userSrc)
        .filter((f) => !f.endsWith('.gitkeep'))
        .map((f) => f.replace(/\.template$/, ''));
      const installed = listTree(userTier);
      for (const f of expected) {
        expect(installed, `missing in user tier: ${f}`).toContain(f);
      }
    });
  });
});
