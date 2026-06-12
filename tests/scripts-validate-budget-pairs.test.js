// @doors: 1
// Door 2 N/A: checkBudgetPairs is pure (registry + file-reader in → errors out).
// Door 3 N/A: no subprocess.
// Door 4 N/A: no message-queue.
// Door 5 N/A: no log surface.
//
// Task 137.4 — at-cap/over-cap fixture pairs for every documented budget
// (the D-124 class). The output-cap clipped a rich fact mid-word and the
// corrupted stub reached disk because no test sat AT and OVER the boundary —
// the budget was documented, the behavior at its edge wasn't pinned.
//
// Enforcement is registry-driven: scripts/validate-budget-pairs.mjs carries
// BUDGET_REGISTRY — every documented budget names its test file + an at-cap
// pattern + an over-cap pattern (or is suppressed with a written reason).
// The validator asserts the referenced files exist and contain the patterns.
// Adding a budget without boundary tests now forces either real tests or a
// visible suppression — never silence. (validate-composition.mjs covers
// CLAUDE.md's composition INSTANCES; this covers numeric BUDGET boundaries —
// the "folds into validate-composition" wording in the task entry predates
// that validator shipping with its narrower scope.)

import { describe, it, expect } from 'vitest';
import {
  checkBudgetPairs,
  BUDGET_REGISTRY,
} from '../scripts/validate-budget-pairs.mjs';

const fakeReader = (files) => (path) => {
  if (!(path in files)) return null;
  return files[path];
};

describe('checkBudgetPairs — drift detection (137.4 / the D-124 class)', () => {
  const entry = {
    name: 'demo-cap',
    sourceRef: 'design §0.0',
    testFile: 'tests/demo.test.js',
    atCapPattern: 'fits exactly at the cap',
    overCapPattern: 'over the cap is dropped',
  };

  it('passes when the file exists and carries both boundary patterns', () => {
    const errors = checkBudgetPairs([entry], fakeReader({
      'tests/demo.test.js': 'it("fits exactly at the cap")\nit("over the cap is dropped")',
    }));
    expect(errors).toEqual([]);
  });

  it('flags a missing test file', () => {
    const errors = checkBudgetPairs([entry], fakeReader({}));
    expect(errors.some((e) => /demo-cap.*test file not found/.test(e))).toBe(true);
  });

  it('flags a missing at-cap or over-cap pattern (one-sided boundary tests)', () => {
    const onlyOver = checkBudgetPairs([entry], fakeReader({
      'tests/demo.test.js': 'it("over the cap is dropped")',
    }));
    expect(onlyOver.some((e) => /demo-cap.*at-cap/.test(e))).toBe(true);

    const onlyAt = checkBudgetPairs([entry], fakeReader({
      'tests/demo.test.js': 'it("fits exactly at the cap")',
    }));
    expect(onlyAt.some((e) => /demo-cap.*over-cap/.test(e))).toBe(true);
  });

  it('a suppressed entry needs a reason — bare suppression fails', () => {
    const errors = checkBudgetPairs(
      [{ name: 'parked-cap', sourceRef: 'design §0.0', suppressed: '' }],
      fakeReader({}),
    );
    expect(errors.some((e) => /parked-cap.*suppression needs a reason/.test(e))).toBe(true);
    expect(
      checkBudgetPairs(
        [{ name: 'parked-cap', sourceRef: 'design §0.0', suppressed: 'enforced by validate-template assertion 3' }],
        fakeReader({}),
      ),
    ).toEqual([]);
  });
});

describe('the real repo: every registered budget has its boundary pair (the live invariant)', () => {
  it('the registry is non-empty and clean against the real tree', () => {
    expect(BUDGET_REGISTRY.length).toBeGreaterThan(0);
    const { checkBudgetPairsOnRepo } = awaitImport();
    expect(checkBudgetPairsOnRepo()).toEqual([]);
  });
});

// Synchronous import helper — the module is already loaded above; this keeps
// the real-repo check colocated without a dynamic-import dance.
import * as validator from '../scripts/validate-budget-pairs.mjs';
function awaitImport() {
  return validator;
}
