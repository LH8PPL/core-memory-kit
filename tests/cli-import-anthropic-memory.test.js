// @doors: 1, 2, 5
// Door 3 N/A: importAnthropicMemory is pure-file-IO; no subprocess.
// Door 4 N/A: no message-queue.

// Tests for Task 38a — cmk import-anthropic-memory.
// Per tasks.md 38.5 (4 cases):
//   1. --dry-run prints proposals; no file in context/ modified (mtime check)
//   2. no-dry-run with --yes: every proposal applied with write_source: imported, trust: medium
//   3. duplicate detection: candidate with matching canonical ID skipped; audit.log has skipped: duplicate
//   4. missing source file: exit 0 cleanly with "no Anthropic auto-memory found"

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  importAnthropicMemory,
  anthropicSlugFor,
  anthropicMemoryPath,
} from '../packages/cli/src/import-anthropic-memory.mjs';
import { readAuditLog } from '../packages/cli/src/audit-log.mjs';
import { install } from '../packages/cli/src/install.mjs';
import { runImportAnthropicMemory } from '../packages/cli/src/subcommands.mjs';

let sandbox;
let projectRoot;
let userDir;
let fakeHarnessRoot; // B2 fix: contains the sandbox's ~/.claude/projects/ analog

async function makeFixture() {
  sandbox = mkdtempSync(join(tmpdir(), 'cmk-import-test-'));
  projectRoot = join(sandbox, 'proj');
  userDir = join(sandbox, 'user');
  fakeHarnessRoot = join(sandbox, 'fake-harness', 'projects');
  await install({ projectRoot, userTier: userDir });
}

function seedAnthropicMemory(bullets) {
  // B2 fix (skill-review 2026-05-28): write into the sandbox-contained
  // harness root, NOT the user's real ~/.claude/projects/.
  const memoryDir = join(fakeHarnessRoot, anthropicSlugFor(projectRoot), 'memory');
  mkdirSync(memoryDir, { recursive: true });
  const text = '# Memory\n\n' + bullets.map((b) => `- ${b}`).join('\n') + '\n';
  writeFileSync(join(memoryDir, 'MEMORY.md'), text, 'utf8');
}

function seedTargetMemory(bullets) {
  const targetPath = join(projectRoot, 'context', 'MEMORY.md');
  mkdirSync(join(projectRoot, 'context'), { recursive: true });
  const text = '# Project memory\n\n' + bullets.map((b) => `- ${b}`).join('\n') + '\n';
  writeFileSync(targetPath, text, 'utf8');
}

beforeEach(async () => {
  await makeFixture();
});

afterEach(() => {
  rmSync(sandbox, { recursive: true, force: true });
  // B2 fix: no real ~/.claude/projects/ pollution to clean up
});

describe('Task 38a — importAnthropicMemory', () => {
  describe('Validation (Door 1)', () => {
    it('rejects missing projectRoot', async () => {
      const r = await importAnthropicMemory({});
      expect(r.action).toBe('error');
      expect(r.errorCategory).toBe('missing_project_root');
    });
  });

  describe('38.5 #4 — missing source → exit cleanly', () => {
    it('returns completed with reason:no-source when ~/.claude/projects/<slug>/memory/MEMORY.md missing', async () => {
      const r = await importAnthropicMemory({ projectRoot, harnessRoot: fakeHarnessRoot });
      expect(r.action).toBe('completed');
      expect(r.reason).toBe('no-source');
      expect(r.accepted).toBe(0);
      expect(r.proposals).toEqual([]);
    });
  });

  describe('38.5 #1 — --dry-run prints proposals; no file modified', () => {
    it('proposes bullets without modifying context/MEMORY.md', async () => {
      seedTargetMemory(['existing fact A']);
      seedAnthropicMemory(['new fact X', 'new fact Y']);
      const targetPath = join(projectRoot, 'context', 'MEMORY.md');
      const targetMtimeBefore = statSync(targetPath).mtimeMs;

      // Tiny wait so mtime would visibly change if anything wrote
      await new Promise((resolve) => setTimeout(resolve, 20));

      const r = await importAnthropicMemory({ projectRoot, harnessRoot: fakeHarnessRoot, dryRun: true });
      expect(r.action).toBe('completed');
      expect(r.mode).toBe('dry-run');
      expect(r.proposals.length).toBe(2);
      expect(r.proposals.map((p) => p.text)).toEqual(
        expect.arrayContaining(['new fact X', 'new fact Y']),
      );
      // State (Door 2): target file untouched
      expect(statSync(targetPath).mtimeMs).toBe(targetMtimeBefore);
    });
  });

  describe('38.5 #2 — --yes applies every proposal', () => {
    it('appends bullets to context/MEMORY.md with imported provenance comment', async () => {
      seedTargetMemory(['existing']);
      seedAnthropicMemory(['imported A', 'imported B']);
      const r = await importAnthropicMemory({ projectRoot, harnessRoot: fakeHarnessRoot, acceptAll: true });
      expect(r.action).toBe('completed');
      expect(r.mode).toBe('apply');
      expect(r.accepted).toBe(2);

      const memText = readFileSync(join(projectRoot, 'context', 'MEMORY.md'), 'utf8');
      expect(memText).toContain('imported A');
      expect(memText).toContain('imported B');
      expect(memText).toMatch(/write_source: imported/);
      expect(memText).toMatch(/trust: medium/);
      expect(memText).toMatch(/source: anthropic-auto-memory/);
    });
  });

  describe('38.5 #3 — duplicate detection skips bullets canonicalize-equal to existing', () => {
    it('canonicalize-equal candidates are skipped + counted', async () => {
      seedTargetMemory(['Shared decision']);
      seedAnthropicMemory(['shared decision', 'unique new fact']);
      const r = await importAnthropicMemory({ projectRoot, harnessRoot: fakeHarnessRoot, acceptAll: true });
      expect(r.action).toBe('completed');
      expect(r.skipped).toBe(1); // "shared decision" canonicalize-matches "Shared decision"
      expect(r.accepted).toBe(1); // only "unique new fact" applied

      // B1 fix: audit log entries land via appendAuditEntry (canonical
      // schema). Verify via readAuditLog so the test pins the shape we
      // actually parse downstream — not raw JSON parsing that masks
      // schema drift.
      const entries = readAuditLog(join(projectRoot, 'context'));
      const dupEntry = entries.find(
        (e) => e.reasonCode === 'import-skipped-duplicate',
      );
      expect(dupEntry).toBeTruthy();
      expect(dupEntry.schema).toBe(1);
      expect(dupEntry.action).toBe('import');
      expect(dupEntry.tier).toBe('P');
      expect(dupEntry.id).toMatch(/^P-[A-Za-z2-9]{8}$/);
      expect(dupEntry.extra?.source).toBe('anthropic-auto-memory');

      // Apply path should have an IMPORT_APPLIED entry for the unique fact
      const appliedEntry = entries.find(
        (e) => e.reasonCode === 'import-applied',
      );
      expect(appliedEntry).toBeTruthy();
      expect(appliedEntry.extra?.trust).toBe('medium');
      expect(appliedEntry.extra?.write_source).toBe('imported');
    });
  });

  describe('default mode (no flags) requires explicit --yes confirmation', () => {
    it('returns requires-confirmation when proposals exist but neither dryRun nor acceptAll is set', async () => {
      seedAnthropicMemory(['fact A']);
      const r = await importAnthropicMemory({ projectRoot, harnessRoot: fakeHarnessRoot });
      expect(r.action).toBe('completed');
      expect(r.mode).toBe('requires-confirmation');
      expect(r.accepted).toBe(0);
      expect(r.proposals.length).toBe(1);
    });
  });

  describe('anthropicSlugFor helper', () => {
    it('replaces non-alphanumerics with hyphens', () => {
      expect(anthropicSlugFor('/Users/foo/Projects/my-app')).toBe('-Users-foo-Projects-my-app');
      expect(anthropicSlugFor('C:\\Projects\\my-app')).toBe('C--Projects-my-app');
    });
  });
});

