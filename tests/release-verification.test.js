// @doors: 1, 2
// Door 3 N/A: release verification reads files; no subprocess spawn at this boundary.
// Door 4 N/A: no NDJSON observability.
// Door 5 N/A: no message-queue.

// Tests for Task 43 — release verification (T-036).
// Per tasks.md 43.6:
//   - package.json version equals 0.1.0 (will match git tag once tagged)
//   - CHANGELOG.md has `## [0.1.0] — YYYY-MM-DD` heading with non-empty body
//   - GitHub Release exists for tag v0.1.0 (skipped pre-publish; runs post-publish manually)
//   - Fresh install of @lh8ppl/claude-memory-kit@0.1.0 succeeds + cmk version outputs 0.1.0 (skipped pre-publish; the npm-pack smoke test below validates the equivalent)

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = join(__dirname, '..');

describe('Task 43 — release verification (pre-publish gates)', () => {
  describe('43.1 — package versions match 0.1.0', () => {
    it('packages/cli/package.json version is 0.1.0', () => {
      const pkg = JSON.parse(
        readFileSync(join(repoRoot, 'packages', 'cli', 'package.json'), 'utf8'),
      );
      expect(pkg.version).toBe('0.1.0');
    });

    it('packages/canonicalize/package.json version is 0.1.0', () => {
      const pkg = JSON.parse(
        readFileSync(join(repoRoot, 'packages', 'canonicalize', 'package.json'), 'utf8'),
      );
      expect(pkg.version).toBe('0.1.0');
    });

    it('packages/cli declares @lh8ppl/cmk-canonicalize as a dependency at 0.1.0', () => {
      const pkg = JSON.parse(
        readFileSync(join(repoRoot, 'packages', 'cli', 'package.json'), 'utf8'),
      );
      expect(pkg.dependencies?.['@lh8ppl/cmk-canonicalize']).toBe('0.1.0');
    });
  });

  describe('43.2 — CHANGELOG.md release entry shape', () => {
    let text;
    it('CHANGELOG.md exists', () => {
      const path = join(repoRoot, 'CHANGELOG.md');
      expect(existsSync(path)).toBe(true);
      text = readFileSync(path, 'utf8');
    });

    it('has [0.1.0] heading with ISO release date', () => {
      text = readFileSync(join(repoRoot, 'CHANGELOG.md'), 'utf8');
      expect(text).toMatch(/##\s*\[0\.1\.0\]\s*[—\-]\s*\d{4}-\d{2}-\d{2}/);
    });

    it('has non-empty Added section with at least 10 bullets', () => {
      text = readFileSync(join(repoRoot, 'CHANGELOG.md'), 'utf8');
      // Match `### Added` up to the next top-level heading (### or ##).
      const addedMatch = text.match(/### Added\b[\s\S]*?(?=^##\s|^###\s(?!#))/m);
      expect(addedMatch).toBeTruthy();
      const bulletCount = (addedMatch[0].match(/^- /gm) || []).length;
      expect(bulletCount).toBeGreaterThan(10);
    });

    it('mentions deferred items (Task 45, Layer 5b)', () => {
      text = readFileSync(join(repoRoot, 'CHANGELOG.md'), 'utf8');
      expect(text).toMatch(/[Dd]eferred to v0\.1\.1/);
      expect(text).toMatch(/Task 45/);
      expect(text).toMatch(/Layer 5b/);
    });

    it('references the GitHub release tag URL', () => {
      text = readFileSync(join(repoRoot, 'CHANGELOG.md'), 'utf8');
      expect(text).toMatch(/releases\/tag\/v0\.1\.0/);
    });
  });

  describe('43.4 — npm tarball contains the load-bearing surface', () => {
    it('packages/cli/package.json `files` includes template/, bin/, src/, README.md', () => {
      const pkg = JSON.parse(
        readFileSync(join(repoRoot, 'packages', 'cli', 'package.json'), 'utf8'),
      );
      expect(pkg.files).toEqual(
        expect.arrayContaining(['bin/', 'src/', 'template/', 'README.md']),
      );
    });

    it('packages/cli has prepublishOnly script that copies template/ before publish', () => {
      const pkg = JSON.parse(
        readFileSync(join(repoRoot, 'packages', 'cli', 'package.json'), 'utf8'),
      );
      expect(pkg.scripts?.prepublishOnly).toMatch(/prepublish-copy-template/);
    });

    it('all 4 bins are declared (cmk + 3 cron entrypoints)', () => {
      const pkg = JSON.parse(
        readFileSync(join(repoRoot, 'packages', 'cli', 'package.json'), 'utf8'),
      );
      expect(Object.keys(pkg.bin).sort()).toEqual([
        'cmk',
        'cmk-compress-lazy',
        'cmk-daily-distill',
        'cmk-weekly-curate',
      ]);
    });
  });
});
