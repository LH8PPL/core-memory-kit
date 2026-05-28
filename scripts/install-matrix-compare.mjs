#!/usr/bin/env node
// Task 40 — install-matrix checksum comparator.
//
// Downloads all 3 OS artifacts and asserts the tree-aggregate hashes
// match. Exits 1 on mismatch (CI surfaces the diff). Per design §14 +
// tasks.md 40.3.

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const artifactsDir = process.argv[2];
if (!artifactsDir) {
  console.error('usage: install-matrix-compare.mjs <artifacts-dir>');
  process.exit(2);
}
if (!existsSync(artifactsDir)) {
  console.error(`artifacts dir does not exist: ${artifactsDir}`);
  process.exit(2);
}

// Each OS artifact lives at <artifactsDir>/<artifact-name>/install-matrix-checksum.json
const reports = [];
for (const entry of readdirSync(artifactsDir).sort()) {
  const full = join(artifactsDir, entry);
  if (!statSync(full).isDirectory()) continue;
  const jsonPath = join(full, 'install-matrix-checksum.json');
  if (!existsSync(jsonPath)) {
    console.error(`missing checksum file in artifact: ${jsonPath}`);
    process.exit(1);
  }
  reports.push({
    name: entry,
    data: JSON.parse(readFileSync(jsonPath, 'utf8')),
  });
}

if (reports.length === 0) {
  console.error('no artifacts found');
  process.exit(1);
}

console.log(`[install-matrix-compare] found ${reports.length} OS report(s)`);
for (const r of reports) {
  console.log(`  ${r.name}: platform=${r.data.platform} fileCount=${r.data.fileCount} treeHash=${r.data.treeHash.slice(0, 16)}...`);
}

// Per-file SHA comparison: each report should have the same set of files
// with the same SHA. Surface specific mismatches for debuggability.
const firstReport = reports[0];
const firstFiles = new Map(firstReport.data.files.map((f) => [f.path, f.sha256]));
let mismatch = false;
for (const other of reports.slice(1)) {
  const otherFiles = new Map(other.data.files.map((f) => [f.path, f.sha256]));
  // Missing files in either side
  for (const path of firstFiles.keys()) {
    if (!otherFiles.has(path)) {
      console.error(`MISMATCH: ${other.name} missing ${path} (present in ${firstReport.name})`);
      mismatch = true;
    } else if (otherFiles.get(path) !== firstFiles.get(path)) {
      console.error(
        `MISMATCH: ${path} sha differs (${firstReport.name}=${firstFiles.get(path).slice(0, 16)} vs ${other.name}=${otherFiles.get(path).slice(0, 16)})`,
      );
      mismatch = true;
    }
  }
  for (const path of otherFiles.keys()) {
    if (!firstFiles.has(path)) {
      console.error(`MISMATCH: ${other.name} has extra ${path} (not in ${firstReport.name})`);
      mismatch = true;
    }
  }
}

if (mismatch) {
  console.error('cross-OS scaffold checksums DO NOT MATCH — failing CI');
  process.exit(1);
}

console.log('cross-OS scaffold checksums MATCH on all reports');
