// Memory-health analysis — content quality, not plumbing (Task 144, D-130).
//
// Public boundary:
//   analyzeMemoryHealth({projectRoot, now?, staleDays?, ...seams}) → report
//   formatMemoryHealth(report) → string (the doctor's informational section)
//
// Read-only by contract: pure reads over the fact archive, the audit log,
// and the queue files. Never mutates, never logs, never affects the doctor
// exit code — the section is INFORMATIONAL ("42 facts: 3 old-and-untouched,
// 2 possible duplicates, 1 conflict pending"), making curation visible
// before Task 95 automates it. Candidates are SURFACED, never auto-acted
// (the reviewable-not-silent rule).
//
// SPEC DEVIATION (recorded in tasks.md 144): the task entry assumed "the
// audit log has every recall" — it does not. The audit log is
// MUTATIONS-only by design (glossary: "any mutating operation"); search /
// get / cite write nothing. "Stale" is therefore defined honestly as
// OLD-AND-UNTOUCHED — created > staleDays ago with no audit-trail mutation
// mentioning the fact's id since creation. True recall-tracking is parked
// for Task 95 (trigger: when curation automation needs recall frequency).
//
// Near-dup detection here is the LITERAL tier: normalized-token Jaccard
// over fact bodies (cheap, embedder-free). Task 143 adds the semantic
// tier at write time; this section is the batch view over what already
// landed.

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseFrontmatter } from './frontmatter.mjs';
import { listConflictQueue } from './conflict-queue.mjs';
import { listReviewQueue } from './review-queue.mjs';
import { nowIso } from './audit-log.mjs';

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_STALE_DAYS = 60;
// Jaccard threshold for "possible duplicate" — tuned to catch paraphrase
// pairs sharing most content words while leaving topically-adjacent facts
// alone. A candidate list errs slightly eager (a human reviews it).
const NEAR_DUP_JACCARD = 0.6;
// Short bodies make Jaccard noisy; require a minimal token set.
const MIN_TOKENS_FOR_DUP = 4;

const STOPWORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'to', 'of', 'in',
  'on', 'for', 'and', 'or', 'not', 'with', 'at', 'by', 'it', 'this',
  'that', 'we', 'you', 'always', 'never', 'use', 'from',
]);

function tokenize(text) {
  return new Set(
    String(text)
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 1 && !STOPWORDS.has(t)),
  );
}

function jaccard(aSet, bSet) {
  let inter = 0;
  for (const t of aSet) if (bSet.has(t)) inter += 1;
  const union = aSet.size + bSet.size - inter;
  return union === 0 ? 0 : inter / union;
}

function readFacts(projectRoot) {
  const dir = join(projectRoot, 'context', 'memory');
  const facts = [];
  if (!existsSync(dir)) return facts;
  for (const name of readdirSync(dir)) {
    if (!name.endsWith('.md') || name === 'INDEX.md') continue;
    try {
      const { frontmatter, body } = parseFrontmatter(readFileSync(join(dir, name), 'utf8'));
      if (!frontmatter?.id) continue;
      facts.push({
        slug: name.replace(/\.md$/, ''),
        id: frontmatter.id,
        type: frontmatter.type ?? 'unknown',
        trust: frontmatter.trust ?? 'unknown',
        createdAt: frontmatter.created_at ?? null,
        body: String(body ?? ''),
      });
    } catch {
      // unparseable file — content health can't read it; HC-4/reindex own that class
    }
  }
  return facts;
}

// Every audit ts per fact id AFTER its creation entry — any mutation counts
// as "touched" (trust override, merge, graduation, tombstone...).
function readTouchedIds(projectRoot) {
  const touched = new Map(); // id → latest mutation ts
  try {
    const auditPath = join(projectRoot, 'context', '.locks', 'audit.log');
    if (!existsSync(auditPath)) return touched;
    for (const line of readFileSync(auditPath, 'utf8').split(/\r?\n/)) {
      if (!line.trim()) continue;
      try {
        const e = JSON.parse(line);
        if (!e.id || !e.ts) continue;
        if (e.action === 'created') continue; // creation isn't a touch
        const prev = touched.get(e.id);
        if (!prev || e.ts > prev) touched.set(e.id, e.ts);
      } catch {
        // torn line
      }
    }
  } catch {
    // unreadable log — degrade to "nothing touched"
  }
  return touched;
}

