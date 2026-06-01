// @doors: 1, 2, 3
// Door 3: the template-freshness test spawns the prepublish-copy-template script
//   (the same copy prepack runs) and asserts the packaged output matches source.
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
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = join(__dirname, '..');

describe('Task 43 — release verification (pre-publish gates)', () => {
  describe('43.1 — package version ↔ CHANGELOG lockstep', () => {
    it('packages/cli/package.json version is valid semver AND matches the latest CHANGELOG release heading', () => {
      // Read the version dynamically and assert it equals the newest released
      // `## [X.Y.Z] — date` heading (skipping the dateless [Unreleased]). This
      // is the invariant `npm run release` guarantees — bumping package.json
      // and finalizing the CHANGELOG in lockstep — so the test never needs a
      // manual edit per release (the hardcoded-version version of this test
      // broke on every bump; v0.2.0 release prep fixed it).
      const pkg = JSON.parse(
        readFileSync(join(repoRoot, 'packages', 'cli', 'package.json'), 'utf8'),
      );
      expect(pkg.version).toMatch(/^\d+\.\d+\.\d+$/);
      const changelog = readFileSync(join(repoRoot, 'CHANGELOG.md'), 'utf8');
      const latest = changelog.match(/^##\s*\[(\d+\.\d+\.\d+)\]\s*[—\-]\s*\d{4}-\d{2}-\d{2}/m);
      expect(latest, 'CHANGELOG has a dated release heading').toBeTruthy();
      expect(pkg.version).toBe(latest[1]);
    });

    it('packages/canonicalize/package.json stays 0.1.0 (unchanged; not republished)', () => {
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

    it('has the historical [0.1.0]/[0.1.1] headings + a dated heading for the current package version', () => {
      text = readFileSync(join(repoRoot, 'CHANGELOG.md'), 'utf8');
      expect(text).toMatch(/##\s*\[0\.1\.0\]\s*[—\-]\s*\d{4}-\d{2}-\d{2}/);
      expect(text).toMatch(/##\s*\[0\.1\.1\]\s*[—\-]\s*\d{4}-\d{2}-\d{2}/);
      // The CURRENT version's heading, read dynamically from package.json so
      // this doesn't rot on the next release.
      const pkg = JSON.parse(
        readFileSync(join(repoRoot, 'packages', 'cli', 'package.json'), 'utf8'),
      );
      // Collect every dated release-heading version with a STATIC regex, then
      // membership-check — never build a regex from the version string (avoids
      // incomplete-escaping; CodeQL js/incomplete-sanitization).
      const datedVersions = [
        ...text.matchAll(/^##\s*\[(\d+\.\d+\.\d+)\]\s*[—\-]\s*\d{4}-\d{2}-\d{2}/gm),
      ].map((m) => m[1]);
      expect(datedVersions).toContain(pkg.version);
    });

    it('the [0.1.0] release section has a non-empty Added with at least 10 bullets', () => {
      text = readFileSync(join(repoRoot, 'CHANGELOG.md'), 'utf8');
      // Slice the [0.1.0] section (from its heading to the next ## version
      // heading), then count its Added bullets. Targeting 0.1.0 explicitly
      // keeps this assertion meaningful now that 0.1.1 (a small release)
      // sits above it.
      const section = text.match(/##\s*\[0\.1\.0\][\s\S]*?(?=^##\s*\[|\Z)/m);
      expect(section).toBeTruthy();
      const addedMatch = section[0].match(/### Added\b[\s\S]*?(?=^##\s|^###\s(?!#))/m);
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

    it('packages/cli copies template/ at PACK time, not just publish (prepack)', () => {
      // Live-test finding #3 (2026-06-01): the copy was wired to
      // `prepublishOnly`, which runs ONLY on `npm publish` — so `npm pack`
      // shipped the STALE template from the last publish (the F1 rich-capture
      // guidance never reached pack-based tests). `prepack` runs before BOTH
      // pack and publish, so the tarball is always built from current source.
      const pkg = JSON.parse(
        readFileSync(join(repoRoot, 'packages', 'cli', 'package.json'), 'utf8'),
      );
      expect(pkg.scripts?.prepack, 'prepack must run the template copy (pack==publish)').toMatch(
        /prepublish-copy-template/,
      );
    });

    it('the packaged template (after the copy runs) matches the source template', () => {
      // Run the copy the way prepack does, then assert packages/cli/template
      // is byte-identical to the repo-root source for the load-bearing
      // CLAUDE.md.template (the F1 behavior lever). Catches a stale packaged
      // copy regardless of when/whether the lifecycle hook fired.
      execFileSync(process.execPath, [join(repoRoot, 'scripts', 'prepublish-copy-template.mjs')], {
        cwd: repoRoot,
      });
      const src = readFileSync(join(repoRoot, 'template', 'CLAUDE.md.template'), 'utf8');
      const packaged = readFileSync(
        join(repoRoot, 'packages', 'cli', 'template', 'CLAUDE.md.template'),
        'utf8',
      );
      expect(packaged).toBe(src);
      expect(packaged).toMatch(/capture RICHLY/); // the F1 lever is present
    });

    it('packages/cli/README.md exists (the npm package landing page)', () => {
      // npm reads the README from the PACKAGE dir, not the repo root. A
      // missing packages/cli/README.md is why the npm page showed "This
      // package does not have a README" after the 0.1.0 publish.
      const path = join(repoRoot, 'packages', 'cli', 'README.md');
      expect(existsSync(path)).toBe(true);
      const text = readFileSync(path, 'utf8');
      expect(text.length).toBeGreaterThan(500);
      expect(text).toMatch(/npm install -g @lh8ppl\/claude-memory-kit/);
    });

    it('all 9 bins are declared (cmk + 3 cron entrypoints + 5 hook bins as of Task 49)', () => {
      const pkg = JSON.parse(
        readFileSync(join(repoRoot, 'packages', 'cli', 'package.json'), 'utf8'),
      );
      expect(Object.keys(pkg.bin).sort()).toEqual([
        'cmk',
        'cmk-capture-prompt',
        'cmk-capture-turn',
        'cmk-compress-lazy',
        'cmk-compress-session',
        'cmk-daily-distill',
        'cmk-inject-context',
        'cmk-observe-edit',
        'cmk-weekly-curate',
      ]);
    });

    it('every declared bin points at a file that exists on disk', () => {
      const pkg = JSON.parse(
        readFileSync(join(repoRoot, 'packages', 'cli', 'package.json'), 'utf8'),
      );
      for (const rel of Object.values(pkg.bin)) {
        const abs = join(repoRoot, 'packages', 'cli', rel);
        expect(existsSync(abs), `declared bin missing on disk: ${rel}`).toBe(true);
      }
    });

    it('cmk-auto-extract.mjs ships in bin/ (spawned by the Stop hook; not a declared bin)', () => {
      // Not in package.json `bin` (Claude Code never invokes it directly —
      // cmk-capture-turn spawns it by absolute path), but it MUST ship so
      // the auto-extract chain works post-`npm install -g`. `files`
      // includes bin/, so any .mjs in bin/ is packed.
      const abs = join(repoRoot, 'packages', 'cli', 'bin', 'cmk-auto-extract.mjs');
      expect(existsSync(abs)).toBe(true);
    });
  });

  describe('Task 49 — plugin marketplace route (Route B) is registerable', () => {
    // Per Anthropic's plugin-marketplace docs (verified 2026-05-29):
    // `/plugin marketplace add LH8PPL/claude-memory-kit` requires a
    // `.claude-plugin/marketplace.json` at the REPOSITORY ROOT listing the
    // plugin + its source path. This pins that Route B is a complete
    // parallel install path to Route A (`cmk install`).
    let mkt;
    it('.claude-plugin/marketplace.json exists at repo root + parses', () => {
      const path = join(repoRoot, '.claude-plugin', 'marketplace.json');
      expect(existsSync(path)).toBe(true);
      mkt = JSON.parse(readFileSync(path, 'utf8'));
    });

    it('has required name + owner + a plugins array', () => {
      mkt = JSON.parse(
        readFileSync(join(repoRoot, '.claude-plugin', 'marketplace.json'), 'utf8'),
      );
      expect(typeof mkt.name).toBe('string');
      expect(mkt.owner?.name).toBeTruthy();
      expect(Array.isArray(mkt.plugins)).toBe(true);
      expect(mkt.plugins.length).toBeGreaterThan(0);
    });

    it('lists the claude-memory-kit plugin whose source resolves to a real plugin dir', () => {
      mkt = JSON.parse(
        readFileSync(join(repoRoot, '.claude-plugin', 'marketplace.json'), 'utf8'),
      );
      const entry = mkt.plugins.find((p) => p.name === 'claude-memory-kit');
      expect(entry).toBeTruthy();
      expect(typeof entry.source).toBe('string');
      // source is a relative path to the co-located plugin; resolve + verify
      // its manifest exists (so the marketplace entry isn't a dangling ref).
      const manifest = join(repoRoot, entry.source, '.claude-plugin', 'plugin.json');
      expect(existsSync(manifest), `plugin manifest missing at ${manifest}`).toBe(true);
    });

    it('the referenced plugin manifest has no <your-username> placeholder URLs', () => {
      const manifest = JSON.parse(
        readFileSync(join(repoRoot, 'plugin', '.claude-plugin', 'plugin.json'), 'utf8'),
      );
      expect(JSON.stringify(manifest)).not.toContain('<your-username>');
      expect(manifest.repository).toContain('LH8PPL/claude-memory-kit');
    });

    it('the plugin route ships its hooks.json + node bin handlers (complete on its own)', () => {
      expect(existsSync(join(repoRoot, 'plugin', 'hooks', 'hooks.json'))).toBe(true);
      // Task 62: the plugin hooks are node `.mjs` invoked via
      // `node "${CLAUDE_PLUGIN_ROOT}/bin/<name>.mjs"` — no bash wrappers.
      for (const bin of [
        'cmk-inject-context.mjs',
        'cmk-capture-turn.mjs',
        'cmk-compress-session.mjs',
      ]) {
        expect(
          existsSync(join(repoRoot, 'plugin', 'bin', bin)),
          `plugin bin handler missing: ${bin}`,
        ).toBe(true);
      }
    });
  });
});
