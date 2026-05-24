import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { generateId } from '../../canonicalize/src/index.mjs';

const VALID_TIERS = new Set(['U', 'P', 'L']);
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

// Layer-2 review finding B2: the naive frontmatter serializer writes string
// values verbatim with no quoting. A value containing \n, \r, or ':' silently
// corrupts the on-disk frontmatter (extra lines become injected fields; values
// with colons mis-split on the read side). Minimum fix: reject these chars at
// the input boundary. PR-2's frontmatter.mjs with js-yaml will quote properly
// and lift this restriction.
function hasUnsafeFrontmatterChars(s) {
  return s.includes('\n') || s.includes('\r') || s.includes(':');
}

function resolveTierRoot({ tier, projectRoot, userDir }) {
  if (tier === 'P') return join(projectRoot ?? process.cwd(), 'context');
  if (tier === 'L') return join(projectRoot ?? process.cwd(), 'context.local');
  return (
    userDir ??
    process.env.MEMORY_KIT_USER_DIR ??
    join(homedir(), '.claude-memory-kit')
  );
}

function resolveFactDir(tier, tierRoot) {
  return tier === 'U' ? join(tierRoot, 'fragments') : join(tierRoot, 'memory');
}

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
  } else if (hasUnsafeFrontmatterChars(opts.title)) {
    errors.push(
      'title: must not contain newlines or colons (frontmatter corruption risk; see Layer-2 review B2)',
    );
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
  } else if (hasUnsafeFrontmatterChars(opts.sourceFile)) {
    errors.push(
      'sourceFile: must not contain newlines or colons (use POSIX-style paths; Windows drive-letter paths blocked until PR-2 adds real YAML quoting)',
    );
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
  } else if (hasUnsafeFrontmatterChars(opts.sourceSha1)) {
    errors.push(
      'sourceSha1: must not contain newlines or colons (sha1 hex strings shouldn\'t anyway)',
    );
  }
  return errors;
}

function serializeYamlValue(v) {
  if (Array.isArray(v)) return `[${v.map(serializeYamlValue).join(', ')}]`;
  if (typeof v === 'boolean') return String(v);
  if (typeof v === 'number') return String(v);
  return String(v);
}

function buildFrontmatter(opts, computed) {
  const required = [
    ['id', computed.id],
    ['type', opts.type],
    ['title', opts.title],
    ['created_at', computed.createdAt],
    ['write_source', opts.writeSource],
    ['trust', opts.trust],
    ['source_file', opts.sourceFile],
    ['source_line', opts.sourceLine],
    ['source_sha1', opts.sourceSha1],
  ];
  const optional = [];
  if (opts.mergedFrom) optional.push(['merged_from', opts.mergedFrom]);
  if (opts.supersededBy) optional.push(['superseded_by', opts.supersededBy]);
  if (opts.tags) optional.push(['tags', opts.tags]);
  if (opts.related) optional.push(['related', opts.related]);
  if (opts.isPrivate === true) optional.push(['private', true]);
  const lines = [...required, ...optional].map(
    ([k, v]) => `${k}: ${serializeYamlValue(v)}`,
  );
  return `---\n${lines.join('\n')}\n---\n`;
}

function findExistingFactById(factDir, id) {
  if (!existsSync(factDir)) return null;
  for (const entry of readdirSync(factDir)) {
    if (!entry.endsWith('.md')) continue;
    const p = join(factDir, entry);
    if (!statSync(p).isFile()) continue;
    const text = readFileSync(p, 'utf8');
    const m = text.match(/^---\n[\s\S]*?^id:\s*(\S+)/m);
    if (m && m[1] === id) return p;
  }
  return null;
}

function readExistingFactId(path) {
  if (!existsSync(path)) return null;
  const text = readFileSync(path, 'utf8');
  const m = text.match(/^---\n[\s\S]*?^id:\s*(\S+)/m);
  return m ? m[1] : null;
}

function appendAuditLog(tierRoot, entry) {
  const locksDir = join(tierRoot, '.locks');
  mkdirSync(locksDir, { recursive: true });
  appendFileSync(
    join(locksDir, 'audit.log'),
    JSON.stringify(entry) + '\n',
    'utf8',
  );
}

function nowIso() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export function writeFact(opts = {}) {
  const errors = validateOptions(opts);
  if (errors.length > 0) {
    return {
      action: 'error',
      errorCategory: 'schema',
      errors,
      id: null,
      path: null,
    };
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
      appendAuditLog(tierRoot, {
        ts: createdAt,
        action: 'skipped',
        reason: 'duplicate',
        id,
        path,
      });
      return { action: 'skipped', skipReason: 'duplicate', id, path };
    }
    return {
      action: 'error',
      errorCategory: 'schema',
      errors: [
        `File exists at ${path} with different id ${existingIdAtPath}; refusing overwrite`,
      ],
      id,
      path,
    };
  }

  const elsewhere = findExistingFactById(factDir, id);
  if (elsewhere) {
    appendAuditLog(tierRoot, {
      ts: createdAt,
      action: 'skipped',
      reason: 'duplicate-elsewhere',
      id,
      path,
      duplicateAt: elsewhere,
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
  const frontmatter = buildFrontmatter(opts, { id, createdAt });
  writeFileSync(path, `${frontmatter}\n${opts.body}\n`, 'utf8');

  return { action: 'created', id, path };
}
