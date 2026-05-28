// Tombstone-write + tombstone-aware fact resolver (Task 9, refactored in
// cleanup-layer-2-cross-module-drift). Two public boundaries:
//   forget(opts) → result          — user-requested deletion
//   resolveFact(opts) → state      — read-side, knows live/tombstoned/superseded
//
// Uses shared modules: tier-paths, frontmatter, audit-log, result-shapes.
// See design §6.5 + CLAUDE.md "Shared modules" rule.

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { canonicalize } from '@lh8ppl/cmk-canonicalize';
import {
  VALID_TIERS,
  ID_PATTERN,
  resolveTierRoot,
  resolveFactDir,
} from './tier-paths.mjs';
import { parse, format } from './frontmatter.mjs';
import { appendAuditEntry, nowIso, REASON_CODES } from './audit-log.mjs';
import { ERROR_CATEGORIES, errorResult, notFoundResult } from './result-shapes.mjs';

// Layer-2 review: PR-1 rejected \n / \r / : in the `reason` field as a
// minimum fix for the naive serializer (finding B2). PR-2's frontmatter.mjs
// (js-yaml CORE_SCHEMA) quotes those chars properly. The B2 restriction is
// LIFTED here — reasons may contain newlines, colons, etc. and round-trip
// correctly. Round-trip tests in cli-forget.test.js (`B2 relaxation`) prove it.

