// @doors: 1
// Door 2 N/A: the pure checker takes two file lists → error array; no disk writes.
//   The real-repo case shells out to `npm pack` but asserts on its parsed
//   output (Door 1), not on a state mutation.
// Door 3 N/A: the pure checker has no subprocess; the real-repo invariant runs
//   `npm pack` but that IS the subject under test, not an injected dependency.
// Door 4 N/A: no message-queue.
// Door 5 N/A: no log surface.
//
// Task 135 (D-130) — pack-completeness validator. The cut-gate9 `npm notice`
// scare: a template file silently dropped from the tarball would scaffold-
// silently-absent for every npm user (a worse failure than a crash — the
// install "succeeds" and the missing piece surfaces later). This converts the
// manual `tar -tzf` check (run twice by hand 2026-06-11) into a permanent
// guarantee: compare the canonical `template/` tree against what `npm pack`
// would actually ship.

import { describe, it, expect } from 'vitest';
import {
  checkPackCompleteness,
  listCanonicalTemplateFiles,
  packedTemplateFiles,
} from '../scripts/validate-pack-completeness.mjs';

describe('checkPackCompleteness — drift detection (135)', () => {
  it('no errors when every canonical template file is in the packed set', () => {
    expect(
      checkPackCompleteness({
        canonical: ['template/CLAUDE.md.template', 'template/project/MEMORY.md.template'],
        packed: ['package.json', 'template/CLAUDE.md.template', 'template/project/MEMORY.md.template'],
      }),
    ).toEqual([]);
  });

  it('flags a canonical template file missing from the pack (the cut-gate9 scare)', () => {
    const errors = checkPackCompleteness({
      canonical: ['template/CLAUDE.md.template', 'template/project/SOUL.md.template'],
      packed: ['package.json', 'template/CLAUDE.md.template'],
    });
    expect(errors.length).toBe(1);
    expect(errors[0]).toMatch(/SOUL\.md\.template.*not in the npm pack/);
  });

  it('extra packed files are fine — only MISSING canonical files fail', () => {
    expect(
      checkPackCompleteness({
        canonical: ['template/a'],
        packed: ['template/a', 'template/b', 'src/x.mjs'],
      }),
    ).toEqual([]);
  });

  it('an empty canonical list is itself a failure (the extractor must bite)', () => {
    const errors = checkPackCompleteness({ canonical: [], packed: ['template/a'] });
    expect(errors.some((e) => /no canonical template files/.test(e))).toBe(true);
  });

  it('normalizes path separators (Windows backslash vs npm forward slash)', () => {
    expect(
      checkPackCompleteness({
        canonical: ['template\\project\\MEMORY.md.template'],
        packed: ['template/project/MEMORY.md.template'],
      }),
    ).toEqual([]);
  });
});

describe('the real repo packs its whole template tree (the live invariant)', () => {
  it('every canonical template/ file is in `npm pack --dry-run`', () => {
    const canonical = listCanonicalTemplateFiles();
    const packed = packedTemplateFiles();
    expect(canonical.length).toBeGreaterThan(0); // the lister must bite
    expect(packed.length).toBeGreaterThan(0); // npm pack ran + parsed
    expect(checkPackCompleteness({ canonical, packed })).toEqual([]);
  });
});
