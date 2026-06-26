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
import { install, mergeProjectSettings, buildDefaultNpmRunner } from '../packages/cli/src/install.mjs';
import { formatSemanticSummary } from '../packages/cli/src/subcommands.mjs';
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
      probeEmbedder: async () => ({ ok: true }), // Task 170: gate on import, not npm exit
      warmEmbedder: fakeWarm,
    });
    expect(npmCalls).toHaveLength(1);
    expect(r.semantic).toMatchObject({ action: 'enabled', defaultMode: 'hybrid' });
    expect(r.semantic.warmed.ok).toBe(true);
    const settings = JSON.parse(readFileSync(settingsPath(), 'utf8'));
    expect(settings.search.default_mode).toBe('hybrid');
  });

  it('Task 170: npm SUCCEEDS but the embedder does NOT import → error, NO hybrid half-state', async () => {
    // The symmetric half (skill-review Important): a status-0 npm with a broken/
    // partial native module must NOT write a hybrid default with no working
    // embedder (every search would degrade to a fallback warning). Gate the
    // status-0 path on the import probe too.
    const r = await install({
      projectRoot,
      userTier: userDir,
      withSemantic: true,
      spawnNpm: () => ({ status: 0 }),
      probeEmbedder: async () => ({ ok: false, reason: 'binding-broken' }),
      warmEmbedder: fakeWarm,
    });
    expect(r.semantic.action).toBe('error');
    if (existsSync(settingsPath())) {
      const settings = JSON.parse(readFileSync(settingsPath(), 'utf8'));
      expect(settings?.search?.default_mode).not.toBe('hybrid');
    }
  });

  it('npm non-zero BUT the embedder imports → ENABLED anyway (Task 170: verify the thing worked, not npm exit)', async () => {
    // The v0.4.1 cut-gate find: a benign cleanup-EBUSY made npm exit non-zero
    // AFTER the package installed successfully. The kit must PROBE whether the
    // embedder actually imports — if it does, enable hybrid regardless of npm's
    // noisy exit code (the D-199 class: verify reality, not the exit code).
    const r = await install({
      projectRoot,
      userTier: userDir,
      withSemantic: true,
      spawnNpm: () => ({ status: 1 }), // npm reports failure...
      probeEmbedder: async () => ({ ok: true }), // ...but the embedder IS importable
      warmEmbedder: fakeWarm,
    });
    expect(r.semantic).toMatchObject({ action: 'enabled', defaultMode: 'hybrid' });
    const settings = JSON.parse(readFileSync(settingsPath(), 'utf8'));
    expect(settings.search.default_mode).toBe('hybrid');
  });

  it('npm failure AND the embedder does NOT import → error, settings NOT flipped (genuine failure)', async () => {
    const r = await install({
      projectRoot,
      userTier: userDir,
      withSemantic: true,
      spawnNpm: () => ({ status: 1 }),
      probeEmbedder: async () => ({ ok: false, reason: 'not-installed' }), // genuinely absent
      warmEmbedder: fakeWarm,
    });
    expect(r.semantic.action).toBe('error');
    expect(r.errors.length).toBeGreaterThan(0);
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

describe('Task 125.4 — buildDefaultNpmRunner (the production closure, seam-testable)', () => {
  // Contract update Task 141a: the runner now probes `npm --version` first
  // (to decide whether the host npm understands --allow-scripts), so two
  // constant command strings spawn — the probe + the install. Both stay
  // DEP0190-safe (constant string + shell:true); the install call keeps the
  // §8.5 timeout discipline. The allow-flag variants are pinned in
  // tests/cli-native-binding.test.js.
  it('spawns the version probe + ONE constant install command (DEP0190-safe; Door 3)', () => {
    const calls = [];
    const runner = buildDefaultNpmRunner({
      spawnSyncImpl: (cmd, opts) => {
        calls.push({ cmd, opts });
        if (String(cmd).includes('--version')) return { status: 0, stdout: '11.4.2\n' };
        return { status: 0 };
      },
    });
    expect(runner()).toEqual({ status: 0, error: undefined });
    expect(calls).toHaveLength(2);
    expect(calls[0].cmd).toBe('npm --version');
    expect(calls[1].cmd).toBe('npm install -g @huggingface/transformers');
    expect(calls[1].opts.shell).toBe(true);
    expect(calls[1].opts.stdio).toBe('inherit');
    expect(calls[1].opts.timeout).toBe(600_000); // design §8.5 spawn discipline
  });

  it('timeout/error path: status null + error message surface (no throw)', () => {
    const runner = buildDefaultNpmRunner({
      spawnSyncImpl: () => ({ status: null, error: new Error('spawnSync npm ETIMEDOUT') }),
    });
    const r = runner();
    expect(r.status).toBe(null);
    expect(r.error).toMatch(/ETIMEDOUT/);
  });
});

describe('Task 125.4 — formatSemanticSummary (install summary lines, pure)', () => {
  it('covers all three outcomes + the noHooks tip suppression', () => {
    expect(
      formatSemanticSummary({ action: 'enabled', warmed: { ok: true, ms: 1500 } }, {}),
    ).toMatch(/ENABLED.*hybrid.*Model cached \(2s\)/s);
    expect(
      formatSemanticSummary({ action: 'enabled', warmed: { ok: false, reason: 'x' } }, {}),
    ).toMatch(/ENABLED.*downloads on first search/s);
    expect(formatSemanticSummary({ action: 'disabled' }, {})).toMatch(/pinned OFF.*keyword/s);
    expect(formatSemanticSummary({ action: 'skipped' }, {})).toMatch(/--with-semantic/);
    expect(formatSemanticSummary({ action: 'skipped' }, { noHooks: true })).toBe(null);
    expect(formatSemanticSummary({ action: 'error', error: 'boom' }, {})).toBe(null);
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
      // Explicit --mode=keyword WINS over the configured hybrid default:
      // the semantic prepare never runs, so no fallback note appears.
      const explicit = spawnSync(
        process.execPath,
        [CMK_BIN, 'search', 'pnpm', '--mode', 'keyword'],
        {
          cwd: projectRoot,
          encoding: 'utf8',
          env: { ...process.env, MEMORY_KIT_USER_DIR: userDir, CMK_DISABLE_SEMANTIC: '1' },
        },
      );
      expect(explicit.status).toBe(0);
      expect(explicit.stdout).toMatch(/pnpm/);
      expect(explicit.stderr).not.toMatch(/falling back to keyword/);
    } finally {
      rmSync(sandbox, { recursive: true, force: true });
    }
  }, 60_000);
});
