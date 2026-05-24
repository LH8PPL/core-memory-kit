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
]);
const REQUIRED_PROVENANCE_FIELDS = [
  'source',
  'source_line',
  'sha1',
  'write',
  'trust',
  'at',
];

// Match the bullet line: `- (<id>) <text>`. The id pattern is the kit's
// custom base32 alphabet from tier-paths.mjs; non-conforming ids are
// treated as "not a kit bullet" by readBullet.
const BULLET_RE = new RegExp(
  `^- \\((${ID_PATTERN.source.replace(/^\^/, '').replace(/\$$/, '')})\\)\\s+(.+)$`,
);

// Match a provenance comment, tolerant of leading indentation.
const COMMENT_RE = /^\s*<!--.*-->\s*$/;

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
  if (typeof line !== 'string') return null;
  if (!COMMENT_RE.test(line)) return null;

  const inner = line.replace(/^\s*<!--/, '').replace(/-->\s*$/, '');
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
