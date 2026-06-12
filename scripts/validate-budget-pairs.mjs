#!/usr/bin/env node
// validate-budget-pairs.mjs — every documented numeric budget has an
// at-cap + over-cap test pair, or a written suppression
// (Task 137.4 — the D-124 class made structural).
//
// The class: the extraction output cap (maxOutputBytes) was documented and
// enforced, but no test sat AT and OVER the boundary — so the hard-slice
// clipping a rich fact mid-word shipped, and a 9-char corrupted stub
// reached disk. Budgets fail at their EDGES; happy-path tests never visit
// them.
//
// Enforcement is registry-driven: BUDGET_REGISTRY below names every
// documented budget, its source-of-truth reference, and the test file +
// at-cap/over-cap patterns proving the boundary pair exists — OR a
// `suppressed: '<reason>'` making the gap visible instead of silent.
// Adding a budget without boundary tests forces a registry decision.
//
// Relation to validate-composition.mjs: that validator covers CLAUDE.md's
// composition INSTANCES (narrative → artifact); this one covers numeric
// BUDGET boundaries (cap → at/over test pair). The task entry's original
// "folds into validate-composition" wording predates that validator
// shipping with its narrower scope.
//
// Run: `node scripts/validate-budget-pairs.mjs`
// Wired into `npm test` as a pre-test step.

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO = process.env.CMK_VALIDATOR_ROOT
  ? resolve(process.env.CMK_VALIDATOR_ROOT)
  : resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * The documented budgets. Patterns are plain substrings matched against the
 * test file's text (comments count — they anchor intent; the test body's
 * quality is the review's job, the validator catches structural omission).
 */
export const BUDGET_REGISTRY = [
  {
    name: 'extraction-output-cap (maxOutputBytes 8192, clipped-fact drop)',
    sourceRef: 'design §6.4 / D-124 (Task 136)',
    testFile: 'tests/cli-auto-extract.test.js',
    atCapPattern: 'maxOutputBytes',
    overCapPattern: 'clipped_facts_dropped',
  },
  {
    name: 'scratchpad per-file cap (max_chars consolidate-on-over-cap)',
    sourceRef: 'design §7.1 cap-coordination',
    testFile: 'tests/cli-scratchpad.test.js',
    atCapPattern: 'max_chars',
    overCapPattern: 'consolidat',
  },
  {
    name: 'tool-activity block caps (300-char snippets / 4000-char block)',
    sourceRef: 'design §19 / D-117 (Task 104.1)',
    testFile: 'tests/cli-turn-tools.test.js',
    atCapPattern: 'truncat',
    overCapPattern: 'caps each result snippet',
  },
  {
    name: 'snapshot Σ-caps + authority-preamble reserve (≤13,000 B)',
    sourceRef: 'design §7.1.2',
    suppressed:
      'enforced structurally on every npm test by validate-template assertion 3 (Σ caps + preamble reserve ≤ cap, gate-bite verified) — a runtime test pair would duplicate the validator',
  },
];

/**
 * Pure check. `readFile(path) → text | null` is injected for tests.
 *
 * @param {Array<object>} registry
 * @param {(path: string) => string | null} readFile
 */
export function checkBudgetPairs(registry, readFile) {
  const errors = [];
  for (const entry of registry) {
    if ('suppressed' in entry) {
      if (!entry.suppressed || !String(entry.suppressed).trim()) {
        errors.push(`budget '${entry.name}': suppression needs a reason — bare suppression is the silent gap this validator exists to kill`);
      }
      continue;
    }
    const text = readFile(entry.testFile);
    if (text == null) {
      errors.push(`budget '${entry.name}': test file not found at ${entry.testFile}`);
      continue;
    }
    if (!text.includes(entry.atCapPattern)) {
      errors.push(
        `budget '${entry.name}': ${entry.testFile} carries no at-cap pattern ('${entry.atCapPattern}') — ` +
          `the boundary's fits-exactly side is unpinned (${entry.sourceRef})`,
      );
    }
    if (!text.includes(entry.overCapPattern)) {
      errors.push(
        `budget '${entry.name}': ${entry.testFile} carries no over-cap pattern ('${entry.overCapPattern}') — ` +
          `the boundary's exceeds side is unpinned (${entry.sourceRef})`,
      );
    }
  }
  return errors;
}

/** The real-tree runner (also used by the test's live-invariant case). */
export function checkBudgetPairsOnRepo() {
  return checkBudgetPairs(BUDGET_REGISTRY, (rel) => {
    const p = join(REPO, rel);
    return existsSync(p) ? readFileSync(p, 'utf8') : null;
  });
}

function runCli() {
  const errors = checkBudgetPairsOnRepo();
  if (errors.length > 0) {
    console.error('validate-budget-pairs: FAIL');
    for (const e of errors) console.error('  - ' + e);
    process.exit(1);
  }
  const suppressed = BUDGET_REGISTRY.filter((e) => 'suppressed' in e).length;
  console.log(
    `validate-budget-pairs: OK — ${BUDGET_REGISTRY.length} documented budget(s): ${BUDGET_REGISTRY.length - suppressed} with at/over-cap test pairs, ${suppressed} suppressed with reasons`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  runCli();
}
