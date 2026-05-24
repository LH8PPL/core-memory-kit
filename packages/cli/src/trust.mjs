// Trust override (Task 15, T-013). Last Layer 3 module.
//
// Public boundary: overrideTrust({id, level, ...}) → result.
// Locates an id in BOTH the granular per-fact archive (YAML frontmatter)
// AND scratchpad-bullet HTML-comment provenance lines, then updates the
// `trust:` field in every matched location. The two trust values are
// independent — a fact file and a scratchpad bullet sharing an id can
// drift; this command brings them back in sync at the new level.
//
// Uses shared modules per CLAUDE.md "Shared modules" rule:
//   tier-paths.mjs    — VALID_TIERS, ID_PATTERN, SCRATCHPADS_BY_TIER,
//                       resolveTierRoot, resolveFactDir
//   frontmatter.mjs   — parse + format (for fact-file YAML round-trip)
//   audit-log.mjs     — appendAuditEntry, nowIso, REASON_CODES.TRUST_CHANGE
//   result-shapes.mjs — ERROR_CATEGORIES, errorResult, notFoundResult

import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import {
  VALID_TIERS,
  ID_PATTERN,
  SCRATCHPADS_BY_TIER,
  resolveTierRoot,
  resolveFactDir,
} from './tier-paths.mjs';
import { parse, format } from './frontmatter.mjs';
import { readBullet, writeBullet } from './provenance.mjs';
import { appendAuditEntry, nowIso, REASON_CODES } from './audit-log.mjs';
import {
  ERROR_CATEGORIES,
  errorResult,
  notFoundResult,
} from './result-shapes.mjs';

const VALID_TRUST_LEVELS = new Set(['high', 'medium', 'low']);

function validateOptions(opts) {
  const errors = [];
  if (!opts.id || typeof opts.id !== 'string') {
    errors.push('id: required, non-empty string');
  } else if (!ID_PATTERN.test(opts.id)) {
    errors.push(
      `id: must match the kit's citation-ID format (got ${JSON.stringify(opts.id)})`,
    );
  }
  if (!opts.level || typeof opts.level !== 'string') {
    errors.push('level: required, one of high/medium/low');
  } else if (!VALID_TRUST_LEVELS.has(opts.level)) {
    errors.push(
      `level: must be one of high/medium/low (got ${JSON.stringify(opts.level)})`,
    );
  }
  return errors;
}

function listFactFiles(factDir) {
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

function findFactFileById(factDir, id) {
  for (const filename of listFactFiles(factDir)) {
    const path = join(factDir, filename);
    if (!statSync(path).isFile()) continue;
    const { frontmatter } = parse(readFileSync(path, 'utf8'));
    if (frontmatter?.id === id) {
      return { path, frontmatter };
    }
  }
  return null;
}

function updateFactFileTrust(path, newLevel) {
  const text = readFileSync(path, 'utf8');
  const { frontmatter, body } = parse(text);
  if (!frontmatter) return null; // shouldn't happen — caller already matched
  const priorTrust = frontmatter.trust ?? null;
  const updated = { ...frontmatter, trust: newLevel };
  writeFileSync(path, format({ frontmatter: updated, body }), 'utf8');
  return { priorTrust };
}

// Locate the bullet with matching leading id and rewrite both its lines via
// the canonical provenance.mjs reader+writer pair. PR-15 review finding:
// the prior `bulletLine.includes('(' + id + ')')` match was too loose — it
// also matched bullets whose BODY TEXT referenced another fact's id (e.g.
// "see also (P-XYZ)"). readBullet returns the leading id deterministically,
// so `parsed.id === id` only matches the actual target. Bonus: this closes
// the read/write-path asymmetry self-flagged in the PR description —
// overrideTrust now round-trips through the same provenance pair that
// appendScratchpadBullet uses.
function updateScratchpadBulletTrust(path, id, newLevel) {
  const text = readFileSync(path, 'utf8');
  const lines = text.split('\n');
  for (let i = 0; i < lines.length - 1; i++) {
    const parsed = readBullet({
      bulletLine: lines[i],
      commentLine: lines[i + 1],
    });
    if (!parsed || parsed.id !== id) continue;
    const priorTrust = parsed.provenance.trust;
    const result = writeBullet({
      id: parsed.id,
      text: parsed.text,
      provenance: { ...parsed.provenance, trust: newLevel },
    });
    if (result.action !== 'formatted') {
      throw new Error(
        'overrideTrust: writeBullet failed for re-formatted bullet — ' +
          (result.errors?.join('; ') ?? 'unknown'),
      );
    }
    const [newBullet, newComment] = result.lines.split('\n');
    lines[i] = newBullet;
    lines[i + 1] = newComment;
    writeFileSync(path, lines.join('\n'), 'utf8');
    return { priorTrust };
  }
  return null;
}

function listScratchpadsForTier(tier, tierRoot) {
  const allowed = SCRATCHPADS_BY_TIER[tier];
  const out = [];
  for (const scratchpad of allowed) {
    out.push({ name: scratchpad, path: join(tierRoot, scratchpad) });
  }
  return out;
}

export function overrideTrust(opts = {}) {
  const errors = validateOptions(opts);
  if (errors.length > 0) {
    return errorResult({
      category: ERROR_CATEGORIES.SCHEMA,
      errors,
    });
  }

  const { id, level, projectRoot, userDir, actor, now } = opts;
  const tier = id[0];
  if (!VALID_TIERS.has(tier)) {
    return errorResult({
      category: ERROR_CATEGORIES.SCHEMA,
      errors: [`id tier prefix invalid: ${tier}`],
    });
  }

  const tierRoot = resolveTierRoot({ tier, projectRoot, userDir });
  const factDir = resolveFactDir(tier, tierRoot);
  const updatedLocations = [];

  // 1. Try fact file (granular archive)
  const factMatch = findFactFileById(factDir, id);
  if (factMatch) {
    const r = updateFactFileTrust(factMatch.path, level);
    if (r) {
      updatedLocations.push({
        type: 'fact',
        path: factMatch.path,
        priorTrust: r.priorTrust,
      });
    }
  }

  // 2. Try every scratchpad in the tier
  for (const { path: scratchpadPath } of listScratchpadsForTier(tier, tierRoot)) {
    if (!existsSync(scratchpadPath)) continue;
    const r = updateScratchpadBulletTrust(scratchpadPath, id, level);
    if (r) {
      updatedLocations.push({
        type: 'scratchpad',
        path: scratchpadPath,
        priorTrust: r.priorTrust,
      });
    }
  }

  if (updatedLocations.length === 0) {
    return notFoundResult({
      errors: [
        `no matching id ${id} found in tier ${tier} (searched fact files + scratchpads)`,
      ],
    });
  }

  // 3. Audit log
  const ts = now ?? nowIso();
  appendAuditEntry(tierRoot, {
    ts,
    action: 'trust-changed',
    tier,
    id,
    reasonCode: REASON_CODES.TRUST_CHANGE,
    extra: {
      actor: actor ?? 'user-explicit',
      newTrust: level,
      priorTrust: updatedLocations.map((l) => ({
        type: l.type,
        path: l.path,
        value: l.priorTrust,
      })),
    },
  });

  return {
    action: 'trust-updated',
    id,
    tier,
    level,
    updatedLocations,
  };
}
