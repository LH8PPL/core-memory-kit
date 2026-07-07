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
    name: 'feedback-screen rate-limit (RATE_LIMIT_PER_FACT_PER_DAY=5, per-fact daily trust-delta cap)',
    sourceRef: 'design section 20.2 / Task 193 (ADR-0017 Phase 1d)',
    testFile: 'tests/cli-feedback-screen.test.js',
    atCapPattern: 'RATE_LIMIT_PER_FACT_PER_DAY',
    overCapPattern: 'rate-limited',
  },
  {
    name: 'feedback-screen burst-hold (BURST_MIN_SIGNALS=10 + BURST_NEGATIVE_FRACTION=0.8, storm quarantine)',
    sourceRef: 'design section 20.2 / Task 193 (ADR-0017 Phase 1d)',
    testFile: 'tests/cli-feedback-screen.test.js',
    atCapPattern: 'BURST_MIN_SIGNALS',
    overCapPattern: 'quarantined',
  },
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
    name: 'semantic embed batch caps (EMBED_BATCH_SIZE=16 items / EMBED_BATCH_CHARS=8000 chars per ONNX forward pass — P-5VJJUEES 8.8GB freeze guard)',
    sourceRef: 'semantic-backend.mjs planEmbedBatches / P-5VJJUEES (the 2026-07-07 memory-leak fix)',
    testFile: 'tests/cli-semantic-backend.test.js',
    // at-cap: batches never exceed the item-count budget; over-cap: a body
    // larger than the char budget forms its own solo batch (the padding-blowup case).
    atCapPattern: 'EMBED_BATCH_SIZE',
    overCapPattern: 'EMBED_BATCH_CHARS',
  },
  {
    name: 'snapshot Σ-caps + authority-preamble reserve (≤13,000 B)',
    sourceRef: 'design §7.1.2',
    suppressed:
      'enforced structurally on every npm test by validate-template assertion 3 (Σ caps + preamble reserve ≤ cap, gate-bite verified) — a runtime test pair would duplicate the validator',
  },
  {
    name: 'commit-proposal git timeout (400ms, silent degrade)',
    sourceRef: 'design §7.1.3 / ADR-0018 (Task 150)',
    suppressed:
      'the over-cap behavior (a hung git killed at the timeout → empty proposal) needs a controllable slow git binary — impractical as a unit pair; the degrade path is covered by the git-failure branch tests (non-git / spawn-error → silence) and the timeout is the composition guard reviewed under NFR-1 (skill-review I1: 400ms inside the 500ms hook budget)',
  },
  {
    name: 'volatile reserved lines (temporal mention 66.4 + commit proposal 150) vs the snapshot cap',
    sourceRef: 'design §7.1.3',
    suppressed:
      'both lines are RESERVED out of the caller cap (snapshot ≤ capBytes pinned by the tightened cap-composition tests incl. the three-reserve joint test in cli-inject-context.test.js); the template-sizing edge (Σ legal caps + reserves > 13,000 → graceful section-drop with a truncation.log event) is the DOCUMENTED accepted trade-off in §7.1.3 with a named re-open trigger',
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
