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
// The name is NOT hardcoded here — it is read from the LICENSE copyright line
// (the one canonical home), so this validator file itself stays name-free and
// auto-adapts if the maintainer ever changes.

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');

// The ONLY files allowed to carry the real name (author / copyright identity).
const ALLOWLIST = new Set([
  'LICENSE',
  'plugin/.claude-plugin/plugin.json',
  '.claude-plugin/marketplace.json',
  'python/pyproject.toml',
]);

function maintainerFirstName() {
  const license = readFileSync(join(REPO, 'LICENSE'), 'utf8');
  const m = license.match(/Copyright \([cC]\)\s*\d{4}\s+(.+)/);
  if (!m) {
    console.error('validate-maintainer-name-confined: cannot read the copyright holder from LICENSE');
    process.exit(1);
  }
  // The first-name token is the broad check — code comments used the first name
  // alone ("the user (2026-…)" used to be "<first> 2026-…"); the full name only
  // ever appears in the allowlisted author fields, and a line with the full name
  // also contains the first-name token, so checking the first name covers both.
  return m[1].trim().split(/\s+/)[0];
}

function filesContaining(name) {
  // git grep scans only tracked files; -w word boundary, -F fixed string.
  // Exit status 1 = "no matches" (clean), not an error.
  try {
    const out = execSync(`git grep -l -w -F -- "${name}"`, { cwd: REPO, encoding: 'utf8' });
    return out.split('\n').map((s) => s.trim()).filter(Boolean);
  } catch (e) {
    if (e.status === 1) return [];
    throw e;
  }
}

const name = maintainerFirstName();
const offenders = filesContaining(name).filter((f) => !ALLOWLIST.has(f));

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
