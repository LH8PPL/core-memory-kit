#!/usr/bin/env node
// Task 42 B1 fix (skill-review 2026-05-28): copy the repo-root template/
// tree into packages/cli/template/ so `cmk install` works post-`npm
// install -g`. Runs as packages/cli's prepublishOnly script.
//
// Why: packages/cli/src/install.mjs::resolveTemplateDir checks two
// paths — dev (<repo>/template) and packaged (<cli-pkg>/template). The
// dev path works in-repo; the packaged path was empty before this
// script because template/ was never copied during npm publish prep.
// Empirically verified via `npm pack --dry-run` showing zero template
// entries in the tarball.

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, '..');
const sourceTemplate = join(repoRoot, 'template');
const destTemplate = join(repoRoot, 'packages', 'cli', 'template');

if (!existsSync(sourceTemplate)) {
  console.error(`prepublish-copy-template: source template missing at ${sourceTemplate}`);
  process.exit(1);
}

function copyRecursive(src, dest) {
  if (!statSync(src).isDirectory()) {
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, readFileSync(src));
    return 1;
  }
  mkdirSync(dest, { recursive: true });
  let count = 0;
  for (const entry of readdirSync(src)) {
    count += copyRecursive(join(src, entry), join(dest, entry));
  }
  return count;
}

// MIRROR, not accumulate: clear the destination first so a file DELETED from
// the source template (e.g. a retired script) doesn't linger in the packaged
// copy and keep shipping. copyRecursive alone is additive — without this, the
// packaged template only ever grows. (destTemplate is a gitignored build
// artifact, so clearing it is safe.)
rmSync(destTemplate, { recursive: true, force: true });
const fileCount = copyRecursive(sourceTemplate, destTemplate);
console.log(`prepublish-copy-template: mirrored ${fileCount} file(s) from ${relative(repoRoot, sourceTemplate)} to ${relative(repoRoot, destTemplate)}`);