function listLiveFactFiles(factDir) {
  if (!existsSync(factDir)) return [];
  const out = [];
  for (const entry of readdirSync(factDir, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    if (!entry.name.endsWith('.md')) continue;
    if (entry.name === 'INDEX.md') continue;
    out.push(entry.name);
  }
  return out;
}

function readFactAt(filePath) {
  const text = readFileSync(filePath, 'utf8');
  const { frontmatter, body } = parse(text);
  return { frontmatter, body, text };
}

function resolveById(id, { projectRoot, userDir }) {
  const tier = id[0];
  if (!VALID_TIERS.has(tier)) return { matches: [] };
  const tierRoot = resolveTierRoot({ tier, projectRoot, userDir });
  const factDir = resolveFactDir(tier, tierRoot);
  for (const filename of listLiveFactFiles(factDir)) {
    const p = join(factDir, filename);
    if (!statSync(p).isFile()) continue;
    const { frontmatter, body } = readFactAt(p);
    if (frontmatter?.id === id && !frontmatter.deleted_at) {
      return {
        matches: [
          { id, tier, path: p, frontmatter, body, tierRoot, factDir },
        ],
      };
    }
  }
  return { matches: [] };
}

function resolveByQuery(query, { projectRoot, userDir }) {
  const canonicalQuery = canonicalize(query);
  if (!canonicalQuery) return { matches: [] };
  const tiersToSearch = [];
  if (projectRoot) tiersToSearch.push('P', 'L');
  if (userDir) tiersToSearch.push('U');

  const matches = [];
  for (const tier of tiersToSearch) {
    const tierRoot = resolveTierRoot({ tier, projectRoot, userDir });
    const factDir = resolveFactDir(tier, tierRoot);
    for (const filename of listLiveFactFiles(factDir)) {
      const p = join(factDir, filename);
      if (!statSync(p).isFile()) continue;
      const { frontmatter, body } = readFactAt(p);
      if (!frontmatter?.id || frontmatter.deleted_at) continue;
      if (canonicalize(body).includes(canonicalQuery)) {
        matches.push({
          id: frontmatter.id,
          tier,
          path: p,
          frontmatter,
          body,
          tierRoot,
          factDir,
        });
      }
    }
  }
  // Layer-2 review M3: sort matches deterministically so ambiguous-error
  // messages list candidate ids in stable order across machines.
  matches.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { matches };
}

function moveFactToTombstone(match, { deletedAt, reason, deletedBy }) {
  const tombDir = join(match.factDir, 'archive', 'tombstones');
  mkdirSync(tombDir, { recursive: true });
  const tombPath = join(tombDir, `${match.id}.md`);
  // Read + parse the original, inject deletion fields at the top of the
  // frontmatter object, write via the canonical formatter. No regex hacks.
  const { frontmatter, body } = parse(readFileSync(match.path, 'utf8'));
  const updated = {
    deleted_at: deletedAt,
    deleted_reason: reason,
    deleted_by: deletedBy,
    ...(frontmatter ?? {}),
  };
  writeFileSync(tombPath, format({ frontmatter: updated, body }), 'utf8');
  unlinkSync(match.path);
  return tombPath;
}

function scrubScratchpadFile(filePath, id) {
  const text = readFileSync(filePath, 'utf8');
  const lines = text.split('\n');
  const removeIdx = new Set();

  for (let i = 0; i < lines.length; i++) {
    if (removeIdx.has(i)) continue;
    const line = lines[i];

    if (line.startsWith('- ') && line.includes(id)) {
      removeIdx.add(i);
      const next = lines[i + 1];
      if (next && /^\s*<!--/.test(next)) {
        removeIdx.add(i + 1);
      }
    } else if (
      /^\s*<!--/.test(line) &&
      line.includes(id) &&
      line.includes('-->')
    ) {
      removeIdx.add(i);
      if (i > 0 && lines[i - 1].startsWith('- ') && !removeIdx.has(i - 1)) {
        removeIdx.add(i - 1);
      }
    }
  }

  if (removeIdx.size === 0) return { changed: false, removed: 0 };

  const bulletsRemoved = [...removeIdx].filter((i) =>
    lines[i].startsWith('- '),
  ).length;
  const out = lines.filter((_, i) => !removeIdx.has(i));
  writeFileSync(filePath, out.join('\n'), 'utf8');
  return { changed: true, removed: bulletsRemoved };
}

function scrubAllScratchpads(tierRoot, id) {
  if (!existsSync(tierRoot)) return [];
  const edits = [];
  for (const entry of readdirSync(tierRoot, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    if (!entry.name.endsWith('.md')) continue;
    if (entry.name === 'INDEX.md') continue;
    const p = join(tierRoot, entry.name);
    const r = scrubScratchpadFile(p, id);
    if (r.changed) edits.push({ path: p, removed: r.removed });
  }
  return edits;
}

export function forget(opts = {}) {
  const {
    idOrQuery,
    projectRoot,
    userDir,
    reason,
    deletedBy,
    yes,
    confirm,
    now,
  } = opts;

  if (!idOrQuery || typeof idOrQuery !== 'string') {
    return errorResult({
      category: ERROR_CATEGORIES.SCHEMA,
      errors: ['idOrQuery: required, non-empty string'],
    });
  }

  // PR-2: B2 restriction on reason is RELAXED (js-yaml quotes strings with
  // \n / \r / :). Only type-check remains.
  if (reason !== undefined && reason !== null && typeof reason !== 'string') {
    return errorResult({
      category: ERROR_CATEGORIES.SCHEMA,
      errors: ['reason: must be a string'],
    });
  }

  const resolved = ID_PATTERN.test(idOrQuery)
    ? resolveById(idOrQuery, { projectRoot, userDir })
    : resolveByQuery(idOrQuery, { projectRoot, userDir });

  if (resolved.matches.length === 0) {
    return notFoundResult({
      errors: [`no matching fact for "${idOrQuery}"`],
    });
  }
  if (resolved.matches.length > 1) {
    const ids = resolved.matches.map((m) => m.id);
    return errorResult({
      category: ERROR_CATEGORIES.COLLISION,
      errors: [
        `ambiguous query "${idOrQuery}" matched multiple facts: ${ids.join(', ')}`,
      ],
      candidateIds: ids,
    });
  }

  const match = resolved.matches[0];

  if (!yes) {
    if (typeof confirm !== 'function') {
      throw new Error(
        "forget(): must provide either yes: true or a confirm() callback (refusing to silently delete)",
      );
    }
    const proceed = confirm({
      id: match.id,
      tier: match.tier,
      path: match.path,
      title: match.frontmatter?.title,
      body: match.body,
    });
    if (!proceed) {
      return {
        action: 'cancelled',
        id: match.id,
        tier: match.tier,
        originalPath: match.path,
      };
    }
  }

  const deletedAt = now ?? nowIso();
  const tombstoneReason = reason ?? '';
  const tombstoneDeletedBy = deletedBy ?? 'user-explicit';
  const tombstonePath = moveFactToTombstone(match, {
    deletedAt,
    reason: tombstoneReason,
    deletedBy: tombstoneDeletedBy,
  });

  const scratchpadEdits = scrubAllScratchpads(match.tierRoot, match.id);

  appendAuditEntry(match.tierRoot, {
    ts: deletedAt,
    action: 'tombstoned',
    tier: match.tier,
    id: match.id,
    reasonCode: REASON_CODES.USER_REQUESTED,
    reasonText: tombstoneReason || undefined,
    paths: { before: match.path, archive: tombstonePath },
    extra: {
      deletedBy: tombstoneDeletedBy,
      scratchpadEdits: scratchpadEdits.map((e) => ({
        path: e.path,
        removed: e.removed,
      })),
    },
  });

  return {
    action: 'tombstoned',
    id: match.id,
    tier: match.tier,
    originalPath: match.path,
    tombstonePath,
    scratchpadEdits,
  };
}

export function resolveFact({ id, projectRoot, userDir }) {
  if (!id || !ID_PATTERN.test(id)) return { state: 'not-found' };
  const tier = id[0];
  const tierRoot = resolveTierRoot({ tier, projectRoot, userDir });
  const factDir = resolveFactDir(tier, tierRoot);

  for (const filename of listLiveFactFiles(factDir)) {
    const p = join(factDir, filename);
    if (!statSync(p).isFile()) continue;
    const { frontmatter, body } = readFactAt(p);
    if (frontmatter?.id === id) {
      return {
        state: frontmatter.deleted_at ? 'tombstoned' : 'live',
        path: p,
        body,
        frontmatter,
        deletedAt: frontmatter.deleted_at,
      };
    }
  }

  const tombPath = join(factDir, 'archive', 'tombstones', `${id}.md`);
  if (existsSync(tombPath)) {
    const { frontmatter, body } = readFactAt(tombPath);
    return {
      state: 'tombstoned',
      path: tombPath,
      body,
      frontmatter,
      deletedAt: frontmatter?.deleted_at,
    };
  }

  const supersededPath = join(factDir, 'archive', 'superseded', `${id}.md`);
  if (existsSync(supersededPath)) {
    const { frontmatter, body } = readFactAt(supersededPath);
    return {
      state: 'superseded',
      path: supersededPath,
      body,
      frontmatter,
      supersededBy: frontmatter?.superseded_by,
    };
  }

  return { state: 'not-found' };
}
