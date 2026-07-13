// anti-pattern.mjs — convert a repeatedly-failing fact into a typed "avoid
// this" memory (Task 194, ADR-0017 Decision #5; the Memento / REMEMBERER /
// Negative-Knowledge precedent — two independent systems retain failures as
// labeled anti-patterns instead of pruning them; Negative-Knowledge makes the
// dead-end-veto a first-class constraint).
//
// demote-not-evict, extended to the loop: the content is RETAINED — reframed
// as a warning that keeps surfacing — never erased. Erasing a failure loses
// exactly the knowledge ("this looked right and wasn't") that prevents the
// next session from re-deriving the same mistake.
//
// Two shapes, by what the id points at:
//   scratchpad bullet → rewritten IN PLACE via the memoryWrite replace path
//     (Poison_Guard + audit + provenance intact) with the ⚠️ AVOID framing.
//     Scratchpads are on the inject path, so the warning IS injected.
//   granular fact file → frontmatter retyped `type: anti-pattern` (a
//     CONVERSION-ONLY type: writeFact's VALID_TYPES deliberately excludes it —
//     like judgments, anti-patterns are born from the loop, never dictated),
//     title AVOID-prefixed, body prefixed with the warning block; PLUS a
//     compact warning bullet appended to the project MEMORY.md
//     "Anti-patterns" section so the warning reaches the injected snapshot
//     (fact files are searchable but not injected — the bullet is the
//     injection half of "retained + injected as a warning").
//
// The fact FILENAME is kept (type_slug.md now carries a different frontmatter
// type) — renaming would churn INDEX.md links + git history for zero recall
// value; the frontmatter `type` is the truth (the markdown-is-truth rule).

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, basename } from 'node:path';
import { openIndexDb } from './index-db.mjs';
import { parse, format } from './frontmatter.mjs';
import { appendAuditEntry, nowIso } from './audit-log.mjs';
import { ERROR_CATEGORIES, errorResult } from './result-shapes.mjs';
import { memoryWrite } from './memory-write.mjs';
import { ensureSectionExists } from './scratchpad.mjs';
import { resolveTierRoot } from './tier-paths.mjs';
import { reindex } from './reindex.mjs';

export const ANTI_PATTERN_TYPE = 'anti-pattern';

/** Read one observations row (id → {tier, source_file, heading_path, body}).
 * Shared by the prune-queue resolver (bullet-vs-fact-file dispatch). Returns
 * null on any failure — callers treat that as "unknown id". */
export function lookupObservation({ projectRoot, id } = {}) {
  if (!projectRoot || !id) return null;
  let db;
  try {
    db = openIndexDb({ projectRoot });
    return (
      db
        .prepare('SELECT tier, source_file, heading_path, body FROM observations WHERE id = ?')
        .get(id) ?? null
    );
  } catch {
    return null;
  } finally {
    try {
      db?.close();
    } catch {
      /* ignore */
    }
  }
}

/** Where a bullet row lives: `heading_path` is `<scratchpad> > <section>`
 * (index-rebuild's shape); fall back to the source file's basename. */
export function bulletLocation(row) {
  const sep = String(row?.heading_path ?? '').indexOf(' > ');
  return {
    scratchpad: sep > 0 ? row.heading_path.slice(0, sep) : basename(String(row?.source_file ?? '')),
    section: sep > 0 ? row.heading_path.slice(sep + 3) : 'Active Threads',
  };
}
const AVOID_TITLE_PREFIX = 'AVOID: ';
const BULLET_WARNING_PREFIX = '⚠️ AVOID (repeatedly failed in practice): ';
const FACT_WARNING_BLOCK =
  '> ⚠️ **ANTI-PATTERN** — this approach repeatedly failed in practice (trust\n' +
  '> floored by outcome signals). Retained as a warning: do NOT rely on it.\n';

/**
 * Convert the fact behind `id` into an anti-pattern (see module header).
 * Returns { action: 'converted', id, kind: 'bullet'|'fact-file', ... } or
 * errorResult. The observations row tells us what the id points at.
 */
export function convertToAntiPattern({ projectRoot, userDir, id, now } = {}) {
  if (!projectRoot || !id) {
    return errorResult({
      category: ERROR_CATEGORIES.SCHEMA,
      errors: ['convertToAntiPattern: projectRoot and id are required'],
    });
  }
  let db;
  let row;
  try {
    db = openIndexDb({ projectRoot });
    row = db
      .prepare('SELECT tier, source_file, heading_path, body FROM observations WHERE id = ?')
      .get(id);
  } finally {
    try {
      db?.close();
    } catch {
      /* ignore */
    }
  }
  if (!row) {
    return errorResult({
      category: ERROR_CATEGORIES.NOT_FOUND,
      errors: [`convertToAntiPattern: no indexed observation for ${id} (run cmk reindex?)`],
    });
  }

  const ts = now ?? nowIso();
  // source_file is projectRoot-relative for P/L tiers, userDir-relative for U
  // (index-rebuild.mjs relativeSource) — resolve against the right base.
  const base = row.tier === 'U' ? userDir : projectRoot;
  const absPath = base ? join(base, row.source_file) : null;

  // A granular fact file is the source whose frontmatter carries THIS id;
  // anything else (a scratchpad, a missing base) is the bullet shape.
  if (absPath && existsSync(absPath)) {
    const parsed = parse(readFileSync(absPath, 'utf8'));
    if (parsed.frontmatter && parsed.frontmatter.id === id) {
      return convertFactFile({ projectRoot, userDir, id, absPath, parsed, ts });
    }
  }
  return convertBullet({ projectRoot, userDir, id, row, ts });
}

