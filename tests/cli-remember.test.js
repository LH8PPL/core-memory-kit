// @doors: 1, 2, 3
// Door 4 N/A: cmk remember surfaces its result on stdout; the audit-log NDJSON
//   entry is memoryWrite's responsibility, covered by cli-memory-write.test.js.
// Door 5 N/A: no message queue.

// Tests for `cmk remember` — the explicit durable-capture CLI (write-path fix
// #0b/#1). It routes through memoryWrite (Poison_Guard + home-path
// abstraction + conflict detection), so the agent never freehand-writes
// malformed/leaky fact files. Real-binary integration (Door 3) is the point:
// the self-test bug was that the *agent's own writes* bypassed the safe path.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { install } from '../packages/cli/src/install.mjs';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = join(dirname(__filename), '..');
const CMK_BIN = join(REPO_ROOT, 'packages', 'cli', 'bin', 'cmk.mjs');

let sandbox;
let projectRoot;
let userDir;

beforeEach(async () => {
  sandbox = mkdtempSync(join(tmpdir(), 'cmk-remember-test-'));
  projectRoot = join(sandbox, 'proj');
  userDir = join(sandbox, 'user');
  await install({ projectRoot, userTier: userDir });
});

afterEach(() => {
  rmSync(sandbox, { recursive: true, force: true });
});

function cmk(args) {
  return spawnSync(process.execPath, [CMK_BIN, ...args], {
    cwd: projectRoot,
    encoding: 'utf8',
    env: { ...process.env, MEMORY_KIT_USER_DIR: userDir },
  });
}

function readMemory() {
  return readFileSync(join(projectRoot, 'context', 'MEMORY.md'), 'utf8');
}

describe('cmk remember — durable capture CLI', () => {
  it('saves a fact to MEMORY.md and reports success (Door 1 + 2)', () => {
    const r = cmk(['remember', 'We', 'standardized', 'on', 'pnpm']);
    expect(r.status ?? 0).toBe(0);
    expect(r.stdout).toMatch(/saved to P\/MEMORY\.md/);
    expect(readMemory()).toContain('We standardized on pnpm');
  });

  it('abstracts a home-dir path; the username never lands in committed MEMORY.md (#1)', () => {
    const r = cmk([
      'remember',
      'venv at C:\\Users\\someuser\\AppData\\Local\\Programs\\Python\\Python313\\python.exe',
    ]);
    expect(r.status ?? 0).toBe(0);
    const mem = readMemory();
    expect(mem).not.toContain('someuser');
    expect(mem).toContain('~\\AppData\\Local\\Programs\\Python\\Python313\\python.exe');
  });

  it('captured fact is then findable via cmk search (remember → search integration)', () => {
    expect(cmk(['remember', 'we deploy with', 'kamal', 'to hetzner']).status ?? 0).toBe(0);
    const s = cmk(['search', 'kamal']);
    expect(s.status ?? 0).toBe(0);
    expect(s.stdout).toContain('kamal');
    expect(s.stdout).not.toContain('no results');
  });

  it('Poison_Guard: a secret is rejected (exit 2) and not written', () => {
    const r = cmk([
      'remember',
      // Allowlisted poison-guard fixture (also in .gitleaks.toml).
      'token ghp_1234567890abcdefghij1234567890abcdef12',
    ]);
    expect(r.status).toBe(2);
    expect(readMemory()).not.toContain('ghp_1234567890');
  });

  it('--tier U is rejected with the v0.1.x deferral notice (exit 2)', () => {
    const r = cmk(['remember', '--tier', 'U', 'cross project pref']);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/not yet supported|v0\.1\.x/);
  });

  // Task 63 (F1) — Door 3: the CLI arg-parser must actually wire --why/--how
  // through commander to runRememberRich. The unit tests call runRememberRich
  // directly; only this real-binary path proves the registry optionSpec flags
  // reach it (and that rich mode writes a FACT FILE, not a MEMORY.md bullet).
  function factFiles() {
    return readdirSync(join(projectRoot, 'context', 'memory')).filter(
      (f) => f.endsWith('.md') && f !== 'INDEX.md',
    );
  }

  it('rich mode (--why/--how) writes a granular fact file, not a MEMORY.md bullet', () => {
    const r = cmk([
      'remember',
      'FastAPI is the delivery layer; logic lives in services',
      '--type', 'feedback',
      '--title', 'layered-backend',
      '--why', 'pay the structure cost up front',
      '--how', 'thin routes; push logic into app/services',
    ]);
    expect(r.status ?? 0).toBe(0);
    expect(r.stdout).toMatch(/saved rich fact/);

    const files = factFiles();
    expect(files).toContain('feedback_layered-backend.md');
    const content = readFileSync(
      join(projectRoot, 'context', 'memory', 'feedback_layered-backend.md'),
      'utf8',
    );
    expect(content).toContain('**Why:** pay the structure cost up front');
    expect(content).toContain('**How to apply:** thin routes; push logic into app/services');
    // Routing boundary: rich capture must NOT also drop a terse MEMORY.md bullet.
    expect(readMemory()).not.toContain('FastAPI is the delivery layer');
  });

  it('--links lands as related cross-links in the fact frontmatter', () => {
    const r = cmk([
      'remember', 'use ruff for lint + format',
      '--title', 'ruff-tooling',
      '--why', 'one tool replaces black+isort+flake8',
      '--links', 'python-tooling, uv-package-manager',
    ]);
    expect(r.status ?? 0).toBe(0);
    const content = readFileSync(
      join(projectRoot, 'context', 'memory', 'feedback_ruff-tooling.md'),
      'utf8',
    );
    expect(content).toMatch(/related:/);
    expect(content).toContain('python-tooling');
    expect(content).toContain('uv-package-manager');
  });
});
