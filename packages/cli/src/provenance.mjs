// Provenance frontmatter writer + reader (Task 13, T-011).
// Pure-functional formatting/parsing — no I/O. Two cooperating boundaries
// share the same on-disk canonical shape so write → read → write is
// byte-identical.
//
// Public surface:
//   writeBullet({id, text, provenance}) → result
//     - formats a 2-line bullet (bullet text on line 1, HTML-comment
//       provenance on line 2) with all 7 required fields
//   readBullet({bulletLine, commentLine}) → {id, text, provenance} | null
//     - parses the pair; returns null on any non-match (graceful skip
//       so callers iterating freeform markdown don't crash)
//   parseBulletProvenance(commentLine) → provenance | null
//     - just the comment parser; used by scratchpad.mjs's consolidator
//       and (post-extraction) anywhere else that needs to read
//       provenance from a freestanding comment line
//
// The 7 required fields per Task 13.2 / design §4:
//   - id          (in bullet line as `(P-XXX)`, not duplicated in comment)
//   - text        (the bullet body)
//   - source      (file path, no inline line number)
//   - source_line (positive integer; separate from `source`)
//   - sha1
//   - write       (enum)
//   - trust       (enum)
//   - at          (ISO 8601 UTC timestamp)
//
// Spec deviation: design §2.1's example uses `source: file.md:142` inline.
// This module uses `source: file.md, source_line: 142` (separate fields)
// per Task 13.2's explicit "7 required" enumeration. design.md §2.1 is
// updated in this PR to match.
//
// Uses shared modules per CLAUDE.md "Shared modules" rule:
//   tier-paths.mjs    — ID_PATTERN (validates the id format in the bullet line)
//   result-shapes.mjs — ERROR_CATEGORIES, errorResult

import { ID_PATTERN } from './tier-paths.mjs';
import { ERROR_CATEGORIES, errorResult } from './result-shapes.mjs';

const VALID_TRUST = new Set(['high', 'medium', 'low']);
const VALID_WRITE_SOURCES = new Set([
  'user-explicit',
  'auto-extract',
  'compressor',
  'manual-edit',
  'imported',
  // Task 138 review finding: the conflict-queue merge-both action writes a
  // merged bullet to the scratchpad; its provenance needs a valid write key
  // (the old hand-rolled comment had none and broke reindex - D-125 class).
  'merged',
]);
const REQUIRED_PROVENANCE_FIELDS = [
  'source',
  'source_line',
  'sha1',
  'write',
  'trust',
  'at',
];

// PR-1 finding B2 was about newlines/colons in YAML-frontmatter scalar values.
// Layer-3 review finding B3 is the same shape with `,` as the separator: the
// HTML-comment provenance is `key: value, key: value, ...`, so a value
// containing `,` would silently inject a fake field. A `source` of
// `"Innocent, sha1: fake"` would round-trip as if it had an `sha1: fake`
// field of its own. Defensive boundary check: reject these chars in scalar
// provenance fields + the bullet text.
//
// `write` and `trust` are enums (already rejected if not in the allow-list);
// `source_line` is a number (no string-injection possible).
const UNSAFE_FOR_COMMENT = /[,\n\r]/;
const UNSAFE_FOR_BULLET_TEXT = /[\n\r]/; // commas are fine in bullet text (line 1, not the comment)
const FIELDS_TO_SANITIZE = ['source', 'sha1', 'at'];

// Match the bullet line: `- (<id>) <text>`. The id pattern is the kit's
// custom base32 alphabet from tier-paths.mjs; non-conforming ids are
// treated as "not a kit bullet" by readBullet.
const BULLET_RE = new RegExp(
  `^- \\((${ID_PATTERN.source.replace(/^\^/, '').replace(/\$$/, '')})\\)\\s+(.+)$`,
);

// Is `line` a single-line HTML comment (the shape the kit writes provenance
// in: `  <!-- source: …, trust: … -->`), tolerant of leading indentation?
// String-scanning, NOT a regex, on purpose: a `/<!--.*-->/` regex trips
// CodeQL js/bad-tag-filter (`.` skips newlines; ignores the `--!>` end-tag
// variant). Our provenance comments are always single-line, so a literal
// prefix/suffix check is equivalent AND clears the alert (the PR #72
// pattern). Shared so scratchpad / memory-write / inject-context don't each
// re-roll the flagged regex.
export function isProvenanceCommentLine(line) {
  if (typeof line !== 'string') return false;
  const t = line.trim();
  return t.length >= 7 && t.startsWith('<!--') && t.endsWith('-->');
}

// Strip the `<!--` (4 chars) / `-->` (3 chars) delimiters from a line already
// confirmed by isProvenanceCommentLine. Slicing, not a regex, for the same
// js/bad-tag-filter reason.
function stripCommentDelimiters(line) {
  const t = line.trim();
  return t.slice(4, t.length - 3);
}

