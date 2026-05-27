// @doors: 1, 2
// Door 3 N/A: writeFact is in-process file emission; no subprocess spawn.
// Door 4 N/A: no message-queue interaction.
// Door 5 N/A: writeFact returns the action+id+path struct (Door 1); the audit-log entry that accompanies a write is the caller's responsibility (memory-write skill / auto-extract).

// Tests for Task 7 — Per-fact file format + writer (T-006).
// Per tasks.md 7.5:
//   - Test valid call creates file at expected path with all 9 frontmatter fields
//   - Test each of the 9 required fields, when omitted, produces error_category: "schema" and no file
//   - Test ID computation derives from canonicalize(body) — same ID as generateId(tier, body)
//   - Test second call with identical canonical body → same ID, no second file, audit-log "skipped: duplicate"
//   - Test optional fields (merged_from, superseded_by, private) written when supplied, absent when not
//
// Boundary-test discipline (per tasks.md "Engineering discipline"):
//   - Test the writeFact() PUBLIC contract — what file lands where with what frontmatter,
//     what the result object reports, what happens on duplicate, what gets logged.
//   - Do NOT test internal helpers (_serializeFrontmatter, _appendAuditLog, etc.).
//     Those are implementation details that may change without breaking the contract.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  mkdtempSync,
  rmSync,
  existsSync,
  readFileSync,
  readdirSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeFact } from '../packages/cli/src/write-fact.mjs';
import { generateId, canonicalize } from '../packages/canonicalize/src/index.mjs';

function validOptions(overrides = {}) {
  return {
    tier: 'P',
    type: 'feedback',
    slug: 'webcam_roi',
    title: 'Webcam ROI is wider than expected',
    body: '`--roi 0,0,80,100` is not enough exclusion for Krish-Naik-style overlays.',
    writeSource: 'user-explicit',
    trust: 'high',
    sourceFile: 'context/transcripts/2026-05-21.md',
    sourceLine: 142,
    sourceSha1: 'abc123ef0123456789abcdef0123456789abcdef',
    createdAt: '2026-05-22T14:30:00Z',
    ...overrides,
  };
}

// Use the production parser so tests see the exact typed shape callers see.
// Per Layer-2 review I2: the prior local parser was naive (split-on-first-colon,
// values typed as strings). PR-2 makes production use js-yaml; tests must too.
import { parse as parseFrontmatterText } from '../packages/cli/src/frontmatter.mjs';

function parseFrontmatter(filePath) {
  return parseFrontmatterText(readFileSync(filePath, 'utf8'));
}

function readAuditLog(tierRoot) {
  const p = join(tierRoot, '.locks', 'audit.log');
  if (!existsSync(p)) return [];
  return readFileSync(p, 'utf8')
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l));
}

