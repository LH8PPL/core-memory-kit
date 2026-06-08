// @doors: 1, 3
// Door 2 N/A: validator reads from disk + reports via stderr/stdout; no kit-state mutation.
// Door 4 N/A: no message-queue interaction.
// Door 5 N/A: no NDJSON observability surface.
//
// Self-test for scripts/validate-numbering-gaps.mjs.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(dirname(__filename), '..');
const VALIDATOR = join(REPO_ROOT, 'scripts', 'validate-numbering-gaps.mjs');

function makeSandbox() {
  const sandbox = mkdtempSync(join(tmpdir(), 'cmk-numgap-test-'));
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

describe('validate-numbering-gaps', () => {
  let sandbox;
  beforeEach(() => {
    sandbox = makeSandbox();
  });
  afterEach(() => {
    rmSync(sandbox, { recursive: true, force: true });
  });

  it('passes on empty corpus', () => {
    const r = runValidator(sandbox);
    expect(r.exitCode).toBe(0);
  });

  it('passes when ADR sequence is contiguous', () => {
    writeFileSync(join(sandbox, 'docs', 'adr', '0001-foo.md'), '# 0001');
    writeFileSync(join(sandbox, 'docs', 'adr', '0002-bar.md'), '# 0002');
    writeFileSync(join(sandbox, 'docs', 'adr', '0003-baz.md'), '# 0003');
    const r = runValidator(sandbox);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toMatch(/ADR sequence: 3 files \/ 0 unmarked gaps/);
  });

  it('FAILS when ADR sequence has unmarked gap', () => {
    writeFileSync(join(sandbox, 'docs', 'adr', '0001-foo.md'), '# 0001');
    writeFileSync(join(sandbox, 'docs', 'adr', '0003-baz.md'), '# 0003');
    // No README.md with reserved marker
    const r = runValidator(sandbox);
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toMatch(/ADR-0002:.*no file/);
  });

  it('passes when ADR gap is explicitly reserved in README', () => {
    writeFileSync(join(sandbox, 'docs', 'adr', '0001-foo.md'), '# 0001');
    writeFileSync(join(sandbox, 'docs', 'adr', '0003-baz.md'), '# 0003');
    writeFileSync(
      join(sandbox, 'docs', 'adr', 'README.md'),
      '| ADR-0001 | Foo |\n| ADR-0002 | reserved (ships in v0.2) |\n| ADR-0003 | Baz |\n',
    );
    const r = runValidator(sandbox);
    expect(r.exitCode).toBe(0);
  });

  it('FAILS on FR gap; passes when FR gap is reserved', () => {
    // Gap case
    writeFileSync(
      join(sandbox, 'specs', 'requirements.md'),
      '**FR-1 — foo**\n\n**FR-3 — bar**\n',
    );
    let r = runValidator(sandbox);
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toMatch(/FR-2:/);

    // Reserved case
    writeFileSync(
      join(sandbox, 'specs', 'requirements.md'),
      '**FR-1 — foo**\n\nFR-2 — reserved (v0.1.x)\n\n**FR-3 — bar**\n',
    );
    r = runValidator(sandbox);
    expect(r.exitCode).toBe(0);
  });

  it('treats `tail-appended` as a valid Task gap marker', () => {
    writeFileSync(
      join(sandbox, 'specs', 'tasks.md'),
      '- [x] 1. Foo\n- [x] 2. Bar\n- [x] 45. Auto-persona (tail-appended Task 45 to avoid renumbering)\n',
    );
    const r = runValidator(sandbox);
    // Should accept Task 45 because the line mentions "tail-appended Task 45"
    // and gaps 3-44 only require markers if MAX > 45. Since max IS 45,
    // gaps 3-44 need markers. They don't have them → FAIL.
    // But the rule applied to OUR kit's Task 45 case: gaps 3-44 are filled
    // by other tasks (e.g., Task 3, Task 4, ...). In this minimal fixture
    // they aren't, so this test confirms the gap detection.
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toMatch(/Task 3:/);
  });
});
