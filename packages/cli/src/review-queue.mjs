// review-queue.mjs — Task 26 (T-023). Public boundary for the
// medium-trust review queue resolver.
//
// Per design §6.2:
//   - Auto-extract routes high-trust → MEMORY.md (direct)
//   - Auto-extract routes medium-trust → queues/review.md (this module)
//   - Auto-extract routes low-trust → discarded (logged to extract.log)
//
// The medium-trust ROUTING is already done by `routeMedium` in
// `auto-extract.mjs` (Task 23). This module handles the RESOLVER side:
// the `cmk queue review` interactive walker that processes pending
// entries one-at-a-time and accepts `promote` / `discard` / `skip`.
//
// Companion to the conflict-queue (Task 25; design §6.8). Same shape
// (interactive walker + per-entry decisions) but different routing:
//   - Review queue: new medium-trust candidates awaiting blessing
//   - Conflict queue: new writes that contradict existing higher-
//     trust facts
//
// Idempotency-convention asymmetry (code-review note): review-queue
// REMOVES resolved entries from review.md; conflict-queue PRESERVES
// them with `resolution: <decision>` markers. The asymmetry is
// intentional — review is transient (once promoted, the candidate's
// outcome is in MEMORY.md; once discarded, in audit.log), so the
// queue file shouldn't grow unbounded with resolved entries.
// Conflict-queue is preservational (file-as-history serves audit).
//
// Parser tolerance (code-review note): parseReviewQueue silently
// skips malformed blocks. Matches kit pattern (lock-discipline,
// conflict-queue). User manually editing review.md with bad
// markdown loses the malformed block but doesn't crash the resolver.
// Trade-off: data-loss risk on bad edits vs. robustness against
// editor noise. The kit's overall posture is "be tolerant of file
// edits; never crash the kit on malformed memory state".
//
// Public surface:
//   - parseReviewQueue(text) — parses the review.md format into
//     entries (`## <ts> — auto-extract (medium-trust, pending review)`
//     heading + bullet + provenance + blank line)
//   - resolveReviewQueue({tier, projectRoot, userDir, prompter}) —
//     walks pending entries one-at-a-time; on each, the prompter
//     returns 'promote' / 'discard' / 'skip'. Resolved entries are
//     REMOVED from review.md (per task 26.3/26.4). Skipped entries
//     stay. Audit-log entries written for promote + discard.
//
// File format (matches routeMedium's output in auto-extract.mjs):
//
//   ## 2026-05-27T10:00:00Z — auto-extract (medium-trust, pending review)
//   - (P-AAAAAAAA) the candidate text
//     <!-- proposed_trust: medium, write: auto-extract, at: 2026-05-27T10:00:00Z -->
//
//   ## 2026-05-27T10:01:00Z — auto-extract (medium-trust, pending review)
//   - (P-BBBBBBBB) another candidate
//     <!-- proposed_trust: medium, write: auto-extract, at: 2026-05-27T10:01:00Z -->
//
// Uses shared modules per CLAUDE.md "Shared modules" rule.

