#!/usr/bin/env node
// validate-exit-doors.mjs — enforce the `@doors:` annotation discipline
// from design §17.1 ("The five exit doors").
//
// Goldberg's five doors (per nodejs-testing-best-practices):
//   1. Response — what the public function returns
//   2. New state — disk / audit trail / scratchpad mutations
//   3. External services — subprocess spawn args, HTTP / SMS / payment
//   4. Message queues — MQ IPC (N/A by default in v0.1; two named
//      exceptions: auto-extract temp-file IPC + Task 31 MCP)
//   5. Observability — NDJSON log entries with the right shape
//
// Annotation format (design §17.1):
//
//   // @doors: 1, 2, 3, 5
//   // Door 4 N/A: no message-queue interaction.
//
// Or for auto-extract / MCP boundary tests:
//
//   // @doors: 1, 2, 3, 4, 5
//
// What this validator does
// ------------------------
//
// Enforces THE HEADER is present and parses. Specifically:
//   1. Walks every *.test.{js,mjs} file under tests/.
//   2. Requires a `@doors: <list>` comment within the first 20 lines.
//   3. Parses the declared doors (1-5; out-of-range = violation).
//   4. For any door 1..5 NOT in the declared set, requires a `// Door
//      N N/A: <reason>` line in the header zone — silent omission is
//      explicitly forbidden by design §17.1 ("Discipline is never
//      silent omission").
//
// What this validator does NOT do
// -------------------------------
//
// Heuristic-match declared doors against assertion patterns in the
// file body. The earlier draft tried; the heuristics were either too
// strict (false positives on tests whose Door-2 surface is a reported
// struct rather than a literal `readFileSync` assertion) or too loose
// (defeating the purpose). Substantive declared-vs-actual coverage is
// part of the `code-review-excellence` ONE-holistic-pass-per-PR
// discipline (CLAUDE.md "Skill agency"); this validator pins the
// procedural floor.
//
// Modes
// -----
//
//   Default: missing header = warning (PR-D rollout).
//   CMK_DOORS_STRICT=1: missing header = error (PR-D final commit).
//
// Annotation-line shape (D1-MIN-C, deferred from PR-D1 code-review):
// The `@doors:` regex (`/^\s*\/\/\s*@doors:\s*([0-9,\s]+)\s*$/`)
// requires the WHOLE line after `// @doors:` to be digits + commas +
// whitespace. Trailing inline prose like `// @doors: 1, 2, 3 — see
// notes` will NOT match and the file is treated as un-annotated.
// This is intentional — the @doors: header is meant to be a clean
// declaration; per-door reasoning belongs in the subsequent `// Door
// N N/A: <reason>` lines, NOT as inline comments on the @doors: line.
// If you have something to say about an INCLUDED door (not an N/A
// one), put it in the test body's comments or in a follow-up `//`
// line right after the header.
//
// Suppression (use sparingly): `// @doors-ignore` anywhere in the
// header zone (first 20 lines) skips the file entirely. The lock-
// discipline self-test wouldn't need this; reserved for true edge
// cases like meta-tests that test the validator itself.
//
// Suppression-marker prose-literal risk (D1-MIN-D, deferred from
// PR-D1 code-review): the header-zone check uses
// `headerZone.includes(SUPPRESSION_MARKER)`. If a test file's header
// docstring quotes `@doors-ignore` as a literal in prose (e.g.,
// "we don't use @doors-ignore here"), the file gets falsely
// suppressed. Low-risk because the marker is intentionally unusual,
// but if this ever fires, the fix is to rename the marker to
// something stricter (e.g., `// @doors-ignore-this-file`).
//
// Run: `node scripts/validate-exit-doors.mjs`
// Wired into `npm test` as a pre-test step.
//
// Per CLAUDE.md "Engineering discipline" — five exit doors framework
// (Goldberg, attributed in SOURCES.md).

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const TEST_DIR = 'tests';
const STRICT = process.env.CMK_DOORS_STRICT === '1';
const SUPPRESSION_MARKER = '@doors-ignore';
const HEADER_ZONE_LINES = 20;

const DOOR_NAMES = {
  1: 'Response',
  2: 'New state',
  3: 'External services',
  4: 'Message queues',
  5: 'Observability',
};

