// @doors: 1, 2, 3
// Door 3: the npm child-process is asserted via the injected spawnNpm seam
//   (argv contract) — the REAL `npm install -g` is the user's machine-level
//   step, never run from tests.
// Door 4 N/A: install's semantic step emits no NDJSON; its observable
//   surface is the result struct (Door 1) + settings.json (Door 2) + the
//   summary lines (owned by the subcommand layer).
// Door 5 N/A: no message-queue interaction.
//
// Tests for Task 46 — `cmk install --with-semantic` / `--no-semantic` and
// the settings-aware default search mode.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { install, mergeProjectSettings } from '../packages/cli/src/install.mjs';
import { resolveDefaultSearchMode } from '../packages/cli/src/semantic-backend.mjs';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = join(dirname(__filename), '..');
const CMK_BIN = join(REPO_ROOT, 'packages', 'cli', 'bin', 'cmk.mjs');

describe('Task 46 — install --with-semantic / --no-semantic', () => {
  let sandbox, projectRoot, userDir;

  beforeEach(() => {
    sandbox = mkdtempSync(join(tmpdir(), 'cmk-46-'));
    projectRoot = join(sandbox, 'proj');
    userDir = join(sandbox, 'user');
  });
  afterEach(() => {
    rmSync(sandbox, { recursive: true, force: true });
  });

  const settingsPath = () => join(projectRoot, 'context', 'settings.json');
  const fakeWarm = async () => ({ ok: true, ms: 1 });

  it('--with-semantic: npm argv contract (Door 3) + default_mode=hybrid (Door 2) + result shape (Door 1)', async () => {
    const npmCalls = [];
    const r = await install({
      projectRoot,
      userTier: userDir,
      withSemantic: true,
      spawnNpm: () => {
        npmCalls.push(['npm', 'install', '-g', '@huggingface/transformers']);
        return { status: 0 };
      },
      warmEmbedder: fakeWarm,
    });
    expect(npmCalls).toHaveLength(1);
    expect(r.semantic).toMatchObject({ action: 'enabled', defaultMode: 'hybrid' });
    expect(r.semantic.warmed.ok).toBe(true);
    const settings = JSON.parse(readFileSync(settingsPath(), 'utf8'));
    expect(settings.search.default_mode).toBe('hybrid');
  });

  it('npm failure → error action, settings NOT flipped (no half-state), keyword unaffected', async () => {
    const r = await install({
      projectRoot,
      userTier: userDir,
      withSemantic: true,
      spawnNpm: () => ({ status: 1 }),
      warmEmbedder: fakeWarm,
    });
    expect(r.semantic.action).toBe('error');
    expect(r.errors.length).toBeGreaterThan(0);
    // settings.json either absent or without a hybrid default.
    if (existsSync(settingsPath())) {
      const settings = JSON.parse(readFileSync(settingsPath(), 'utf8'));
      expect(settings?.search?.default_mode).not.toBe('hybrid');
    }
  });

  it('--no-semantic pins keyword explicitly', async () => {
    const r = await install({ projectRoot, userTier: userDir, noSemantic: true });
    expect(r.semantic.action).toBe('disabled');
    const settings = JSON.parse(readFileSync(settingsPath(), 'utf8'));
    expect(settings.search.default_mode).toBe('keyword');
  });

  it('neither flag → settings untouched (3-state contract)', async () => {
    const r = await install({ projectRoot, userTier: userDir });
    expect(r.semantic.action).toBe('skipped');
    expect(existsSync(settingsPath())).toBe(false);
  });

  it('mergeProjectSettings preserves existing keys (over-mutation guard)', () => {
    mkdirSync(join(projectRoot, 'context'), { recursive: true });
    writeFileSync(
      settingsPath(),
      JSON.stringify({ scratchpads: { 'MEMORY.md': { max_chars: 4000 } }, search: { custom: 1 } }),
      'utf8',
    );
    const r = mergeProjectSettings(projectRoot, { search: { default_mode: 'hybrid' } });
    expect(r.ok).toBe(true);
    const s = JSON.parse(readFileSync(settingsPath(), 'utf8'));
    expect(s.scratchpads['MEMORY.md'].max_chars).toBe(4000); // untouched
    expect(s.search.custom).toBe(1); // sibling key inside search preserved
    expect(s.search.default_mode).toBe('hybrid');
  });
});

describe('Task 46 — resolveDefaultSearchMode', () => {
  let sandbox, projectRoot;
  beforeEach(() => {
    sandbox = mkdtempSync(join(tmpdir(), 'cmk-46-mode-'));
    projectRoot = join(sandbox, 'proj');
    mkdirSync(join(projectRoot, 'context'), { recursive: true });
  });
  afterEach(() => rmSync(sandbox, { recursive: true, force: true }));

  it('reads hybrid; invalid values and missing files fall back to keyword', () => {
    const p = join(projectRoot, 'context', 'settings.json');
    writeFileSync(p, JSON.stringify({ search: { default_mode: 'hybrid' } }), 'utf8');
    expect(resolveDefaultSearchMode({ projectRoot })).toBe('hybrid');
    writeFileSync(p, JSON.stringify({ search: { default_mode: 'sideways' } }), 'utf8');
    expect(resolveDefaultSearchMode({ projectRoot })).toBe('keyword');
    writeFileSync(p, 'not json', 'utf8');
    expect(resolveDefaultSearchMode({ projectRoot })).toBe('keyword');
    rmSync(p);
    expect(resolveDefaultSearchMode({ projectRoot })).toBe('keyword');
  });
});

describe('Task 46 — configured hybrid default degrades gracefully (CLI integration)', () => {
  it('settings hybrid + embedder disabled → exit 0, keyword results, fallback note (NOT exit 2)', async () => {
    const sandbox = mkdtempSync(join(tmpdir(), 'cmk-46-cli-'));
    const projectRoot = join(sandbox, 'proj');
    const userDir = join(sandbox, 'user');
    try {
      await install({ projectRoot, userTier: userDir });
      writeFileSync(
        join(projectRoot, 'context', 'settings.json'),
        JSON.stringify({ search: { default_mode: 'hybrid' } }),
        'utf8',
      );
      // Seed one searchable bullet through the real CLI so keyword can hit.
      const seed = spawnSync(
        process.execPath,
        [CMK_BIN, 'remember', 'we standardized on pnpm for installs'],
        { cwd: projectRoot, encoding: 'utf8', env: { ...process.env, MEMORY_KIT_USER_DIR: userDir } },
      );
      expect(seed.status).toBe(0);
      const r = spawnSync(process.execPath, [CMK_BIN, 'search', 'pnpm'], {
        cwd: projectRoot,
        encoding: 'utf8',
        env: { ...process.env, MEMORY_KIT_USER_DIR: userDir, CMK_DISABLE_SEMANTIC: '1' },
      });
      expect(r.status).toBe(0); // graceful — the configured default never breaks search
      expect(r.stdout).toMatch(/pnpm/);
      expect(r.stderr).toMatch(/falling back to keyword/);
    } finally {
      rmSync(sandbox, { recursive: true, force: true });
    }
  }, 60_000);
});
