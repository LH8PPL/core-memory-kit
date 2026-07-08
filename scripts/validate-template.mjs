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

import { existsSync, readFileSync, statSync } from 'node:fs';
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
// Task 164.10 — the scaffold templates a user gets must be lint-clean markdown
// (so a user's CI markdownlint passes on committed context/). This is a pure
// line-scan of the two cheapest-to-regress rules — MD022 (blanks around
// headings) and MD060 (spaced table separators) — NOT a full markdownlint
// (that needs a network/npx dep). It guards the regression class the 164.x
// generator + template fixes closed: a future template edit that drops a blank
// around a heading or writes a compact `|---|` table separator fails here.
function checkTemplateLintClean() {
  const mdTemplates = [
    'template/project/MEMORY.md.template',
    'template/project/SOUL.md.template',
    'template/project/memory/INDEX.md.template',
    'template/user/USER.md.template',
    'template/user/HABITS.md.template',
    'template/user/LESSONS.md.template',
  ];
  for (const rel of mdTemplates) {
    const abs = join(REPO_ROOT, rel);
    if (!existsSync(abs)) continue; // a missing-file violation is reported elsewhere
    const lines = readFileSync(abs, 'utf8').split(/\r?\n/);
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      // MD022: an ATX heading must have a blank line above (unless first line)
      // and below (unless last line). HTML comments + blank lines are fine.
      if (/^#{1,6}\s/.test(line)) {
        if (i > 0 && lines[i - 1].trim() !== '') {
          violations.push(`LINT(MD022) ${rel}:${i + 1}: heading needs a blank line ABOVE — "${line.slice(0, 40)}"`);
        }
        if (i < lines.length - 1 && lines[i + 1].trim() !== '') {
          violations.push(`LINT(MD022) ${rel}:${i + 1}: heading needs a blank line BELOW — "${line.slice(0, 40)}"`);
        }
      }
      // MD060 (compact table separator): a `|---|---|` row with no spaces.
      if (/^\s*\|(\s*:?-+:?\s*\|)+\s*$/.test(line) && /\|-/.test(line.replace(/\s/g, ''))) {
        if (/\|-{1,}/.test(line) && !/\|\s-/.test(line)) {
          violations.push(`LINT(MD060) ${rel}:${i + 1}: table separator needs spaces around pipes (\`| --- |\`) — "${line.slice(0, 40)}"`);
        }
      }
    }
  }
}

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

  // Import the inject-context constants (DEFAULT_CAP_BYTES, TIER_BUDGETS,
  // and the exported AUTHORITATIVE_MEMORY_PREAMBLE for assertion 3).
  let DEFAULT_CAP_BYTES, TIER_BUDGETS, PREAMBLE;
  try {
    const mod = await import('../packages/cli/src/inject-context.mjs');
    PREAMBLE = mod.AUTHORITATIVE_MEMORY_PREAMBLE ?? '';
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

  // Assertion 3 (Task 75.0, design §7.1.2): the authoritative-memory
  // preamble + its 2 joining newlines + Σ per-file caps must fit the
  // snapshot cap TOGETHER. Without the JOINT check, the preamble-size
  // test (≤700) and assertion 1 (Σ ≤ cap) each pass while a future
  // budget raise composes past the cap at runtime — the effective cap
  // handed to truncation (cap − preamble reserve) would fall below Σ
  // budgets and silently drop the user tier on every session (the exact
  // PR-25 failure shape, reintroduced through the preamble seam).
  const preambleBytes = Buffer.byteLength(PREAMBLE, 'utf8');
  const preambleReserve = preambleBytes === 0 ? 0 : preambleBytes + 2;
  if (sumAllTiers + preambleReserve > DEFAULT_CAP_BYTES) {
    violations.push(
      `CAP-COORD: Σ per-file caps (${sumAllTiers}) + authoritative-memory preamble reserve (${preambleReserve}) ` +
        `= ${sumAllTiers + preambleReserve} exceeds DEFAULT_CAP_BYTES (${DEFAULT_CAP_BYTES}). ` +
        `Shrink AUTHORITATIVE_MEMORY_PREAMBLE, tighten per-file caps, or raise DEFAULT_CAP_BYTES. ` +
        `Per design §7.1.2 composition rule.`,
    );
  }
}

// Task 148.7 (ADR-0019, design §6.10) — privacy-critical gitignore lines.
// The fragment lands in every user's .gitignore; if one of these lines is
// dropped in a future edit, an UNSCREENED surface travels with `git clone`:
//   *.live.md          — the L1-masked-but-not-judge-screened live buffer
//   .extract-*.tmp     — the raw turn buffer for the detached child
//   *.extract.log      — discarded-candidate traces (not secret-screened)
//   context.local/     — the whole local tier (incl. private.md, 148.5)
const REQUIRED_GITIGNORE_LINES = [
  'context.local/',
  'context/sessions/*.extract.log',
  'context/transcripts/.extract-*.tmp',
  'context/transcripts/*.live.md',
];

function checkGitignorePrivacyLines() {
  const fragPath = join(REPO_ROOT, 'template', '.gitignore.fragment');
  if (!existsSync(fragPath)) return; // MISSING FILE already reported by the manifest walk
  const lines = new Set(
    readFileSync(fragPath, 'utf8')
      .split(/\r?\n/)
      .map((l) => l.trim()),
  );
  for (const required of REQUIRED_GITIGNORE_LINES) {
    if (!lines.has(required)) {
      violations.push(
        `GITIGNORE-PRIVACY: template/.gitignore.fragment is missing the line ${JSON.stringify(required)} ` +
          `— an unscreened surface would travel with git clone. Per design §6.10 (Task 148.7).`,
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
checkTemplateLintClean();
checkGitignorePrivacyLines();

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
