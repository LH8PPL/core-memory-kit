#!/usr/bin/env node
// validate-numbering-gaps.mjs — ADR / FR / NFR / Task ID sequences
// either have no gaps OR have an explicit reserved-not-yet-shipped
// marker. Closes the gap PR-C surfaced (ADR-0009 + ADR-0010 reserved
// 2026-05-22, shipped 2026-05-22, but the FILES weren't written until
// PR-C — for ~3 weeks the docs cited IDs that had no file).
//
// Rule
// ----
//
// For each ID class (ADR, FR, NFR, Task):
//   - Collect the set of defined IDs
//   - If max(N) > size(set), there are gaps
//   - Each gap must be either:
//     a) Explicitly reserved with a marker in docs/adr/README.md (for
//        ADRs) or in the requirements / tasks file itself (for FR /
//        NFR / Task)
//     b) Backfilled (file/heading actually exists) — caught by the
//        set already containing the ID
//   - Otherwise: violation
//
// The "explicit reserved" marker shape: a line in the relevant file
// matching `<RESERVED|reserved|TODO|todo>.*<ID>` or a frontmatter
// `reserved: true` annotation in a placeholder file.
//
// What this validator does NOT do
// -------------------------------
//
// Verify that a backfilled ID's file CONTENT matches its declared
// purpose. That's the primary-source-verification rule (CLAUDE.md
// "Internal cross-references"). This validator only checks numbering
// contiguity, not semantic correctness.
//
// Run: `node scripts/validate-numbering-gaps.mjs`
// Wired into `npm test` as a pre-test step.

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
// REPO_ROOT defaults to scripts/'s parent; honors CMK_VALIDATOR_ROOT
// env var for testability (sandboxed self-tests set this to point at
// a fixture directory).
const REPO_ROOT = process.env.CMK_VALIDATOR_ROOT
  ? resolve(process.env.CMK_VALIDATOR_ROOT)
  : resolve(dirname(__filename), '..');

const violations = [];

// --- ADR sequence ---------------------------------------------------

const adrDir = join(REPO_ROOT, 'docs', 'adr');
const adrReadme = join(adrDir, 'README.md');
const adrFiles = new Map(); // id (4-digit string) -> filename
if (existsSync(adrDir)) {
  for (const f of readdirSync(adrDir)) {
    const m = f.match(/^(\d{4})-/);
    if (m) adrFiles.set(m[1], f);
  }
}

const adrReadmeText = existsSync(adrReadme) ? readFileSync(adrReadme, 'utf8') : '';
// Look for "RESERVED" + ADR-NNNN patterns in the README. Case-insensitive.
const adrReservedSet = new Set();
for (const m of adrReadmeText.matchAll(/(?:reserved|TODO|placeholder|not[- ]yet)[^\n]*?ADR-(\d{4})/gi)) {
  adrReservedSet.add(m[1]);
}
// ALSO accept the reverse direction: "ADR-NNNN ... reserved" on the same line
for (const m of adrReadmeText.matchAll(/ADR-(\d{4})[^\n]*?(?:reserved|TODO|placeholder|not[- ]yet)/gi)) {
  adrReservedSet.add(m[1]);
}

if (adrFiles.size > 0) {
  const ids = [...adrFiles.keys()].map((s) => parseInt(s, 10)).sort((a, b) => a - b);
  const max = ids[ids.length - 1];
  for (let i = 1; i <= max; i++) {
    const id4 = String(i).padStart(4, '0');
    if (adrFiles.has(id4)) continue;
    if (adrReservedSet.has(id4)) continue;
    violations.push(
      `ADR-${id4}: no file under docs/adr/ AND no "reserved" marker in docs/adr/README.md. ` +
        `Either backfill the ADR file or add a reserved-marker line like "ADR-${id4} — reserved (will ship in vN.M)".`,
    );
  }
}

// --- FR / NFR sequence ---------------------------------------------

