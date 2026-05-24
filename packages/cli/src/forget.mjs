import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { canonicalize } from '../../canonicalize/src/index.mjs';

const VALID_TIERS = new Set(['U', 'P', 'L']);
const ID_PATTERN = /^[PUL]-[2345679ABCDEFGHJKLMNPQRSTUVWXYZa]{8}$/;

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

function readAndParse(filePath) {
  const text = readFileSync(filePath, 'utf8');
  const m = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return { frontmatter: null, body: text, text };
  const fm = {};
  for (const line of m[1].split('\n')) {
    if (!line.trim()) continue;
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    fm[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return { frontmatter: fm, body: m[2] ?? '', text };
}

function nowIso() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
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

function resolveById(id, { projectRoot, userDir }) {
  const tier = id[0];
  if (!VALID_TIERS.has(tier)) return { matches: [] };
  const tierRoot = resolveTierRoot({ tier, projectRoot, userDir });
  const factDir = resolveFactDir(tier, tierRoot);
  for (const filename of listLiveFactFiles(factDir)) {
    const p = join(factDir, filename);
    if (!statSync(p).isFile()) continue;
    const { frontmatter, body } = readAndParse(p);
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
      const { frontmatter, body } = readAndParse(p);
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
  return { matches };
}

function moveFactToTombstone(match, { deletedAt, reason, deletedBy }) {
  const tombDir = join(match.factDir, 'archive', 'tombstones');
  mkdirSync(tombDir, { recursive: true });
  const tombPath = join(tombDir, `${match.id}.md`);
  const original = readFileSync(match.path, 'utf8');
  const tombstoned = original.replace(
    /^---\n/,
    `---\ndeleted_at: ${deletedAt}\ndeleted_reason: ${reason}\ndeleted_by: ${deletedBy}\n`,
  );
  writeFileSync(tombPath, tombstoned, 'utf8');
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
    return {
      action: 'error',
      errors: ['idOrQuery: required, non-empty string'],
    };
  }

  const resolved = ID_PATTERN.test(idOrQuery)
    ? resolveById(idOrQuery, { projectRoot, userDir })
    : resolveByQuery(idOrQuery, { projectRoot, userDir });

  if (resolved.matches.length === 0) {
    return {
      action: 'not-found',
      errors: [`no matching fact for "${idOrQuery}"`],
    };
  }
  if (resolved.matches.length > 1) {
    const ids = resolved.matches.map((m) => m.id);
    return {
      action: 'error',
      errors: [
        `ambiguous query "${idOrQuery}" matched multiple facts: ${ids.join(', ')}`,
      ],
      candidateIds: ids,
    };
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

  appendAuditLog(match.tierRoot, {
    ts: deletedAt,
    action: 'tombstoned',
    id: match.id,
    tier: match.tier,
    reason: tombstoneReason,
    deletedBy: tombstoneDeletedBy,
    originalPath: match.path,
    tombstonePath,
    scratchpadEdits: scratchpadEdits.map((e) => ({
      path: e.path,
      removed: e.removed,
    })),
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
    const { frontmatter, body } = readAndParse(p);
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
    const { frontmatter, body } = readAndParse(tombPath);
    return {
      state: 'tombstoned',
      path: tombPath,
      body,
      frontmatter,
      deletedAt: frontmatter?.deleted_at,
    };
  }

  return { state: 'not-found' };
}
