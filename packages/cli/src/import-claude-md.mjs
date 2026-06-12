// `cmk import-claude-md` (Task 142, D-130).
//
// Public boundary:
//   async importClaudeMd({projectRoot, file?, now?, dryRun?, acceptAll?, writeFactImpl?})
//     → {action, mode?, reason?, proposals, accepted, skipped, rejected, errors, sourcePath, duration_ms}
//
// Onboards a project from the rules file the user already owns (CLAUDE.md,
// .cursorrules, AGENTS.md, any markdown/plain rules file): parses it into
// TYPED fact candidates and writes each through writeFact() — the kit's one
// safe write path. That composition (not re-implementation) is the point:
// writeFact already gives Poison_Guard screening, home-path sanitization,
// content-addressed dedup, INDEX reindex, and create-audit. The D-125 bug
// (import-anthropic hand-rolling its provenance comment and breaking the next
// reindex) is the precedent this design avoids.
//
// Differences from `cmk import-anthropic-memory` (the structural template):
//   - target is the GRANULAR fact archive (context/memory/), not MEMORY.md
//     bullets — rules-file content is durable and typed, not scratchpad;
//   - fact `type` is inferred from the nearest markdown heading
//     (user / feedback / reference, default project);
//   - candidates inside the kit's own managed CLAUDE.md block and inside
//     code fences are never proposed (boilerplate / shell examples).
//
// Explicit user action only. Never automatic. `--dry-run` previews; apply
// requires explicit `--yes` (same confirmation contract as the precedent).

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { createHash } from 'node:crypto';
import { canonicalize, generateId } from '@lh8ppl/cmk-canonicalize';
import { appendAuditEntry, nowIso, REASON_CODES } from './audit-log.mjs';
import { ERROR_CATEGORIES, errorResult } from './result-shapes.mjs';
import { writeFact } from './write-fact.mjs';
import { slugifyFact } from './rich-fact.mjs';
import { sanitizeHomePaths } from './sanitize.mjs';
import { parse as parseFrontmatter } from './frontmatter.mjs';

const DEFAULT_FILE = 'CLAUDE.md';
const IMPORT_SOURCE = 'claude-md';
// Below this length a line is noise ("go", "etc."), not a rule.
const MIN_CANDIDATE_CHARS = 8;

