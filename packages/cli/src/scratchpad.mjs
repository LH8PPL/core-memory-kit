// Bounded scratchpad writer (Task 12, T-010). First Layer 3 module.
// First real consumer of the shared modules established at PR-2.
//
// Public boundary: appendScratchpadBullet(opts) → result.
// See design §2.1 + §4 + tasks.md 12.1-12.5.
//
// Uses shared modules per CLAUDE.md "Shared modules" rule:
//   tier-paths.mjs   — VALID_TIERS, SCRATCHPADS_BY_TIER, DEFAULT_SCRATCHPAD_CAPS,
//                      resolveTierRoot, resolveScratchpadPath
//   audit-log.mjs    — appendAuditEntry, nowIso, AUDIT_LOG_SCHEMA_VERSION
//   result-shapes.mjs — ERROR_CATEGORIES, errorResult
//   @lh8ppl/cmk-canonicalize — generateId (citation IDs derived from the bullet text)
//
// Frontmatter (HTML-comment provenance below the bullet) is hand-formatted
// inline for v0.1. Task 13 (Provenance frontmatter writer + reader) will
// extract this to a shared `writeBullet(text, provenance)` primitive that
// this module will call instead. The handoff is clean: format stays identical;
// only the location of the formatter moves.

import {
  existsSync,
  readFileSync,
  writeFileSync,
  appendFileSync,
  mkdirSync,
} from 'node:fs';
import { join } from 'node:path';
import { generateId } from '@lh8ppl/cmk-canonicalize';
import {
  VALID_TIERS,
  SCRATCHPADS_BY_TIER,
  DEFAULT_SCRATCHPAD_CAPS,
  resolveTierRoot,
  resolveScratchpadPath,
} from './tier-paths.mjs';
import { appendAuditEntry, nowIso, REASON_CODES } from './audit-log.mjs';
import { ERROR_CATEGORIES, errorResult } from './result-shapes.mjs';
import { writeBullet, parseBulletProvenance, isProvenanceCommentLine } from './provenance.mjs';
import { graduateForCapRelief } from './graduation.mjs';

const VALID_TRUST = new Set(['high', 'medium', 'low']);
const VALID_WRITE_SOURCES = new Set([
  'user-explicit',
  'auto-extract',
  'compressor',
  'manual-edit',
  'imported',
]);
// Per Task 13.2 / provenance.mjs: 6 comment fields. `id` comes from the
// bullet line and is added by appendScratchpadBullet, not from caller.
const REQUIRED_PROVENANCE_FIELDS = [
  'source',
  'source_line',
  'sha1',
  'write',
  'trust',
  'at',
];

const CONSOLIDATION_TRIGGER_RATIO = 0.95;
const STALE_AFTER_DAYS = 14;

function validateOptions(opts) {
  const errors = [];

  if (!opts.tier) {
    errors.push("tier: required, one of 'U', 'P', 'L'");
  } else if (!VALID_TIERS.has(opts.tier)) {
    errors.push(`tier: must be 'U', 'P', or 'L' (got ${JSON.stringify(opts.tier)})`);
  }

  if (!opts.scratchpad) {
    errors.push('scratchpad: required, one of the documented scratchpad filenames');
  } else if (opts.tier && VALID_TIERS.has(opts.tier)) {
    const allowed = SCRATCHPADS_BY_TIER[opts.tier];
    if (!allowed.has(opts.scratchpad)) {
      errors.push(
        `scratchpad: ${opts.scratchpad} is not valid for tier ${opts.tier} (allowed: ${[...allowed].join(', ')})`,
      );
    }
  }

  if (!opts.section || typeof opts.section !== 'string') {
    errors.push('section: required, non-empty string (must match a `## <section>` heading in the file)');
  }

  if (opts.text == null || typeof opts.text !== 'string' || !opts.text.trim()) {
    errors.push('text: required, non-empty string');
  }

  if (!opts.provenance || typeof opts.provenance !== 'object') {
    errors.push('provenance: required object with source/source_line/sha1/write/trust/at');
  } else {
    for (const f of REQUIRED_PROVENANCE_FIELDS) {
      if (opts.provenance[f] === undefined || opts.provenance[f] === null || opts.provenance[f] === '') {
        errors.push(`provenance.${f}: required, non-empty`);
      }
    }
    if (opts.provenance.trust && !VALID_TRUST.has(opts.provenance.trust)) {
      errors.push(`provenance.trust: must be one of high/medium/low (got ${JSON.stringify(opts.provenance.trust)})`);
    }
    if (opts.provenance.write && !VALID_WRITE_SOURCES.has(opts.provenance.write)) {
      errors.push(
        `provenance.write: must be one of user-explicit/auto-extract/compressor/manual-edit/imported (got ${JSON.stringify(opts.provenance.write)})`,
      );
    }
  }

  return errors;
}

