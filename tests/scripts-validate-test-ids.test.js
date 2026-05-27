// @doors: 1, 3
// Door 2 N/A: validator reads from disk + writes to stdout/stderr; no kit-state mutation.
// Door 4 N/A: no message-queue interaction.
// Door 5 N/A: no NDJSON observability surface.
//
// Self-test for scripts/validate-test-ids.mjs.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(dirname(__filename), '..');
const VALIDATOR = join(REPO_ROOT, 'scripts', 'validate-test-ids.mjs');

function makeSandbox() {
  const sandbox = mkdtempSync(join(tmpdir(), 'cmk-testids-test-'));
  mkdirSync(join(sandbox, 'tests'), { recursive: true });
  // Also copy the kit's tier-paths.mjs (the validator imports ID_PATTERN
  // from it). Simpler: just symlink the whole packages/ dir? Even simpler:
  // make the sandbox cwd a sibling of the REAL repo so the import works.
  // Cleanest for self-test isolation: write a stub tier-paths.mjs.
  mkdirSync(join(sandbox, 'packages', 'cli', 'src'), { recursive: true });
  writeFileSync(
    join(sandbox, 'packages', 'cli', 'src', 'tier-paths.mjs'),
    "export const ID_PATTERN = /^[PUL]-[2-79A-HJ-NP-Za]{8}$/;\n",
  );
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

describe('validate-test-ids', () => {
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
    expect(r.stdout).toMatch(/all \[PUL\]-XXXXXXXX tokens/);
  });

  it('passes when test ids use the kit alphabet', () => {
    writeFileSync(
      join(sandbox, 'tests', 'foo.test.js'),
      "const id = 'P-AAAAAAAA';\n",
    );
    const r = runValidator(sandbox);
    expect(r.exitCode).toBe(0);
  });

  it('FAILS when test id contains an excluded char (0 / O / 1 / l / I / 8)', () => {
    writeFileSync(
      join(sandbox, 'tests', 'bad.test.js'),
      "const id = 'P-A0AAAAAA';\n", // validate-test-ids: ignore — fixture string written to disk, not a real id
    );
    const r = runValidator(sandbox);
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toMatch(/invalid alphabet char/);
  });

  it('honors the per-line suppression marker `validate-test-ids: ignore`', () => {
    writeFileSync(
      join(sandbox, 'tests', 'suppressed.test.js'),
      "const id = 'P-A0AAAAAA'; // validate-test-ids: ignore — deliberately bad\n", // validate-test-ids: ignore — fixture string written to disk, not a real id
    );
    const r = runValidator(sandbox);
    expect(r.exitCode).toBe(0);
  });
});
