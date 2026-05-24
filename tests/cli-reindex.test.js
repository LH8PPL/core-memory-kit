// Tests for Task 8 — INDEX.md generation + maintenance (T-007).
// Per tasks.md 8.4:
//   - Test reindex with 0 facts produces header-only INDEX.md
//   - Test reindex with N facts produces exactly N body lines in the documented format
//   - Test adding a new fact + reindex: new line appears at the documented sort position
//   - Test removing a fact + reindex: line disappears
//   - Test retitling a fact (frontmatter `title:` change) + reindex: line shows new title
//   - Test 26 KB INDEX scenario: warning to stderr, file still written
//   - Test tombstoned facts (`deleted_at`) excluded from INDEX
//
// Boundary-test discipline:
//   - Test the reindex() PUBLIC contract — INDEX file shape, line format,
//     sort order, warning behavior. NOT internal helpers (frontmatter parser,
//     hook extractor, tier-path resolver).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  mkdtempSync,
  rmSync,
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  unlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { reindex } from '../packages/cli/src/reindex.mjs';
import { writeFact } from '../packages/cli/src/write-fact.mjs';

function validFactOpts(overrides = {}) {
  return {
    tier: 'P',
    type: 'feedback',
    slug: 'sample',
    title: 'Sample fact',
    body: 'This is the body of the sample fact.',
    writeSource: 'user-explicit',
    trust: 'high',
    sourceFile: 'context/transcripts/2026-05-24.md',
    sourceLine: 1,
    sourceSha1: 'deadbeef0123456789abcdef0123456789abcdef',
    ...overrides,
  };
}

