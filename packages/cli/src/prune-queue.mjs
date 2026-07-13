// prune-queue.mjs — the SURVIVAL GATE's landing surface (Task 194, ADR-0017
// Phase 2 / SYSTEM-MAP §6 CURATE panel; D-252).
//
// ExpeL's prune-at-zero, adapted to the kit's demote-not-evict posture: a fact
// whose trust_score sits at TRUST_SCORE_FLOOR and STILL takes an applied
// dampen ("floored + still failing") becomes a prune-CANDIDATE — routed here,
// NEVER silently deleted. The queue is the human/agent decision point; the
// resolution options extend demote-not-evict to the loop:
//
//   convert → the Memento/REMEMBERER/Negative-Knowledge move: the fact is
//             RETAINED as a typed "avoid this" anti-pattern (a warning that
//             keeps injecting/surfacing), not erased. See convertToAntiPattern.
//   forget  → tombstone through the safe forget() path (archived, audited).
//   keep    → the user vouches for it; dismissed, never re-queued.
//   skip    → decide later (stays pending).
//
// The queue file is PRESERVATIONAL (the conflict-queue convention, not the
// review-queue's remove-on-resolve): resolved entries stay with their
// `resolution:` marker. That choice is load-bearing — the survival gate fires
// on EVERY floored dampen, and "id already anywhere in the file" is the
// idempotency check, so a resolved candidate (converted OR kept) is never
// re-nagged by the next failure signal.
//
// Location: ALWAYS the project tier (context/queues/prune-review.md), even
// for U-/L- ids — the trust_score overlay whose floor fires the gate lives in
// the PROJECT-LOCAL index (the trust-signal.mjs M6 posture), so the project
// queue is where the candidacy actually arose.
//
// Uses shared modules per CLAUDE.md: audit-log, result-shapes, frontmatter
// (via anti-pattern.mjs), forget.

import {
  existsSync,
  readFileSync,
  writeFileSync,
  appendFileSync,
  mkdirSync,
} from 'node:fs';
import { join } from 'node:path';
import { appendAuditEntry, nowIso } from './audit-log.mjs';
import { ERROR_CATEGORIES, errorResult } from './result-shapes.mjs';
// NOTE: forget + convertToAntiPattern are imported LAZILY inside
// resolvePruneQueue (it's already async) — a static import here would close
// the cycle trust-signal → prune-queue → anti-pattern → memory-write →
// trust-signal (applyTrustSignal routes candidates here; the resolver's
// conversion path routes back through memoryWrite). The write half
// (routePruneCandidate) stays dependency-light for the hot signal path.

const QUEUE_RELATIVE = ['queues', 'prune-review.md'];

const QUEUE_HEADER = `# Prune-review queue — survival-gate candidates (Task 194)

Facts whose trust_score sat at the floor and STILL took a failing signal.
Resolve with \`cmk queue prune\`: convert (→ anti-pattern warning, retained) /
forget (tombstone) / keep (dismiss). Resolved entries are preserved below with
their resolution — that history is the never-re-nag memory.

`;

function queuePathOf(projectRoot) {
  return join(projectRoot, 'context', ...QUEUE_RELATIVE);
}

// --- Parsing ---------------------------------------------------------

const ENTRY_HEADER_RE = /^- \(candidate:\s*([PUL]-[A-Za-z0-9]{8})\)\s+(.+)$/;
const FIELD_LINE_RE = /^\s+(\w+):\s*(.+)$/;

/**
 * Parse the prune-review.md format. Returns { entries } where each entry is
 * { id, text, trustScore, signalCount, detectedAt, resolution,
 *   startLineIdx, resolutionLineIdx }.
 * Tolerant parser (kit posture): malformed blocks are skipped, never thrown on.
 */