/**
 * Read-only content-health analysis of the project tier.
 *
 * @param {object} opts
 * @param {string} opts.projectRoot
 * @param {string} [opts.now]
 * @param {number} [opts.staleDays]
 * @param {Function} [opts.listConflictsImpl] - test seam.
 * @param {Function} [opts.listReviewImpl] - test seam.
 */
export function analyzeMemoryHealth({
  projectRoot,
  now,
  staleDays = DEFAULT_STALE_DAYS,
  listConflictsImpl,
  listReviewImpl,
} = {}) {
  const nowMs = Date.parse(now ?? nowIso());
  const facts = readFacts(projectRoot);

  const byType = {};
  const byTrust = {};
  for (const f of facts) {
    byType[f.type] = (byType[f.type] ?? 0) + 1;
    byTrust[f.trust] = (byTrust[f.trust] ?? 0) + 1;
  }

  // Old-and-untouched: created > staleDays ago, no post-creation mutation.
  const touched = readTouchedIds(projectRoot);
  const oldUntouched = facts.filter((f) => {
    if (!f.createdAt) return false;
    const ageMs = nowMs - Date.parse(f.createdAt);
    if (!(ageMs > staleDays * DAY_MS)) return false;
    return !touched.has(f.id);
  });

  // Near-dup candidate pairs (literal tier).
  const tokenized = facts.map((f) => ({ f, tokens: tokenize(f.body) }));
  const nearDupPairs = [];
  for (let i = 0; i < tokenized.length; i++) {
    for (let j = i + 1; j < tokenized.length; j++) {
      const { f: fa, tokens: ta } = tokenized[i];
      const { f: fb, tokens: tb } = tokenized[j];
      if (ta.size < MIN_TOKENS_FOR_DUP || tb.size < MIN_TOKENS_FOR_DUP) continue;
      const score = jaccard(ta, tb);
      if (score >= NEAR_DUP_JACCARD) {
        nearDupPairs.push({ a: fa.slug, b: fb.slug, idA: fa.id, idB: fb.id, score: Number(score.toFixed(2)) });
      }
    }
  }

  // The detected-contradiction surface = the pending queues.
  let conflicts = 0;
  let review = 0;
  try {
    conflicts = (listConflictsImpl ?? listConflictQueue)({ tier: 'P', projectRoot }).length;
  } catch {
    // queue unreadable — degrade to zero
  }
  try {
    review = (listReviewImpl ?? listReviewQueue)({ tier: 'P', projectRoot }).length;
  } catch {
    // queue unreadable — degrade to zero
  }

  return {
    facts: { total: facts.length, byType, byTrust },
    oldUntouched: oldUntouched.map((f) => ({ slug: f.slug, id: f.id, createdAt: f.createdAt })),
    nearDupPairs,
    queues: { conflicts, review },
    staleDays,
  };
}

/**
 * Render the doctor's informational section. Zero-concerns stay silent —
 * a healthy memory earns one quiet line, never noise.
 */
export function formatMemoryHealth(report) {
  const lines = [];
  const t = report.facts;
  const trustBits = Object.entries(t.byTrust)
    .map(([k, v]) => `${v} ${k}`)
    .join(' · ');
  lines.push(
    `Memory health (informational): ${t.total} fact(s)` + (trustBits ? ` — trust: ${trustBits}` : ''),
  );
  if (report.oldUntouched.length > 0) {
    lines.push(
      `  ${report.oldUntouched.length} old-and-untouched (> ${report.staleDays}d, no mutation since creation) — worth a skim: ` +
        report.oldUntouched.slice(0, 3).map((f) => f.slug).join(', ') +
        (report.oldUntouched.length > 3 ? ', …' : ''),
    );
  }
  if (report.nearDupPairs.length > 0) {
    lines.push(
      `  ${report.nearDupPairs.length} possible duplicate pair(s): ` +
        report.nearDupPairs.slice(0, 3).map((p) => `${p.a} ↔ ${p.b}`).join('; ') +
        (report.nearDupPairs.length > 3 ? '; …' : ''),
    );
  }
  const q = [];
  if (report.queues.conflicts > 0) q.push(`${report.queues.conflicts} conflict(s)`);
  if (report.queues.review > 0) q.push(`${report.queues.review} review item(s)`);
  if (q.length > 0) lines.push(`  ${q.join(' + ')} pending — cmk queue`);
  return lines.join('\n');
}
