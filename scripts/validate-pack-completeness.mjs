#!/usr/bin/env node
// validate-pack-completeness.mjs — the canonical template/ tree must ship
// in full inside the npm tarball (Task 135, D-130).
//
// The cut-gate9 scare: `cmk install` scaffolds from the packaged
// template/, so a template file silently dropped from the tarball would
// scaffold-silently-absent for every npm user — a worse failure than a
// crash (install "succeeds", the missing piece surfaces later). The fix
// then was a manual `tar -tzf` eyeball (run twice by hand); this makes it
// structural.
//
// What it does:
//   1. Run the prepublish copy (root template/ → packages/cli/template/,
//      the gitignored build artifact `cmk install` actually reads) so the
//      packaged copy reflects the current source.
//   2. `npm pack --dry-run --json --ignore-scripts` in packages/cli
//      (--ignore-scripts so the prepublishOnly stdout can't pollute the
//      JSON — npm pack runs prepublishOnly otherwise; we already ran the
//      copy in step 1).
//   3. Assert every canonical root-template/ file appears (as `template/…`)
//      in the packed file list. Extra packed files are fine; only a MISSING
//      canonical file fails.
//
// `npm pack --json` shape (verified 2026-06-13): an array with one entry
// whose `files` is `[{path, size, mode}, …]`, paths forward-slashed,
// relative to the package root.
//
// Run: `node scripts/validate-pack-completeness.mjs`
// Wired into `npm test` as a pre-test step.

import { execFileSync, execSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO = process.env.CMK_VALIDATOR_ROOT
  ? resolve(process.env.CMK_VALIDATOR_ROOT)
  : resolve(dirname(fileURLToPath(import.meta.url)), '..');

const CANONICAL_TEMPLATE = join(REPO, 'template');
const CLI_PKG = join(REPO, 'packages', 'cli');

const norm = (p) => p.replace(/\\/g, '/');

/** Every file under the canonical root template/, as `template/…` posix paths. */
export function listCanonicalTemplateFiles() {
  const out = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else out.push('template/' + norm(relative(CANONICAL_TEMPLATE, full)));
    }
  };
  walk(CANONICAL_TEMPLATE);
  return out.sort();
}

/**
 * Run `npm pack --dry-run --json`, retrying a transient spawn failure.
 *
 * `npm pack` spawns a heavy Node process; under stress-gate concurrency (5×
 * full suite = many vitest workers contending for the machine) the spawn can
 * fail transiently (EBUSY / temp-dir contention / a slow npm startup), and a
 * bare `execSync` throws an opaque error that crashes vitest collection — the
 * exact "i don't believe in flake" class. This is a transient EXTERNAL spawn,
 * not a drift signal, so a bounded retry with backoff is the right resilience
 * (the `renameWithRetry` precedent for the Windows EPERM flake). A genuine
 * pack-drift failure surfaces in `checkPackCompleteness`, not here.
 */
function runNpmPack(attempts = 4, sleep = sleepMs) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      // --ignore-scripts: npm pack would otherwise re-run prepublishOnly, whose
      // stdout pollutes the JSON on the same stream. Constant command string via
      // execSync (npm is npm.cmd on Windows; the shell resolves it cross-platform)
      // — no args array under shell, so no DEP0190 (the buildDefaultNpmRunner
      // pattern). // platform-commands: ignore — `npm pack` is identical on all OSes
      return execSync('npm pack --dry-run --json --ignore-scripts', {
        cwd: CLI_PKG,
        encoding: 'utf8',
      });
    } catch (err) {
      lastErr = err;
      if (i < attempts - 1) sleep(50 * 2 ** i); // 50, 100, 200ms
    }
  }
  throw new Error(`npm pack failed after ${attempts} attempts: ${lastErr?.message ?? lastErr}`);
}

/** Synchronous sleep (no busy-spin) — same primitive as renameWithRetry. */
function sleepMs(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/** The `template/…` files npm would pack, from `npm pack --dry-run --json`. */
export function packedTemplateFiles() {
  // Refresh the packaged copy first (the prepublishOnly mechanic) so we
  // validate the CURRENT source, not a stale build artifact.
  execFileSync(process.execPath, [join(REPO, 'scripts', 'prepublish-copy-template.mjs')], {
    stdio: 'ignore',
  });
  const out = runNpmPack();
  const parsed = JSON.parse(out);
  const files = (parsed[0]?.files ?? []).map((f) => norm(f.path));
  return files.filter((p) => p.startsWith('template/')).sort();
}

/**
 * Pure check. Every canonical template file must be in the packed set.
 *
 * @param {object} a
 * @param {string[]} a.canonical - root-template files as `template/…`.
 * @param {string[]} a.packed    - files npm would ship (any subset prefix ok).
 */
export function checkPackCompleteness({ canonical, packed }) {
  const errors = [];
  if (!canonical || canonical.length === 0) {
    errors.push('no canonical template files found — the template/ tree is empty or the lister broke');
    return errors;
  }
  const packedSet = new Set(packed.map(norm));
  for (const file of canonical) {
    if (!packedSet.has(norm(file))) {
      errors.push(
        `canonical template file '${norm(file)}' is not in the npm pack — it would scaffold-silently-absent for every npm user. ` +
          `Check packages/cli/package.json "files" + the prepublish copy.`,
      );
    }
  }
  return errors;
}

function runCli() {
  let canonical;
  let packed;
  try {
    canonical = listCanonicalTemplateFiles();
    packed = packedTemplateFiles();
  } catch (err) {
    console.error(`validate-pack-completeness: could not enumerate the pack — ${err?.message ?? err}`);
    process.exit(1);
  }
  const errors = checkPackCompleteness({ canonical, packed });
  if (errors.length > 0) {
    console.error('validate-pack-completeness: FAIL');
    for (const e of errors) console.error('  - ' + e);
    process.exit(1);
  }
  console.log(
    `validate-pack-completeness: OK — all ${canonical.length} canonical template/ file(s) ship in the npm tarball`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  runCli();
}
