#!/usr/bin/env node
// validate-maintainer-name-confined.mjs — Task 122 structural guard (D-102).
//
// The repo is PUBLIC. The maintainer's real name is allowed in EXACTLY ONE
// place: the author / copyright metadata (LICENSE + the plugin/package author
// fields — the maintainer's deliberate public authorship, the user's 2026-06-09
// call). It must appear NOWHERE ELSE — not in code comments, scripts, tests,
// docs, or commit-message-derived content (CLAUDE.md "Name privacy").
//
// The D-51 sweep (2026-06-04) only covered .md and MISSED code/scripts/tests;
// the name was still in 4 shipped src files + 5 scripts + 6 test occurrences
// when the v0.2.3 cut surfaced it. This guard makes that drift a build failure
// so the next session can't silently re-introduce it.
//
// MATCHING (hardened 2026-06-09, Task 123.B / D-103): case-INSENSITIVE,
// word-START boundary `\b<firstname>`. The original `-w -F` (whole-word, fixed,
// case-sensitive) match had TWO holes the cut-gate7 run exposed: it missed
// lowercase forms (the name-prefixed `<name>-test-N` run labels in shipped src)
// AND name-PREFIXED identifiers with no internal boundary (`<name>wiki`,
// `<name>pedia`). `\b<name>` catches the bare name + every prefixed form, while
// the word-START boundary still excludes mid-word false positives (e.g. the
// stem buried inside a word like "ameliorate" is not at a boundary).
//
// The name is NOT hardcoded here — it is read from the LICENSE copyright line
// (the one canonical home), so this validator file itself stays name-free and
// auto-adapts if the maintainer ever changes.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');

// The ONLY files allowed to carry the real name (author / copyright identity).
export const ALLOWLIST = new Set([
  'LICENSE',
  'plugin/.claude-plugin/plugin.json',
  '.claude-plugin/marketplace.json',
  'python/pyproject.toml',
]);

/**
 * Pure: extract the first-name token of the copyright holder from LICENSE text.
 * The first name is the broad check — code comments used the first name alone;
 * the full name only appears in the allowlisted author fields, and a full-name
 * line still contains the first-name token, so the first name covers both.
 * Returns null if no copyright line is found.
 */
export function parseMaintainerFirstName(licenseText) {
  const m = String(licenseText).match(/Copyright \([cC]\)\s*\d{4}\s+(.+)/);
  if (!m) return null;
  return m[1].trim().split(/\s+/)[0];
}

/** Pure: the tracked files that carry the name but are NOT in the allowlist. */
export function offendersOutsideAllowlist(filesWithName, allowlist = ALLOWLIST) {
  return filesWithName.filter((f) => !allowlist.has(f));
}

/**
 * Pure: the case-insensitive PCRE the guard greps for. `\b<firstname>` flags the
 * bare name AND name-prefixed identifiers (`<name>-test`, `<name>wiki`,
 * `<name>pedia`) — the forms the old `-w -F` match missed (D-103). The word-START
 * boundary excludes mid-word false positives (e.g. "ameliorate"). The name is regex-
 * escaped so a metacharacter in the copyright holder can't break the pattern.
 * git grep and the test apply this same string, so they can't drift.
 */
export function buildNamePattern(name) {
  const escaped = String(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return `\\b${escaped}`;
}

/** IO: tracked files matching the name pattern, case-insensitive (git grep, no shell). */
function filesContaining(name) {
  // execFileSync (no shell) so the pattern is an argv element, never interpolated
  // into a command line — no quoting/injection surface. -i case-insensitive,
  // -P PCRE (for the `\b` word boundary). git grep exit status 1 = "no matches"
  // (clean), not an error.
  try {
    const out = execFileSync('git', ['grep', '-l', '-i', '-P', '--', buildNamePattern(name)], {
      cwd: REPO,
      encoding: 'utf8',
    });
    return out.split('\n').map((s) => s.trim()).filter(Boolean);
  } catch (e) {
    if (e.status === 1) return [];
    throw e;
  }
}

function run() {
  const name = parseMaintainerFirstName(readFileSync(join(REPO, 'LICENSE'), 'utf8'));
  if (!name) {
    console.error('validate-maintainer-name-confined: cannot read the copyright holder from LICENSE');
    process.exit(1);
  }
  const offenders = offendersOutsideAllowlist(filesContaining(name));
  if (offenders.length > 0) {
    console.error('validate-maintainer-name-confined: FAIL');
    console.error('  The maintainer name appears OUTSIDE the allowed author/copyright files:');
    for (const f of offenders) console.error('    - ' + f);
    console.error(
      `\n  The name belongs ONLY in: ${[...ALLOWLIST].join(', ')}.` +
        '\n  Everywhere else use "the user" (quotes/attributions) or "the maintainer" (credit) — CLAUDE.md "Name privacy".',
    );
    process.exit(1);
  }
  console.log(
    `validate-maintainer-name-confined: OK — maintainer name confined to ${ALLOWLIST.size} author/copyright file(s); absent from all other tracked files`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  run();
}
