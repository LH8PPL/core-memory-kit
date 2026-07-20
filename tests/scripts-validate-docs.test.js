// @doors: 1, 3
// Door 2 N/A: validator reads markdown + reports via stdout/stderr; no kit-state mutation.
// Door 4 N/A: no message-queue interaction.
// Door 5 N/A: no NDJSON observability surface.
//
// Task 186 (D-249 structural graduation) — the ONE manifest-driven doc
// validator. The 4 legacy validators (doc-registry, references,
// index-completeness, doc-completeness) are FAMILIES of scripts/validate-docs.mjs,
// driven by docs/DOCUMENTATION-MAP.md as the single manifest input.
// Family-level behavior locks live in the four scripts-validate-* sibling
// test files (repointed at the consolidated entry); THIS file pins the
// consolidation contract itself:
//   - one entry runs all families on the real repo
//   - `--only <family>` selects families (what fixture tests rely on)
//   - the NEW manifest direction: a registered-but-missing doc FAILS (stale
//     registry entry — the both-directions discipline the old registry
//     validator lacked)
//   - record zones are never policed (living-vs-record classification)
//   - the legacy `validate-references: ignore` suppression marker still works

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(dirname(__filename), '..');
const VALIDATOR = join(REPO_ROOT, 'scripts', 'validate-docs.mjs');

function makeSandbox() {
  const sandbox = mkdtempSync(join(tmpdir(), 'cmk-vdocs-test-'));
  mkdirSync(join(sandbox, 'docs', 'journey'), { recursive: true });
  mkdirSync(join(sandbox, 'specs'), { recursive: true });
  return sandbox;
}

function writeMap(sandbox, registryBody) {
  // The map is itself a high-risk doc — it self-registers (same contract as
  // the legacy registry validator's fixtures).
  writeFileSync(
    join(sandbox, 'docs', 'DOCUMENTATION-MAP.md'),
    `# DOCUMENTATION-MAP\n\n## Registry\n\n${registryBody}\n\`docs/DOCUMENTATION-MAP.md\`\n`,
  );
}

function run(sandbox, args = []) {
  const r = spawnSync(process.execPath, [VALIDATOR, ...args], {
    cwd: sandbox ?? REPO_ROOT,
    encoding: 'utf8',
    windowsHide: true,
    env: sandbox
      ? { ...process.env, CMK_VALIDATOR_ROOT: sandbox }
      : { ...process.env },
  });
  return { exitCode: r.status, stdout: r.stdout, stderr: r.stderr };
}

describe('validate-docs — the consolidation contract (Task 186)', () => {
  let sandbox;
  beforeEach(() => {
    sandbox = makeSandbox();
  });
  afterEach(() => {
    rmSync(sandbox, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  });

  it('--only registry: a registered-but-MISSING doc fails (the new stale-entry direction)', () => {
    writeMap(sandbox, '`specs/ghost.md`\n');
    const r = run(sandbox, ['--only', 'registry']);
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toMatch(/specs\/ghost\.md/);
    expect(r.stderr).toMatch(/does not exist|stale/i);
  });

  it('--only registry: registered + existing docs pass both directions', () => {
    writeFileSync(join(sandbox, 'specs', 'real.md'), '# real\n');
    writeMap(sandbox, '`specs/real.md`\n');
    const r = run(sandbox, ['--only', 'registry']);
    expect(r.exitCode).toBe(0);
  });

  it('record zones are never policed: an unregistered docs/research note does not fail the registry', () => {
    mkdirSync(join(sandbox, 'docs', 'research'), { recursive: true });
    writeFileSync(join(sandbox, 'docs', 'research', 'note.md'), '# a dated note\n');
    writeMap(sandbox, '(no files)\n');
    const r = run(sandbox, ['--only', 'registry']);
    expect(r.exitCode).toBe(0);
  });

  it('--only selects families: a fixture with a broken reference passes when only registry runs', () => {
    writeFileSync(join(sandbox, 'specs', 'broken.md'), 'See [x](missing-target.md).\n');
    writeMap(sandbox, '`specs/broken.md`\n');
    expect(run(sandbox, ['--only', 'registry']).exitCode).toBe(0);
    const refs = run(sandbox, ['--only', 'references']);
    expect(refs.exitCode).toBe(1);
    expect(refs.stderr).toMatch(/broken link target: missing-target\.md/);
  });

  it('the LEGACY suppression marker (validate-references: ignore) still suppresses', () => {
    writeMap(sandbox, '`specs/legacy.md`\n');
    writeFileSync(
      join(sandbox, 'specs', 'legacy.md'),
      'A reserved ref ADR-9999 <!-- validate-references: ignore -->\n',
    );
    const r = run(sandbox, ['--only', 'references,registry']);
    expect(r.exitCode).toBe(0);
  });

  it('the new marker (validate-docs: ignore) suppresses too', () => {
    writeMap(sandbox, '`specs/newmark.md`\n');
    writeFileSync(
      join(sandbox, 'specs', 'newmark.md'),
      'A reserved ref ADR-9999 <!-- validate-docs: ignore -->\n',
    );
    const r = run(sandbox, ['--only', 'references,registry']);
    expect(r.exitCode).toBe(0);
  });

  it('an unknown family name is an explicit error, not a silent no-op', () => {
    const r = run(sandbox, ['--only', 'nonsense']);
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toMatch(/unknown family/i);
  });

  it('the real repo passes ALL families through the single entry (Door 3)', () => {
    const r = run(null);
    expect(r.exitCode, `validate-docs failed on the repo:\n${r.stderr}`).toBe(0);
    // One consolidated OK line naming every family's summary.
    expect(r.stdout).toMatch(/validate-docs: OK/);
    expect(r.stdout).toMatch(/registered/);
    expect(r.stdout).toMatch(/markdown files scanned/);
    expect(r.stdout).toMatch(/catalog index/);
    expect(r.stdout).toMatch(/CLI verbs documented/);
  });
});
