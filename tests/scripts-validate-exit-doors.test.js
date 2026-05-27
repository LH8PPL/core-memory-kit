// @doors: 1, 3
// Door 2 N/A: validator reads test files + writes to stdout/stderr; no kit-state mutation.
// Door 4 N/A: no message-queue interaction.
// Door 5 N/A: no NDJSON observability surface.
//
// Self-test for scripts/validate-exit-doors.mjs.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(dirname(__filename), '..');
const VALIDATOR = join(REPO_ROOT, 'scripts', 'validate-exit-doors.mjs');

function makeSandbox() {
  const sandbox = mkdtempSync(join(tmpdir(), 'cmk-doors-test-'));
  mkdirSync(join(sandbox, 'tests'), { recursive: true });
  return sandbox;
}

function runValidator(sandbox, env = {}) {
  const r = spawnSync(process.execPath, [VALIDATOR], {
    cwd: sandbox,
    encoding: 'utf8',
    windowsHide: true,
    env: { ...process.env, ...env },
  });
  return { exitCode: r.status, stdout: r.stdout, stderr: r.stderr };
}

describe('validate-exit-doors', () => {
  let sandbox;
  beforeEach(() => {
    sandbox = makeSandbox();
  });
  afterEach(() => {
    rmSync(sandbox, { recursive: true, force: true });
  });

  it('passes on a clean sandbox (no test files)', () => {
    const r = runValidator(sandbox);
    expect(r.exitCode).toBe(0);
  });

  it('passes when a test file has all doors declared or N/A', () => {
    writeFileSync(
      join(sandbox, 'tests', 'full.test.js'),
      '// @doors: 1, 2, 3, 5\n// Door 4 N/A: no MQ.\nimport {x} from "x";\n',
    );
    const r = runValidator(sandbox);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toMatch(/1\/1 test files annotated/);
  });

  it('FAILS when a test file is missing the @doors header (strict default, post-D2b)', () => {
    writeFileSync(
      join(sandbox, 'tests', 'naked.test.js'),
      'import {x} from "x";\n',
    );
    const r = runValidator(sandbox);
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toMatch(/missing `\/\/ @doors:/);
  });

  it('FAILS on silent omission (door not declared and not marked N/A)', () => {
    writeFileSync(
      join(sandbox, 'tests', 'silent.test.js'),
      '// @doors: 1, 2\nimport {x} from "x";\n',
    );
    const r = runValidator(sandbox);
    expect(r.exitCode).toBe(1);
    // Doors 3, 4, 5 are silent omissions — should fire 3 violations
    expect(r.stderr).toMatch(/door 3.*neither declared nor marked N\/A/);
    expect(r.stderr).toMatch(/door 4.*neither declared nor marked N\/A/);
    expect(r.stderr).toMatch(/door 5.*neither declared nor marked N\/A/);
  });

  it('FAILs on out-of-range door number (0 or 6)', () => {
    writeFileSync(
      join(sandbox, 'tests', 'badrange.test.js'),
      '// @doors: 1, 6\n',
    );
    const r = runValidator(sandbox);
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toMatch(/declares door 6/);
  });

  it('skips files with the @doors-ignore suppression marker', () => {
    writeFileSync(
      join(sandbox, 'tests', 'skipme.test.js'),
      '// @doors-ignore — meta-test for the validator itself\nimport {x} from "x";\n',
    );
    const r = runValidator(sandbox);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toMatch(/1 suppressed/);
  });
});