const MANAGED_BLOCK_START = /<!--\s*claude-memory-kit:start\b/;
const MANAGED_BLOCK_END = /<!--\s*claude-memory-kit:end\s*-->/;
const HEADING = /^(#{1,6})\s+(.+?)\s*$/;
const LIST_ITEM = /^\s*(?:[-*+]|\d+[.)])\s+(.+?)\s*$/;
const CODE_FENCE = /^\s*(```|~~~)/;

/**
 * Infer the kit fact type from the heading a candidate sits under.
 * Heuristic by design — `--dry-run` shows the inferred type so the user can
 * inspect before applying. Order matters: user-profile phrasing wins over the
 * broad rule/style class, and \b on "reference" keeps "Preferences" from
 * matching it.
 *
 * @param {string|null} heading
 * @returns {'user'|'feedback'|'project'|'reference'}
 */
export function inferFactType(heading) {
  if (!heading) return 'project';
  const h = String(heading).toLowerCase();
  if (/prefer|about (me|the user)|profile|persona|communicat/.test(h)) return 'user';
  if (/\b(link|reference|resource|url|bookmark)/.test(h)) return 'reference';
  if (/rule|discipline|workflow|convention|anti-pattern|style|verification|review|testing|engineering|working/.test(h)) {
    return 'feedback';
  }
  return 'project';
}

/**
 * Parse a rules file into typed fact candidates.
 *
 * Primary shape: markdown list items (-, *, +, 1.) with the nearest heading
 * as type context. Fallback shape (.cursorrules and other plain-text rules
 * files): when the file has NO list items at all, every non-empty,
 * non-heading line outside code fences is a candidate.
 *
 * Skipped in both shapes: code-fence content (shell examples, not rules) and
 * the kit's own managed CLAUDE.md block (importing our boilerplate back into
 * memory would be noise for every kit user).
 *
 * @param {string} text - the rules-file content.
 * @returns {Array<{text: string, line: number, heading: string|null, type: string}>}
 */
export function parseRulesFile(text) {
  const lines = String(text).split(/\r?\n/);
  const bullets = [];
  const plain = [];
  let heading = null;
  let inFence = false;
  let inManagedBlock = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (MANAGED_BLOCK_START.test(line)) {
      inManagedBlock = true;
      continue;
    }
    if (inManagedBlock) {
      if (MANAGED_BLOCK_END.test(line)) inManagedBlock = false;
      continue;
    }
    if (CODE_FENCE.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    const h = HEADING.exec(line);
    if (h) {
      heading = h[2];
      continue;
    }

    const item = { line: i + 1, heading, type: inferFactType(heading) };
    const m = LIST_ITEM.exec(line);
    if (m && m[1].trim().length >= MIN_CANDIDATE_CHARS) {
      bullets.push({ ...item, text: m[1].trim() });
      continue;
    }
    const t = line.trim();
    if (!m && t.length >= MIN_CANDIDATE_CHARS && !t.startsWith('<!--')) {
      plain.push({ ...item, text: t });
    }
  }

  return bullets.length > 0 ? bullets : plain;
}

// Canonical forms already present in memory: every MEMORY.md scratchpad
// bullet + every granular fact body. Imported fact bodies are the bare rule
// text, so a re-run canonicalize-matches its own first run here.
function collectExistingCanonical(projectRoot) {
  const existing = new Set();
  const memPath = join(projectRoot, 'context', 'MEMORY.md');
  if (existsSync(memPath)) {
    try {
      for (const line of readFileSync(memPath, 'utf8').split(/\r?\n/)) {
        const m = LIST_ITEM.exec(line);
        if (m) {
          const c = canonicalize(m[1].trim());
          if (c) existing.add(c);
        }
      }
    } catch {
      // best-effort: unreadable scratchpad means no dedup hits from it
    }
  }
  const factDir = join(projectRoot, 'context', 'memory');
  if (existsSync(factDir)) {
    for (const name of readdirSync(factDir)) {
      if (!name.endsWith('.md') || name === 'INDEX.md') continue;
      try {
        const { body } = parseFrontmatter(readFileSync(join(factDir, name), 'utf8'));
        const c = canonicalize(String(body ?? '').trim());
        if (c) existing.add(c);
      } catch {
        // skip unparseable files; writeFact's own id dedup still backstops
      }
    }
  }
  return existing;
}

/**
 * Run the import pipeline.
 *
 * @param {object} opts
 * @param {string} opts.projectRoot
 * @param {string} [opts.file] - rules file, relative to projectRoot or absolute (default CLAUDE.md)
 * @param {string} [opts.now]
 * @param {boolean} [opts.dryRun] - preview proposals; no file modified
 * @param {boolean} [opts.acceptAll] - apply every proposal (the CLI's --yes)
 * @param {Function} [opts.writeFactImpl] - test seam (default: the real writeFact)
 * @returns {Promise<object>}
 */
export async function importClaudeMd({
  projectRoot,
  file,
  now,
  dryRun = false,
  acceptAll = false,
  writeFactImpl = writeFact,
} = {}) {
  const ts = now ?? nowIso();
  const t0 = Date.now();

  if (!projectRoot) {
    return errorResult({
      category: ERROR_CATEGORIES.MISSING_PROJECT_ROOT,
      errors: ['projectRoot is required'],
      duration_ms: Date.now() - t0,
    });
  }

  const fileRel = file && String(file).trim() ? String(file).trim() : DEFAULT_FILE;
  const sourcePath = isAbsolute(fileRel) ? fileRel : join(projectRoot, fileRel);
  const done = (extra) => ({
    action: 'completed',
    proposals: [],
    accepted: 0,
    skipped: 0,
    rejected: 0,
    errors: 0,
    sourcePath,
    duration_ms: Date.now() - t0,
    ...extra,
  });

  if (!existsSync(sourcePath)) return done({ reason: 'no-source' });

  let sourceText;
  try {
    sourceText = readFileSync(sourcePath, 'utf8');
  } catch (err) {
    return done({ errors: 1, reason: `read-source-failed: ${err?.message ?? err}` });
  }

  const existingCanonical = collectExistingCanonical(projectRoot);
  const tierRoot = join(projectRoot, 'context');
  const proposals = [];
  let skipped = 0;
  // Dry-run / requires-confirmation must not touch ANY file — including the
  // audit log. Skip entries are only audited when the user actually applied.
  const auditSkips = acceptAll && !dryRun;

  for (const candidate of parseRulesFile(sourceText)) {
    // Sanitize BEFORE canonicalizing so the dedup key matches what writeFact
    // actually lands on disk (it ids the sanitized body).
    const sanitized = sanitizeHomePaths(candidate.text);
    const canonical = canonicalize(sanitized);
    if (!canonical) continue;
    const id = generateId('P', sanitized);
    if (existingCanonical.has(canonical)) {
      skipped += 1;
      if (auditSkips) {
        try {
          appendAuditEntry(tierRoot, {
            ts,
            action: 'import',
            tier: 'P',
            id,
            reasonCode: REASON_CODES.IMPORT_SKIPPED_DUPLICATE,
            extra: { source: IMPORT_SOURCE },
          });
        } catch {
          // best-effort — never block the import flow on audit-log failure
        }
      }
      continue;
    }
    existingCanonical.add(canonical); // same-file duplicates collapse to one proposal
    proposals.push({
      text: candidate.text,
      line: candidate.line,
      heading: candidate.heading,
      type: candidate.type,
      id,
    });
  }

  if (dryRun) return done({ mode: 'dry-run', proposals, skipped });
  if (!acceptAll && proposals.length > 0) {
    return done({ mode: 'requires-confirmation', proposals, skipped });
  }
  if (proposals.length === 0) return done({ mode: 'apply', skipped });

  let accepted = 0;
  let rejected = 0;
  let errors = 0;
  // Two distinct rules can share a 60-char slug prefix (slugifyFact caps);
  // the second would hit writeFact's filename-collision error and be lost.
  // De-collide within the run by suffixing the (unique) source line.
  const usedSlugs = new Set();
  // The committed source_file field must never carry a username from an
  // absolute --file argument (the D-51 name-privacy class).
  const sourceFileField = sanitizeHomePaths(fileRel);
  for (const p of proposals) {
    const title = p.text.split('\n')[0].slice(0, 80);
    let slug = slugifyFact(title);
    if (usedSlugs.has(`${p.type}/${slug}`)) slug = `${slug}-l${p.line}`;
    usedSlugs.add(`${p.type}/${slug}`);
    const r = writeFactImpl({
      tier: 'P',
      type: p.type,
      slug,
      title,
      body: p.text,
      writeSource: 'imported',
      trust: 'medium',
      sourceFile: sourceFileField,
      sourceLine: p.line,
      // Content fingerprint for provenance — NOT a security context (the kit's
      // sha1-of-content convention; see remember-core.mjs). // NOSONAR
      sourceSha1: createHash('sha1').update(p.text, 'utf8').digest('hex'), // NOSONAR
      projectRoot,
      // writeFact's default create-audit is replaced by the richer-semantic
      // IMPORT_APPLIED entry below (the merge-facts precedent).
      audit: false,
    });
    if (r.action === 'created') {
      accepted += 1;
      try {
        appendAuditEntry(tierRoot, {
          ts,
          action: 'import',
          tier: 'P',
          id: r.id,
          reasonCode: REASON_CODES.IMPORT_APPLIED,
          paths: { after: r.path },
          extra: { source: IMPORT_SOURCE, trust: 'medium', write_source: 'imported' },
        });
      } catch {
        // best-effort
      }
    } else if (r.action === 'skipped') {
      skipped += 1;
    } else if (r.errorCategory === ERROR_CATEGORIES.POISON_GUARD) {
      // writeFact already logged the rejection to poison-guard.log (Door 4);
      // count it honestly — a rejected secret is not an "error", it's the
      // guard doing its job.
      rejected += 1;
    } else {
      errors += 1;
    }
  }

  return done({ mode: 'apply', proposals, accepted, skipped, rejected, errors });
}
