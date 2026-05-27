#!/usr/bin/env node
// validate-composition.mjs — every documented composition-verification
// instance in CLAUDE.md has a kit artifact addressing it (test file or
// design section).
//
// The rule comes from CLAUDE.md's "Composition verification" meta-rule:
// when two components have independent budgets / contracts, check the
// composition, not just each in isolation. The kit has 4 named
// instances of the failure mode (PR-14, PR-22, PR-25, PR-A) — and §16.22
// reserves a 5th for v0.1.x (MEMORY.md 25KB ceiling vs the kit's cap
// composition).
//
// Why this validator
// ------------------
//
// Composition is semantic, not syntactic. A validator can't prove that
// component A's contract composes correctly with component B's. What
// it CAN do is verify that every documented composition instance
// references a kit artifact (test or design section) that addresses
// it. This catches the failure mode where a new instance gets added
// to CLAUDE.md's enumeration but no corresponding test or design
// section is written — the same shape PR-D1's deferrals address for
// validator self-tests, applied recursively.
//
// What this validator does
// ------------------------
//
//   1. Reads CLAUDE.md's "Composition verification" rule.
//   2. Extracts the numbered composition instances (currently 4 + 1
//      reserved).
//   3. For each instance, asserts the same line OR the line(s) below
//      reference at least one kit artifact:
//        - A test file (`tests/...test.js`)
//        - A design section (`design §X` or `§X.Y`)
//        - A reserved marker (`reserved`, `v0.1.x`, `not yet`)
//
// What this validator does NOT do
// -------------------------------
//
// Verify that the referenced test ACTUALLY exercises the composition.
// That's the test's job (per the kit's TDD + five-doors discipline).
// This validator only catches the structural omission of "we
// documented an instance but didn't reference any artifact."
//
// Run: `node scripts/validate-composition.mjs`
// Wired into `npm test` as a pre-test step.

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
// REPO_ROOT defaults to scripts/'s parent; honors CMK_VALIDATOR_ROOT
// env var for testability (sandboxed self-tests set this to point at
// a fixture directory).
const REPO_ROOT = process.env.CMK_VALIDATOR_ROOT
  ? resolve(process.env.CMK_VALIDATOR_ROOT)
  : resolve(dirname(__filename), '..');

const CLAUDE_MD = join(REPO_ROOT, 'CLAUDE.md');
if (!existsSync(CLAUDE_MD)) {
  console.error('validate-composition: CLAUDE.md not found at repo root');
  process.exit(1);
}
const text = readFileSync(CLAUDE_MD, 'utf8');

// Locate the "Composition verification" rule. The rule starts with the
// bullet `- **Composition verification —` and continues until the
// next top-level bullet at the same indent.
const compositionMatch = text.match(/-\s+\*\*Composition verification[^]+?(?=\n-\s+\*\*|\n## )/);
if (!compositionMatch) {
  console.error(
    'validate-composition: could not locate "Composition verification" rule in CLAUDE.md. ' +
      'Was the rule renamed or restructured?',
  );
  process.exit(1);
}
const ruleText = compositionMatch[0];

// Instances inside the rule appear inline as `<prefix>-<id> (...) (<description>)`
// or `Task <num> (...)`. Two prefixes accepted:
//   - `PR-<id>` for campaign-PR instances (PR-14, PR-22, PR-A, etc.)
//   - `Task <num>` for post-campaign task-driven instances (Task 25
//     was the first such, added 2026-05-27)
// Intermediate prose between the id and the parenthesized description
// is allowed (e.g., "PR-A of the post-PR-31 audit campaign (...)") but
// capped at 80 chars + rejects another instance-prefix within it — see
// PR-D2a code-review IMP-1 for the rationale (without the cap a future
// contributor writing "PR-X is similar to PR-Y (...)" would falsely
// bind PR-X to PR-Y's description).
const instanceSegments = [];
const INSTANCE_RE = /(?:PR-|Task\s+)(\w+)((?:(?!PR-|Task\s)[^()\n]){0,80}?)\(([^()]+(?:\([^()]*\)[^()]*)*)\)/g;
for (const m of ruleText.matchAll(INSTANCE_RE)) {
  instanceSegments.push({ id: m[1], description: m[3] });
}

if (instanceSegments.length === 0) {
  console.error(
    'validate-composition: found the "Composition verification" rule but couldn\'t parse any inline instances. ' +
      'Expected format: "PR-<id> (<description>)". Was the rule restructured?',
  );
  process.exit(1);
}

const violations = [];

const TEST_REF_RE = /tests\/[\w-]+\.test\.(?:js|mjs)/;
const DESIGN_REF_RE = /design\s+§\d+|§\d+\.\d+|design\.md\s+§\d+/i;
const RESERVED_MARKER_RE = /\b(?:reserved|v0\.1\.x|v0\.2|not[- ]yet)\b/i;

for (let i = 0; i < instanceSegments.length; i++) {
  const { id, description } = instanceSegments[i];
  const hasTest = TEST_REF_RE.test(description);
  const hasDesign = DESIGN_REF_RE.test(description);
  const hasReserved = RESERVED_MARKER_RE.test(description);
  if (!hasTest && !hasDesign && !hasReserved) {
    violations.push(
      `composition instance PR-${id}: "${description.slice(0, 100)}..." has no test/design/reserved reference in its inline description. ` +
        `Per CLAUDE.md "Composition verification" rule, every instance must point to a kit artifact (test file, design section) addressing it, OR be marked reserved.`,
    );
  }
}

if (violations.length > 0) {
  console.error(
    `validate-composition: FAIL — ${violations.length} composition instance(s) with no addressing artifact`,
  );
  for (const v of violations) console.error('  ' + v);
  console.error('');
  console.error(
    '  Each instance should reference at least one of: a `tests/X.test.js` file,',
  );
  console.error(
    '  a `design §X.Y` section, or a "reserved" / "v0.1.x" / "not yet" marker.',
  );
  process.exit(1);
}

console.log(
  `validate-composition: OK — ${instanceSegments.length} composition instance(s) in CLAUDE.md; all have addressing artifact (test, design section, or reserved marker)`,
);
