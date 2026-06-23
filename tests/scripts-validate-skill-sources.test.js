// @doors: 1, 2
// Door 1 (response): the validator's exit code (0 pass / non-zero fail).
// Door 2 (state): N/A beyond the fixture it reads — the validator writes nothing.
// Door 3 N/A: invoked as a subprocess BY the test, but the unit under test does
//   no spawning itself.
// Door 4 N/A: no NDJSON/log surface.
// Door 5 N/A: no message-queue.

// validate-skill-sources.mjs — the canonical-skill guard. This test pins the
// D-194-adjacent finding (the cut-gate-kiro 7th cut-blocker): a SKILL.md
// `description` containing an unquoted `: ` (colon-space) is INVALID YAML — a
// strict parser reads a new mapping key and rejects the frontmatter. Claude Code
// tolerated it (lenient read), Kiro validates strictly and rejected the file.
// The validator must STRICT-PARSE the frontmatter YAML so this class can't ship.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const VALIDATOR = join(REPO, 'scripts', 'validate-skill-sources.mjs');
const REAL_SKILLS = join(REPO, 'template', '.claude', 'skills');
const REAL_PLUGIN_SKILLS = join(REPO, 'plugin', 'skills');

let sandbox;

beforeEach(() => {
  sandbox = mkdtempSync(join(tmpdir(), 'cmk-skill-src-'));
});
afterEach(() => {
  rmSync(sandbox, { recursive: true, force: true });
});

// Build a fixture repo tree the validator can run against: copy the REAL
// canonical + plugin skills (so the byte-identical drift guard passes), then let
// callers mutate one file.
function fixtureRepo() {
  const root = join(sandbox, 'repo');
  cpSync(REAL_SKILLS, join(root, 'template', '.claude', 'skills'), { recursive: true });
  cpSync(REAL_PLUGIN_SKILLS, join(root, 'plugin', 'skills'), { recursive: true });
  return root;
}

function runValidator(root) {
  try {
    execFileSync('node', [VALIDATOR, root], { encoding: 'utf8', stdio: 'pipe' });
    return { code: 0, output: '' };
  } catch (err) {
    return { code: err.status ?? 1, output: `${err.stdout || ''}${err.stderr || ''}` };
  }
}

describe('validate-skill-sources — strict YAML frontmatter', () => {
  it('passes on the real canonical skills (they are valid YAML)', () => {
    const r = runValidator(fixtureRepo());
    expect(r.code).toBe(0);
  });

  it('FAILS when a SKILL.md description has an unquoted colon-space (invalid YAML) — the Kiro reject class', () => {
    const root = fixtureRepo();
    // A description with a bare `: ` inside it — exactly the memory-write bug
    // ("update memory: X is now Y"). Valid-looking to a naive line parser,
    // invalid to a strict YAML parser (and to Kiro).
    const broken = [
      '---',
      'name: memory-search',
      'description: Searches memory. Use when correcting a fact: change X to Y, or removing one.',
      'allowed-tools: Read, Grep',
      '---',
      '',
      '# body',
      '',
    ].join('\n');
    writeFileSync(join(root, 'template', '.claude', 'skills', 'memory-search', 'SKILL.md'), broken, 'utf8');

    const r = runValidator(root);
    expect(r.code).not.toBe(0);
    // the error names the YAML problem + the file
    expect(r.output).toMatch(/memory-search/);
    expect(r.output.toLowerCase()).toMatch(/yaml|frontmatter|parse/);
  });

  it('still passes a description that uses a colon WITHOUT a space (URLs, ratios — valid YAML scalar)', () => {
    // A colon with no following space does NOT start a mapping key, so this is
    // valid YAML and must NOT be falsely rejected (guard against over-strictness).
    // Write the SAME content to canonical + plugin so the drift guard is
    // satisfied and ONLY the valid-YAML aspect is under test.
    const root = fixtureRepo();
    const ok = [
      '---',
      'name: memory-search',
      'description: Searches memory at https://example.com and ratio 3:1 contexts.',
      'allowed-tools: Read, Grep',
      '---',
      '',
      '# body',
      '',
    ].join('\n');
    writeFileSync(join(root, 'template', '.claude', 'skills', 'memory-search', 'SKILL.md'), ok, 'utf8');
    writeFileSync(join(root, 'plugin', 'skills', 'memory-search', 'SKILL.md'), ok, 'utf8');

    const r = runValidator(root);
    expect(r.code).toBe(0);
  });
});
