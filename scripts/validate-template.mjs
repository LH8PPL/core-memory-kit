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
import { fileURLToPath, pathToFileURL } from 'node:url';
import { requiredDirs, requiredFiles, manifestSummary } from './template-manifest.mjs';
// NOTE: tier-paths.mjs + inject-context.mjs are dynamically imported
// INSIDE checkCapCoordination() rather than statically here, because
// the template-scaffolding test sandbox copies only template/ +
// scripts/ + package.json. The cap-coordination check is a kit-dev
// invariant that skips when packages/ isn't in scope.

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = join(dirname(__filename), '..');

const violations = [];

// --- Snapshot cap coordination invariant (design §7.1) ---------------
//
// Per the coordination rule:
//   - Σ per-file caps across all tiers <= snapshot cap
//   - Σ per-file caps in tier T == TIER_BUDGETS[T]
//
// Read DEFAULT_CAP_BYTES + TIER_BUDGETS from inject-context.mjs via a
// dynamic import so the assertion stays in sync with the constants
// without copy-pasting. Then assert against per-file caps from
// tier-paths.mjs (the source-of-truth for per-file values).
//
// SKIPPED if packages/cli/src/inject-context.mjs is not present at
// REPO_ROOT — this is a kit-dev invariant, not a contract end-user
// template-validation should enforce. Standalone copies of the
// template/ + scripts/ + package.json (e.g. the
// template-scaffolding.test.js sandbox) don't ship the packages/
// tree.
async function checkCapCoordination() {
  const tierPathsPath = join(REPO_ROOT, 'packages', 'cli', 'src', 'tier-paths.mjs');
  const injectContextPath = join(REPO_ROOT, 'packages', 'cli', 'src', 'inject-context.mjs');
  if (!existsSync(tierPathsPath) || !existsSync(injectContextPath)) {
    // Not in the kit-dev tree; cap-coordination check is N/A here.
    return;
  }
  // Dynamic import: only runs when both source files exist.
  const { DEFAULT_SCRATCHPAD_CAPS, SCRATCHPADS_BY_TIER } = await import(
    pathToFileURL(tierPathsPath).href
  );
  // Sum per-file caps grouped by tier.
  const sumByTier = {};
  for (const [tier, scratchpads] of Object.entries(SCRATCHPADS_BY_TIER)) {
    let sum = 0;
    for (const name of scratchpads) {
      const cap = DEFAULT_SCRATCHPAD_CAPS[name];
      if (typeof cap !== 'number') {
        violations.push(
          `CAP-COORD: ${name} (tier ${tier}) has no DEFAULT_SCRATCHPAD_CAPS entry`,
        );
        continue;
      }
      sum += cap;
    }
    sumByTier[tier] = sum;
  }
  const sumAllTiers = Object.values(sumByTier).reduce((a, b) => a + b, 0);

  // Import the inject-context constants (DEFAULT_CAP_BYTES, TIER_BUDGETS).
  let DEFAULT_CAP_BYTES, TIER_BUDGETS;
  try {
    const mod = await import('../packages/cli/src/inject-context.mjs');
    // These constants aren't exported; we need them for the check.
    // Workaround: re-read the module source and parse the values. The
    // cleaner long-term path is to export them, but for v0.1 we keep
    // them internal + parse here so the validator owns the coupling.
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(
      join(REPO_ROOT, 'packages', 'cli', 'src', 'inject-context.mjs'),
      'utf8',
    );
    const capMatch = src.match(/DEFAULT_CAP_BYTES\s*=\s*([\d_]+)/);
    if (!capMatch) {
      violations.push('CAP-COORD: could not parse DEFAULT_CAP_BYTES from inject-context.mjs');
      return;
    }
    DEFAULT_CAP_BYTES = parseInt(capMatch[1].replace(/_/g, ''), 10);

    const budgetsBlock = src.match(/TIER_BUDGETS\s*=\s*Object\.freeze\(\{([\s\S]*?)\}\)/);
    if (!budgetsBlock) {
      violations.push('CAP-COORD: could not parse TIER_BUDGETS from inject-context.mjs');
      return;
    }
    TIER_BUDGETS = {};
    for (const m of budgetsBlock[1].matchAll(/([LPU])\s*:\s*(\d+)/g)) {
      TIER_BUDGETS[m[1]] = parseInt(m[2], 10);
    }
  } catch (err) {
    violations.push(
      `CAP-COORD: failed to load inject-context.mjs constants: ${err?.message ?? err}`,
    );
    return;
  }

  // Assertion 1: Σ per-file caps across all tiers <= DEFAULT_CAP_BYTES
  if (sumAllTiers > DEFAULT_CAP_BYTES) {
    violations.push(
      `CAP-COORD: Σ per-file caps (${sumAllTiers}) exceeds DEFAULT_CAP_BYTES (${DEFAULT_CAP_BYTES}). ` +
        `Either raise DEFAULT_CAP_BYTES in packages/cli/src/inject-context.mjs OR tighten per-file caps in DEFAULT_SCRATCHPAD_CAPS. ` +
        `Per design §7.1 coordination rule.`,
    );
  }

  // Assertion 2: per-tier budget == sum of per-file caps in that tier
  for (const tier of ['L', 'P', 'U']) {
    const expected = sumByTier[tier];
    const actual = TIER_BUDGETS[tier];
    if (actual !== expected) {
      violations.push(
        `CAP-COORD: TIER_BUDGETS.${tier}=${actual} but Σ per-file caps in tier ${tier} = ${expected}. ` +
          `Update TIER_BUDGETS.${tier} = ${expected} in packages/cli/src/inject-context.mjs. ` +
          `Per design §7.1 coordination rule.`,
      );
    }
  }
}

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

await checkCapCoordination();

const summary = manifestSummary();

if (violations.length > 0) {
  console.error(`validate-template: ${violations.length} violation(s) against manifest`);
  console.error(`manifest: ${summary.dirCount} dirs + ${summary.fileCount} files\n`);
  for (const v of violations) console.error('  ' + v);
  process.exit(1);
}

console.log(
  `validate-template: OK (${summary.dirCount} dirs + ${summary.fileCount} files; cap-coordination invariant satisfied)`,
);
process.exit(0);
