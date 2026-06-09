// @doors: 1, 2, 3
// Door 4 N/A: no message-queue interaction.
// Door 5 N/A: template-scaffolding tests assert the manifest's structural shape (Door 1) + the kit's filesystem state matches (Door 2) + the validator subprocess runs correctly (Door 3); no NDJSON observability is produced by the template emission itself.

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
import { existsSync, statSync, mkdtempSync, cpSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
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

  // Task 63 (F1) — the behavior lever. The v0.2.0 live test found the agent
  // wrote terse one-line bullets because the scaffolded CLAUDE.md told it to
  // "use cmk remember "<the fact>"" (terse) and "never hand-write fact files".
  // This guards the flipped guidance: recommend RICH capture (--why/--how) so
  // the agent produces granular fact files again. If this regresses, the kit
  // silently goes back to losing the *why* on every capture.
  describe('Task 63 — CLAUDE.md template recommends RICH capture (the F1 behavior lever)', () => {
    const tpl = () =>
      readFileSync(join(REPO_ROOT, 'template', 'CLAUDE.md.template'), 'utf8');

    it('tells the agent to capture richly via --why / --how', () => {
      const text = tpl();
      expect(text).toMatch(/--why/);
      expect(text).toMatch(/--how/);
      expect(text).toMatch(/rich/i);
    });

    it('still warns against hand-writing fact files (the v0.1.2 safety guard stays)', () => {
      // Rich capture must go THROUGH cmk remember (sanitizer + Poison_Guard),
      // not by hand-writing files under context/memory/ (the username-leak class).
      // Wording slimmed in Task 69.3 (the full procedure moved into the
      // memory-write skill); the hand-edit warning + the path stay.
      expect(tpl()).toMatch(/never hand-write[^\n]*context\/memory\//i);
    });
  });

  // Task 75.0 — the authoritative-memory rule must reach the scaffolded
  // CLAUDE.md too (the snapshot preamble is the upgrade-proof carrier; the
  // CLAUDE.md line reinforces it for new installs, where CLAUDE.md is
  // always-in-context while the snapshot competes with the conversation).
  describe('Task 75.0 — CLAUDE.md template carries the injected-memory-wins authority rule', () => {
    const tpl = () =>
      readFileSync(join(REPO_ROOT, 'template', 'CLAUDE.md.template'), 'utf8');

    it('states that injected memory wins over assumptions (memory-os Ground Truth key line)', () => {
      const text = tpl();
      expect(text).toMatch(/injected memory contradicts your assumptions, injected memory wins/i);
      expect(text).toMatch(/never treat a question as novel/i);
    });
  });

  // Task 107 — Task 82 scrubbed kit-internal cruft from the scaffold templates
  // but MISSED the CLAUDE.md block: a v0.2.2 live-test install showed it still
  // said "v0.1.0 is under active development", "HC-1..HC-8" (there are 9), and
  // carried RELATIVE links to docs/adr/ + specs/design.md that resolve
  // inside the USER's project, where those paths don't exist. This guards the
  // scrub so the scaffold a user opens never leaks a stale version or a kit-repo
  // path again.
  describe('Task 107 — scaffolded CLAUDE.md is free of kit-internal cruft (finishes Task 82)', () => {
    const tpl = () =>
      readFileSync(join(REPO_ROOT, 'template', 'CLAUDE.md.template'), 'utf8');

    it('pins no stale kit version / "under active development" framing', () => {
      const text = tpl();
      expect(text).not.toMatch(/v0\.1\.0/);
      expect(text).not.toMatch(/under active development/i);
    });

    it('carries no hardcoded HC count (HC-1..HC-N drifts as checks are added)', () => {
      expect(tpl()).not.toMatch(/HC-1\s*\.\.\s*HC-\d/);
    });

    it('links to no kit-repo-internal paths that are absent in a user project', () => {
      // A user's CLAUDE.md must not RELATIVE-link docs/adr/ or specs/… — they
      // resolve inside the user's own repo (404). External github URLs are fine.
      const text = tpl();
      expect(text).not.toMatch(/\]\(docs\/adr\//);
      expect(text).not.toMatch(/\]\(specs\//);
      expect(text).not.toMatch(/specs\/v0\.1\.0/);
    });
  });

  // Task 107 — the gitignore fragment is also user-facing (lands in the user's
  // .gitignore); no internal Task-NN references in its comments.
  describe('Task 107 — .gitignore fragment carries no internal Task-NN reference', () => {
    it('explains the extract.log exclusion without naming a kit task', () => {
      const frag = readFileSync(
        join(REPO_ROOT, 'template', '.gitignore.fragment'),
        'utf8',
      );
      expect(frag).not.toMatch(/Task\s*\d/);
    });
  });
});
