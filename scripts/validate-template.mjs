#!/usr/bin/env node
// validate-template.mjs — kit-dev lint for the template/ scaffold.
//
// Reads the manifest from template-manifest.mjs and asserts:
//   - every required directory exists
//   - every required file exists and is a regular file
//   - every required file is non-empty UNLESS marked emptyOk (e.g., .gitkeep)
//
// Exits 0 on success, 1 on any violation (with each violation printed
// to stderr — grep-friendly).
//
// Runs in CI via `npm run validate:template` and is invoked from
// tests/template-scaffolding.test.js as the public-contract check.

import { existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { requiredDirs, requiredFiles, manifestSummary } from './template-manifest.mjs';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = join(dirname(__filename), '..');

const violations = [];

for (const d of requiredDirs) {
  const abs = join(REPO_ROOT, d.path);
  if (!existsSync(abs)) {
    violations.push(`MISSING DIR: ${d.path}/  (${d.description})`);
  } else if (!statSync(abs).isDirectory()) {
    violations.push(`NOT A DIR: ${d.path}/  (exists but is not a directory)`);
  }
}

for (const f of requiredFiles) {
  const abs = join(REPO_ROOT, f.path);
  if (!existsSync(abs)) {
    violations.push(`MISSING FILE: ${f.path}  (${f.description})`);
    continue;
  }
  const st = statSync(abs);
  if (!st.isFile()) {
    violations.push(`NOT A FILE: ${f.path}  (exists but is not a regular file)`);
    continue;
  }
  if (!f.emptyOk && st.size === 0) {
    violations.push(`EMPTY: ${f.path}  (size=0; expected non-empty seed content)`);
  }
}

const summary = manifestSummary();

if (violations.length > 0) {
  console.error(`validate-template: ${violations.length} violation(s) against manifest`);
  console.error(`manifest: ${summary.dirCount} dirs + ${summary.fileCount} files\n`);
  for (const v of violations) console.error('  ' + v);
  process.exit(1);
}

console.log(`validate-template: OK (${summary.dirCount} dirs + ${summary.fileCount} files)`);
process.exit(0);