// Bullet formatting is delegated to provenance.mjs's writeBullet (Task 13).
// scratchpad.mjs is responsible for "where the bullet goes" (which file,
// which section, cap enforcement); provenance.mjs is responsible for
// "what the bullet+comment look like on disk".
function formatBullet({ id, text, provenance }) {
  const result = writeBullet({ id, text, provenance });
  if (result.action !== 'formatted') {
    // Shouldn't happen — we already validated above, but be defensive.
    throw new Error(
      `scratchpad.formatBullet: writeBullet returned ${result.action}: ${result.errors?.join('; ') ?? 'unknown'}`,
    );
  }
  return result.lines;
}

function readJsonIfExists(path) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

function resolveCap({ tier, scratchpad, projectRoot, userDir, settings }) {
  // Test-injected settings short-circuit.
  if (settings) {
    return (
      settings?.scratchpads?.[scratchpad]?.max_chars ??
      DEFAULT_SCRATCHPAD_CAPS[scratchpad]
    );
  }
  // Project tier wins (only meaningful for tiers P + L which share a project root).
  if (tier === 'P' || tier === 'L') {
    const projectSettings = readJsonIfExists(
      resolveScratchpadPath({
        tier: 'P',
        scratchpad: 'settings.json',
        projectRoot,
      }),
    );
    const projectCap = projectSettings?.scratchpads?.[scratchpad]?.max_chars;
    if (typeof projectCap === 'number') return projectCap;
  }
  // User tier fallback.
  const userSettings = readJsonIfExists(
    resolveScratchpadPath({
      tier: 'U',
      scratchpad: 'settings.json',
      userDir,
    }),
  );
  const userCap = userSettings?.scratchpads?.[scratchpad]?.max_chars;
  if (typeof userCap === 'number') return userCap;
  // Hardcoded default.
  return DEFAULT_SCRATCHPAD_CAPS[scratchpad];
}

function findSectionRange(lines, sectionTitle) {
  const startIdx = lines.findIndex(
    (l) => l.trim() === `## ${sectionTitle}`,
  );
  if (startIdx === -1) return null;
  let endIdx = lines.findIndex(
    (l, i) => i > startIdx && /^##\s/.test(l),
  );
  if (endIdx === -1) endIdx = lines.length;
  return { startIdx, endIdx };
}

function insertIntoSection(text, sectionTitle, bullet) {
  const lines = text.split('\n');
  const range = findSectionRange(lines, sectionTitle);
  if (!range) return null;
  // Insert before the next `## ` heading; skip trailing blank lines so the
  // new bullet sits cleanly at the end of this section's content.
  let insertAt = range.endIdx;
  while (insertAt > range.startIdx + 1 && lines[insertAt - 1].trim() === '') {
    insertAt--;
  }
  // Preserve a blank line after the new bullet pair when there's content
  // beyond it (the next heading).
  const bulletLines = bullet.split('\n');
  lines.splice(insertAt, 0, ...bulletLines);
  return lines.join('\n');
}

/**
 * Ensure a `## <sectionTitle>` heading exists in a scratchpad file, creating
 * it (appended at EOF, with clean spacing) if absent. Used by the persona
 * promoter (Task 64 / F2) so a cross-project candidate routed to a sane-but-
 * new section lands instead of schema-failing to the review queue. The CALLER
 * owns the name-safety guard — this only writes the heading.
 *
 * @returns {{created: boolean, error?: string}}
 */
export function ensureSectionExists(scratchpadPath, sectionTitle) {
  if (!existsSync(scratchpadPath)) return { created: false, error: 'no-file' };
  const text = readFileSync(scratchpadPath, 'utf8');
  if (findSectionRange(text.split('\n'), sectionTitle)) return { created: false };
  const body = text.trimEnd(); // drop trailing whitespace/blank lines (no `\s+$` regex — trips ReDoS heuristics)
  // No leading blank lines for an empty/whitespace-only file (the scaffolded
  // scratchpads are never empty, but keep the output clean if one ever is).
  const prefix = body ? `${body}\n\n` : '';
  writeFileSync(scratchpadPath, `${prefix}## ${sectionTitle}\n`, 'utf8');
  return { created: true };
}

