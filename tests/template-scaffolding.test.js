// Tests for Task 1 — Repo scaffolding + template/ skeleton (T-001).
// Per tasks.md 1.4:
//   - Test every required file in template/ exists (manifest-driven)
//   - Test every required file is non-empty (size > 0)
//   - Test validate-template.sh / .mjs exits 0 against canonical template/
//   - Test validate-template exits non-zero when a required file is deleted
//
// Boundary-test discipline (per tasks.md "Engineering discipline"):
//   - Test the PUBLIC contract of the template scaffold (what files must
//     exist, what content rules apply, what the validator does).
//   - Do NOT test internal validator helpers — those are implementation
//     details that may change.

import { describe, it, expect } from 'vitest';
import { existsSync, statSync, mkdtempSync, cpSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { requiredDirs, requiredFiles } from '../scripts/template-manifest.mjs';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = join(dirname(__filename), '..');
const VALIDATOR = join(REPO_ROOT, 'scripts', 'validate-template.mjs');

describe('Task 1 — template/ scaffolding', () => {
  describe('Required directories exist', () => {
    for (const d of requiredDirs) {
      it(`exists: ${d.path}/  (${d.description})`, () => {
        const abs = join(REPO_ROOT, d.path);
        expect(existsSync(abs), `missing directory: ${d.path}`).toBe(true);
        expect(statSync(abs).isDirectory(), `${d.path} exists but is not a directory`).toBe(true);
      });
    }
  });

  describe('Required files exist', () => {
    for (const f of requiredFiles) {
      it(`exists: ${f.path}  (${f.description})`, () => {
        const abs = join(REPO_ROOT, f.path);
        expect(existsSync(abs), `missing file: ${f.path}`).toBe(true);
        expect(statSync(abs).isFile(), `${f.path} exists but is not a file`).toBe(true);
      });
    }
  });

  describe('Required files are non-empty (except .gitkeep / emptyOk)', () => {
    for (const f of requiredFiles) {
      if (f.emptyOk) continue;
      it(`non-empty: ${f.path}`, () => {
        const abs = join(REPO_ROOT, f.path);
        const size = statSync(abs).size;
        expect(size, `${f.path} is empty (size=0); expected non-empty seed content`).toBeGreaterThan(0);
      });
    }
  });

  describe('scripts/validate-template.mjs', () => {
    it('exits 0 against the canonical template/', () => {
      const result = spawnSync(process.execPath, [VALIDATOR], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
      });
      expect(result.status, `validator stderr:\n${result.stderr}\nstdout:\n${result.stdout}`).toBe(0);
    });

    it('exits non-zero when a required file is deleted from a copy', () => {
      // Boundary test: prove the validator detects scaffold corruption.
      // Use a tmpdir copy so we never mutate the real template/.
      const sandbox = mkdtempSync(join(tmpdir(), 'cmk-template-test-'));
      try {
        cpSync(join(REPO_ROOT, 'template'), join(sandbox, 'template'), { recursive: true });
        cpSync(join(REPO_ROOT, 'scripts'), join(sandbox, 'scripts'), { recursive: true });
        cpSync(join(REPO_ROOT, 'package.json'), join(sandbox, 'package.json'));

        // Pick a required file to delete and prove it fails.
        const victim = requiredFiles.find((f) => !f.emptyOk);
        rmSync(join(sandbox, victim.path));

        const result = spawnSync(process.execPath, [join(sandbox, 'scripts', 'validate-template.mjs')], {
          cwd: sandbox,
          encoding: 'utf8',
        });
        expect(result.status, `expected non-zero exit after deleting ${victim.path}; got status=${result.status}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`).not.toBe(0);
        expect(result.stdout + result.stderr).toContain(victim.path);
      } finally {
        rmSync(sandbox, { recursive: true, force: true });
      }
    });

    it('exits non-zero when a required non-emptyOk file is zero bytes', () => {
      const sandbox = mkdtempSync(join(tmpdir(), 'cmk-template-test-'));
      try {
        cpSync(join(REPO_ROOT, 'template'), join(sandbox, 'template'), { recursive: true });
        cpSync(join(REPO_ROOT, 'scripts'), join(sandbox, 'scripts'), { recursive: true });
        cpSync(join(REPO_ROOT, 'package.json'), join(sandbox, 'package.json'));

        const victim = requiredFiles.find((f) => !f.emptyOk);
        writeFileSync(join(sandbox, victim.path), '');

        const result = spawnSync(process.execPath, [join(sandbox, 'scripts', 'validate-template.mjs')], {
          cwd: sandbox,
          encoding: 'utf8',
        });
        expect(result.status, `expected non-zero exit after truncating ${victim.path}; got status=${result.status}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`).not.toBe(0);
        expect(result.stdout + result.stderr).toContain(victim.path);
      } finally {
        rmSync(sandbox, { recursive: true, force: true });
      }
    });
  });
});
