// @doors: 1, 3
// Door 2 N/A: validator reads CLAUDE.md + writes to stdout/stderr; no kit-state mutation.
// Door 4 N/A: no message-queue interaction.
// Door 5 N/A: no NDJSON observability surface.
//
// Self-test for scripts/validate-composition.mjs.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(dirname(__filename), '..');
const VALIDATOR = join(REPO_ROOT, 'scripts', 'validate-composition.mjs');

function makeSandbox() {
  return mkdtempSync(join(tmpdir(), 'cmk-comp-test-'));
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

const RULE_HEADER = '- **Composition verification — when two components have independent budgets / contracts, check the composition.**';

describe('validate-composition', () => {
  let sandbox;
  beforeEach(() => {
    sandbox = makeSandbox();
  });
  afterEach(() => {
    rmSync(sandbox, { recursive: true, force: true });
  });

  it('FAILS when CLAUDE.md is missing', () => {
    const r = runValidator(sandbox);
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toMatch(/CLAUDE\.md not found/);
  });

  it('FAILS when CLAUDE.md has no Composition verification rule', () => {
    writeFileSync(join(sandbox, 'CLAUDE.md'), '# Project\n\n- Some other rule.\n');
    const r = runValidator(sandbox);
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toMatch(/could not locate "Composition verification" rule/);
  });

  it('passes when all instances have addressing artifacts', () => {
    const content = [
      '# Project',
      '',
      RULE_HEADER + ' Instances: PR-X (broke X — addressed by tests/x.test.js + design §1.1), PR-Y (broke Y — addressed by tests/y.test.js + design §2.2).',
      '',
      '- Some other rule.',
      '',
      '## Section',
    ].join('\n');
    writeFileSync(join(sandbox, 'CLAUDE.md'), content);
    const r = runValidator(sandbox);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toMatch(/2 composition instance/);
  });

  it('FAILS when an instance lacks any addressing artifact', () => {
    const content = [
      '# Project',
      '',
      RULE_HEADER + ' Instances: PR-X (broke X — addressed by tests/x.test.js), PR-Z (broke Z — TBD).',
      '',
      '## Section',
    ].join('\n');
    writeFileSync(join(sandbox, 'CLAUDE.md'), content);
    const r = runValidator(sandbox);
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toMatch(/composition instance PR-Z/);
  });

  it('accepts a "reserved" / "v0.1.x" marker as a valid addressing artifact', () => {
    const content = [
      '# Project',
      '',
      RULE_HEADER + ' Instances: PR-X (broke X — addressed by tests/x.test.js), PR-Future (will break Y — reserved v0.1.x).',
      '',
      '## Section',
    ].join('\n');
    writeFileSync(join(sandbox, 'CLAUDE.md'), content);
    const r = runValidator(sandbox);
    expect(r.exitCode).toBe(0);
  });

  it('handles intermediate prose between PR-id and the inline parens', () => {
    // e.g., "PR-A of the post-PR-31 audit campaign (description)"
    const content = [
      '# Project',
      '',
      RULE_HEADER + ' PR-A of the campaign (broke A — addressed by tests/a.test.js).',
      '',
      '## Section',
    ].join('\n');
    writeFileSync(join(sandbox, 'CLAUDE.md'), content);
    const r = runValidator(sandbox);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toMatch(/1 composition instance/);
  });

  it('does NOT bind a parens-less PR-id to a sibling PR-id\'s parens (D2a IMP-1 guard)', () => {
    // Pre-fix this regex would have matched PR-X with PR-Y's parens,
    // falsely attributing "broke Y" to PR-X and missing PR-Y entirely.
    // The 80-char cap + (?!PR-) negative-lookahead prevents that.
    const content = [
      '# Project',
      '',
      RULE_HEADER + ' Note: PR-X is similar in pattern to PR-Y (broke Y — addressed by tests/y.test.js).',
      '',
      '## Section',
    ].join('\n');
    writeFileSync(join(sandbox, 'CLAUDE.md'), content);
    const r = runValidator(sandbox);
    // Result: PR-X is NOT matched as an instance (no parens after it),
    // PR-Y IS matched correctly. So we should see exactly 1 instance.
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toMatch(/1 composition instance/);
  });
});
