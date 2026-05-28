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
import { install } from '../packages/cli/src/install.mjs';

let sandbox;
let projectRoot;
let userDir;
let fakeHomeAnthropicMemoryDir;

async function makeFixture() {
  sandbox = mkdtempSync(join(tmpdir(), 'cmk-import-test-'));
  projectRoot = join(sandbox, 'proj');
  userDir = join(sandbox, 'user');
  await install({ projectRoot, userTier: userDir });
  // Seed the Anthropic memory file at the real homedir-derived path.
  // The module computes path via homedir() — we can't intercept; the
  // existing implementation uses homedir() at call time. We seed the
  // path the module computes for THIS project's slug.
  const path = anthropicMemoryPath(projectRoot);
  fakeHomeAnthropicMemoryDir = path.replace(/\/MEMORY\.md$/, '').replace(/\\MEMORY\.md$/, '');
}

function seedAnthropicMemory(bullets) {
  mkdirSync(fakeHomeAnthropicMemoryDir, { recursive: true });
  const text = '# Memory\n\n' + bullets.map((b) => `- ${b}`).join('\n') + '\n';
  writeFileSync(join(fakeHomeAnthropicMemoryDir, 'MEMORY.md'), text, 'utf8');
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
  if (fakeHomeAnthropicMemoryDir && existsSync(fakeHomeAnthropicMemoryDir)) {
    rmSync(fakeHomeAnthropicMemoryDir, { recursive: true, force: true });
  }
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
      const r = await importAnthropicMemory({ projectRoot });
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

      const r = await importAnthropicMemory({ projectRoot, dryRun: true });
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
      const r = await importAnthropicMemory({ projectRoot, acceptAll: true });
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
      const r = await importAnthropicMemory({ projectRoot, acceptAll: true });
      expect(r.action).toBe('completed');
      expect(r.skipped).toBe(1); // "shared decision" canonicalize-matches "Shared decision"
      expect(r.accepted).toBe(1); // only "unique new fact" applied

      // Audit log has the skipped: duplicate entry
      const auditLog = join(projectRoot, 'context', '.locks', 'audit.log');
      expect(existsSync(auditLog)).toBe(true);
      const entries = readFileSync(auditLog, 'utf8')
        .trim()
        .split('\n')
        .map((l) => JSON.parse(l));
      const dupEntry = entries.find((e) => e.reason === 'import-skipped-duplicate');
      expect(dupEntry).toBeTruthy();
      expect(dupEntry.source).toBe('import-anthropic-memory');
    });
  });

  describe('default mode (no flags) requires explicit --yes confirmation', () => {
    it('returns requires-confirmation when proposals exist but neither dryRun nor acceptAll is set', async () => {
      seedAnthropicMemory(['fact A']);
      const r = await importAnthropicMemory({ projectRoot });
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