const EVICTED_ID_RE = /^- \(([PUL]-[A-Za-z0-9]+)\)/;

function consolidate(text, { nowDate }) {
  const lines = text.split('\n');
  const removeIdx = new Set();
  const evicted = [];
  const staleCutoff = new Date(nowDate.getTime() - STALE_AFTER_DAYS * 24 * 60 * 60 * 1000);
  let bulletsRemoved = 0;

  for (let i = 0; i < lines.length - 1; i++) {
    if (removeIdx.has(i)) continue;
    const bulletLine = lines[i];
    const commentLine = lines[i + 1];
    if (!bulletLine.startsWith('- (')) continue;
    if (!isProvenanceCommentLine(commentLine)) continue;

    const prov = parseBulletProvenance(commentLine);
    if (!prov || !prov.at || !prov.trust) continue;
    if (prov.trust === 'high') continue; // Preserve high-trust regardless of age.

    const at = new Date(prov.at);
    if (Number.isNaN(at.getTime())) continue;
    if (at >= staleCutoff) continue; // <14d → keep

    removeIdx.add(i);
    removeIdx.add(i + 1);
    // Task 91.2: capture the dropped bullet so the caller can ARCHIVE it
    // (recoverable, per the §6.5 tombstone principle) instead of hard-deleting.
    const idMatch = bulletLine.match(EVICTED_ID_RE);
    evicted.push({ id: idMatch ? idMatch[1] : 'unknown', block: `${bulletLine}\n${commentLine}` });
    bulletsRemoved++;
  }

  if (removeIdx.size === 0) {
    return { text, bulletsRemoved: 0, evicted: [] };
  }
  const out = lines.filter((_, i) => !removeIdx.has(i)).join('\n');
  return { text: out, bulletsRemoved, evicted };
}

// Task 91.2: archive bullets that consolidate() dropped, so eviction is
// recoverable rather than silent (mirrors `cmk forget`'s tombstone, §6.5).
// Append-only log under the tier's archive dir; one audit entry per bullet.
const EVICTED_ARCHIVE_HEADER =
  '# Evicted scratchpad bullets\n\n<!-- Bullets dropped by cap-consolidation (low/medium trust, >14 days old). Kept here so eviction is recoverable, not silent. To restore one, re-capture it via `cmk remember`. -->\n\n';

function archiveEvictedBullets({ tierRoot, tier, scratchpad, evicted, now }) {
  const archiveDir = join(tierRoot, 'memory', 'archive');
  mkdirSync(archiveDir, { recursive: true });
  const archivePath = join(archiveDir, 'evicted-bullets.md');
  const ts = now ?? nowIso();
  const header = existsSync(archivePath) ? '' : EVICTED_ARCHIVE_HEADER;
  const block = `## Evicted ${ts} — consolidate(${scratchpad})\n${evicted
    .map((e) => e.block)
    .join('\n')}\n\n`;
  appendFileSync(archivePath, header + block, 'utf8');
  for (const e of evicted) {
    appendAuditEntry(tierRoot, {
      ts,
      action: 'evicted',
      tier,
      id: e.id,
      reasonCode: REASON_CODES.SCRATCHPAD_EVICTED,
      paths: { archive: archivePath },
      extra: { scratchpad },
    });
  }
}