function parseDeclaration(text) {
  const lines = text.split(/\r?\n/).slice(0, HEADER_ZONE_LINES);
  const decl = { doors: null, naReasons: {}, raw: null, headerLines: lines };
  for (const line of lines) {
    const m = line.match(/^\s*\/\/\s*@doors:\s*([0-9,\s]+)\s*$/);
    if (m) {
      decl.raw = line.trim();
      decl.doors = new Set(
        m[1]
          .split(',')
          .map((s) => parseInt(s.trim(), 10))
          .filter((n) => Number.isFinite(n)),
      );
      continue;
    }
    const naMatch = line.match(/^\s*\/\/\s*Door\s+([1-5])\s+N\/?A\s*:\s*(.+)$/i);
    if (naMatch) {
      decl.naReasons[parseInt(naMatch[1], 10)] = naMatch[2].trim();
    }
  }
  return decl;
}

function scan(dir, results) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      scan(path, results);
      continue;
    }
    if (!entry.name.endsWith('.test.js') && !entry.name.endsWith('.test.mjs')) continue;
    results.push(path);
  }
}

const violations = [];
const warnings = [];
const testFiles = [];
try {
  statSync(TEST_DIR);
} catch {
  console.error(`validate-exit-doors: tests/ directory not found at ${TEST_DIR}`);
  process.exit(1);
}
scan(TEST_DIR, testFiles);

let annotated = 0;
let suppressed = 0;
for (const path of testFiles) {
  const text = readFileSync(path, 'utf8');
  const headerZone = text.split(/\r?\n/).slice(0, HEADER_ZONE_LINES).join('\n');
  if (headerZone.includes(SUPPRESSION_MARKER)) {
    suppressed++;
    continue;
  }

  const decl = parseDeclaration(text);
  if (!decl.doors) {
    const msg = `${path}: missing \`// @doors: <list>\` header in first ${HEADER_ZONE_LINES} lines (design §17.1).`;
    if (STRICT) violations.push(msg);
    else warnings.push(msg);
    continue;
  }

  // Out-of-range declarations are always a violation regardless of mode.
  for (const d of decl.doors) {
    if (d < 1 || d > 5) {
      violations.push(`${path}: @doors declares door ${d}; valid range is 1..5 (Goldberg's five doors).`);
    }
  }

  // Silent-omission check: every door 1..5 not in the declared set
  // must have a `Door N N/A: <reason>` line. Door 4 is the most common
  // omission and the one design §17.1 explicitly calls out.
  for (const d of [1, 2, 3, 4, 5]) {
    if (decl.doors.has(d)) continue;
    if (!decl.naReasons[d]) {
      const msg = `${path}: door ${d} (${DOOR_NAMES[d]}) is neither declared nor marked N/A. Per design §17.1, "Discipline is never silent omission" — add either \`// @doors: ${[...decl.doors, d].sort().join(', ')}\` or \`// Door ${d} N/A: <reason>\` to the header.`;
      // Silent-omission graduates to violation in STRICT; warning otherwise.
      if (STRICT) violations.push(msg);
      else warnings.push(msg);
    }
  }
  annotated++;
}

if (warnings.length > 0 && !STRICT) {
  console.error(
    `validate-exit-doors: ${warnings.length} warning(s) — header / N/A discipline gaps`,
  );
  for (const w of warnings) console.error('  ' + w);
  console.error('');
  console.error(
    '  Warnings will become errors when CMK_DOORS_STRICT=1 (final commit of PR-D flips the default).',
  );
  console.error('');
}

if (violations.length > 0) {
  console.error(`validate-exit-doors: FAIL — ${violations.length} violation(s)`);
  for (const v of violations) console.error('  ' + v);
  process.exit(1);
}

const skipMsg = suppressed > 0 ? `; ${suppressed} suppressed via // ${SUPPRESSION_MARKER}` : '';
const warnMsg = warnings.length > 0 ? `; ${warnings.length} warning${warnings.length === 1 ? '' : 's'} (non-strict mode)` : '';
console.log(
  `validate-exit-doors: OK — ${annotated}/${testFiles.length} test files annotated${skipMsg}${warnMsg}`,
);
