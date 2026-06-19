#!/usr/bin/env node
// validate-prompt-assertions.mjs — every LLM-spawn site pins WHAT IS SENT
// (Task 137.1 — "Door 3.5", design §17.9; the D-122 class made structural).
//
// The class: capture-turn composed the just-captured turn into the dedup
// context SENT to Haiku, and no test pinned the sent prompt — the extractor
// self-suppressed for ~10 releases while every surface stayed unit-green.
// Door 3 asserts a subprocess was CALLED; Door 3.5 pins the PROMPT CONTENT
// the call carries (the input + instructions composition).
//
// Enforcement (two-factor, the validate-exit-doors precedent):
//   1. DISCOVER: every module under packages/cli/src/ that calls
//      `backend.compress(` / `haikuBackend.compress(` is an LLM-prompt
//      composition site (compressor.mjs itself is the transport, excluded).
//   2. Each site's test file (tests/cli-<module>.test.js) must carry BOTH:
//        (a) the `@door-3.5:` declaration marker, and
//        (b) actual prompt assertions — an expect() referencing the captured
//            call's `input` and `instructions`.
//      Declared-but-not-asserted and asserted-but-undeclared both fail.
//
// Run: `node scripts/validate-prompt-assertions.mjs`
// Wired into `npm test` as a pre-test step.

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO = process.env.CMK_VALIDATOR_ROOT
  ? resolve(process.env.CMK_VALIDATOR_ROOT)
  : resolve(dirname(fileURLToPath(import.meta.url)), '..');

const SRC_DIR = join(REPO, 'packages', 'cli', 'src');
const TESTS_DIR = join(REPO, 'tests');

// The transport module defines compress(); it composes nothing.
const TRANSPORT_MODULES = new Set(['compressor']);

/**
 * Find every src module that composes an LLM prompt (calls a backend's
 * compress()). Returns [{module, testFile, testText}] — testFile/testText
 * null when the expected test file is missing.
 */
export function discoverLlmSpawnSites() {
  const sites = [];
  for (const name of readdirSync(SRC_DIR)) {
    if (!name.endsWith('.mjs')) continue;
    const module = name.replace(/\.mjs$/, '');
    if (TRANSPORT_MODULES.has(module)) continue;
    const src = readFileSync(join(SRC_DIR, name), 'utf8');
    // Strip line comments first — capture-turn/inject-context REFERENCE
    // `compress({...})` in spawn-discipline comments without calling it.
    const code = src
      .split('\n')
      .map((l) => l.replace(/(^|\s)\/\/.*$/, ''))
      .join('\n');
    // An LLM-prompt composition site is either a direct `backend.compress({...})`
    // OR a `compressWithRetry(backend, {...})` (Task 161 / D-175 — the bounded-retry
    // wrapper the ceiling-free verbs now call; the prompt object {input,instructions}
    // is still composed at this site, so it must carry the Door-3.5 pin).
    if (!/\w+\.compress\(\{/.test(code) && !/compressWithRetry\(\s*\w+\s*,\s*\{/.test(code)) continue;
    const testFile = `tests/cli-${module}.test.js`;
    const testPath = join(REPO, 'tests', `cli-${module}.test.js`);
    if (existsSync(testPath)) {
      sites.push({ module, testFile, testText: readFileSync(testPath, 'utf8') });
    } else {
      sites.push({ module, testFile: null, testText: null });
    }
  }
  return sites;
}

const MARKER_RE = /@door-3\.5:/;
// The actual-assertion factor: the file must REFERENCE the captured call's
// sent fields — `<something>.input` / `<something>.instructions` property
// access (the recording-backend idiom every site suite uses), or an expect()
// whose argument names the field. Heuristic by design (the exit-doors
// precedent) — the marker declares intent, these tokens prove a pin exists;
// the test's own quality is the review's job.
//
// Skill-review fix (2026-06-12): the first version ended in an unanchored
// `|toMatch/` alternation — ANY file containing toMatch passed the input
// factor, gutting the two-factor check. Pinned by the gate-bite unit test
// (a toMatch-only file must fail).
const INPUT_PIN_RE = /\.\s*input\b|expect\([^)\n]*\binput\b/;
const INSTRUCTIONS_PIN_RE = /\.\s*instructions\b|expect\([^)\n]*\binstructions\b/;

/**
 * Pure check. Returns human-readable errors (empty = every site pinned).
 *
 * @param {Array<{module: string, testFile: string|null, testText: string|null}>} sites
 */
export function checkPromptAssertions(sites) {
  const errors = [];
  for (const { module, testFile, testText } of sites) {
    if (!testFile || testText == null) {
      errors.push(
        `LLM-spawn site '${module}' has no test file at tests/cli-${module}.test.js — ` +
          `every prompt-composition site needs its Door-3.5 pin (design §17.9).`,
      );
      continue;
    }
    const hasMarker = MARKER_RE.test(testText);
    const hasPins = INPUT_PIN_RE.test(testText) && INSTRUCTIONS_PIN_RE.test(testText);
    if (!hasMarker) {
      errors.push(
        `LLM-spawn site '${module}': ${testFile} has no @door-3.5: marker — ` +
          `declare the prompt-assertion (and make sure one exists; design §17.9).`,
      );
      continue;
    }
    if (!hasPins) {
      errors.push(
        `LLM-spawn site '${module}': ${testFile} declares @door-3.5 but carries no prompt assertion ` +
          `(no expect() pinning the sent input/instructions) — declared-but-not-asserted.`,
      );
    }
  }
  return errors;
}

function runCli() {
  const sites = discoverLlmSpawnSites();
  if (sites.length === 0) {
    console.error('validate-prompt-assertions: FAIL — discovered zero LLM-spawn sites; the discovery regex no longer matches the codebase shape');
    process.exit(1);
  }
  const errors = checkPromptAssertions(sites);
  if (errors.length > 0) {
    console.error('validate-prompt-assertions: FAIL');
    for (const e of errors) console.error('  - ' + e);
    process.exit(1);
  }
  console.log(
    `validate-prompt-assertions: OK — ${sites.length} LLM-spawn site(s), each test pinning the sent prompt (Door 3.5)`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  runCli();
}
