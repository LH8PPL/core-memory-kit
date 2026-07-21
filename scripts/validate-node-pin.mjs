#!/usr/bin/env node
// One Node version across every CI job (Task 240, D-383).
//
// THE DRIFT THIS EXISTS TO PREVENT — measured, not hypothetical. Before this
// validator, `node-version` was a copy-pasted literal in 11 `setup-node` blocks
// across 8 workflows, and they had already disagreed: `bench-storage.yml` ran
// Node **24** while every gate that approves the code ran **20**. So the
// benchmark measured a different runtime than production, silently, and nothing
// caught it. That is the composition-verification class applied to CI: a gate
// running a different runtime than the release job can pass code the release
// breaks on.
//
// The fix is one source of truth (`.nvmrc`, read by setup-node's
// `node-version-file` AND honored by nvm/fnm/Volta locally). This guard makes
// the fix stick: a bare `node-version:` literal fails the build.
//
// A deliberate exception is possible but must be DECLARED here with a reason —
// the point is that a divergence becomes a written choice rather than a
// copy-paste accident.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const WORKFLOWS = join(REPO, '.github', 'workflows');

/**
 * Workflows allowed a literal `node-version`, each with the REASON it diverges.
 * The point is not that the list stays empty — it is that every entry is a
 * written, defensible choice rather than a copy-paste accident. A matrix build
 * testing multiple majors would belong here too (a deliberate test axis, not
 * drift).
 */
export const LITERAL_ALLOWLIST = Object.freeze({
  // REQUIRED divergence, not drift. `scripts/bench-storage.mjs` imports
  // `node:sqlite` unconditionally at module scope, and that module did not
  // exist before Node 22.5 — on the .nvmrc pin (20) the benchmark does not
  // produce worse numbers, it CRASHES on import, and `node --experimental-sqlite`
  // is rejected at startup too.
  //
  // Decision-trail: D-383 originally moved this workflow ONTO the pin, arguing a
  // bench on a different major is an invisible confound. That reasoning was
  // right in general and WRONG here, because the thing being benchmarked has a
  // hard floor above the pin. Caught by skill-review; the file's own header
  // comment ("Node 24 — node:sqlite needs >= 22.5") had said so all along, two
  // lines above the line that was edited. The sweep was mechanical and did not
  // read it. See D-384.
  'bench-storage.yml': 'node:sqlite requires Node >= 22.5 (added 22.5.0); the benchmark imports it at module scope, so the .nvmrc pin (20) would crash the run rather than skew it',
});

/** Pure: find bare `node-version:` literals in a workflow's text. */
export function findLiteralPins(text) {
  const out = [];
  const lines = String(text).split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    // `node-version-file:` is the good form and must not match.
    // `\s*` before the colon: `node-version : 20` is valid YAML and would
    // otherwise slip past (skill-review Minor).
    if (/^\s*node-version\s*:\s*\S/.test(lines[i])) {
      out.push({ line: i + 1, text: lines[i].trim() });
    }
  }
  return out;
}

/** Pure: the checker, so it is testable without the real repo. */
export function checkNodePins({ files, nvmrc, allowlist = LITERAL_ALLOWLIST }) {
  const errors = [];
  if (!nvmrc || !/^\d+/.test(String(nvmrc).trim())) {
    errors.push('.nvmrc is missing or does not start with a major version — it is the single source of truth for every CI job');
  }
  for (const { name, text } of files) {
    for (const hit of findLiteralPins(text)) {
      if (allowlist[name]) continue;
      errors.push(
        `${name}:${hit.line} pins Node with a literal (\`${hit.text}\`) — use \`node-version-file: .nvmrc\` so every job runs one version, ` +
        'or add an entry to LITERAL_ALLOWLIST in scripts/validate-node-pin.mjs stating why this job deliberately differs',
      );
    }
  }
  return errors;
}

function runCli() {
  const nvmrcPath = join(REPO, '.nvmrc');
  const nvmrc = existsSync(nvmrcPath) ? readFileSync(nvmrcPath, 'utf8') : '';
  const files = existsSync(WORKFLOWS)
    ? readdirSync(WORKFLOWS)
        .filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))
        .map((f) => ({ name: f, text: readFileSync(join(WORKFLOWS, f), 'utf8') }))
    : [];

  const errors = checkNodePins({ files, nvmrc });
  if (errors.length > 0) {
    console.error('validate-node-pin: FAIL');
    for (const e of errors) console.error('  - ' + e);
    process.exit(1);
  }
  const usages = files.reduce(
    (n, f) => n + (f.text.match(/node-version-file:\s*\.nvmrc/g) || []).length, 0,
  );
  console.log(
    `validate-node-pin: OK — ${files.length} workflow(s), ${usages} setup-node block(s) all read .nvmrc (Node ${nvmrc.trim()})`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  runCli();
}