/**
 * The prune-review 'forget' half, shape-aware (Task 194): a granular FACT
 * routes through forget() (tombstone archive + scratchpad scrub + reindex);
 * a scratchpad BULLET — which forget() deliberately does NOT tombstone (it
 * answers not-found with the "is a scratchpad bullet" hint) — routes through
 * the memoryWrite remove path (tombstone archive + provenance-pair strip),
 * the same safe surface the memory-write skill uses. Never a hand-delete.
 */
export async function forgetCandidate({ projectRoot, userDir, id, reason, now } = {}) {
  const ts = now ?? nowIso();
  const { forget } = await import('./forget.mjs'); // lazy: forget ⇄ write-path cycle safety
  const r = forget({
    idOrQuery: id,
    projectRoot,
    userDir,
    yes: true,
    deletedBy: 'prune-review',
    reason,
    now: ts,
  });
  if (r.action !== 'not-found') return r;

  const row = lookupObservation({ projectRoot, id });
  if (!row) return r; // genuinely unknown id — surface forget()'s not-found
  const { scratchpad, section } = bulletLocation(row);
  return memoryWrite({
    action: 'remove',
    tier: row.tier,
    scratchpad,
    section,
    text: row.body,
    confirmRemove: true,
    source: 'prune-review',
    trust: 'medium',
    projectRoot,
    userDir,
    now: ts,
  });
}

// --- the fact-file shape ------------------------------------------------

function convertFactFile({ projectRoot, userDir, id, absPath, parsed, ts }) {
  const { frontmatter, body } = parsed;
  const originalType = frontmatter.type;
  const originalTitle = String(frontmatter.title ?? '');

  frontmatter.type = ANTI_PATTERN_TYPE;
  if (!originalTitle.startsWith(AVOID_TITLE_PREFIX)) {
    frontmatter.title = `${AVOID_TITLE_PREFIX}${originalTitle}`;
  }
  frontmatter.converted_at = ts;
  frontmatter.converted_from_type = originalType;
  frontmatter.converted_reason = 'survival-gate: trust floored by repeated outcome failures';

  const newBody = body.startsWith(FACT_WARNING_BLOCK)
    ? body
    : `${FACT_WARNING_BLOCK}\n${body}`;
  writeFileSync(absPath, format({ frontmatter, body: newBody }), 'utf8');

  const tier = id[0];
  const tierRoot = resolveTierRoot({ tier, projectRoot, userDir });
  appendAuditEntry(tierRoot ?? join(projectRoot, 'context'), {
    ts,
    action: 'anti-pattern-converted',
    tier,
    id,
    reasonCode: 'survival-gate',
    reasonText: `anti-pattern conversion: ${basename(absPath)} retyped ${originalType} → ${ANTI_PATTERN_TYPE} (retained as a warning, not erased)`,
    paths: { file: absPath },
    extra: { kind: 'fact-file', converted_from_type: originalType },
  });

  // Refresh the index so search surfaces the AVOID framing immediately.
  try {
    reindex({ tier, projectRoot, userDir, warn: () => {} });
  } catch {
    // best-effort — the committed file is the truth; the next boot reindex catches up.
  }

  // The injection half: a compact warning bullet on the project MEMORY.md.
  // Best-effort — the conversion is complete without it (searchable either way).
  let bullet = null;
  try {
    const scratchpadPath = join(projectRoot, 'context', 'MEMORY.md');
    if (existsSync(scratchpadPath)) {
      ensureSectionExists(scratchpadPath, 'Anti-patterns');
      const r = memoryWrite({
        action: 'add',
        tier: 'P',
        scratchpad: 'MEMORY.md',
        section: 'Anti-patterns',
        text: `${BULLET_WARNING_PREFIX}${originalTitle} (see ${id})`,
        source: 'survival-gate',
        trust: 'high',
        projectRoot,
        userDir,
        now: ts,
      });
      if (r.action === 'appended') bullet = r.id;
    }
  } catch {
    // best-effort injection bullet
  }

  return { action: 'converted', id, kind: 'fact-file', path: absPath, warningBullet: bullet };
}

// --- the bullet shape ----------------------------------------------------

function convertBullet({ projectRoot, userDir, id, row, ts }) {
  if (String(row.body).startsWith(BULLET_WARNING_PREFIX)) {
    return { action: 'converted', id, kind: 'bullet', alreadyConverted: true };
  }
  const { scratchpad, section } = bulletLocation(row);

  const r = memoryWrite({
    action: 'replace',
    tier: row.tier,
    scratchpad,
    section,
    oldText: row.body,
    text: `${BULLET_WARNING_PREFIX}${row.body}`,
    source: 'survival-gate',
    trust: 'high',
    projectRoot,
    userDir,
    now: ts,
  });
  if (r.action === 'error') return r;

  const tierRoot = resolveTierRoot({ tier: row.tier, projectRoot, userDir });
  appendAuditEntry(tierRoot ?? join(projectRoot, 'context'), {
    ts,
    action: 'anti-pattern-converted',
    tier: row.tier,
    id,
    reasonCode: 'survival-gate',
    reasonText: `anti-pattern conversion: bullet ${id} reframed in place as an AVOID warning (retained + injected, not erased)`,
    extra: { kind: 'bullet', newId: r.newId, scratchpad, section },
  });

  // Refresh the index row (the replace rewrote the bullet text).
  try {
    reindex({ tier: row.tier, projectRoot, userDir, warn: () => {} });
  } catch {
    // best-effort
  }

  return { action: 'converted', id, kind: 'bullet', newId: r.newId };
}
