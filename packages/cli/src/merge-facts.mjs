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
import { generateId } from '../../canonicalize/src/index.mjs';
import { writeFact } from './write-fact.mjs';

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

function findLiveFactById(factDir, id) {
  if (!existsSync(factDir)) return null;
  for (const entry of readdirSync(factDir, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    if (!entry.name.endsWith('.md')) continue;
    if (entry.name === 'INDEX.md') continue;
    const p = join(factDir, entry.name);
    if (!statSync(p).isFile()) continue;
    const { frontmatter, body, text } = readAndParse(p);
    if (frontmatter?.id === id && !frontmatter.deleted_at) {
      return { id, path: p, frontmatter, body, text };
    }
  }
  return null;
}

function moveToSuperseded(match, supersededBy) {
  const supersededDir = join(
    match.factDir,
    'archive',
    'superseded',
  );
  mkdirSync(supersededDir, { recursive: true });
  const newPath = join(supersededDir, `${match.id}.md`);
  const updated = match.text.replace(
    /^---\n/,
    `---\nsuperseded_by: ${supersededBy}\n`,
  );
  writeFileSync(newPath, updated, 'utf8');
  unlinkSync(match.path);
  return newPath;
}

export function mergeFacts(opts = {}) {
  const {
    idA,
    idB,
    mergedBody,
    mergedTitle,
    mergedSlug,
    mergedType,
    writeSource,
    trust,
    sourceFile,
    sourceLine,
    sourceSha1,
    mergedTags,
    projectRoot,
    userDir,
    now,
  } = opts;

  const errors = [];
  if (!idA || !ID_PATTERN.test(idA)) errors.push(`idA: must be a valid citation ID`);
  if (!idB || !ID_PATTERN.test(idB)) errors.push(`idB: must be a valid citation ID`);
  if (idA && idB && idA === idB) {
    return {
      action: 'error',
      errors: [`idA and idB are the same (${idA}); cannot merge a fact with itself`],
    };
  }
  if (!mergedBody || typeof mergedBody !== 'string' || !mergedBody.length) {
    errors.push('mergedBody: required, non-empty string');
  }
  if (!mergedTitle || typeof mergedTitle !== 'string') {
    errors.push('mergedTitle: required, non-empty string');
  }
  if (!mergedSlug || typeof mergedSlug !== 'string') {
    errors.push('mergedSlug: required, non-empty string');
  }
  if (errors.length > 0) {
    return { action: 'error', errorCategory: 'schema', errors };
  }

  const tierA = idA[0];
  const tierB = idB[0];
  if (tierA !== tierB) {
    return {
      action: 'error',
      errors: [
        `cross-tier merge not supported: idA tier (${tierA}) ≠ idB tier (${tierB}). Promote one side to the same tier first.`,
      ],
    };
  }
  const tier = tierA;
  if (!VALID_TIERS.has(tier)) {
    return {
      action: 'error',
      errors: [`invalid tier prefix on ids: ${tier}`],
    };
  }

  const tierRoot = resolveTierRoot({ tier, projectRoot, userDir });
  const factDir = resolveFactDir(tier, tierRoot);

  const matchA = findLiveFactById(factDir, idA);
  const matchB = findLiveFactById(factDir, idB);
  if (!matchA || !matchB) {
    const missing = [];
    if (!matchA) missing.push(idA);
    if (!matchB) missing.push(idB);
    return {
      action: 'not-found',
      errors: [`no live fact found for ${missing.join(', ')}`],
    };
  }
  matchA.factDir = factDir;
  matchB.factDir = factDir;

  const typeC =
    mergedType ?? matchA.frontmatter.type ?? matchB.frontmatter.type;

  const writeResult = writeFact({
    tier,
    type: typeC,
    slug: mergedSlug,
    title: mergedTitle,
    body: mergedBody,
    writeSource: writeSource ?? 'compressor',
    trust: trust ?? 'high',
    sourceFile: sourceFile ?? matchA.frontmatter.source_file ?? 'merge',
    sourceLine: sourceLine ?? 1,
    sourceSha1: sourceSha1 ?? matchA.frontmatter.source_sha1 ?? 'merged',
    mergedFrom: [idA, idB],
    tags: mergedTags,
    projectRoot,
    userDir,
  });
  if (writeResult.action === 'error') {
    return {
      action: 'error',
      errorCategory: writeResult.errorCategory,
      errors: writeResult.errors,
    };
  }

  // Layer-2 review finding B1: if writeFact dedup'd against an existing
  // unrelated fact (content-addressed collision), we must NOT proceed to
  // moveToSuperseded — that would silently retarget A's and B's history
  // to a pre-existing fact whose frontmatter has no merged_from entry.
  // Reject with a clear error; caller picks a different mergedBody.
  if (writeResult.action !== 'created') {
    return {
      action: 'error',
      errorCategory: 'collision',
      errors: [
        `merged body collides with existing fact ${writeResult.id} (writeFact returned ${writeResult.action}${writeResult.skipReason ? ': ' + writeResult.skipReason : ''}); choose a different mergedBody`,
      ],
    };
  }

  const supersededA = moveToSuperseded(matchA, writeResult.id);
  const supersededB = moveToSuperseded(matchB, writeResult.id);

  const ts = now ?? nowIso();
  appendAuditLog(tierRoot, {
    ts,
    action: 'merged',
    id: writeResult.id,
    tier,
    mergedFrom: [idA, idB],
    supersededPaths: [supersededA, supersededB],
    newPath: writeResult.path,
  });

  return {
    action: 'merged',
    id: writeResult.id,
    tier,
    path: writeResult.path,
    supersededPaths: [supersededA, supersededB],
  };
}
