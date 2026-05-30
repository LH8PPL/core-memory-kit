#!/usr/bin/env node
// Print the release-notes body for a finalized CHANGELOG version section.
// Used by .github/workflows/publish.yml on a `v*` tag push to create the
// GitHub Release without hand-writing notes:
//
//   node scripts/print-release-notes.mjs 0.2.0 > notes.md
//   gh release create v0.2.0 --notes-file notes.md
//
// Usage: node scripts/print-release-notes.mjs <X.Y.Z>   (X.Y.Z or vX.Y.Z)

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractReleaseNotes } from './lib/changelog-release.mjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const raw = process.argv[2] ?? '';
const version = raw.replace(/^v/, '');

if (!/^\d+\.\d+\.\d+$/.test(version)) {
  process.stderr.write('usage: node scripts/print-release-notes.mjs <X.Y.Z>\n');
  process.exit(2);
}

try {
  const changelogText = readFileSync(join(repoRoot, 'CHANGELOG.md'), 'utf8');
  process.stdout.write(extractReleaseNotes(changelogText, version) + '\n');
} catch (err) {
  process.stderr.write(`print-release-notes: ${err?.message ?? err}\n`);
  process.exit(1);
}
