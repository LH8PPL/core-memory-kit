// @doors: 1, 3
// Door 2 N/A: validator scans .mjs files + writes to stderr/stdout; no kit-state mutation.
// Door 4 N/A: no message-queue interaction.
// Door 5 N/A: validator emits human-readable summary, not NDJSON observability.
//
// Self-test for scripts/validate-platform-commands.mjs.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(dirname(__filename), '..');
const VALIDATOR = join(REPO_ROOT, 'scripts', 'validate-platform-commands.mjs');

function makeSandbox() {
  const sandbox = mkdtempSync(join(tmpdir(), 'cmk-platcmd-test-'));
  mkdirSync(join(sandbox, 'packages', 'cli', 'src'), { recursive: true });
  mkdirSync(join(sandbox, 'plugin', 'bin'), { recursive: true });
  return sandbox;
}

function runValidator(sandbox) {
  const r = spawnSync(process.execPath, [VALIDATOR], {
    cwd: sandbox,
    encoding: 'utf8',
    windowsHide: true,
  });
  return { exitCode: r.status, stdout: r.stdout, stderr: r.stderr };
}

describe('validate-platform-commands', () => {
  let sandbox;
  beforeEach(() => {
    sandbox = makeSandbox();
  });
  afterEach(() => {
    rmSync(sandbox, { recursive: true, force: true });
  });

  it('passes on a clean sandbox (no production .mjs files)', () => {
    const r = runValidator(sandbox);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toMatch(/validate-platform-commands: OK/);
  });

  it('FAILS on a hardcoded `rm "..."` POSIX command without the helper or marker', () => {
    writeFileSync(
      join(sandbox, 'packages', 'cli', 'src', 'naked.mjs'),
      'export function recoveryCmd(path) {\n  return `rm "${path}"`;\n}\n',
    );
    const r = runValidator(sandbox);
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toMatch(/hardcoded POSIX command `rm`/);
  });

  it('passes when the file imports from platform-commands.mjs (helper in scope)', () => {
    writeFileSync(
      join(sandbox, 'packages', 'cli', 'src', 'helper-user.mjs'),
      "import { removeFile } from './platform-commands.mjs';\nexport function cmd(path) {\n  return `rm \"${path}\"`; // helper not used on this branch, but file has discipline\n}\n",
    );
    const r = runValidator(sandbox);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toMatch(/helper-in-scope/);
  });

  it('passes when the line has // platform-commands: ignore marker', () => {
    writeFileSync(
      join(sandbox, 'packages', 'cli', 'src', 'suppressed.mjs'),
      'export function shellOnly(path) {\n  return `rm "${path}"`; // platform-commands: ignore — bash-only contract for installer\n}\n',
    );
    const r = runValidator(sandbox);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toMatch(/ignored/);
  });

  it('passes when the suppression marker is on the line above', () => {
    writeFileSync(
      join(sandbox, 'packages', 'cli', 'src', 'suppressed2.mjs'),
      'export function shellOnly(path) {\n  // platform-commands: ignore — explicit posix contract\n  return `rm "${path}"`;\n}\n',
    );
    const r = runValidator(sandbox);
    expect(r.exitCode).toBe(0);
  });

  it('does NOT false-positive on `mkdirSync` (Node API, not shell mkdir)', () => {
    writeFileSync(
      join(sandbox, 'packages', 'cli', 'src', 'node-api.mjs'),
      "import { mkdirSync } from 'node:fs';\nexport function ensureDir(path) {\n  mkdirSync(path, { recursive: true });\n}\n",
    );
    const r = runValidator(sandbox);
    expect(r.exitCode).toBe(0);
  });

  it('does NOT false-positive on POSIX commands inside line comments', () => {
    writeFileSync(
      join(sandbox, 'packages', 'cli', 'src', 'comment-only.mjs'),
      '// Note: users on POSIX systems can run `rm "..."` to clear the lock manually\nexport const x = 1;\n',
    );
    const r = runValidator(sandbox);
    expect(r.exitCode).toBe(0);
  });
});
