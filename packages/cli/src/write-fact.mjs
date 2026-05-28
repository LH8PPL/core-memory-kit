// Per-fact archive writer (Task 7, refactored in cleanup-layer-2-cross-module-drift).
// Single public boundary: writeFact(opts) → result. See design §2.2 + §4.
//
// Uses shared modules: tier-paths (path resolution), frontmatter (js-yaml
// serialize), audit-log (canonical NDJSON), result-shapes (errorCategory enum).
// See CLAUDE.md "Shared modules" rule.

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { generateId } from '@lh8ppl/cmk-canonicalize';
import { VALID_TIERS, resolveTierRoot, resolveFactDir } from './tier-paths.mjs';
import { parse, format } from './frontmatter.mjs';
import { appendAuditEntry, nowIso, REASON_CODES } from './audit-log.mjs';
import { ERROR_CATEGORIES, errorResult } from './result-shapes.mjs';

const VALID_TYPES = new Set(['user', 'feedback', 'project', 'reference']);
const VALID_WRITE_SOURCES = new Set([
  'user-explicit',
  'auto-extract',
  'compressor',
  'manual-edit',
  'imported',
]);
const VALID_TRUST = new Set(['high', 'medium', 'low']);
const SLUG_PATTERN = /^[a-z0-9][a-z0-9_-]*$/i;

// Layer-2 review: PR-1 rejected \n / \r / : in scalar frontmatter fields as
// a minimum fix for the naive serializer (finding B2). PR-2's frontmatter.mjs
// (js-yaml CORE_SCHEMA) quotes those chars properly. The B2 restriction is
// LIFTED here — titles/sourceFile/sourceSha1 may contain newlines, colons,
// and other YAML-special chars; they round-trip correctly via parse/format.
// Round-trip tests in cli-write-fact.test.js (`B2 relaxation`) prove it.

function validateOptions(opts) {
  const errors = [];
  if (!opts.tier || !VALID_TIERS.has(opts.tier)) {
    errors.push("tier: must be 'U', 'P', or 'L'");
  }
  if (!opts.type || !VALID_TYPES.has(opts.type)) {
    errors.push('type: must be one of user/feedback/project/reference');
  }
  if (
    !opts.slug ||
    typeof opts.slug !== 'string' ||
    !SLUG_PATTERN.test(opts.slug)
  ) {
    errors.push(
      'slug: must start with alphanumeric and contain only [A-Za-z0-9_-]',
    );
  }
  if (!opts.title || typeof opts.title !== 'string' || !opts.title.trim()) {
    errors.push('title: required, non-empty string');
  }
  if (opts.body == null || typeof opts.body !== 'string' || !opts.body.length) {
    errors.push('body: required, non-empty string');
  }
  if (!opts.writeSource || !VALID_WRITE_SOURCES.has(opts.writeSource)) {
    errors.push(
      'writeSource: must be one of user-explicit/auto-extract/compressor/manual-edit/imported',
    );
  }
  if (!opts.trust || !VALID_TRUST.has(opts.trust)) {
    errors.push('trust: must be one of high/medium/low');
  }
  if (
    !opts.sourceFile ||
    typeof opts.sourceFile !== 'string' ||
    !opts.sourceFile.length
  ) {
    errors.push('sourceFile: required, non-empty string');
  }
  if (
    typeof opts.sourceLine !== 'number' ||
    !Number.isInteger(opts.sourceLine) ||
    opts.sourceLine < 1
  ) {
    errors.push('sourceLine: required, positive integer');
  }
  if (
    !opts.sourceSha1 ||
    typeof opts.sourceSha1 !== 'string' ||
    !opts.sourceSha1.length
  ) {
    errors.push('sourceSha1: required, non-empty string');
  }
  return errors;
}

function buildFrontmatterObject(opts, computed) {
  // Key order matters for visual diff stability — insertion order = on-disk order.
  const fm = {
    id: computed.id,
    type: opts.type,
    title: opts.title,
    created_at: computed.createdAt,
    write_source: opts.writeSource,
    trust: opts.trust,
    source_file: opts.sourceFile,
    source_line: opts.sourceLine,
    source_sha1: opts.sourceSha1,
  };
  if (opts.mergedFrom) fm.merged_from = opts.mergedFrom;
  if (opts.supersededBy) fm.superseded_by = opts.supersededBy;
  if (opts.tags) fm.tags = opts.tags;
  if (opts.related) fm.related = opts.related;
  if (opts.isPrivate === true) fm.private = true;
  return fm;
}

// Per Layer-2 review M2: filter INDEX.md from the dedup scan. Pre-fix the
// inline scanner here didn't exclude INDEX.md; harmless in practice (it
// has no `id:` matching real ids) but inconsistent with reindex/forget.
function findExistingFactById(factDir, id) {
  if (!existsSync(factDir)) return null;
  for (const entry of readdirSync(factDir, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    if (!entry.name.endsWith('.md')) continue;
    if (entry.name === 'INDEX.md') continue;
    const p = join(factDir, entry.name);
    if (!statSync(p).isFile()) continue;
    const { frontmatter } = parse(readFileSync(p, 'utf8'));
    if (frontmatter?.id === id) return p;
  }
  return null;
}

function readExistingFactId(path) {
  if (!existsSync(path)) return null;
  const { frontmatter } = parse(readFileSync(path, 'utf8'));
  return frontmatter?.id ?? null;
}

export function writeFact(opts = {}) {
  const errors = validateOptions(opts);
  if (errors.length > 0) {
    return errorResult({
      category: ERROR_CATEGORIES.SCHEMA,
      errors,
      id: null,
      path: null,
    });
  }

  const id = opts.id ?? generateId(opts.tier, opts.body);
  const createdAt = opts.createdAt ?? nowIso();
  const tierRoot = resolveTierRoot(opts);
  const factDir = resolveFactDir(opts.tier, tierRoot);
  const filename = `${opts.type}_${opts.slug}.md`;
  const path = join(factDir, filename);

  const existingIdAtPath = readExistingFactId(path);
  if (existingIdAtPath !== null) {
    if (existingIdAtPath === id) {
      appendAuditEntry(tierRoot, {
        ts: createdAt,
        action: 'skipped',
        tier: opts.tier,
        id,
        reasonCode: REASON_CODES.DUPLICATE,
        paths: { before: path },
      });
      return { action: 'skipped', skipReason: 'duplicate', id, path };
    }
    return errorResult({
      category: ERROR_CATEGORIES.COLLISION,
      errors: [
        `File exists at ${path} with different id ${existingIdAtPath}; refusing overwrite`,
      ],
      id,
      path,
    });
  }

  const elsewhere = findExistingFactById(factDir, id);
  if (elsewhere) {
    appendAuditEntry(tierRoot, {
      ts: createdAt,
      action: 'skipped',
      tier: opts.tier,
      id,
      reasonCode: REASON_CODES.DUPLICATE_ELSEWHERE,
      paths: { before: elsewhere, after: path },
    });
    return {
      action: 'skipped',
      skipReason: 'duplicate-elsewhere',
      id,
      path,
      duplicateAt: elsewhere,
    };
  }

  mkdirSync(factDir, { recursive: true });
  const frontmatter = buildFrontmatterObject(opts, { id, createdAt });
  writeFileSync(path, format({ frontmatter, body: `\n${opts.body}\n` }), 'utf8');

  return { action: 'created', id, path };
}
