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
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
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
});
