#!/usr/bin/env node
// Lint every [PUL]-XXXXXXXX token in tests/ against the kit's ID_PATTERN
// (kit-custom base32 alphabet excluding 0/O/1/l/I/8 + lowercase a).
//
// Why: four tasks in a row (10, 12, 13, 15) shipped test fixtures with
// invalid-alphabet IDs (P-MISSING2, P-NOPERSAY, P-A8FN3MQ2, P-NOPESORRY).
// Each surfaced AT TEST-RUN time, blocked the PR until the fixture was
// fixed, and recurred in the next task because new test files type
// fresh placeholder ids without checking the alphabet. Root-cause fix:
// catch it BEFORE the test runs — at lint time, on every test file in
// the repo.
//
// Run: `node scripts/validate-test-ids.mjs`
// Wired into `npm test` as a pre-test step (root package.json).
//
// Acceptable IDs:
//   - Placeholder all-same-char ids (P-AAAAAAAA, U-XXXXXXXX, L-XXXXXXXX, etc.)
//     pass ID_PATTERN because A and X are in the kit's alphabet
//   - Real generated ids from fixtures/canonicalize-vectors.json
//   - Any 8-char tail using only [2345679ABCDEFGHJKLMNPQRSTUVWXYZa]
//
// Rejected IDs (will fail lint):
//   - Any 8-char tail containing 0, O, 1, l, I, or 8
//
// Per CLAUDE.md "Engineering discipline" — test fixture IDs must pass
// ID_PATTERN. Use only the kit's base32 alphabet or copy a real id from
// fixtures/canonicalize-vectors.json.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ID_PATTERN } from '../packages/cli/src/tier-paths.mjs';

// Match the on-disk shape `[PUL]-` followed by exactly 8 alphanumerics.
// Looser than ID_PATTERN so we catch the violations rather than skip them.
const ID_TOKEN_RE = /[PUL]-[A-Za-z0-9]{8}/g;
const TEST_DIR = 'tests';
const errors = [];

// Per-line suppression marker for deliberately-invalid ids in tests that
// EXPECT rejection (e.g. "test that readBullet returns null on a malformed
// id"). Add `// validate-test-ids: ignore` to the same line as the literal.
// Sparingly used; Category-B fixtures should swap to valid alphabet instead.
const SUPPRESSION_MARKER = 'validate-test-ids: ignore';

function scan(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      scan(path);
      continue;
    }
    if (!entry.name.endsWith('.test.js') && !entry.name.endsWith('.test.mjs')) {
      continue;
    }
    const text = readFileSync(path, 'utf8');
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes(SUPPRESSION_MARKER)) continue;
      const lineMatches = [...lines[i].matchAll(ID_TOKEN_RE)];
      for (const match of lineMatches) {
        const id = match[0];
        if (!ID_PATTERN.test(id)) {
          errors.push(`${path}:${i + 1}: invalid alphabet char in id ${id}`);
        }
      }
    }
  }
}

try {
  statSync(TEST_DIR);
} catch {
  console.error(`validate-test-ids: tests/ directory not found at ${TEST_DIR}`);
  process.exit(1);
}

scan(TEST_DIR);

if (errors.length > 0) {
  console.error('validate-test-ids: FAIL');
  console.error(
    "The kit's base32 alphabet excludes 0, O, 1, l, I, 8. Fix the offending ids by:",
  );
  console.error(
    '  - replacing chars with valid alphabet chars (2-9 except 8; A-Z except I/O; lowercase a), OR',
  );
  console.error(
    '  - copying a real generated id from fixtures/canonicalize-vectors.json (expected_id_P field), OR',
  );
  console.error(
    '  - if the test DELIBERATELY uses a malformed id (e.g. asserts rejection of bad input),',
  );
  console.error(
    `    add the suppression marker on the same line: // ${SUPPRESSION_MARKER}`,
  );
  console.error('');
  for (const err of errors) console.error('  ' + err);
  process.exit(1);
}

console.log(
  'validate-test-ids: OK — all [PUL]-XXXXXXXX tokens in tests/ pass ID_PATTERN',
);
