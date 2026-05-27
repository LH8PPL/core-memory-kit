// @doors: 1, 3
// Door 2 N/A: validator scripts read from disk + write to stderr/stdout;
//   the assertion here is on the validator's RESPONSE (Door 1) and the
//   subprocess it spawned to invoke node (Door 3), not on kit disk state.
// Door 4 N/A: no message-queue interaction.
// Door 5 N/A: validator scripts don't emit NDJSON observability logs;
//   they emit human-readable summaries to stdout/stderr.
//
// Self-test for scripts/validate-spawn-discipline.mjs. Per the kit's own
// "structural rules get validators" rule applied recursively: validators
// without their own tests can drift silently. This test fixture creates
// a sandbox with intentionally-violating spawn sites + intentionally-
// clean spawn sites, runs the validator, and asserts the violation
// output matches expectations.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  mkdirSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(dirname(__filename), '..');
const VALIDATOR = join(REPO_ROOT, 'scripts', 'validate-spawn-discipline.mjs');

// The validator scans `packages/cli/src` and `plugin/bin` relative to
// the CWD. We test the validator by running it in a sandbox CWD where
// we control those directories' content.
function makeSandbox() {
  const sandbox = mkdtempSync(join(tmpdir(), 'cmk-spawn-disc-test-'));
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

describe('validate-spawn-discipline', () => {
  let sandbox;
  beforeEach(() => {
    sandbox = makeSandbox();
  });
  afterEach(() => {
    rmSync(sandbox, { recursive: true, force: true });
  });

  it('passes on a clean sandbox (no spawn sites)', () => {
    const r = runValidator(sandbox);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toMatch(/validate-spawn-discipline: OK — 0 spawn site\(s\)/);
  });

  it('passes when a spawn site has `timeout:` in options', () => {
    writeFileSync(
      join(sandbox, 'packages', 'cli', 'src', 'clean.mjs'),
      "import { spawn } from 'node:child_process';\nspawn('node', ['x.mjs'], { timeout: 5000 });\n",
    );
    const r = runValidator(sandbox);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toMatch(/1 native-timeout/);
  });

  it('passes when a spawn site has caller-managed marker', () => {
    writeFileSync(
      join(sandbox, 'packages', 'cli', 'src', 'managed.mjs'),
      "import { spawn } from 'node:child_process';\n// spawn-discipline: caller-managed killChain helper\nspawn('node', ['x.mjs']);\n",
    );
    const r = runValidator(sandbox);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toMatch(/1 caller-managed/);
  });

  it('passes when a spawn site has ignore marker', () => {
    writeFileSync(
      join(sandbox, 'packages', 'cli', 'src', 'detached.mjs'),
      "import { spawn } from 'node:child_process';\n// spawn-discipline: ignore detached-fire-and-forget\nspawn('node', ['x.mjs'], { detached: true });\n",
    );
    const r = runValidator(sandbox);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toMatch(/1 ignored/);
  });

  it('FAILS when a spawn site has no marker and no timeout', () => {
    writeFileSync(
      join(sandbox, 'packages', 'cli', 'src', 'naked.mjs'),
      "import { spawn } from 'node:child_process';\nspawn('node', ['x.mjs']);\n",
    );
    const r = runValidator(sandbox);
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toMatch(/validate-spawn-discipline: FAIL/);
    expect(r.stderr).toMatch(/naked\.mjs:\d+:\s*spawn\(\)/);
  });

  it('does NOT false-positive on regex.exec() / array.exec()', () => {
    writeFileSync(
      join(sandbox, 'packages', 'cli', 'src', 'regex.mjs'),
      "const re = /abc/g; let m; while ((m = re.exec('text')) !== null) {}\n",
    );
    const r = runValidator(sandbox);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toMatch(/0 spawn site\(s\)/);
  });

  it('matches the kit wrapper convention `this._spawn(`', () => {
    writeFileSync(
      join(sandbox, 'packages', 'cli', 'src', 'wrapper.mjs'),
      "class Foo { compress() { this._spawn('node', ['x']); } }\n",
    );
    const r = runValidator(sandbox);
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toMatch(/_spawn\(\)/);
  });

  it('skips method definitions like `_spawn(bin, args, opts) {`', () => {
    writeFileSync(
      join(sandbox, 'packages', 'cli', 'src', 'wrapperdef.mjs'),
      "class Foo {\n  _spawn(bin, args, opts) {\n    return spawn(bin, args, { ...opts, timeout: 5000 });\n  }\n}\n",
    );
    const r = runValidator(sandbox);
    // The inner spawn() has timeout:, so it passes.
    // The outer _spawn(bin, args, opts) { is a method definition, not a call.
    expect(r.exitCode).toBe(0);
  });
});
