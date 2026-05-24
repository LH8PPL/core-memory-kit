// Tests for Task 14 — Seed scratchpad templates (T-012).
// Per tasks.md 14.4:
//   - Test cmk install produces every required project-tier file
//   - Test cmk init-user-tier with MEMORY_KIT_USER_DIR=/tmp/xxx puts
//     user-tier files at /tmp/xxx/
//   - Test each seed's first ~chars contain header markers
//     (Cap:, Last distilled:, Last health check:)
//   - Test each seed contains its three documented section headings
//     (from SCRATCHPAD_DOCUMENTED_SECTIONS in tier-paths.mjs)
//
// Boundary-test discipline:
//   - Tests run against the shipped seed files in template/ + the install
//     output in tempdirs. Public contract: every documented scratchpad
//     in SCRATCHPAD_DOCUMENTED_SECTIONS has a corresponding seed with the
//     canonical header + the documented sections.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { install, initUserTier } from '../packages/cli/src/install.mjs';
import {
  SCRATCHPAD_DOCUMENTED_SECTIONS,
  DEFAULT_SCRATCHPAD_CAPS,
} from '../packages/cli/src/tier-paths.mjs';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = join(dirname(__filename), '..');
const TEMPLATE_DIR = join(REPO_ROOT, 'template');

// Map each scratchpad to its template path on disk (pre-install).
const TEMPLATE_PATHS = {
  'SOUL.md': join(TEMPLATE_DIR, 'project', 'SOUL.md.template'),
  'MEMORY.md': join(TEMPLATE_DIR, 'project', 'MEMORY.md.template'),
  'USER.md': join(TEMPLATE_DIR, 'user', 'USER.md.template'),
  'HABITS.md': join(TEMPLATE_DIR, 'user', 'HABITS.md.template'),
  'LESSONS.md': join(TEMPLATE_DIR, 'user', 'LESSONS.md.template'),
  'machine-paths.md': join(TEMPLATE_DIR, 'local', 'machine-paths.md.template'),
  'overrides.md': join(TEMPLATE_DIR, 'local', 'overrides.md.template'),
};

// First N chars window for the canonical-header check. The compact
// single-line `<!-- Cap: ... · Last distilled: ... · Last health check: ... -->`
// fits comfortably inside 200 chars across all scratchpads.
const HEADER_WINDOW_CHARS = 200;