function checkRequirementIds(prefix, label) {
  const reqText =
    (existsSync(join(REPO_ROOT, 'specs/requirements.md'))
      ? readFileSync(join(REPO_ROOT, 'specs/requirements.md'), 'utf8')
      : '') +
    '\n' +
    (existsSync(join(REPO_ROOT, 'specs/requirements-revisions-proposed.md'))
      ? readFileSync(join(REPO_ROOT, 'specs/requirements-revisions-proposed.md'), 'utf8')
      : '');
  // Find definitions (heading-style lines like `**FR-12 — title**` or `### FR-12 ...`
  // or table rows `| FR-12 |`). We scan for any occurrence that looks
  // like a DEFINITION rather than a citation.
  const defRe = new RegExp(`(?:^|\\n)(?:\\*\\*|#{2,6}\\s+|\\|\\s*)${prefix}-(\\d+)\\b`, 'g');
  const ids = new Set();
  for (const m of reqText.matchAll(defRe)) ids.add(parseInt(m[1], 10));

  // Reserved markers in same files
  const reservedRe = new RegExp(`(?:reserved|TODO|placeholder|not[- ]yet)[^\n]*?${prefix}-(\\d+)`, 'gi');
  const reverseRe = new RegExp(`${prefix}-(\\d+)[^\n]*?(?:reserved|TODO|placeholder|not[- ]yet)`, 'gi');
  const reserved = new Set();
  for (const m of reqText.matchAll(reservedRe)) reserved.add(parseInt(m[1], 10));
  for (const m of reqText.matchAll(reverseRe)) reserved.add(parseInt(m[1], 10));

  if (ids.size === 0) return;
  const max = Math.max(...ids);
  for (let i = 1; i <= max; i++) {
    if (ids.has(i)) continue;
    if (reserved.has(i)) continue;
    violations.push(
      `${prefix}-${i}: not defined in requirements.md or requirements-revisions-proposed.md AND not marked reserved. ` +
        `Either define ${label} ${prefix}-${i} or add a "reserved" line.`,
    );
  }
}

checkRequirementIds('FR', 'Functional Requirement');
checkRequirementIds('NFR', 'Non-Functional Requirement');

// --- Task sequence --------------------------------------------------

const tasksPath = join(REPO_ROOT, 'specs/tasks.md');
if (existsSync(tasksPath)) {
  const tasksText = readFileSync(tasksPath, 'utf8');
  // Parent tasks appear as `- [x] N. ...`, `- [ ] N. ...`, or `- [~] N. ...`
  // (the `[~]` partial-completion state, e.g. Task 80 reopened per D-56).
  const taskDefRe = /^- \[[ x~]\]\s+(\d{1,3})\.\s/gm;
  const ids = new Set();
  for (const m of tasksText.matchAll(taskDefRe)) ids.add(parseInt(m[1], 10));

  // Tasks tail-appended out of sequence get a `tail-appended` or similar
  // marker line (per CLAUDE.md's note about Task 45 being tail-appended)
  const reservedRe = /(?:reserved|TODO|placeholder|tail[- ]appended|not[- ]yet)[^\n]*?Task\s+(\d{1,3})/gi;
  const reverseRe = /Task\s+(\d{1,3})[^\n]*?(?:reserved|TODO|placeholder|tail[- ]appended|not[- ]yet)/gi;
  const reserved = new Set();
  for (const m of tasksText.matchAll(reservedRe)) reserved.add(parseInt(m[1], 10));
  for (const m of tasksText.matchAll(reverseRe)) reserved.add(parseInt(m[1], 10));

  if (ids.size > 0) {
    const max = Math.max(...ids);
    for (let i = 1; i <= max; i++) {
      if (ids.has(i)) continue;
      if (reserved.has(i)) continue;
      violations.push(
        `Task ${i}: not defined in tasks.md AND not marked reserved/tail-appended. ` +
          `Either add the task or add a reserved-marker line.`,
      );
    }
  }
}

// --- Report ---------------------------------------------------------

if (violations.length > 0) {
  console.error(`validate-numbering-gaps: FAIL — ${violations.length} unmarked gap(s)`);
  for (const v of violations) console.error('  ' + v);
  console.error('');
  console.error(
    '  Numbering gaps are allowed when explicit. Add a reserved-marker line to the relevant',
  );
  console.error(
    '  file (e.g., docs/adr/README.md for ADRs; requirements.md for FR/NFR; tasks.md for Tasks).',
  );
  console.error(
    '  Marker shape: a line matching `<reserved|TODO|placeholder|not-yet>` + the ID, OR',
  );
  console.error(
    '  the ID + the marker on the same line.',
  );
  process.exit(1);
}

console.log(
  `validate-numbering-gaps: OK — ADR sequence: ${adrFiles.size} files / ` +
    `0 unmarked gaps; FR + NFR + Task sequences: no unmarked gaps`,
);