export function parsePruneQueue(text) {
  const lines = String(text ?? '').split(/\r?\n/);
  const entries = [];
  let current = null;
  for (let i = 0; i < lines.length; i++) {
    const header = lines[i].match(ENTRY_HEADER_RE);
    if (header) {
      if (current) entries.push(current);
      let entryText = header[2];
      try {
        entryText = JSON.parse(entryText); // strip the JSON.stringify quoting
      } catch {
        /* tolerate a hand-edited unquoted text */
      }
      current = {
        id: header[1],
        text: entryText,
        trustScore: null,
        signalCount: null,
        detectedAt: null,
        resolution: 'pending',
        startLineIdx: i,
        resolutionLineIdx: -1,
      };
      continue;
    }
    if (!current) continue;
    const field = lines[i].match(FIELD_LINE_RE);
    if (!field) {
      // a blank / non-field line ends the entry block
      if (lines[i].trim() === '') {
        entries.push(current);
        current = null;
      }
      continue;
    }
    const [, key, value] = field;
    if (key === 'trust_score') current.trustScore = Number(value);
    else if (key === 'signal_count') current.signalCount = Number(value);
    else if (key === 'detected_at') current.detectedAt = value;
    else if (key === 'resolution') {
      current.resolution = value;
      current.resolutionLineIdx = i;
    }
  }
  if (current) entries.push(current);
  return { entries };
}

// --- Public: routePruneCandidate --------------------------------------

/**
 * Append a pending prune candidate (the survival gate's write half).
 * Idempotent: an id already present in the queue — pending OR resolved —
 * returns { action: 'already-queued' } and leaves the file byte-identical.
 *
 * BEST-EFFORT SHAPE for the applyTrustSignal call site: validation failures
 * return errorResult (never throw).
 *
 * @param {object} o
 * @param {string} o.projectRoot
 * @param {string} o.id           the floored fact's canonical id
 * @param {string} [o.text]       the fact body (snippet for the reviewer)
 * @param {number} [o.trustScore]  the score at detection (≈ the floor)
 * @param {number} [o.signalCount] the evidence count at detection
 * @param {string} [o.at]          ISO detection time (injectable for tests)
 */
export function routePruneCandidate({ projectRoot, id, text, trustScore, signalCount, at } = {}) {
  if (!projectRoot || !id) {
    return errorResult({
      category: ERROR_CATEGORIES.SCHEMA,
      errors: ['routePruneCandidate: projectRoot and id are required'],
    });
  }
  const queuePath = queuePathOf(projectRoot);
  if (existsSync(queuePath)) {
    const { entries } = parsePruneQueue(readFileSync(queuePath, 'utf8'));
    if (entries.some((e) => e.id === id)) {
      return { action: 'already-queued', id, path: queuePath };
    }
  }
  const ts = at ?? nowIso();
  // TIER BOUNDARY (self-review finding, 2026-07-13): the queue lives in the
  // COMMITTED project tier, but a U-/L- fact's content is deliberately
  // machine-local (the persona never ships inside a project; L is gitignored).
  // So only P- ids persist their body text here — U/L candidates queue by id
  // with a placeholder, and the resolver looks the body up LIVE (display-only,
  // never persisted) from the local index.
  const persistedText = id.startsWith('P-') ? (text ?? '') : `[${id[0]}-tier content — kept out of the committed queue; shown live at resolve time]`;
  const entry = [
    `- (candidate: ${id}) ${JSON.stringify(persistedText)}`,
    `  trust_score: ${Number.isFinite(trustScore) ? trustScore : 0}`,
    `  signal_count: ${Number.isFinite(signalCount) ? signalCount : 0}`,
    `  detected_at: ${ts}`,
    `  resolution: pending`,
    '',
  ].join('\n');

  mkdirSync(join(projectRoot, 'context', QUEUE_RELATIVE[0]), { recursive: true });
  if (!existsSync(queuePath)) {
    writeFileSync(queuePath, QUEUE_HEADER + entry, 'utf8');
  } else {
    appendFileSync(queuePath, entry, 'utf8');
  }

  appendAuditEntry(join(projectRoot, 'context'), {
    ts,
    action: 'prune-candidate',
    tier: id[0],
    id,
    reasonCode: 'survival-gate',
    reasonText: `survival gate: trust_score floored and still receiving dampens — queued for prune review (never auto-deleted)`,
    extra: { trust_score: trustScore, signal_count: signalCount },
  });

  return { action: 'queued', id, path: queuePath };
}

// --- Public: listPruneQueue --------------------------------------------

/** Pure read of PENDING candidates (the mk_queue_list contract: a list never
 * rewrites the queue file). `[]` when no queue exists yet. */