// Task 114 (F-13): the cut-gate sweep only ran `cmk import-anthropic-memory
// --dry-run` with native memory OFF (nothing to import) — the CLI wrapper's real
// APPLY path was never exercised. The core (importAnthropicMemory) is covered
// above; this drives the wrapper (runImportAnthropicMemory, now dep-injectable)
// on a real seeded native MEMORY.md.
describe('Task 114 (F-13) — runImportAnthropicMemory CLI wrapper on real input', () => {
  it('applied: imports real native bullets end-to-end (--yes), write_source/trust correct', async () => {
    seedAnthropicMemory(['we migrated the build to Vite', 'the team prefers conventional-commits']);
    const out = [];
    const r = await runImportAnthropicMemory({ projectRoot, harnessRoot: fakeHarnessRoot, yes: true, log: (m) => out.push(String(m)), logError: (m) => out.push(String(m)) });
    expect(r.accepted).toBe(2);
    expect(out.join('\n')).toContain('applied 2 proposal');
    const mem = readFileSync(join(projectRoot, 'context', 'MEMORY.md'), 'utf8');
    expect(mem).toContain('Vite');
    expect(mem).toMatch(/write_source: imported/);
    expect(mem).toMatch(/trust: medium/);
  });
  it('no-source: reports cleanly when no native memory is present', async () => {
    const out = [];
    const r = await runImportAnthropicMemory({ projectRoot, harnessRoot: fakeHarnessRoot, log: (m) => out.push(String(m)), logError: () => {} });
    expect(r.reason).toBe('no-source');
    expect(out.join('\n')).toContain('no Anthropic auto-memory found');
  });
  it('dry-run: proposes without applying', async () => {
    seedAnthropicMemory(['a dry candidate']);
    const out = [];
    const r = await runImportAnthropicMemory({ projectRoot, harnessRoot: fakeHarnessRoot, dryRun: true, log: (m) => out.push(String(m)), logError: () => {} });
    expect(r.mode).toBe('dry-run');
    expect(out.join('\n')).toContain('dry-run');
  });
  it('requires-confirmation: lists proposals when neither --yes nor --dry-run', async () => {
    seedAnthropicMemory(['a confirm candidate']);
    const out = [];
    const r = await runImportAnthropicMemory({ projectRoot, harnessRoot: fakeHarnessRoot, log: (m) => out.push(String(m)), logError: () => {} });
    expect(r.mode).toBe('requires-confirmation');
    expect(out.join('\n')).toContain('Re-run with --yes');
  });
});

describe('Task 114 — runImportAnthropicMemory error handling (importFn seam)', () => {
  afterEach(() => { process.exitCode = 0; });
  it('error: reports + sets exit code when the core returns an error', async () => {
    const errs = [];
    const r = await runImportAnthropicMemory({ projectRoot, log: () => {}, logError: (m) => errs.push(String(m)), importFn: async () => ({ action: 'error', errors: ['boom'] }) });
    expect(r.action).toBe('error');
    expect(errs.join('\n')).toContain('boom');
  });
  it('catch: reports an unexpected throw + sets exit code', async () => {
    const errs = [];
    await runImportAnthropicMemory({ projectRoot, log: () => {}, logError: (m) => errs.push(String(m)), importFn: async () => { throw new Error('kaboom'); } });
    expect(errs.join('\n')).toContain('kaboom');
  });
});