describe('Task 7 — writeFact() boundary', () => {
  let sandbox;
  let projectRoot;
  let userDir;

  beforeEach(() => {
    sandbox = mkdtempSync(join(tmpdir(), 'cmk-write-fact-test-'));
    projectRoot = join(sandbox, 'proj');
    userDir = join(sandbox, 'user-tier');
  });

  afterEach(() => {
    rmSync(sandbox, { recursive: true, force: true });
  });

  describe('happy path — valid call', () => {
    it('creates a file at <project>/context/memory/<type>_<slug>.md for tier P', () => {
      const result = writeFact(validOptions({ projectRoot }));
      expect(result.action).toBe('created');
      const expectedPath = join(projectRoot, 'context', 'memory', 'feedback_webcam_roi.md');
      expect(result.path).toBe(expectedPath);
      expect(existsSync(expectedPath)).toBe(true);
    });

    it('creates a file at <project>/context.local/memory/<type>_<slug>.md for tier L', () => {
      const result = writeFact(validOptions({ projectRoot, tier: 'L' }));
      expect(result.action).toBe('created');
      expect(result.path).toBe(
        join(projectRoot, 'context.local', 'memory', 'feedback_webcam_roi.md'),
      );
    });

    it('creates a file at <userDir>/fragments/<type>_<slug>.md for tier U', () => {
      const result = writeFact(validOptions({ tier: 'U', userDir }));
      expect(result.action).toBe('created');
      expect(result.path).toBe(join(userDir, 'fragments', 'feedback_webcam_roi.md'));
    });

    it('output frontmatter contains all 9 required fields with correct values', () => {
      const opts = validOptions({ projectRoot });
      const result = writeFact(opts);
      const { frontmatter } = parseFrontmatter(result.path);
      expect(frontmatter.id).toBe(generateId('P', opts.body));
      expect(frontmatter.type).toBe('feedback');
      expect(frontmatter.title).toBe(opts.title);
      expect(frontmatter.created_at).toBe('2026-05-22T14:30:00Z');
      expect(frontmatter.write_source).toBe('user-explicit');
      expect(frontmatter.trust).toBe('high');
      expect(frontmatter.source_file).toBe(opts.sourceFile);
      // Post-PR-2: js-yaml parses integers as numbers (CORE_SCHEMA). Pre-PR-2
      // the naive parser left everything as strings; that bug is gone.
      expect(frontmatter.source_line).toBe(142);
      expect(frontmatter.source_sha1).toBe(opts.sourceSha1);
    });

    it('body content appears verbatim after the frontmatter', () => {
      const opts = validOptions({ projectRoot });
      const result = writeFact(opts);
      const { body } = parseFrontmatter(result.path);
      expect(body).toContain(opts.body);
    });

    it('returns the computed ID in the result', () => {
      const opts = validOptions({ projectRoot });
      const result = writeFact(opts);
      expect(result.id).toBe(generateId('P', opts.body));
    });
  });

  describe('schema validation — each of 9 required fields, when omitted, → error_category: "schema"', () => {
    const fieldsToOmit = [
      'type',
      'title',
      'writeSource',
      'trust',
      'sourceFile',
      'sourceLine',
      'sourceSha1',
    ];

    for (const field of fieldsToOmit) {
      it(`omitting ${field} → error_category: "schema", no file written`, () => {
        const opts = validOptions({ projectRoot });
        delete opts[field];
        const result = writeFact(opts);
        expect(result.action).toBe('error');
        expect(result.errorCategory).toBe('schema');
        expect(result.errors).toBeDefined();
        expect(result.errors.length).toBeGreaterThan(0);
        const memDir = join(projectRoot, 'context', 'memory');
        expect(existsSync(memDir) ? readdirSync(memDir) : []).toEqual([]);
      });
    }

    it('omitting body (so id cannot be computed) → error_category: "schema", no file written', () => {
      const opts = validOptions({ projectRoot });
      delete opts.body;
      const result = writeFact(opts);
      expect(result.action).toBe('error');
      expect(result.errorCategory).toBe('schema');
    });

    it('output file frontmatter always contains id + created_at (writer-filled defaults)', () => {
      const opts = validOptions({ projectRoot });
      delete opts.createdAt;
      const result = writeFact(opts);
      expect(result.action).toBe('created');
      const { frontmatter } = parseFrontmatter(result.path);
      expect(frontmatter.id).toMatch(/^P-[2345679ABCDEFGHJKLMNPQRSTUVWXYZa]{8}$/);
      expect(frontmatter.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it('invalid tier → schema error', () => {
      const r = writeFact(validOptions({ projectRoot, tier: 'X' }));
      expect(r.action).toBe('error');
      expect(r.errorCategory).toBe('schema');
    });

    it('invalid type (not in taxonomy) → schema error', () => {
      const r = writeFact(validOptions({ projectRoot, type: 'whatever' }));
      expect(r.action).toBe('error');
      expect(r.errorCategory).toBe('schema');
    });

    it('invalid writeSource (not in enum) → schema error', () => {
      const r = writeFact(validOptions({ projectRoot, writeSource: 'guessed' }));
      expect(r.action).toBe('error');
      expect(r.errorCategory).toBe('schema');
    });

    it('invalid trust (not in enum) → schema error', () => {
      const r = writeFact(validOptions({ projectRoot, trust: 'maybe' }));
      expect(r.action).toBe('error');
      expect(r.errorCategory).toBe('schema');
    });

    it('non-positive sourceLine → schema error', () => {
      const r1 = writeFact(validOptions({ projectRoot, sourceLine: 0 }));
      expect(r1.action).toBe('error');
      expect(r1.errorCategory).toBe('schema');
      const r2 = writeFact(validOptions({ projectRoot, sourceLine: -5 }));
      expect(r2.action).toBe('error');
      expect(r2.errorCategory).toBe('schema');
      const r3 = writeFact(validOptions({ projectRoot, sourceLine: 'x' }));
      expect(r3.action).toBe('error');
      expect(r3.errorCategory).toBe('schema');
    });

    it('slug containing path-traversal characters → schema error (no file outside memory/)', () => {
      const r = writeFact(validOptions({ projectRoot, slug: '../escape' }));
      expect(r.action).toBe('error');
      expect(r.errorCategory).toBe('schema');
      expect(existsSync(join(projectRoot, 'escape.md'))).toBe(false);
    });
  });

  // Layer-2 review B2 RELAXATION (PR-2): PR-1 rejected \n / \r / : in scalar
  // frontmatter fields as a minimum fix for the naive serializer. PR-2's
  // frontmatter.mjs (js-yaml CORE_SCHEMA) quotes those chars properly. The
  // input restriction is LIFTED here — these tests prove the round-trip
  // works for previously-rejected inputs.
  describe('B2 relaxation — chars previously rejected by PR-1 now round-trip correctly via js-yaml', () => {
    const trickyValues = [
      { label: 'newline', value: 'first line\nsecond line' },
      { label: 'carriage-return', value: 'first\rsecond' },
      { label: 'colon', value: 'something: with colon' },
      {
        label: 'all three combined',
        value: 'with: colon\nand newline\rand cr',
      },
    ];

    for (const { label, value } of trickyValues) {
      it(`title containing ${label}: write succeeds + round-trip preserves the value`, () => {
        const r = writeFact(validOptions({ projectRoot, title: value }));
        expect(r.action).toBe('created');
        const { frontmatter } = parseFrontmatter(r.path);
        expect(frontmatter.title).toBe(value);
      });

      it(`sourceFile containing ${label}: write succeeds + round-trip preserves the value`, () => {
        const r = writeFact(validOptions({ projectRoot, sourceFile: value }));
        expect(r.action).toBe('created');
        const { frontmatter } = parseFrontmatter(r.path);
        expect(frontmatter.source_file).toBe(value);
      });

      it(`sourceSha1 containing ${label}: write succeeds + round-trip preserves the value`, () => {
        const r = writeFact(validOptions({ projectRoot, sourceSha1: value }));
        expect(r.action).toBe('created');
        const { frontmatter } = parseFrontmatter(r.path);
        expect(frontmatter.source_sha1).toBe(value);
      });
    }

    it('YAML injection attempt does NOT create extra frontmatter keys (proves quoting works)', () => {
      const r = writeFact(
        validOptions({
          projectRoot,
          title: 'Innocent\nadmin: true\nfake_id: P-EVIL1234', // validate-test-ids: ignore
        }),
      );
      expect(r.action).toBe('created');
      const { frontmatter } = parseFrontmatter(r.path);
      // The whole multi-line string is the title; no `admin` or `fake_id`
      // keys leaked into the frontmatter object.
      expect(frontmatter.title).toBe(
        'Innocent\nadmin: true\nfake_id: P-EVIL1234', // validate-test-ids: ignore
      );
      expect(frontmatter.admin).toBeUndefined();
      expect(frontmatter.fake_id).toBeUndefined();
    });

    it('safe values still work (regression guard against over-restrictive validation)', () => {
      const r = writeFact(
        validOptions({
          projectRoot,
          title: 'A safe title with - dashes and (parens)',
          sourceFile: 'context/transcripts/2026-05-24.md',
          sourceSha1: 'abc123ef0123456789abcdef0123456789abcdef',
        }),
      );
      expect(r.action).toBe('created');
    });
  });

  describe('ID derivation (task 7.3)', () => {
    it('ID equals generateId(tier, body) — derived from body, not title or slug', () => {
      const opts = validOptions({ projectRoot, title: 'IRRELEVANT', slug: 'irrelevant' });
      const result = writeFact(opts);
      expect(result.id).toBe(generateId('P', opts.body));
    });

    it('changing title or slug does not change the ID', () => {
      const a = writeFact(
        validOptions({ projectRoot, title: 'Title A', slug: 'slug_a' }),
      );
      const sandboxB = mkdtempSync(join(tmpdir(), 'cmk-write-fact-test-b-'));
      try {
        const b = writeFact(
          validOptions({
            projectRoot: join(sandboxB, 'proj'),
            title: 'Title B',
            slug: 'slug_b',
          }),
        );
        expect(a.id).toBe(b.id);
      } finally {
        rmSync(sandboxB, { recursive: true, force: true });
      }
    });

    it('canonical-text equivalent bodies yield the same ID', () => {
      const r1 = writeFact(
        validOptions({ projectRoot, slug: 'a', body: 'Hello World' }),
      );
      const sandbox2 = mkdtempSync(join(tmpdir(), 'cmk-write-fact-test-c-'));
      try {
        const r2 = writeFact(
          validOptions({
            projectRoot: join(sandbox2, 'proj'),
            slug: 'b',
            body: '  hello  WORLD.  ',
          }),
        );
        expect(canonicalize('Hello World')).toBe(canonicalize('  hello  WORLD.  '));
        expect(r1.id).toBe(r2.id);
      } finally {
        rmSync(sandbox2, { recursive: true, force: true });
      }
    });
  });

  describe('dedup-via-canonical-ID (task 7.4)', () => {
    it('second call with identical body + identical slug → action: skipped, no overwrite', () => {
      const opts = validOptions({ projectRoot });
      const first = writeFact(opts);
      expect(first.action).toBe('created');
      const mtime1 = readFileSync(first.path);

      const second = writeFact(opts);
      expect(second.action).toBe('skipped');
      expect(second.skipReason).toBe('duplicate');
      expect(second.id).toBe(first.id);

      // file content byte-identical (no overwrite)
      expect(readFileSync(second.path)).toEqual(mtime1);
    });

    it('second call with identical body + different slug → skipped, audit log records duplicate-elsewhere', () => {
      const first = writeFact(validOptions({ projectRoot, slug: 'first' }));
      expect(first.action).toBe('created');

      const second = writeFact(validOptions({ projectRoot, slug: 'second' }));
      expect(second.action).toBe('skipped');
      expect(second.id).toBe(first.id);
      // No second file created
      expect(
        existsSync(
          join(projectRoot, 'context', 'memory', 'feedback_second.md'),
        ),
      ).toBe(false);

      const log = readAuditLog(join(projectRoot, 'context'));
      expect(log.length).toBeGreaterThan(0);
      const skipEntry = log.find((e) => e.action === 'skipped');
      expect(skipEntry).toBeDefined();
      // Post-PR-2 canonical audit-log schema: reasonCode is the machine-
      // parseable enum; reasonText is the optional free-text companion.
      expect(skipEntry.reasonCode).toMatch(/duplicate/);
      expect(skipEntry.id).toBe(first.id);
      expect(skipEntry.schema).toBe(1);
      expect(skipEntry.tier).toBe('P');
    });

    it('different body → different ID, second file created', () => {
      const first = writeFact(validOptions({ projectRoot, slug: 'a' }));
      const second = writeFact(
        validOptions({
          projectRoot,
          slug: 'b',
          body: 'A different fact entirely.',
        }),
      );
      expect(first.action).toBe('created');
      expect(second.action).toBe('created');
      expect(first.id).not.toBe(second.id);
      expect(existsSync(first.path)).toBe(true);
      expect(existsSync(second.path)).toBe(true);
    });

    it('duplicate skip is also logged for same-slug re-writes', () => {
      const opts = validOptions({ projectRoot });
      writeFact(opts);
      writeFact(opts);
      const log = readAuditLog(join(projectRoot, 'context'));
      const skipped = log.filter((e) => e.action === 'skipped');
      expect(skipped.length).toBeGreaterThan(0);
    });
  });

  describe('optional fields written when supplied, absent when not', () => {
    it('default call: no merged_from, superseded_by, private, tags, related in frontmatter', () => {
      const result = writeFact(validOptions({ projectRoot }));
      const { frontmatter } = parseFrontmatter(result.path);
      expect(frontmatter.merged_from).toBeUndefined();
      expect(frontmatter.superseded_by).toBeUndefined();
      expect(frontmatter.private).toBeUndefined();
      expect(frontmatter.tags).toBeUndefined();
      expect(frontmatter.related).toBeUndefined();
    });

    it('mergedFrom: [id, ...] → frontmatter merged_from: [...]', () => {
      const result = writeFact(
        validOptions({
          projectRoot,
          mergedFrom: ['P-AAAAAAAA', 'P-BBBBBBBB'],
        }),
      );
      const text = readFileSync(result.path, 'utf8');
      expect(text).toMatch(/merged_from:\s*\[\s*P-AAAAAAAA\s*,\s*P-BBBBBBBB\s*\]/);
    });

    it('supersededBy: id → frontmatter superseded_by: id', () => {
      const result = writeFact(
        validOptions({ projectRoot, supersededBy: 'P-NEWFACT2' }),
      );
      const { frontmatter } = parseFrontmatter(result.path);
      expect(frontmatter.superseded_by).toBe('P-NEWFACT2');
    });

    it('isPrivate: true → frontmatter private: true (boolean, not string)', () => {
      const result = writeFact(validOptions({ projectRoot, isPrivate: true }));
      const { frontmatter } = parseFrontmatter(result.path);
      // Post-PR-2: js-yaml parses booleans as booleans (was string 'true' pre-PR-2).
      expect(frontmatter.private).toBe(true);
    });

    it('isPrivate: false → no private field in frontmatter (default behavior)', () => {
      const result = writeFact(validOptions({ projectRoot, isPrivate: false }));
      const { frontmatter } = parseFrontmatter(result.path);
      expect(frontmatter.private).toBeUndefined();
    });

    it('tags + related lists serialize as inline YAML arrays', () => {
      const result = writeFact(
        validOptions({
          projectRoot,
          tags: ['video-pipeline', 'roi'],
          related: ['P-A8FN3MQ2'], // validate-test-ids: ignore
        }),
      );
      const text = readFileSync(result.path, 'utf8');
      expect(text).toMatch(/tags:\s*\[\s*video-pipeline\s*,\s*roi\s*\]/);
      expect(text).toMatch(/related:\s*\[\s*P-A8FN3MQ2\s*\]/); // validate-test-ids: ignore
    });
  });
});
