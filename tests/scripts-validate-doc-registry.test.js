// @doors: 1, 3
// Door 2 N/A: validator reads from disk + reports via stderr/stdout; no kit-state mutation.
// Door 4 N/A: no message-queue / NDJSON observability surface.
// Door 5 N/A: no message queue.
//
// Self-test for scripts/validate-doc-registry.mjs — the documentation
// governance harness. The contract: every markdown file in a high-risk
// zone (repo-root *.md, specs/, docs/ top level, docs/journey/) must be
// registered in docs/DOCUMENTATION-MAP.md; bulk history dirs are not.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(dirname(__filename), '..');
const VALIDATOR = join(REPO_ROOT, 'scripts', 'validate-doc-registry.mjs');

function makeSandbox() {
  const sandbox = mkdtempSync(join(tmpdir(), 'cmk-docreg-test-'));
  mkdirSync(join(sandbox, 'docs', 'journey'), { recursive: true });
  mkdirSync(join(sandbox, 'specs', 'v0.1.0'), { recursive: true });
  return sandbox;
}

function writeMap(sandbox, registryBody) {
  writeFileSync(
    join(sandbox, 'docs', 'DOCUMENTATION-MAP.md'),
    `# DOCUMENTATION-MAP\n\n## Registry\n\n${registryBody}\n`,
  );
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

describe('validate-doc-registry', () => {
  let sandbox;
  beforeEach(() => {
    sandbox = makeSandbox();
  });
  afterEach(() => {
    rmSync(sandbox, { recursive: true, force: true });
  });

  it('FAILS when the map itself is missing', () => {
    // No DOCUMENTATION-MAP.md written.
    writeFileSync(join(sandbox, 'README.md'), '# readme');
    const r = runValidator(sandbox);
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toMatch(/DOCUMENTATION-MAP\.md is missing/);
  });

  it('passes when every high-risk file is registered', () => {
    writeFileSync(join(sandbox, 'README.md'), '# readme');
    writeFileSync(join(sandbox, 'specs', 'v0.1.0', 'tasks.md'), '# tasks');
    writeFileSync(join(sandbox, 'docs', 'journey', 'DECISION-LOG.md'), '# log');
    // Registry must also self-register the map (docs/DOCUMENTATION-MAP.md).
    writeMap(
      sandbox,
      'README.md · specs/tasks.md · docs/journey/DECISION-LOG.md · docs/DOCUMENTATION-MAP.md',
    );
    const r = runValidator(sandbox);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toMatch(/all registered/);
  });

  it('FAILS when a new rogue surface appears in docs/journey/ unregistered', () => {
    writeFileSync(join(sandbox, 'docs', 'journey', 'DECISION-LOG.md'), '# log');
    writeFileSync(join(sandbox, 'docs', 'journey', 'PHASE-4-PLAN.md'), '# rogue plan');
    writeMap(sandbox, 'docs/journey/DECISION-LOG.md · docs/DOCUMENTATION-MAP.md');
    const r = runValidator(sandbox);
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toMatch(/docs\/journey\/PHASE-4-PLAN\.md/);
    expect(r.stderr).toMatch(/unregistered doc surface/);
  });

  it('FAILS when a new rogue surface appears at repo root unregistered', () => {
    writeFileSync(join(sandbox, 'ROADMAP.md'), '# rogue roadmap');
    writeMap(sandbox, 'docs/DOCUMENTATION-MAP.md');
    const r = runValidator(sandbox);
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toMatch(/ROADMAP\.md/);
  });

  it('does NOT require bulk history-dir files (docs/research) to be registered', () => {
    mkdirSync(join(sandbox, 'docs', 'research'), { recursive: true });
    writeFileSync(join(sandbox, 'docs', 'research', '2026-06-01-some-note.md'), '# note');
    // Map registers no research file, only itself.
    writeMap(sandbox, 'docs/DOCUMENTATION-MAP.md');
    const r = runValidator(sandbox);
    expect(r.exitCode).toBe(0);
  });
});