function validateBulletInput({ id, text, provenance }) {
  const errors = [];

  if (!id || typeof id !== 'string') {
    errors.push('id: required, non-empty string');
  } else if (!ID_PATTERN.test(id)) {
    errors.push(
      `id: must match the kit's citation-ID format (got ${JSON.stringify(id)})`,
    );
  }

  if (!text || typeof text !== 'string' || !text.trim()) {
    errors.push('text: required, non-empty string');
  } else if (UNSAFE_FOR_BULLET_TEXT.test(text)) {
    errors.push(
      'text: must not contain newlines (would break the 2-line bullet+comment shape; see review finding B3)',
    );
  }

  if (!provenance || typeof provenance !== 'object') {
    errors.push(
      'provenance: required object with source/source_line/sha1/write/trust/at',
    );
    return errors;
  }

  for (const f of REQUIRED_PROVENANCE_FIELDS) {
    const v = provenance[f];
    if (v === undefined || v === null || v === '') {
      errors.push(`provenance.${f}: required, non-empty`);
    }
  }

  if (
    provenance.source_line !== undefined &&
    provenance.source_line !== null &&
    provenance.source_line !== ''
  ) {
    if (
      typeof provenance.source_line !== 'number' ||
      !Number.isInteger(provenance.source_line) ||
      provenance.source_line < 1
    ) {
      errors.push(
        'provenance.source_line: must be a positive integer (number type)',
      );
    }
  }

  if (provenance.trust && !VALID_TRUST.has(provenance.trust)) {
    errors.push(
      `provenance.trust: must be one of high/medium/low (got ${JSON.stringify(provenance.trust)})`,
    );
  }

  if (provenance.write && !VALID_WRITE_SOURCES.has(provenance.write)) {
    errors.push(
      `provenance.write: must be one of user-explicit/auto-extract/compressor/manual-edit/imported (got ${JSON.stringify(provenance.write)})`,
    );
  }

  // B3 defense: scalar string fields that land in the comment must not contain
  // `,` / `\n` / `\r`. A `,` would silently spawn a fake field on read; a
  // newline would break the single-line comment shape.
  for (const f of FIELDS_TO_SANITIZE) {
    const v = provenance[f];
    if (typeof v === 'string' && UNSAFE_FOR_COMMENT.test(v)) {
      errors.push(
        `provenance.${f}: must not contain commas, newlines, or carriage returns ` +
          '(comment-format injection risk; see review finding B3)',
      );
    }
  }

  return errors;
}

export function writeBullet(opts = {}) {
  const errors = validateBulletInput(opts);
  if (errors.length > 0) {
    return errorResult({
      category: ERROR_CATEGORIES.SCHEMA,
      errors,
    });
  }

  const { id, text, provenance: p } = opts;
  const bullet = `- (${id}) ${text}`;
  // Canonical field order (matches Task 13.2 enumeration):
  //   source, source_line, sha1, write, trust, at
  const comment =
    `  <!-- source: ${p.source}, source_line: ${p.source_line},` +
    ` sha1: ${p.sha1}, write: ${p.write}, trust: ${p.trust},` +
    ` at: ${p.at} -->`;
  return {
    action: 'formatted',
    id,
    text,
    bullet,
    comment,
    lines: `${bullet}\n${comment}`,
  };
}

export function parseBulletProvenance(line) {
  if (!isProvenanceCommentLine(line)) return null;

  const inner = stripCommentDelimiters(line);
  const fields = {};
  for (const part of inner.split(',')) {
    const idx = part.indexOf(':');
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (!k) continue;
    fields[k] = v;
  }
  if (Object.keys(fields).length === 0) return null;

  // Coerce numeric fields back to numbers for symmetric round-trip.
  if (fields.source_line && /^\d+$/.test(fields.source_line)) {
    fields.source_line = parseInt(fields.source_line, 10);
  }
  return fields;
}

export function readBullet(opts = {}) {
  const { bulletLine, commentLine } = opts;
  if (typeof bulletLine !== 'string') return null;
  const m = bulletLine.match(BULLET_RE);
  if (!m) return null;
  const [, id, text] = m;
  const provenance = parseBulletProvenance(commentLine);
  if (!provenance) return null;
  return { id, text, provenance };
}

// The template-seed sentinel (Task 183 / D-247): every scaffolded `(example)`
// placeholder bullet (SOUL/USER/HABITS/LESSONS/machine-paths/overrides) ships
// with an all-zero content sha1 (`0{40}`) + `at: 2020-01-01T…`. A REAL captured
// fact always has a real content hash, so the all-zero sha1 is an unambiguous
// "scaffolding the user never replaced" marker. Shared here (the module that
// owns bullet provenance) so the indexer and inject-context agree — a seed the
// inject path already skips must not sneak into the search index either.
export const SEED_SENTINEL_SHA1 = '0'.repeat(40);

/**
 * True if a parsed provenance object is a scaffold seed (all-zero sha1).
 *
 * NOTE (Task 183 review M1): inject-context.mjs has a BROADER local check —
 * all-zero-sha1 OR the literal `(P-XXX) (example)` text shape. The two agree on
 * the load-bearing sha1 sentinel (a real seed always carries both markers), so
 * they don't diverge in practice. A v0.4.x follow-up may unify them (have
 * inject import this + layer its text check on top — one sentinel, two
 * consumers); deliberately NOT done here to avoid churning a working inject
 * security-path filter right before the v0.4.3 release.
 *
 * @param {object|null} provenance  a parseBulletProvenance() result
 * @returns {boolean}
 */
export function isSeedProvenance(provenance) {
  return !!provenance && provenance.sha1 === SEED_SENTINEL_SHA1;
}