import {
  existsSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { resolveTierRoot, VALID_TIERS } from './tier-paths.mjs';
import { nowIso, appendAuditEntry, REASON_CODES } from './audit-log.mjs';
import { ERROR_CATEGORIES, errorResult } from './result-shapes.mjs';
import { memoryWrite } from './memory-write.mjs';

const QUEUE_RELATIVE = ['queues', 'review.md'];

// --- Parsing -------------------------------------------------------

const HEADING_RE = /^##\s+(.+?)\s+—\s+auto-extract\s+\(medium-trust,\s+pending review\)\s*$/;
const BULLET_LINE_RE = /^- \(([PUL]-[A-Za-z0-9]{8})\)\s+(.+)$/;
const PROVENANCE_RE = /^\s+<!--\s*(.+?)\s*-->\s*$/;

/**
 * Parse the review.md file body into an entry array.
 *
 * Returns: { entries: [{ ts, id, text, provenance, startLine, endLine }],
 *            preamble: string[] }
 *
 * Entries are ORDERED — earliest at index 0. preamble holds any text
 * before the first heading (typically empty or comments). The parser
 * is tolerant: any block that doesn't match the heading+bullet+
 * provenance triple is skipped silently (the resolver doesn't lose
 * data — it just doesn't display malformed entries).
 */
export function parseReviewQueue(text) {
  const lines = String(text ?? '').split(/\r?\n/);
  const entries = [];
  let preambleEnd = 0;
  let i = 0;

  // Skip any preamble before the first heading.
  while (i < lines.length && !HEADING_RE.test(lines[i])) {
    i++;
  }
  preambleEnd = i;

  while (i < lines.length) {
    const headingMatch = lines[i].match(HEADING_RE);
    if (!headingMatch) {
      i++;
      continue;
    }
    const ts = headingMatch[1];
    const startLine = i;
    // Next non-blank line should be the bullet.
    let j = i + 1;
    let bulletLine = -1;
    let provenanceLine = -1;
    while (j < lines.length && j < i + 5) {
      if (BULLET_LINE_RE.test(lines[j])) {
        bulletLine = j;
        break;
      }
      j++;
    }
    if (bulletLine === -1) {
      i++;
      continue;
    }
    const bulletMatch = lines[bulletLine].match(BULLET_LINE_RE);
    const id = bulletMatch[1];
    const bulletText = bulletMatch[2];
    // Provenance comment is the next line.
    if (bulletLine + 1 < lines.length && PROVENANCE_RE.test(lines[bulletLine + 1])) {
      provenanceLine = bulletLine + 1;
    }
    // entry ends at the next heading or EOF.
    let endLine = (provenanceLine === -1 ? bulletLine : provenanceLine) + 1;
    while (endLine < lines.length && !HEADING_RE.test(lines[endLine])) {
      // Stop at blank-line boundary if the next non-blank starts a heading.
      if (lines[endLine].trim() === '') {
        endLine++;
        continue;
      }
      // Non-empty, non-heading line — could be a malformed entry.
      // Conservative: include it in this entry.
      endLine++;
    }
    entries.push({
      ts,
      id,
      text: bulletText,
      provenance: provenanceLine !== -1 ? lines[provenanceLine] : null,
      startLine,
      endLine, // exclusive
    });
    i = endLine;
  }

  return {
    entries,
    preamble: lines.slice(0, preambleEnd),
  };
}

/**
 * Re-serialize entries back to the review.md file format. Used by
 * the resolver after promote/discard removals to keep the file
 * coherent.
 */
function serializeReviewQueue({ preamble, entries }) {
  const lines = [...preamble];
  for (const e of entries) {
    lines.push(`## ${e.ts} — auto-extract (medium-trust, pending review)`);
    lines.push(`- (${e.id}) ${e.text}`);
    if (e.provenance) lines.push(e.provenance);
    lines.push('');
  }
  return lines.join('\n');
}

// --- Public: resolveReviewQueue ------------------------------------

/**
 * Walk pending review.md entries one-at-a-time. The `prompter` is a
 * caller-supplied function: `async ({id, text, ts, provenance}) →
 * 'promote' | 'discard' | 'skip'`. Lets the CLI / tests inject
 * behavior; production wires through the interactive `cmk queue
 * review` verb.
 *
 * Decisions:
 *   - 'promote' → invokes memoryWrite({action: 'add', trust: 'high',
 *     source: 'review-promote', text, tier, ...}). Removes entry
 *     from review.md. Audit-log entry written by memoryWrite (action:
 *     'promoted'/scratchpad-append) AND this module (action: 'promoted'
 *     for review-queue tracking).
 *   - 'discard' → removes entry from review.md. Audit-log entry:
 *     action: 'discarded', reasonCode: REVIEW_DISCARDED.
 *   - 'skip' → entry stays in review.md. No audit-log entry.
 *   - anything else → treated as 'skip' (defensive).
 *
 * Returns: { promoted: N, discarded: N, skipped: N, errors: [] } on
 * success, OR errorResult on schema failure.
 *
 * Note on the memoryWrite call: this passes `scratchpad: 'MEMORY.md'`
 * + `section: 'Active Threads'` as v0.1 defaults. The kit's
 * memory-write skill picks the section based on heuristics in v0.1.x.
 */
// Default `section` is 'Active Threads' — the catchall section in
// the kit's seed MEMORY.md scaffold (per design §2.1). v0.1.x
// candidate: per-candidate section routing via heuristics in the
// memory-write skill (requires `routeMedium` in auto-extract.mjs
// to capture the target section at write-time, currently it doesn't
// — review.md format has no section field). For v0.1.0 the catchall
// works because Active Threads is where transient observations
// belong by convention; the user can promote into a different
// section by editing MEMORY.md after promotion.
/**
 * Pure-read list of pending review-queue entries (no mutation). Used by the MCP
 * `mk_queue_list` tool so a "list" never rewrites the queue file — unlike
 * resolveReviewQueue, which reserializes on every call. Returns `[]` when the
 * queue file doesn't exist.
 */
export function listReviewQueue({ tier = 'P', projectRoot, userDir } = {}) {
  const tierRoot = resolveTierRoot({ tier, projectRoot, userDir });
  const queuePath = join(tierRoot, ...QUEUE_RELATIVE);
  if (!existsSync(queuePath)) return [];
  return parseReviewQueue(readFileSync(queuePath, 'utf8')).entries;
}

export async function resolveReviewQueue({
  tier,
  projectRoot,
  userDir,
  prompter,
  scratchpad = 'MEMORY.md',
  section = 'Active Threads',
} = {}) {
  if (!VALID_TIERS.has(tier)) {
    return errorResult({
      category: ERROR_CATEGORIES.SCHEMA,
      errors: [`resolveReviewQueue: tier must be one of P/U/L (got ${tier})`],
    });
  }
  if (typeof prompter !== 'function') {
    return errorResult({
      category: ERROR_CATEGORIES.SCHEMA,
      errors: ['resolveReviewQueue: prompter required (function)'],
    });
  }
  const tierRoot = resolveTierRoot({ tier, projectRoot, userDir });
  const queuePath = join(tierRoot, ...QUEUE_RELATIVE);
  if (!existsSync(queuePath)) {
    return { promoted: 0, discarded: 0, skipped: 0, errors: [] };
  }

  const text = readFileSync(queuePath, 'utf8');
  const { entries, preamble } = parseReviewQueue(text);
  if (entries.length === 0) {
    return { promoted: 0, discarded: 0, skipped: 0, errors: [] };
  }

  let promoted = 0;
  let discarded = 0;
  let skipped = 0;
  const errors = [];
  const keep = []; // entries that remain after this pass

  for (const entry of entries) {
    const decision = await prompter({
      id: entry.id,
      text: entry.text,
      ts: entry.ts,
      provenance: entry.provenance,
    });

    if (decision === 'promote') {
      // Promote via memoryWrite — adds at trust: high. The proposed id
      // from review.md is recomputed by memoryWrite from the canonical
      // text, so it'll match if the text hasn't been edited.
      //
      // Composition note (code-review IMP-1): memoryWrite runs
      // detectConflicts on every add (Task 25 integration). If the
      // promoted text conflicts with an existing high-trust bullet,
      // the result will be `{action: 'queued', ...}` — re-routed to
      // queues/conflicts.md. This is by design (high-trust + similar-
      // to-existing IS a conflict that needs surfacing), not a bug.
      // The resolver reports this explicitly so the user understands
      // where the promoted entry ended up.
      const result = memoryWrite({
        action: 'add',
        tier,
        scratchpad,
        section,
        text: entry.text,
        source: 'review-promote',
        trust: 'high',
        projectRoot,
        userDir,
        now: nowIso(),
      });
      if (result.action === 'error') {
        errors.push({
          id: entry.id,
          decision,
          errors: result.errors,
        });
        keep.push(entry);
        continue;
      }
      // Detect the re-route case: memoryWrite returned `action: 'queued'`
      // (conflict-queue route), not `action: 'created'` / 'appended'.
      const rerouted = result.action === 'queued';
      appendAuditEntry(tierRoot, {
        ts: nowIso(),
        action: 'promoted',
        tier,
        id: entry.id,
        reasonCode: REASON_CODES.REVIEW_PROMOTED,
        reasonText: rerouted
          ? `review-queue: promoted ${entry.id} but re-routed to conflict-queue (collision with ${result.conflictsWith}; resolve via cmk queue conflicts)`
          : `review-queue: promoted ${entry.id} to ${scratchpad} (trust: high)`,
        extra: {
          decision,
          from_queue: 'review',
          original_ts: entry.ts,
          ...(rerouted
            ? {
                rerouted_to: 'conflicts',
                rerouted_as: result.id,
                conflicts_with: result.conflictsWith,
              }
            : {}),
        },
      });
      promoted++;
    } else if (decision === 'discard') {
      appendAuditEntry(tierRoot, {
        ts: nowIso(),
        action: 'discarded',
        tier,
        id: entry.id,
        reasonCode: REASON_CODES.REVIEW_DISCARDED,
        reasonText: `review-queue: discarded ${entry.id} (medium-trust auto-extract candidate)`,
        extra: {
          decision,
          from_queue: 'review',
          original_ts: entry.ts,
        },
      });
      discarded++;
    } else {
      // skip OR unknown → preserve entry as-is, no audit.
      skipped++;
      keep.push(entry);
    }
  }

  // Rewrite the queue with only the kept (skipped + errored) entries.
  const newBody = serializeReviewQueue({ preamble, entries: keep });
  writeFileSync(queuePath, newBody, 'utf8');

  return { promoted, discarded, skipped, errors };
}
