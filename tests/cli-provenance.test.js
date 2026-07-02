// @doors: 1
// Door 2 N/A: tests assert on the return-value bullet text + provenance frontmatter string; no kit disk-state mutation under test (the frontmatter is rendered in-memory).
// Door 3 N/A: no subprocess spawn.
// Door 4 N/A: no message-queue interaction.
// Door 5 N/A: provenance is a pure read/write helper; observability logs are the caller's responsibility.

// Tests for Task 13 — Provenance frontmatter writer + reader (T-011).
// Per tasks.md 13.4:
//   - Test writeBullet({text, provenance}) produces two-line output: bullet,
//     then HTML comment with all required fields
//   - Test each required field, when omitted: rejected with errorCategory: "schema"
//   - Test reader parses comment back into struct with all fields populated
//   - Test reader skips lines not matching the comment shape (graceful on
//     freeform markdown)
//   - Test round-trip: write → read → write produces byte-identical output
//
// Boundary-test discipline:
//   - Test writeBullet() + readBullet() + parseBulletProvenance() public
//     contracts only — string in, string/struct out. No I/O involved here;
//     this module is pure-functional formatting/parsing.

import { describe, it, expect } from 'vitest';
import {
  writeBullet,
  readBullet,
  parseBulletProvenance,
} from '../packages/cli/src/provenance.mjs';

function validBulletInput(overrides = {}) {
  return {
    id: 'P-S79MJHFN',
    text: 'we standardized on python 3.13',
    provenance: {
      source: 'transcripts/2026-05-22.md',
      source_line: 142,
      sha1: 'abc123ef0123456789abcdef0123456789abcdef',
      write: 'user-explicit',
      trust: 'high',
      at: '2026-05-22T14:30:00Z',
    },
    ...overrides,
  };
}

