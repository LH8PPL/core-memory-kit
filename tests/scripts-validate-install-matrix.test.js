// @doors: 1, 2
// Door 3 N/A: test parses the workflow yaml as text — no subprocess spawn.
// Door 4 N/A: no NDJSON observability surface.
// Door 5 N/A: no message-queue.

// Tests for Task 40 — install-matrix CI workflow shape.
// Per tasks.md 40.5: assert the workflow file is structurally correct
// before relying on it as the v0.1.0 cross-OS acceptance gate.

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import yaml from 'js-yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = join(__dirname, '..');
const workflowPath = join(repoRoot, '.github', 'workflows', 'install-matrix.yml');
const checksumScriptPath = join(repoRoot, 'scripts', 'install-matrix-checksum.mjs');
const compareScriptPath = join(repoRoot, 'scripts', 'install-matrix-compare.mjs');

describe('Task 40 — install-matrix workflow shape', () => {
  it('workflow file exists at .github/workflows/install-matrix.yml', () => {
    expect(existsSync(workflowPath)).toBe(true);
  });

  it('helper scripts exist', () => {
    expect(existsSync(checksumScriptPath)).toBe(true);
    expect(existsSync(compareScriptPath)).toBe(true);
  });

  describe('YAML parses + structural shape', () => {
    let doc;
    it('parses as valid YAML', () => {
      const text = readFileSync(workflowPath, 'utf8');
      doc = yaml.load(text);
      expect(doc).toBeTruthy();
      expect(typeof doc).toBe('object');
    });

    it('has a name', () => {
      doc = yaml.load(readFileSync(workflowPath, 'utf8'));
      expect(typeof doc.name).toBe('string');
      expect(doc.name.length).toBeGreaterThan(0);
    });

    it('triggers on pull_request + push to main', () => {
      doc = yaml.load(readFileSync(workflowPath, 'utf8'));
      // js-yaml parses bare `on:` as a key; the key gets normalized
      // depending on schema. Accept either { on: {pull_request: ...} } or
      // the truthy-key normalized version.
      const onKey = doc.on ?? doc[true] ?? doc.true;
      expect(onKey).toBeTruthy();
      expect(onKey.pull_request).toBeTruthy();
      expect(onKey.push).toBeTruthy();
      expect(onKey.push.branches).toContain('main');
    });

    it('install-and-doctor job runs the full 3-OS matrix', () => {
      doc = yaml.load(readFileSync(workflowPath, 'utf8'));
      const job = doc.jobs?.['install-and-doctor'];
      expect(job).toBeTruthy();
      expect(job.strategy?.matrix?.os).toEqual(
        expect.arrayContaining(['ubuntu-22.04', 'macos-14', 'windows-2022']),
      );
    });

    it('install-and-doctor has checkout + node-20 + install + doctor + upload-artifact steps', () => {
      doc = yaml.load(readFileSync(workflowPath, 'utf8'));
      const steps = doc.jobs['install-and-doctor'].steps;
      const usesActions = steps.map((s) => s.uses || '').filter(Boolean);
      const runCommands = steps.map((s) => s.run || '').filter(Boolean);

      expect(usesActions.some((u) => u.startsWith('actions/checkout@'))).toBe(true);
      expect(usesActions.some((u) => u.startsWith('actions/setup-node@'))).toBe(true);
      expect(usesActions.some((u) => u.startsWith('actions/upload-artifact@'))).toBe(true);

      // Must reference cmk install + cmk doctor + the checksum script
      const allCommands = runCommands.join('\n');
      expect(allCommands).toMatch(/cmk\.mjs install/);
      expect(allCommands).toMatch(/cmk\.mjs doctor/);
      expect(allCommands).toMatch(/install-matrix-checksum\.mjs/);
    });

    it('checksum-compare job depends on install-and-doctor + compares artifacts', () => {
      doc = yaml.load(readFileSync(workflowPath, 'utf8'));
      const compare = doc.jobs?.['checksum-compare'];
      expect(compare).toBeTruthy();
      expect(compare.needs).toBe('install-and-doctor');
      const runCommands = compare.steps.map((s) => s.run || '').join('\n');
      expect(runCommands).toMatch(/install-matrix-compare\.mjs/);
    });

    it('failure modes per 40.4: missing artifact OR sha mismatch exits non-zero (text check)', () => {
      const compareText = readFileSync(compareScriptPath, 'utf8');
      expect(compareText).toMatch(/process\.exit\(1\)/);
      expect(compareText).toMatch(/MISMATCH/);
    });
  });
});