export function listPruneQueue({ projectRoot } = {}) {
  if (!projectRoot) return [];
  const queuePath = queuePathOf(projectRoot);
  if (!existsSync(queuePath)) return [];
  return parsePruneQueue(readFileSync(queuePath, 'utf8')).entries.filter(
    (e) => e.resolution === 'pending',
  );
}

// --- Public: resolvePruneQueue ------------------------------------------

/**
 * Walk PENDING candidates one at a time. `prompter({id, text, trustScore,
 * signalCount, detectedAt}) → 'convert' | 'forget' | 'keep' | 'skip'`.
 * Resolved entries are PRESERVED with their resolution marker (updated in
 * place); skipped/unknown stay pending. Returns
 * { converted, forgotten, kept, skipped, errors }.
 */
export async function resolvePruneQueue({ projectRoot, userDir, prompter, now } = {}) {
  if (!projectRoot) {
    return errorResult({
      category: ERROR_CATEGORIES.SCHEMA,
      errors: ['resolvePruneQueue: projectRoot required'],
    });
  }
  if (typeof prompter !== 'function') {
    return errorResult({
      category: ERROR_CATEGORIES.SCHEMA,
      errors: ['resolvePruneQueue: prompter required (function)'],
    });
  }
  const queuePath = queuePathOf(projectRoot);
  const empty = { converted: 0, forgotten: 0, kept: 0, skipped: 0, errors: [] };
  if (!existsSync(queuePath)) return empty;

  const lines = readFileSync(queuePath, 'utf8').split(/\r?\n/);
  const { entries } = parsePruneQueue(lines.join('\n'));
  const pending = entries.filter((e) => e.resolution === 'pending');
  if (pending.length === 0) return empty;

  const result = { ...empty, errors: [] };
  const ts = now ?? nowIso();
  // Lazy imports — see the module-header note on the import cycle.
  const { convertToAntiPattern, forgetCandidate, lookupObservation } = await import('./anti-pattern.mjs');

  for (const entry of pending) {
    // U-/L- entries carry a placeholder in the committed queue (tier
    // boundary — see routePruneCandidate); resolve the live body from the
    // local index for DISPLAY only.
    let displayText = entry.text;
    if (!entry.id.startsWith('P-')) {
      const row = lookupObservation({ projectRoot, id: entry.id });
      if (row?.body) displayText = row.body;
    }
    const decision = await prompter({
      id: entry.id,
      text: displayText,
      trustScore: entry.trustScore,
      signalCount: entry.signalCount,
      detectedAt: entry.detectedAt,
    });

    if (decision === 'convert') {
      const r = convertToAntiPattern({ projectRoot, userDir, id: entry.id, now: ts });
      if (r.action === 'error') {
        result.errors.push({ id: entry.id, decision, errors: r.errors });
        continue; // stays pending — a failed convert must not mark resolved
      }
      markResolution(lines, entry, 'convert');
      result.converted++;
    } else if (decision === 'forget') {
      const r = await forgetCandidate({
        projectRoot,
        userDir,
        id: entry.id,
        reason: 'survival-gate prune: trust floored by repeated outcome failures',
        now: ts,
      });
      // A forget that didn't actually remove anything (error OR not-found)
      // must NOT mark the entry resolved — it stays pending, honestly.
      if (r.action === 'error' || r.action === 'not-found') {
        result.errors.push({ id: entry.id, decision, errors: r.errors ?? ['not found'] });
        continue;
      }
      markResolution(lines, entry, 'forget');
      result.forgotten++;
    } else if (decision === 'keep') {
      markResolution(lines, entry, 'keep');
      appendAuditEntry(join(projectRoot, 'context'), {
        ts,
        action: 'prune-kept',
        tier: entry.id[0],
        id: entry.id,
        reasonCode: 'user-vouched',
        reasonText: 'prune-review: user kept the floored fact (dismissed — never re-queued)',
        extra: { from_queue: 'prune-review' },
      });
      result.kept++;
    } else {
      result.skipped++;
    }
  }

  writeFileSync(queuePath, lines.join('\n'), 'utf8');
  return result;
}

// Update the entry's `resolution:` line in place (preservational — the entry
// text/provenance lines are untouched; over-mutation-safe by construction).
function markResolution(lines, entry, resolution) {
  if (entry.resolutionLineIdx >= 0) {
    lines[entry.resolutionLineIdx] = `  resolution: ${resolution}`;
  }
}
