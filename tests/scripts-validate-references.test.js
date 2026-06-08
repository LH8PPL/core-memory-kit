// @doors: 1, 3
// Door 2 N/A: validator reads markdown files + writes to stdout/stderr; no kit-state mutation.
// Door 4 N/A: no message-queue interaction.
// Door 5 N/A: no NDJSON observability surface.
//
// Self-test for scripts/validate-references.mjs.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(dirname(__filename), '..');
const VALIDATOR = join(REPO_ROOT, 'scripts', 'validate-references.mjs');

function makeSandbox() {
  const sandbox = mkdtempSync(join(tmpdir(), 'cmk-refs-test-'));
  mkdirSync(join(sandbox, 'docs', 'adr'), { recursive: true });
  mkdirSync(join(sandbox, 'specs'), { recursive: true });
  return sandbox;
}

function runValidator(sandbox) {
  const r = spawnSync(process.execPath, [VALIDATOR], {
    cwd: sandbox,
    encoding: 'utf8',
    windowsHide: true,
    env: { ...process.env, CMK_VALIDATOR_ROOT: sandbox },
  });
  return { exitCode: r.status, stdout: r.stdout, stderr: r.stderr };
}

describe('validate-references', () => {
  let sandbox;
  beforeEach(() => {
    sandbox = makeSandbox();
  });
  afterEach(() => {
    rmSync(sandbox, { recursive: true, force: true });
  });

  it('passes on an empty corpus', () => {
    const r = runValidator(sandbox);
    expect(r.exitCode).toBe(0);
  });

  it('FAILS on a broken [label](path) link', () => {
    writeFileSync(
      join(sandbox, 'index.md'),
      '# Top\n\nSee [missing](does-not-exist.md).\n',
    );
    const r = runValidator(sandbox);
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toMatch(/broken link target: does-not-exist\.md/);
  });

  it('passes when a [label](path) link resolves', () => {
    writeFileSync(join(sandbox, 'index.md'), '# Top\n\nSee [target](other.md).\n');
    writeFileSync(join(sandbox, 'other.md'), '# Other\n');
    const r = runValidator(sandbox);
    expect(r.exitCode).toBe(0);
  });

  it('FAILS on a broken ADR-NNNN reference', () => {
    writeFileSync(join(sandbox, 'index.md'), '# Top\n\nSee ADR-0099.\n');
    const r = runValidator(sandbox);
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toMatch(/ADR-0099 has no file/);
  });

  it('skips link-shaped tokens inside fenced code blocks (D1-IMP-A)', () => {
    writeFileSync(
      join(sandbox, 'index.md'),
      '# Top\n\nExample:\n\n```\n[link](does-not-exist.md)\n```\n\nThat was inside a fence.\n',
    );
    const r = runValidator(sandbox);
    expect(r.exitCode).toBe(0);
  });

  it('skips link-shaped tokens inside inline-code spans', () => {
    writeFileSync(
      join(sandbox, 'index.md'),
      '# Top\n\nFor example, `[link](does-not-exist.md)` is illustrative.\n',
    );
    const r = runValidator(sandbox);
    expect(r.exitCode).toBe(0);
  });

  it('honors the same-line suppression marker', () => {
    writeFileSync(
      join(sandbox, 'index.md'),
      '# Top\n\nReserved: ADR-0099. <!-- validate-references: ignore -->\n',
    );
    const r = runValidator(sandbox);
    expect(r.exitCode).toBe(0);
  });
});
