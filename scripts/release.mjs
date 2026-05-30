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

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assembleRelease } from './lib/changelog-release.mjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const changelogPath = join(repoRoot, 'CHANGELOG.md');
const pkgPath = join(repoRoot, 'packages', 'cli', 'package.json');

const args = process.argv.slice(2);
const dry = args.includes('--dry');
const dateIdx = args.indexOf('--date');
const date = dateIdx !== -1 ? args[dateIdx + 1] : undefined;
const target = args.find((a) => !a.startsWith('--') && a !== date);

if (!target) {
  process.stderr.write('usage: npm run release -- <patch|minor|major | X.Y.Z> [--date YYYY-MM-DD] [--dry]\n');
  process.exit(2);
}

const changelogText = readFileSync(changelogPath, 'utf8');
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
const isExplicit = /^\d+\.\d+\.\d+$/.test(target);

let result;
try {
  result = assembleRelease({
    changelogText,
    currentVersion: pkg.version,
    bump: isExplicit ? undefined : target,
    version: isExplicit ? target : undefined,
    date,
  });
} catch (err) {
  process.stderr.write(`release: ${err?.message ?? err}\n`);
  process.exit(1);
}

const { newVersion, changelog, notes } = result;

if (dry) {
  process.stdout.write(`[dry-run] would release v${newVersion}\n\n--- release notes ---\n${notes}\n`);
  process.exit(0);
}

writeFileSync(changelogPath, changelog, 'utf8');
pkg.version = newVersion;
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');

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
