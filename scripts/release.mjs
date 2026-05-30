#!/usr/bin/env node
// Release mechanic CLI (Lior 2026-05-30: "put everything in a file and that
// creates everything from that"). You edit ONE file during PRs — CHANGELOG.md's
// `## [Unreleased]` section. This command turns it into a release:
//
//   npm run release -- <patch|minor|major | X.Y.Z> [--date YYYY-MM-DD] [--dry]
//
// It (1) finalizes [Unreleased] → `## [X.Y.Z] — date`, (2) resets a fresh empty
// [Unreleased], (3) bumps packages/cli/package.json version. It does NOT commit
// or tag — it prints the exact next steps so you review the diff first; the tag
// push (your outward-facing step) triggers publish.yml, which publishes to npm
// AND creates the GitHub Release from the same CHANGELOG section.

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareReleaseFiles } from './lib/changelog-release.mjs';

const repoRoot = process.env.CMK_REPO_ROOT ?? join(dirname(fileURLToPath(import.meta.url)), '..');

const args = process.argv.slice(2);
const dry = args.includes('--dry');
const dateIdx = args.indexOf('--date');
const date = dateIdx !== -1 ? args[dateIdx + 1] : undefined;
const target = args.find((a) => !a.startsWith('--') && a !== date);

if (!target) {
  process.stderr.write('usage: npm run release -- <patch|minor|major | X.Y.Z> [--date YYYY-MM-DD] [--dry]\n');
  process.exit(2);
}

let result;
try {
  result = prepareReleaseFiles({ repoRoot, target, date, dry });
} catch (err) {
  process.stderr.write(`release: ${err?.message ?? err}\n`);
  process.exit(1);
}

const { newVersion, notes } = result;

if (dry) {
  process.stdout.write(`[dry-run] would release v${newVersion}\n\n--- release notes ---\n${notes}\n`);
  process.exit(0);
}

process.stdout.write(
  [
    `✓ Prepared release v${newVersion}`,
    `  • CHANGELOG.md: [Unreleased] → [${newVersion}] (+ fresh [Unreleased])`,
    `  • packages/cli/package.json: version → ${newVersion}`,
    '',
    'Next (review the diff, then ship):',
    `  git add CHANGELOG.md packages/cli/package.json`,
    `  git commit -m "release: v${newVersion}"`,
    `  git tag v${newVersion} && git push origin HEAD --tags   # ← triggers publish.yml (npm + GitHub Release)`,
    '',
  ].join('\n'),
);
