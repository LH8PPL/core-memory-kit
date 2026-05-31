#!/usr/bin/env node
// validate-doc-registry.mjs — the documentation-governance harness.
//
// Why this exists
// ---------------
//
// Across the build, documentation was repeatedly written to a NEW or
// different file under deadline pressure instead of its home — spawning
// ~7 overlapping "current state / what's next / what was decided"
// surfaces (conversation-log → build-log → BOOTSTRAP → RESUME-HERE →
// findings-roadmap → DECISION-LOG → PHASE-3-PLAN). The cure is a single
// registry — docs/DOCUMENTATION-MAP.md — plus THIS validator, so the
// "no new rogue surface" rule survives a context-compact WITHOUT relying
// on Claude remembering it. Structural enforcement, not goodwill.
//
// Rule
// ----
//
// Every markdown file in a HIGH-RISK zone must be listed (by its
// repo-relative, forward-slash path) somewhere in docs/DOCUMENTATION-MAP.md.
// High-risk zones are where rogue state surfaces historically appeared:
//
//   - repo-root `*.md`        (a new ROADMAP.md / STATE.md at root)
//   - `specs/**/*.md`         (a new requirements-revisions-X.md)
//   - `docs/*.md` (top level) (a new docs/PLAN.md)
//   - `docs/journey/*.md`     (a new PHASE-N-PLAN.md / FINDINGS.md)
//
// A file found in a high-risk zone but NOT named in the map = violation
// ("unregistered doc surface"). To add a doc, add its path to the map's
// Registry section in the same change.
//
// Bulk history dirs (docs/research, docs/sources, docs/process,
// docs/adr, docs/conversation-log, archive) are registered BY ZONE in
// the map and are not enumerated file-by-file — new research notes are
// expected and self-evidently history, not new state surfaces.
//
// What this does NOT do
// ---------------------
//
// Judge whether a file's CONTENT is misclassified (e.g., an orbit file
// that smuggles in "current state"). That's a judgment rule (CLAUDE.md
// "Documentation routing"); this validator only enforces registry
// completeness — the deterministic, structural half.
//
// Scope: dev-process tool. Wired into `npm test`. Ships nothing; users
// of the kit never run it.
//
// Run: `node scripts/validate-doc-registry.mjs`

import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname, resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = process.env.CMK_VALIDATOR_ROOT
  ? resolve(process.env.CMK_VALIDATOR_ROOT)
  : resolve(dirname(__filename), '..');

const MAP_PATH = join(REPO_ROOT, 'docs', 'DOCUMENTATION-MAP.md');

function relPosix(abs) {
  return relative(REPO_ROOT, abs).split(sep).join('/');
}

// Top-level *.md in a directory (non-recursive).
function topLevelMd(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.md'))
    .map((e) => join(dir, e.name));
}

// Recursive *.md under a directory.
function walkMd(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walkMd(p, out);
    else if (e.name.endsWith('.md')) out.push(p);
  }
  return out;
}

const violations = [];

if (!existsSync(MAP_PATH)) {
  console.error('validate-doc-registry: FAIL — docs/DOCUMENTATION-MAP.md is missing.');
  console.error('  The documentation registry is the single map of where every doc lives.');
  console.error('  It must exist; create it before adding working docs.');
  process.exit(1);
}

const mapText = readFileSync(MAP_PATH, 'utf8');

// Collect the high-risk files.
const highRisk = [
  ...topLevelMd(REPO_ROOT), // repo-root *.md
  ...walkMd(join(REPO_ROOT, 'specs')), // specs/**/*.md
  ...topLevelMd(join(REPO_ROOT, 'docs')), // docs/*.md
  ...topLevelMd(join(REPO_ROOT, 'docs', 'journey')), // docs/journey/*.md
];

// De-dupe (repo-root walk + docs both safe, but specs recursion could
// overlap nothing; keep a Set for safety).
const seen = new Set();
for (const abs of highRisk) {
  const rel = relPosix(abs);
  if (seen.has(rel)) continue;
  seen.add(rel);
  if (!mapText.includes(rel)) {
    violations.push(rel);
  }
}

if (violations.length > 0) {
  console.error(
    `validate-doc-registry: FAIL — ${violations.length} unregistered doc surface(s)`,
  );
  for (const v of violations) {
    console.error(`  ${v} — not listed in docs/DOCUMENTATION-MAP.md`);
  }
  console.error('');
  console.error('  Every doc in a high-risk zone (repo-root *.md, specs/, docs/ top level,');
  console.error('  docs/journey/) must be registered in docs/DOCUMENTATION-MAP.md. Add the');
  console.error('  path to the Registry section in the same change — or, if this is a new');
  console.error('  kind of state surface, DON\'T: route the content into requirements/design/tasks.');
  process.exit(1);
}

console.log(
  `validate-doc-registry: OK — ${seen.size} high-risk doc(s) all registered in docs/DOCUMENTATION-MAP.md`,
);