describe('Task 14 — Seed scratchpad templates', () => {
  describe('14.3 — every seed has the canonical header in the first 200 chars', () => {
    for (const scratchpad of Object.keys(SCRATCHPAD_DOCUMENTED_SECTIONS)) {
      it(`${scratchpad} template has Cap: + Last distilled: + Last health check: in the first ${HEADER_WINDOW_CHARS} chars`, () => {
        const path = TEMPLATE_PATHS[scratchpad];
        expect(existsSync(path)).toBe(true);
        const text = readFileSync(path, 'utf8');
        const window = text.slice(0, HEADER_WINDOW_CHARS);
        expect(window).toMatch(/Cap:\s*\d+/);
        expect(window).toMatch(/Last distilled:/);
        expect(window).toMatch(/Last health check:/);
      });

      it(`${scratchpad} header Cap value matches DEFAULT_SCRATCHPAD_CAPS[${scratchpad}]`, () => {
        const text = readFileSync(TEMPLATE_PATHS[scratchpad], 'utf8');
        const m = text.slice(0, HEADER_WINDOW_CHARS).match(/Cap:\s*(\d+)/);
        expect(m).not.toBeNull();
        expect(parseInt(m[1], 10)).toBe(DEFAULT_SCRATCHPAD_CAPS[scratchpad]);
      });
    }
  });

  describe('14.3 — every seed contains its three documented section headings', () => {
    for (const [scratchpad, sections] of Object.entries(
      SCRATCHPAD_DOCUMENTED_SECTIONS,
    )) {
      it(`${scratchpad} has all 3 sections: ${sections.join(' / ')}`, () => {
        const text = readFileSync(TEMPLATE_PATHS[scratchpad], 'utf8');
        for (const section of sections) {
          expect(text).toContain(`## ${section}`);
        }
      });

      it(`${scratchpad} has exactly 3 ## sections (no extras, no shortfall)`, () => {
        const text = readFileSync(TEMPLATE_PATHS[scratchpad], 'utf8');
        const headings = (text.match(/^## .+$/gm) ?? []).map((l) => l.trim());
        expect(headings.length).toBe(3);
      });
    }
  });

  describe('14.1 — cmk install produces every required project-tier file', () => {
    let sandbox;
    let projectRoot;
    let userDir;
    beforeEach(() => {
      sandbox = mkdtempSync(join(tmpdir(), 'cmk-seed-install-test-'));
      projectRoot = join(sandbox, 'proj');
      userDir = join(sandbox, 'user-tier');
    });
    afterEach(() => {
      rmSync(sandbox, { recursive: true, force: true });
    });

    it('install scaffolds SOUL.md + MEMORY.md in the project tier', async () => {
      await install({ projectRoot, userTier: userDir });
      expect(existsSync(join(projectRoot, 'context', 'SOUL.md'))).toBe(true);
      expect(existsSync(join(projectRoot, 'context', 'MEMORY.md'))).toBe(true);
    });

    it('install scaffolds machine-paths.md + overrides.md in the local tier', async () => {
      await install({ projectRoot, userTier: userDir });
      expect(
        existsSync(join(projectRoot, 'context.local', 'machine-paths.md')),
      ).toBe(true);
      expect(
        existsSync(join(projectRoot, 'context.local', 'overrides.md')),
      ).toBe(true);
    });

    it('install scaffolds user-tier seeds too (USER.md, HABITS.md, LESSONS.md, fragments/INDEX.md)', async () => {
      await install({ projectRoot, userTier: userDir });
      expect(existsSync(join(userDir, 'USER.md'))).toBe(true);
      expect(existsSync(join(userDir, 'HABITS.md'))).toBe(true);
      expect(existsSync(join(userDir, 'LESSONS.md'))).toBe(true);
      expect(existsSync(join(userDir, 'fragments', 'INDEX.md'))).toBe(true);
    });

    it('installed seeds (in the tempdir) still pass the header + sections contract', async () => {
      await install({ projectRoot, userTier: userDir });
      const installedPaths = {
        'SOUL.md': join(projectRoot, 'context', 'SOUL.md'),
        'MEMORY.md': join(projectRoot, 'context', 'MEMORY.md'),
        'USER.md': join(userDir, 'USER.md'),
        'HABITS.md': join(userDir, 'HABITS.md'),
        'LESSONS.md': join(userDir, 'LESSONS.md'),
        'machine-paths.md': join(projectRoot, 'context.local', 'machine-paths.md'),
        'overrides.md': join(projectRoot, 'context.local', 'overrides.md'),
      };
      for (const [scratchpad, p] of Object.entries(installedPaths)) {
        const text = readFileSync(p, 'utf8');
        const window = text.slice(0, HEADER_WINDOW_CHARS);
        expect(window).toMatch(/Cap:\s*\d+/);
        expect(window).toMatch(/Last distilled:/);
        expect(window).toMatch(/Last health check:/);
        for (const section of SCRATCHPAD_DOCUMENTED_SECTIONS[scratchpad]) {
          expect(text).toContain(`## ${section}`);
        }
      }
    });
  });

  describe('14.2 — cmk init-user-tier scaffolds the user tier only', () => {
    let sandbox;
    let userDir;
    beforeEach(() => {
      sandbox = mkdtempSync(join(tmpdir(), 'cmk-init-user-test-'));
      userDir = join(sandbox, 'user-tier');
    });
    afterEach(() => {
      rmSync(sandbox, { recursive: true, force: true });
    });

    it('initUserTier({userTier}) creates USER.md, HABITS.md, LESSONS.md, fragments/INDEX.md at userTier', () => {
      const r = initUserTier({ userTier: userDir });
      expect(r.userTier).toBe(userDir);
      expect(r.created.length).toBeGreaterThan(0);
      expect(existsSync(join(userDir, 'USER.md'))).toBe(true);
      expect(existsSync(join(userDir, 'HABITS.md'))).toBe(true);
      expect(existsSync(join(userDir, 'LESSONS.md'))).toBe(true);
      expect(existsSync(join(userDir, 'fragments', 'INDEX.md'))).toBe(true);
    });

    it('initUserTier respects $MEMORY_KIT_USER_DIR when no explicit option', () => {
      // Set env var before calling
      const originalEnv = process.env.MEMORY_KIT_USER_DIR;
      try {
        process.env.MEMORY_KIT_USER_DIR = userDir;
        const r = initUserTier({});
        expect(r.userTier).toBe(userDir);
        expect(existsSync(join(userDir, 'USER.md'))).toBe(true);
      } finally {
        if (originalEnv === undefined) {
          delete process.env.MEMORY_KIT_USER_DIR;
        } else {
          process.env.MEMORY_KIT_USER_DIR = originalEnv;
        }
      }
    });

    it('initUserTier does NOT touch project or local tier files', () => {
      // No projectRoot scaffolding should happen; this only does user-tier.
      const projectRoot = join(sandbox, 'proj');
      initUserTier({ userTier: userDir });
      expect(existsSync(join(projectRoot, 'context'))).toBe(false);
      expect(existsSync(join(projectRoot, 'context.local'))).toBe(false);
    });

    it('initUserTier is idempotent — re-running skips existing files', () => {
      initUserTier({ userTier: userDir });
      const r2 = initUserTier({ userTier: userDir });
      expect(r2.created.length).toBe(0);
      expect(r2.skipped.length).toBeGreaterThan(0);
    });
  });
});