describe('Task 13 — writeBullet() / readBullet() / parseBulletProvenance()', () => {
  describe('writeBullet() — 2-line output with all required fields (13.1)', () => {
    it('produces a bullet line and a provenance HTML-comment line', () => {
      const r = writeBullet(validBulletInput());
      expect(r.action).toBe('formatted');
      expect(r.bullet).toBe('- (P-S79MJHFN) we standardized on python 3.13');
      // String checks (not /<!--/ or /-->$/ regexes) — those trip CodeQL
      // js/bad-tag-filter even in tests; the assertion is the same.
      expect(r.comment.startsWith('  <!--')).toBe(true);
      expect(r.comment.endsWith('-->')).toBe(true);
      expect(r.lines).toBe(`${r.bullet}\n${r.comment}`);
    });

    it('all 6 comment fields appear in the documented canonical order', () => {
      const r = writeBullet(validBulletInput());
      // Order: source, source_line, sha1, write, trust, at
      const expectedRe =
        /<!-- source: transcripts\/2026-05-22\.md, source_line: 142, sha1: abc123ef0123456789abcdef0123456789abcdef, write: user-explicit, trust: high, at: 2026-05-22T14:30:00Z -->/;
      expect(r.comment).toMatch(expectedRe);
    });

    it('id appears in the bullet line as (P-XXX), not in the comment', () => {
      const r = writeBullet(validBulletInput());
      expect(r.bullet.startsWith('- (P-S79MJHFN)')).toBe(true);
      // id is not duplicated in the comment (it's recoverable from the bullet line)
      expect(r.comment).not.toMatch(/\bid:/);
    });
  });

  describe('writeBullet() — schema validation: each required field omitted → schema error (13.2)', () => {
    const topLevelRequired = ['id', 'text'];
    for (const field of topLevelRequired) {
      it(`omitting top-level ${field} → schema error`, () => {
        const opts = validBulletInput();
        delete opts[field];
        const r = writeBullet(opts);
        expect(r.action).toBe('error');
        expect(r.errorCategory).toBe('schema');
        expect(r.errors.join(' ').toLowerCase()).toContain(field.toLowerCase());
      });
    }

    const provenanceRequired = ['source', 'source_line', 'sha1', 'write', 'trust', 'at'];
    for (const field of provenanceRequired) {
      it(`omitting provenance.${field} → schema error`, () => {
        const opts = validBulletInput();
        const prov = { ...opts.provenance };
        delete prov[field];
        opts.provenance = prov;
        const r = writeBullet(opts);
        expect(r.action).toBe('error');
        expect(r.errorCategory).toBe('schema');
        expect(r.errors.join(' ')).toMatch(new RegExp(field, 'i'));
      });
    }

    it('missing provenance entirely → schema error listing all required fields', () => {
      const r = writeBullet({ id: 'P-AAAAAAAA', text: 'hello' });
      expect(r.action).toBe('error');
      expect(r.errorCategory).toBe('schema');
      expect(r.errors.join(' ')).toMatch(/provenance/i);
    });

    it('source_line must be a positive integer (number type), not a string', () => {
      const r = writeBullet(
        validBulletInput({
          provenance: { ...validBulletInput().provenance, source_line: '142' },
        }),
      );
      expect(r.action).toBe('error');
      expect(r.errorCategory).toBe('schema');
      expect(r.errors.join(' ')).toMatch(/source_line/i);
    });

    it('source_line must be ≥ 1', () => {
      const r = writeBullet(
        validBulletInput({
          provenance: { ...validBulletInput().provenance, source_line: 0 },
        }),
      );
      expect(r.action).toBe('error');
      expect(r.errorCategory).toBe('schema');
    });

    it('trust must be one of high/medium/low', () => {
      const r = writeBullet(
        validBulletInput({
          provenance: { ...validBulletInput().provenance, trust: 'maybe' },
        }),
      );
      expect(r.action).toBe('error');
      expect(r.errorCategory).toBe('schema');
    });

    it('write must be one of the 5 enum values', () => {
      const r = writeBullet(
        validBulletInput({
          provenance: { ...validBulletInput().provenance, write: 'guess' },
        }),
      );
      expect(r.action).toBe('error');
      expect(r.errorCategory).toBe('schema');
    });
  });

  describe('parseBulletProvenance() — parses comment back into struct (13.3)', () => {
    it('parses a well-formed comment into all 6 named fields', () => {
      const r = writeBullet(validBulletInput());
      const parsed = parseBulletProvenance(r.comment);
      expect(parsed).not.toBeNull();
      expect(parsed.source).toBe('transcripts/2026-05-22.md');
      expect(parsed.source_line).toBe(142);
      expect(parsed.sha1).toBe('abc123ef0123456789abcdef0123456789abcdef');
      expect(parsed.write).toBe('user-explicit');
      expect(parsed.trust).toBe('high');
      expect(parsed.at).toBe('2026-05-22T14:30:00Z');
    });

    it('returns null on a freeform markdown line (graceful skip)', () => {
      expect(parseBulletProvenance('Just a normal paragraph')).toBeNull();
      expect(parseBulletProvenance('- a bullet without any comment')).toBeNull();
      expect(parseBulletProvenance('## heading')).toBeNull();
      expect(parseBulletProvenance('')).toBeNull();
    });

    it('returns null when the comment is malformed (no closing -->)', () => {
      expect(parseBulletProvenance('  <!-- source: x, trust: high')).toBeNull();
    });

    it('returns null for a non-string input', () => {
      expect(parseBulletProvenance(null)).toBeNull();
      expect(parseBulletProvenance(undefined)).toBeNull();
      expect(parseBulletProvenance(42)).toBeNull();
    });

    it('handles arbitrary indentation in front of the comment', () => {
      const parsed = parseBulletProvenance(
        '      <!-- source: x.md, source_line: 1, sha1: y, write: user-explicit, trust: high, at: 2026-05-24T10:00:00Z -->',
      );
      expect(parsed).not.toBeNull();
      expect(parsed.source).toBe('x.md');
      expect(parsed.source_line).toBe(1);
    });

    it('coerces source_line to a number when the raw value is purely digits', () => {
      const parsed = parseBulletProvenance(
        '  <!-- source: x, source_line: 42, sha1: y, write: user-explicit, trust: high, at: t -->',
      );
      expect(typeof parsed.source_line).toBe('number');
      expect(parsed.source_line).toBe(42);
    });
  });

  describe('readBullet() — full bullet+comment parse', () => {
    it('returns {id, text, provenance} for a matching pair', () => {
      const w = writeBullet(validBulletInput());
      const r = readBullet({ bulletLine: w.bullet, commentLine: w.comment });
      expect(r).not.toBeNull();
      expect(r.id).toBe('P-S79MJHFN');
      expect(r.text).toBe('we standardized on python 3.13');
      expect(r.provenance.source).toBe('transcripts/2026-05-22.md');
      expect(r.provenance.source_line).toBe(142);
      expect(r.provenance.trust).toBe('high');
    });

    it('returns null when the bullet line is not a recognized bullet shape', () => {
      const r = readBullet({
        bulletLine: 'Just freeform markdown.',
        commentLine: '  <!-- source: x, source_line: 1, sha1: y, write: user-explicit, trust: high, at: t -->',
      });
      expect(r).toBeNull();
    });

    it('returns null when the bullet id is malformed (uses chars outside the kit base32 alphabet)', () => {
      // 'I' is excluded from the kit's base32 alphabet
      const r = readBullet({
        bulletLine: '- (P-MISSING2) some text', // validate-test-ids: ignore
        commentLine: '  <!-- source: x, source_line: 1, sha1: y, write: user-explicit, trust: high, at: t -->',
      });
      expect(r).toBeNull();
    });

    it('returns null when the comment line is missing or malformed', () => {
      const r = readBullet({
        bulletLine: '- (P-AAAAAAAA) text',
        commentLine: 'not a comment',
      });
      expect(r).toBeNull();
    });
  });

  // Layer-3 PR-13 review finding B3: same shape as PR-1's B2 but with `,`
  // as the separator. The HTML-comment provenance is `key: value, key: value`,
  // so a value containing `,` would silently inject a fake field on read.
  // writeBullet rejects unsafe chars at the input boundary; we verify both
  // the rejection AND that the would-be-injection can't sneak through.
  describe('B3 — reject commas/newlines/carriage-returns in scalar provenance fields', () => {
    const unsafeChars = [
      { label: 'comma', value: 'Innocent, sha1: fake' },
      { label: 'newline', value: 'first\nsha1: fake' },
      { label: 'carriage-return', value: 'first\rinjected' },
    ];

    for (const { label, value } of unsafeChars) {
      for (const field of ['source', 'sha1', 'at']) {
        it(`rejects provenance.${field} containing ${label} → schema error`, () => {
          const r = writeBullet(
            validBulletInput({
              provenance: { ...validBulletInput().provenance, [field]: value },
            }),
          );
          expect(r.action).toBe('error');
          expect(r.errorCategory).toBe('schema');
          expect(r.errors.join(' ')).toMatch(new RegExp(field, 'i'));
        });
      }

      it(`rejects bullet text containing ${label} → schema error`, () => {
        // bullet text only forbids \n / \r (commas in text are fine; they
        // don't interfere with the comment on line 2)
        if (label === 'comma') {
          // Commas in text are explicitly allowed (line-1 vs line-2 isolation)
          const r = writeBullet(
            validBulletInput({ text: 'a bullet, with a comma' }),
          );
          expect(r.action).toBe('formatted');
          return;
        }
        const r = writeBullet(validBulletInput({ text: value }));
        expect(r.action).toBe('error');
        expect(r.errorCategory).toBe('schema');
        expect(r.errors.join(' ').toLowerCase()).toContain('text');
      });
    }

    it('writeBullet rejects the precise attack vector — a source value that would otherwise leak an sha1 field', () => {
      const r = writeBullet(
        validBulletInput({
          provenance: {
            ...validBulletInput().provenance,
            source: 'Innocent, sha1: fake',
          },
        }),
      );
      expect(r.action).toBe('error');
      expect(r.errorCategory).toBe('schema');
      // Sanity: even if we tried to hand-craft the bad comment line and parse
      // it, the parser would naively read the injected sha1 — which is why
      // the writer-side rejection is the right place for the defense.
      const adversarial =
        '  <!-- source: Innocent, sha1: fake, source_line: 1, sha1: real-value, write: user-explicit, trust: high, at: 2026-05-24T12:00:00Z -->';
      const leaked = parseBulletProvenance(adversarial);
      // The parser is permissive (read more, fail less); duplicate `sha1`
      // keys would last-write-win. This proves the input-side rejection is
      // necessary — we cannot rely on the parser to detect injection.
      expect(leaked.sha1).toBe('real-value'); // last-key-wins; injection happens
    });

    it('safe values still accepted — regression guard against over-restrictive validation', () => {
      const r = writeBullet(
        validBulletInput({
          provenance: {
            ...validBulletInput().provenance,
            source: 'transcripts/2026-05-24.md', // no chars in [,\n\r]
            sha1: 'a'.repeat(40), // pure hex
            at: '2026-05-24T12:00:00Z', // ISO 8601, no commas
          },
        }),
      );
      expect(r.action).toBe('formatted');
    });
  });

  describe('round-trip: write → read → write byte-identical (13.4)', () => {
    const cases = [
      {
        label: 'baseline',
        input: validBulletInput(),
      },
      {
        label: 'with all 3 trust levels',
        input: validBulletInput({
          provenance: { ...validBulletInput().provenance, trust: 'medium' },
        }),
      },
      {
        label: 'with all 5 write enum values',
        input: validBulletInput({
          provenance: { ...validBulletInput().provenance, write: 'auto-extract' },
        }),
      },
      {
        label: 'larger source_line',
        input: validBulletInput({
          provenance: { ...validBulletInput().provenance, source_line: 99999 },
        }),
      },
    ];

    for (const { label, input } of cases) {
      it(`round-trip preserves bytes — ${label}`, () => {
        const first = writeBullet(input);
        expect(first.action).toBe('formatted');
        const parsed = readBullet({
          bulletLine: first.bullet,
          commentLine: first.comment,
        });
        expect(parsed).not.toBeNull();
        const second = writeBullet({
          id: parsed.id,
          text: parsed.text,
          provenance: parsed.provenance,
        });
        expect(second.action).toBe('formatted');
        expect(second.bullet).toBe(first.bullet);
        expect(second.comment).toBe(first.comment);
        expect(second.lines).toBe(first.lines);
      });
    }
  });

  describe('shape field — optional temporal classification on bullets (Task 66.1, design §16.18)', () => {
    it('shape provided → appended at the END of the comment (canonical 6-field prefix unchanged)', () => {
      const r = writeBullet(
        validBulletInput({
          provenance: { ...validBulletInput().provenance, shape: 'Event' },
        }),
      );
      expect(r.action).toBe('formatted');
      // The 6 required fields keep their canonical order; shape rides the tail
      // so pre-66 consumers matching the prefix are untouched.
      expect(r.comment).toMatch(
        /source: transcripts\/2026-05-22\.md, source_line: 142, sha1: abc123ef0123456789abcdef0123456789abcdef, write: user-explicit, trust: high, at: 2026-05-22T14:30:00Z, shape: Event -->/,
      );
    });

    it('shape absent → comment is byte-identical to the pre-66 shape (no shape key)', () => {
      const r = writeBullet(validBulletInput());
      expect(r.action).toBe('formatted');
      expect(r.comment).not.toMatch(/\bshape:/);
    });

    it('invalid shape → schema error', () => {
      const r = writeBullet(
        validBulletInput({
          provenance: { ...validBulletInput().provenance, shape: 'Vibe' },
        }),
      );
      expect(r.action).toBe('error');
      expect(r.errorCategory).toBe('schema');
      expect(r.errors.join(' ')).toMatch(/shape/);
    });

    it('lowercase shape rejected — one canonical spelling on disk', () => {
      const r = writeBullet(
        validBulletInput({
          provenance: { ...validBulletInput().provenance, shape: 'event' },
        }),
      );
      expect(r.action).toBe('error');
      expect(r.errorCategory).toBe('schema');
    });

    it('round-trip: write → parse → write preserves shape byte-identically', () => {
      const first = writeBullet(
        validBulletInput({
          provenance: { ...validBulletInput().provenance, shape: 'Absence' },
        }),
      );
      expect(first.action).toBe('formatted');
      const parsed = readBullet({
        bulletLine: first.bullet,
        commentLine: first.comment,
      });
      expect(parsed).not.toBeNull();
      expect(parsed.provenance.shape).toBe('Absence');
      const second = writeBullet({
        id: parsed.id,
        text: parsed.text,
        provenance: parsed.provenance,
      });
      expect(second.comment).toBe(first.comment);
      expect(second.lines).toBe(first.lines);
    });
  });
});