describe('Task 8 — reindex() boundary', () => {
  let sandbox;
  let projectRoot;
  let userDir;
  let memDir;

  beforeEach(() => {
    sandbox = mkdtempSync(join(tmpdir(), 'cmk-reindex-test-'));
    projectRoot = join(sandbox, 'proj');
    userDir = join(sandbox, 'user-tier');
    memDir = join(projectRoot, 'context', 'memory');
  });

  afterEach(() => {
    rmSync(sandbox, { recursive: true, force: true });
  });

  describe('empty / sparse cases', () => {
    it('reindex with 0 facts → INDEX.md with header + ## Files but no body lines', () => {
      mkdirSync(memDir, { recursive: true });
      const result = reindex({ tier: 'P', projectRoot });
      expect(result.factCount).toBe(0);
      expect(existsSync(result.indexPath)).toBe(true);
      const content = readFileSync(result.indexPath, 'utf8');
      expect(content).toMatch(/^# /m); // a top-level heading exists
      expect(content).toMatch(/## Files/);
      // No bullet lines under ## Files
      const filesSection = content.split('## Files')[1] ?? '';
      const bulletLines = filesSection.split('\n').filter((l) => l.startsWith('- '));
      expect(bulletLines).toEqual([]);
    });

    it('reindex on a non-existent memory dir → creates the dir + empty INDEX', () => {
      const result = reindex({ tier: 'P', projectRoot });
      expect(result.factCount).toBe(0);
      expect(existsSync(result.indexPath)).toBe(true);
    });
  });

  describe('N facts → N body lines, documented format', () => {
    it('three facts → three body lines, each matching format `- ({id}) [type] [title](filename.md) — <hook>`', () => {
      writeFact(validFactOpts({ projectRoot, slug: 'a', body: 'Body of A — first one.' }));
      writeFact(
        validFactOpts({
          projectRoot,
          slug: 'b',
          body: 'Body of B — second one.',
          type: 'project',
          title: 'Title B',
        }),
      );
      writeFact(
        validFactOpts({
          projectRoot,
          slug: 'c',
          body: 'Body of C — third one.',
          type: 'user',
          title: 'Title C',
        }),
      );

      const result = reindex({ tier: 'P', projectRoot });
      expect(result.factCount).toBe(3);

      const content = readFileSync(result.indexPath, 'utf8');
      const bulletLines = content
        .split('\n')
        .filter((l) => l.startsWith('- ('));
      expect(bulletLines).toHaveLength(3);

      const lineRe = /^- \(([PUL]-[2345679ABCDEFGHJKLMNPQRSTUVWXYZa]{8})\) \[(user|feedback|project|reference)\] \[(.+?)\]\((\S+?\.md)\)( — .+)?$/;
      for (const line of bulletLines) {
        expect(line).toMatch(lineRe);
      }
    });

    it('reindex sorts body lines deterministically by id ascending', () => {
      writeFact(validFactOpts({ projectRoot, slug: 'first', body: 'fact one' }));
      writeFact(validFactOpts({ projectRoot, slug: 'second', body: 'fact two' }));
      writeFact(validFactOpts({ projectRoot, slug: 'third', body: 'fact three' }));

      const result = reindex({ tier: 'P', projectRoot });
      const content = readFileSync(result.indexPath, 'utf8');
      const ids = [...content.matchAll(/^- \((P-[^)]+)\)/gm)].map((m) => m[1]);
      const sorted = [...ids].sort();
      expect(ids).toEqual(sorted);
    });

    it('INDEX line title reflects the fact frontmatter title', () => {
      writeFact(
        validFactOpts({
          projectRoot,
          slug: 'sample',
          title: 'Original title',
          body: 'first body',
        }),
      );
      const r1 = reindex({ tier: 'P', projectRoot });
      const c1 = readFileSync(r1.indexPath, 'utf8');
      expect(c1).toContain('[Original title]');
      expect(c1).not.toContain('[Updated title]');
    });

    it('INDEX line hook is the first non-heading body line, truncated to ~80 chars', () => {
      const longBody =
        '# Heading line should be skipped\n\n' +
        'The actual hook content starts here and goes on for a while past the eighty-character mark to test truncation.';
      writeFact(
        validFactOpts({ projectRoot, slug: 'long', body: longBody }),
      );
      const result = reindex({ tier: 'P', projectRoot });
      const content = readFileSync(result.indexPath, 'utf8');
      const line = content.split('\n').find((l) => l.startsWith('- ('));
      expect(line).toContain('— The actual hook content starts');
      // Truncation indicator (ellipsis) on long hooks
      expect(line).toMatch(/\.\.\.\s*$/);
      // Total hook length (after the "— ") is bounded
      const hookPart = line.split(' — ')[1] ?? '';
      expect(hookPart.length).toBeLessThanOrEqual(90);
    });
  });

  describe('add / remove / retitle round-trips', () => {
    it('add a new fact + reindex → new line appears in INDEX', () => {
      writeFact(validFactOpts({ projectRoot, slug: 'a', body: 'first' }));
      const r1 = reindex({ tier: 'P', projectRoot });
      const c1 = readFileSync(r1.indexPath, 'utf8');
      expect(c1.match(/^- \(P-/gm)?.length).toBe(1);

      writeFact(validFactOpts({ projectRoot, slug: 'b', body: 'second' }));
      const r2 = reindex({ tier: 'P', projectRoot });
      const c2 = readFileSync(r2.indexPath, 'utf8');
      expect(c2.match(/^- \(P-/gm)?.length).toBe(2);
      expect(r2.factCount).toBe(2);
    });

    it('delete a fact file + reindex → its line disappears', () => {
      const w1 = writeFact(validFactOpts({ projectRoot, slug: 'a', body: 'first' }));
      writeFact(validFactOpts({ projectRoot, slug: 'b', body: 'second' }));
      reindex({ tier: 'P', projectRoot });

      unlinkSync(w1.path);

      const r2 = reindex({ tier: 'P', projectRoot });
      const c2 = readFileSync(r2.indexPath, 'utf8');
      expect(c2).not.toContain(w1.id);
      expect(r2.factCount).toBe(1);
    });

    it('retitle a fact (rewrite frontmatter title) + reindex → INDEX shows new title', () => {
      const w = writeFact(
        validFactOpts({ projectRoot, slug: 'a', title: 'Original', body: 'body' }),
      );
      reindex({ tier: 'P', projectRoot });

      // Manually rewrite frontmatter title (simulating an edit)
      const original = readFileSync(w.path, 'utf8');
      const updated = original.replace(/^title: .*$/m, 'title: Updated');
      writeFileSync(w.path, updated, 'utf8');

      const r2 = reindex({ tier: 'P', projectRoot });
      const c2 = readFileSync(r2.indexPath, 'utf8');
      expect(c2).toContain('[Updated]');
      expect(c2).not.toContain('[Original]');
    });
  });

  describe('size warning at >25 KB', () => {
    it('a 26 KB INDEX scenario produces a warning AND still writes the file', () => {
      // Generate enough facts to exceed 25 KB INDEX.
      // Each line is ~150 chars including a 80-char hook → need ~180 facts.
      for (let i = 0; i < 200; i++) {
        writeFact(
          validFactOpts({
            projectRoot,
            slug: `fact_${String(i).padStart(4, '0')}`,
            body: `Fact body number ${i} — pad pad pad pad pad pad pad pad pad pad pad pad`,
          }),
        );
      }
      const warnings = [];
      const result = reindex({
        tier: 'P',
        projectRoot,
        warn: (msg) => warnings.push(msg),
      });
      const content = readFileSync(result.indexPath, 'utf8');
      const size = Buffer.byteLength(content, 'utf8');
      expect(size).toBeGreaterThan(25 * 1024);
      expect(existsSync(result.indexPath)).toBe(true);
      expect(warnings.some((w) => /25|consolidat/i.test(w))).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings.some((w) => /25|consolidat/i.test(w))).toBe(true);
    });

    it('small INDEX → no size warning', () => {
      writeFact(validFactOpts({ projectRoot, slug: 'tiny' }));
      const warnings = [];
      const result = reindex({
        tier: 'P',
        projectRoot,
        warn: (msg) => warnings.push(msg),
      });
      expect(result.warnings.length).toBe(0);
      expect(warnings.length).toBe(0);
    });
  });

  describe('tombstones + malformed files', () => {
    it('a fact with deleted_at: in its frontmatter is excluded from INDEX', () => {
      const w1 = writeFact(validFactOpts({ projectRoot, slug: 'live', body: 'live one' }));
      const w2 = writeFact(validFactOpts({ projectRoot, slug: 'gone', body: 'gone one' }));

      // Inject deleted_at into w2's frontmatter
      const text = readFileSync(w2.path, 'utf8');
      const tombstoned = text.replace(
        /^---\n/,
        '---\ndeleted_at: 2026-05-24T12:00:00Z\n',
      );
      writeFileSync(w2.path, tombstoned, 'utf8');

      const r = reindex({ tier: 'P', projectRoot });
      const c = readFileSync(r.indexPath, 'utf8');
      expect(c).toContain(w1.id);
      expect(c).not.toContain(w2.id);
      expect(r.factCount).toBe(1);
    });

    it('a file without frontmatter is skipped (with warning) and does not crash reindex', () => {
      mkdirSync(memDir, { recursive: true });
      writeFileSync(join(memDir, 'feedback_loose.md'), '# Just a heading\n', 'utf8');
      writeFact(validFactOpts({ projectRoot, slug: 'good', body: 'valid' }));

      const warnings = [];
      const r = reindex({
        tier: 'P',
        projectRoot,
        warn: (msg) => warnings.push(msg),
      });
      expect(r.factCount).toBe(1);
      expect(warnings.length).toBeGreaterThan(0);
    });

    it('a file with frontmatter missing the id field is skipped (with warning)', () => {
      mkdirSync(memDir, { recursive: true });
      writeFileSync(
        join(memDir, 'feedback_noid.md'),
        '---\ntype: feedback\ntitle: No ID\n---\n\nbody\n',
        'utf8',
      );
      writeFact(validFactOpts({ projectRoot, slug: 'good', body: 'valid' }));

      const warnings = [];
      const r = reindex({
        tier: 'P',
        projectRoot,
        warn: (msg) => warnings.push(msg),
      });
      expect(r.factCount).toBe(1);
      expect(warnings.length).toBeGreaterThan(0);
    });

    it('the existing INDEX.md is not counted as a fact during a re-walk', () => {
      writeFact(validFactOpts({ projectRoot, slug: 'a' }));
      const r1 = reindex({ tier: 'P', projectRoot });
      expect(r1.factCount).toBe(1);
      // Now INDEX.md exists in memDir. Re-walk should still report 1 fact.
      const r2 = reindex({ tier: 'P', projectRoot });
      expect(r2.factCount).toBe(1);
    });

    it('subdirectories under memory/ (e.g. archive/tombstones/) are NOT scanned', () => {
      writeFact(validFactOpts({ projectRoot, slug: 'live' }));
      const archiveDir = join(memDir, 'archive', 'tombstones');
      mkdirSync(archiveDir, { recursive: true });
      writeFileSync(
        join(archiveDir, 'feedback_buried.md'),
        '---\nid: P-BURIED99\ntype: feedback\ntitle: Buried\n---\n\nshould not appear\n',
        'utf8',
      );

      const r = reindex({ tier: 'P', projectRoot });
      const c = readFileSync(r.indexPath, 'utf8');
      expect(c).not.toContain('P-BURIED99');
      expect(c).not.toContain('Buried');
      expect(r.factCount).toBe(1);
    });
  });

  describe('tier path resolution', () => {
    it('tier L → writes INDEX at <projectRoot>/context.local/memory/INDEX.md', () => {
      writeFact(validFactOpts({ projectRoot, tier: 'L', slug: 'a' }));
      const r = reindex({ tier: 'L', projectRoot });
      expect(r.indexPath).toBe(
        join(projectRoot, 'context.local', 'memory', 'INDEX.md'),
      );
      expect(existsSync(r.indexPath)).toBe(true);
    });

    it('tier U → writes INDEX at <userDir>/fragments/INDEX.md', () => {
      writeFact(validFactOpts({ tier: 'U', userDir, slug: 'a' }));
      const r = reindex({ tier: 'U', userDir });
      expect(r.indexPath).toBe(join(userDir, 'fragments', 'INDEX.md'));
      expect(existsSync(r.indexPath)).toBe(true);
    });

    it('tier P → writes INDEX at <projectRoot>/context/memory/INDEX.md', () => {
      writeFact(validFactOpts({ projectRoot, slug: 'a' }));
      const r = reindex({ tier: 'P', projectRoot });
      expect(r.indexPath).toBe(
        join(projectRoot, 'context', 'memory', 'INDEX.md'),
      );
    });

    it('returns the tier in the result for downstream callers', () => {
      writeFact(validFactOpts({ projectRoot }));
      const r = reindex({ tier: 'P', projectRoot });
      expect(r.tier).toBe('P');
    });
  });
});