export function appendScratchpadBullet(opts = {}) {
  const errors = validateOptions(opts);
  if (errors.length > 0) {
    return errorResult({
      category: ERROR_CATEGORIES.SCHEMA,
      errors,
    });
  }

  const {
    tier,
    scratchpad,
    section,
    text,
    provenance,
    projectRoot,
    userDir,
    now,
    settings,
  } = opts;

  const tierRoot = resolveTierRoot({ tier, projectRoot, userDir });
  const path = resolveScratchpadPath({ tier, scratchpad, projectRoot, userDir });

  if (!existsSync(path)) {
    return errorResult({
      category: ERROR_CATEGORIES.NOT_FOUND,
      errors: [
        `scratchpad file does not exist at ${path} — run \`cmk install\` (project tier) or \`cmk init-user-tier\` (user tier) first`,
      ],
      path,
    });
  }

  const original = readFileSync(path, 'utf8');
  const id = opts.id ?? generateId(tier, text);
  const cap = resolveCap({ tier, scratchpad, projectRoot, userDir, settings });
  const bullet = formatBullet({ id, text, provenance });

  // 1. Build candidate file content (bullet inserted into section)
  const candidate = insertIntoSection(original, section, bullet);
  if (candidate === null) {
    return errorResult({
      category: ERROR_CATEGORIES.SCHEMA,
      errors: [
        `section "${section}" not found in ${scratchpad} (expected a "## ${section}" heading)`,
      ],
      path,
    });
  }

  // 2. Cap check: would the write push to >95%? If yes, consolidate.
  let consolidationRan = false;
  let bulletsConsolidated = 0;
  let evictedBullets = [];
  let finalContent = candidate;
  const candidateBytes = Buffer.byteLength(candidate, 'utf8');

  if (candidateBytes > cap * CONSOLIDATION_TRIGGER_RATIO) {
    consolidationRan = true;
    const nowDate = new Date(now ?? nowIso());
    const consolidated = consolidate(candidate, { nowDate });
    bulletsConsolidated = consolidated.bulletsRemoved;
    finalContent = consolidated.text;
    evictedBullets = consolidated.evicted ?? [];
  }

  // 2b. Graduation (Task 91, generalized to all tiers by Task 94 / §19.2). If
  // still over the LOAD-cap after stale-drop — which is what happens when the
  // bullets are high-trust (consolidate() never drops those) — graduate the
  // oldest high-trust bullets OUT of the hot index into the tier's permanent
  // fact store, keeping the injected slice small (the write already succeeded
  // via the load-cap; graduation is about injection budget, not write success).
  // ALL FACT-BEARING TIERS (D-61): project (MEMORY.md + SOUL.md) AND the user-
  // tier persona (USER/HABITS/LESSONS) — graduating into the tier's existing
  // fact store (project context/memory/, user <userDir>/fragments/; writeFact
  // already routes tier-U facts there). Local tier (machine-paths/overrides) is
  // excluded: it's machine-specific config, not durable facts.
  let bulletsGraduated = 0;
  let graduatedIds = [];
  let finalBytes = Buffer.byteLength(finalContent, 'utf8');
  if (finalBytes > cap && (tier === 'P' || tier === 'U')) {
    const grad = graduateForCapRelief({
      text: finalContent,
      capBytes: cap,
      tier,
      projectRoot,
      userDir,
      now,
    });
    finalContent = grad.text;
    graduatedIds = grad.graduated;
    bulletsGraduated = graduatedIds.length;
    finalBytes = Buffer.byteLength(finalContent, 'utf8');
  }

  // 3. Load-cap, NOT write-cap (Task 94 / D-61 / design §19). The write ALWAYS
  // succeeds — the cap governs only how much is injected, never whether content
  // can be saved (the never-lose-memory invariant). When consolidate + graduation
  // can't bring the file under cap (e.g. an absurdly small cap, or a single large
  // bullet), the file is allowed to GROW past the inject budget; inject-context
  // load-caps the snapshot (§7.1.1) and the overflow stays searchable on disk.
  // The old `cap_exceeded` reject path was removed here — see §19.5 for the
  // superseded write-cap design and why it changed.

  // 4. Write + audit
  writeFileSync(path, finalContent, 'utf8');
  const ts = now ?? nowIso();

  // 4a. Task 91.2 — archive evicted bullets now that the drop is durable on
  // disk (only on the success path, so we never archive a bullet that's still
  // live in the unchanged on-disk scratchpad).
  if (evictedBullets.length > 0) {
    archiveEvictedBullets({ tierRoot, tier, scratchpad, evicted: evictedBullets, now: ts });
  }
  // 4b. Task 91.4 (Door 4) — one audit entry per graduated bullet, so the
  // bullet→fact-file move is traceable in the audit log (writeFact also logs
  // the fact create; this records the graduation that triggered it).
  for (const gid of graduatedIds) {
    appendAuditEntry(tierRoot, {
      ts,
      action: 'graduated',
      tier,
      id: gid,
      reasonCode: REASON_CODES.SCRATCHPAD_GRADUATED,
      paths: { after: path },
      extra: { scratchpad },
    });
  }

  appendAuditEntry(tierRoot, {
    ts,
    action: 'appended',
    tier,
    id,
    reasonCode: REASON_CODES.SCRATCHPAD_APPEND,
    paths: { after: path },
    extra: {
      scratchpad,
      section,
      cap,
      bytes: finalBytes,
      consolidationRan,
      bulletsConsolidated,
      bulletsGraduated,
    },
  });

  return {
    action: 'appended',
    id,
    path,
    cap,
    bytes: finalBytes,
    consolidationRan,
    bulletsConsolidated,
    bulletsGraduated,
  };
}
