// @doors: 1
// Door 2 N/A: checkIndexCompleteness is pure (file lists in → error array out); no disk writes.
// Door 3 N/A: no subprocess at this boundary.
// Door 4 N/A: no message-queue.
// Door 5 N/A: no NDJSON/log surface.
//
// Task 152 — validate-index-completeness (scripts/validate-index-completeness.mjs).
// The recurring index-lag drift class: a hand-maintained catalog doc (adr/README,
// research/INDEX, sources/README, process/README) silently falls behind the files
// it lists. The 2026-06-15 docs review found FOUR stale at once while
// validate-references/-doc-completeness/-doc-registry all stayed green (those check
// link-resolution + verb/tool coverage + registry membership, NOT "does each index
// list every sibling .md"). This guard makes presence structural — both directions
// (a missing entry AND a listed-but-deleted entry both fail).
//
// Presence-only by design (per the spec): it asserts every sibling .md appears as a
// link, NOT that the description is good — content quality would be a false-positive
// magnet. We test the PURE check with synthetic inputs (a guard that only ever
// passes is worthless), then assert the REAL repo invariant.

import { describe, it, expect } from 'vitest';
import {
  checkIndexCompleteness,
  extractLinkedFiles,
  listSiblingMarkdown,
  CATALOG_INDEXES,
} from '../scripts/validate-index-completeness.mjs';

describe('checkIndexCompleteness — drift detection (the index-lag class)', () => {
  it('returns no errors when the index lists exactly its siblings', () => {
    expect(
      checkIndexCompleteness({
        dir: 'docs/research',
        linked: ['a.md', 'b.md'],
        siblings: ['a.md', 'b.md'],
      }),
    ).toEqual([]);
  });

  it('returns no errors when the index lists MORE than its siblings has on disk via allowlist (extra link ok only if file exists)', () => {
    // An index may legitimately link a file that lives elsewhere; the check is
    // siblings ⊆ linked, not equality, EXCEPT a linked sibling-shaped file that
    // does not exist on disk is the stale-entry failure (next test).
    expect(
      checkIndexCompleteness({
        dir: 'docs/research',
        linked: ['a.md', 'b.md', 'c.md'],
        siblings: ['a.md', 'b.md', 'c.md'],
      }),
    ).toEqual([]);
  });

  it('flags a sibling .md that the index does NOT list (the lag bug)', () => {
    const errors = checkIndexCompleteness({
      dir: 'docs/research',
      linked: ['a.md'],
      siblings: ['a.md', 'b.md'],
    });
    expect(errors.some((e) => /b\.md.*not listed/i.test(e))).toBe(true);
  });

  it('flags a listed entry whose file no longer exists (the stale-entry / both-directions case)', () => {
    const errors = checkIndexCompleteness({
      dir: 'docs/research',
      linked: ['a.md', 'ghost.md'],
      siblings: ['a.md'],
    });
    expect(errors.some((e) => /ghost\.md.*does not exist|no such file/i.test(e))).toBe(true);
  });

  it('honors allowlisted exclusions (a sibling that is deliberately not indexed)', () => {
    expect(
      checkIndexCompleteness({
        dir: 'docs/research',
        linked: ['a.md'],
        siblings: ['a.md', 'TEMPLATE.md'],
        exclude: ['TEMPLATE.md'],
      }),
    ).toEqual([]);
  });

  it('never lists the index file itself as a required entry', () => {
    // The index (INDEX.md / README.md) is passed in siblings by the lister but
    // must be auto-excluded — an index need not link itself.
    expect(
      checkIndexCompleteness({
        dir: 'docs/research',
        indexFile: 'INDEX.md',
        linked: ['a.md'],
        siblings: ['a.md', 'INDEX.md'],
      }),
    ).toEqual([]);
  });
});

describe('extractLinkedFiles — markdown link parsing', () => {
  it('extracts .md targets from inline markdown links', () => {
    const md = 'see [foo](2026-01-01-foo.md) and [bar](bar.md) but not [ext](https://x.com/y.md)';
    const links = extractLinkedFiles(md);
    expect(links).toContain('2026-01-01-foo.md');
    expect(links).toContain('bar.md');
  });

  it('strips a markdown link title suffix', () => {
    const links = extractLinkedFiles('[foo](bar.md "the bar note")');
    expect(links).toContain('bar.md');
    expect(links).not.toContain('bar.md "the bar note"');
  });

  it('ignores external URLs and anchors', () => {
    const md = '[a](https://example.com/a.md) [b](../other/b.md) [c](#section)';
    const links = extractLinkedFiles(md);
    // Same-dir links only; a ../ path points outside the dir, an http link is external.
    expect(links).not.toContain('https://example.com/a.md');
    expect(links).not.toContain('#section');
  });
});

describe('the real repo is index-complete (the live invariant)', () => {
  for (const cfg of CATALOG_INDEXES) {
    it(`${cfg.dir}/${cfg.indexFile} lists every sibling .md`, () => {
      const siblings = listSiblingMarkdown(cfg);
      const indexPath = `${cfg.dir}/${cfg.indexFile}`;
      // The extractor itself must bite — a catalog with zero links is a broken parse.
      expect(siblings.length).toBeGreaterThan(0);
      const errors = checkIndexCompleteness({
        dir: cfg.dir,
        indexFile: cfg.indexFile,
        linked: extractLinkedFiles(readIndex(indexPath)),
        siblings,
        exclude: cfg.exclude,
      });
      expect(errors).toEqual([]);
    });
  }
});

// Local helper for the live test (the script exports the pure pieces; reading a
// file is a test concern).
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
function readIndex(rel) {
  return readFileSync(join(REPO, rel), 'utf8');
}
