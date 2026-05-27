// conflict-queue.mjs — Task 25 (T-022). Public boundary for the
// conflict-detection + queue-write + interactive-resolve flow.
//
// Per design §6.8:
//   - The review queue (§6.2) handles medium-trust *new* writes
//     awaiting blessing.
//   - The conflict queue (this module) handles writes that
//     CONTRADICT an existing high-trust fact on the same
//     heading_path. Different concern, different queue, different UX.
//
// Public surface:
//   - detectConflicts({...}) — pre-write check: does the new bullet
//     conflict with an existing one on the same heading_path?
//   - writeConflictEntry({...}) — appends a pending entry to
//     <tierRoot>/queues/conflicts.md when the new write has LOWER
//     trust than the existing fact (the user must resolve manually).
//   - resolveConflictQueue({...}) — interactive walker that processes
//     pending entries one-at-a-time (keep-old / keep-new / merge-both /
//     skip).
//
// Trust ordering: high (3) > medium (2) > low (1). Higher wins.
//   - new.trust >= existing.trust → supersede silently (the new
//     write becomes canonical; old marked superseded — handled by
//     memory-write's existing replace flow, NOT this module)
//   - new.trust < existing.trust → queue (write to conflicts.md;
//     surfaces in `cmk queue conflicts`)
//
// Similarity backends (per design §6.8):
//   - Layer 5 FTS5 + optional vector: not in v0.1 scope. Injectable
//     similarityFn hook for v0.1.x.
//   - Substring-match fallback (the v0.1 default): token-Jaccard
//     similarity on lowercased word tokens. Conservative,
//     deterministic, no external deps. The audit-log entry records
//     `similarity_backend: 'substring'` so v0.1.x can swap in FTS5
//     and analytics can compare backends.
//
// Uses shared modules per CLAUDE.md "Shared modules" rule:
//   tier-paths.mjs    — resolveTierRoot
//   audit-log.mjs     — nowIso, appendAuditEntry
//   result-shapes.mjs — ERROR_CATEGORIES, errorResult
//   frontmatter.mjs   — parse (for bullet provenance comment)

import {
  existsSync,
  mkdirSync,
  readFileSync,
  appendFileSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { resolveTierRoot, VALID_TIERS } from './tier-paths.mjs';
import { nowIso, appendAuditEntry, REASON_CODES } from './audit-log.mjs';
import { ERROR_CATEGORIES, errorResult } from './result-shapes.mjs';

// Trust ordering. Higher number = higher trust.
const TRUST_LEVELS = Object.freeze({
  high: 3,
  medium: 2,
  low: 1,
});

// Similarity thresholds vary by backend:
//   - 'substring' (token-Jaccard fallback): 0.5 — lexical similarity
//     under-reports semantic similarity ("Python 3.13" vs "Python 3.14"
//     scores ~0.71 by Jaccard despite being a clear conflict).
//     Calibrated empirically against real conflict cases.
//   - 'custom' (FTS5 + vector, v0.1.x): 0.85 per design §6.8 — semantic
//     similarity is more reliable. The caller passes
//     `similarityThreshold: 0.85` when wiring in the FTS5 backend.
//
// Callers can always override via the `similarityThreshold` option.
const DEFAULT_SUBSTRING_THRESHOLD = 0.5;
const DEFAULT_SEMANTIC_THRESHOLD = 0.85;
const QUEUE_RELATIVE = ['queues', 'conflicts.md'];
const QUEUE_HEADER = '# Conflicts queue\n\n';

// --- Similarity backends -------------------------------------------

/**
 * Token-Jaccard similarity. Lowercase, split on whitespace + common
 * punctuation, dedupe. Returns 0..1.
 *
 * This is the substring-match fallback — "substring" is the
 * audit-log label per design §6.8 even though we use Jaccard internally,
 * because the SEMANTIC layer (FTS5 / vector embeddings) is what gets
 * swapped in for v0.1.x. The substring/Jaccard fallback is "no semantic
 * backend; lexical only".
 */
export function tokenJaccardSimilarity(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return 0;
  if (a === b) return 1;
  const tokenize = (s) =>
    new Set(
      s
        .toLowerCase()
        .split(/[\s.,!?;:()[\]{}'"`/\\-]+/u)
        .filter((t) => t.length > 0),
    );
  const ta = tokenize(a);
  const tb = tokenize(b);
  if (ta.size === 0 && tb.size === 0) return 1;
  if (ta.size === 0 || tb.size === 0) return 0;
  let intersect = 0;
  for (const t of ta) if (tb.has(t)) intersect++;
  const union = ta.size + tb.size - intersect;
  return intersect / union;
}

// --- Existing-bullet scan -------------------------------------------

const BULLET_LINE_RE = /^- \(([PUL])-([A-Za-z0-9]{8})\)\s+(.+)$/;
const HEADING_LINE_RE = /^##\s+(.+?)\s*$/;
const PROVENANCE_RE = /^<!--\s*(.*?)\s*-->\s*$/;

function findSectionRange(lines, sectionTitle) {
  let startIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(HEADING_LINE_RE);
    if (m && m[1].trim() === sectionTitle.trim()) {
      startIdx = i + 1;
      break;
    }
  }
  if (startIdx === -1) return null;
  let endIdx = lines.length;
  for (let i = startIdx; i < lines.length; i++) {
    if (HEADING_LINE_RE.test(lines[i])) {
      endIdx = i;
      break;
    }
  }
  return { startIdx, endIdx };
}

// Walks all bullets in the given section (or the whole file if no
// section). Returns the array of {id, text, trust, lineIdx} entries.
function collectExistingBullets({ scratchpadText, sectionTitle }) {
  const lines = scratchpadText.split(/\r?\n/);
  const range = sectionTitle
    ? findSectionRange(lines, sectionTitle)
    : { startIdx: 0, endIdx: lines.length };
  if (!range) return [];
  const out = [];
  for (let i = range.startIdx; i < range.endIdx; i++) {
    const bm = lines[i].match(BULLET_LINE_RE);
    if (!bm) continue;
    const [, tier, idShort, bulletText] = bm;
    const id = `${tier}-${idShort}`;
    // Trust lives in the provenance comment on the next line.
    let trust = 'medium';
    const nextLine = lines[i + 1] ?? '';
    const pm = nextLine.match(PROVENANCE_RE);
    if (pm) {
      const tm = pm[1].match(/trust:\s*(high|medium|low)/);
      if (tm) trust = tm[1];
    }
    out.push({ id, text: bulletText, trust, lineIdx: i });
  }
  return out;
}

// --- Public: detectConflicts ---------------------------------------

/**
 * Compare a new write against existing bullets in the same
 * scratchpad + section. Three outcomes:
 *   - { conflict: false, similarityBackend, scanned: N }
 *   - { conflict: true, action: 'supersede', existingId, similarity,
 *       similarityBackend }
 *       — new.trust >= existing.trust; caller should treat as a
 *       replace (kit's existing replace flow handles this; conflict-
 *       queue is NOT involved beyond returning the signal).
 *   - { conflict: true, action: 'queue', existingId, existingText,
 *       existingTrust, similarity, similarityBackend }
 *       — new.trust < existing.trust; caller routes via
 *       writeConflictEntry.
 */
export function detectConflicts({
  newText,
  newTrust,
  scratchpadPath,
  sectionTitle,
  similarityFn,
  similarityThreshold,
} = {}) {
  if (typeof newText !== 'string' || newText.length === 0) {
    return errorResult({
      category: ERROR_CATEGORIES.SCHEMA,
      errors: ['detectConflicts: newText required (non-empty string)'],
    });
  }
  if (!TRUST_LEVELS[newTrust]) {
    return errorResult({
      category: ERROR_CATEGORIES.SCHEMA,
      errors: [`detectConflicts: newTrust required (one of: ${Object.keys(TRUST_LEVELS).join(', ')})`],
    });
  }
  if (typeof scratchpadPath !== 'string') {
    return errorResult({
      category: ERROR_CATEGORIES.SCHEMA,
      errors: ['detectConflicts: scratchpadPath required (string)'],
    });
  }

  const fn = typeof similarityFn === 'function' ? similarityFn : tokenJaccardSimilarity;
  const similarityBackend = fn === tokenJaccardSimilarity ? 'substring' : 'custom';
  const threshold =
    typeof similarityThreshold === 'number'
      ? similarityThreshold
      : similarityBackend === 'substring'
        ? DEFAULT_SUBSTRING_THRESHOLD
        : DEFAULT_SEMANTIC_THRESHOLD;

  // Empty scratchpad / missing file → no conflicts possible.
  let scratchpadText = '';
  if (existsSync(scratchpadPath)) {
    scratchpadText = readFileSync(scratchpadPath, 'utf8');
  }
  const bullets = collectExistingBullets({ scratchpadText, sectionTitle });
  if (bullets.length === 0) {
    return { conflict: false, similarityBackend, scanned: 0 };
  }

  // Find the highest-similarity existing bullet.
  let best = null;
  for (const b of bullets) {
    if (b.text === newText) continue; // exact-match isn't a conflict; the replace flow handles dedup
    const sim = fn(newText, b.text);
    if (!best || sim > best.similarity) {
      best = { ...b, similarity: sim };
    }
  }

  if (!best || best.similarity < threshold) {
    return { conflict: false, similarityBackend, scanned: bullets.length };
  }

  // We have a conflict candidate. Decide route based on trust.
  const newRank = TRUST_LEVELS[newTrust];
  const existingRank = TRUST_LEVELS[best.trust] ?? TRUST_LEVELS.medium;
  if (newRank >= existingRank) {
    return {
      conflict: true,
      action: 'supersede',
      existingId: best.id,
      similarity: best.similarity,
      similarityBackend,
    };
  }
  return {
    conflict: true,
    action: 'queue',
    existingId: best.id,
    existingText: best.text,
    existingTrust: best.trust,
    similarity: best.similarity,
    similarityBackend,
  };
}

// --- Public: writeConflictEntry ------------------------------------

/**
 * Append a pending entry to <tierRoot>/queues/conflicts.md.
 *
 * Entry shape:
 *   - (proposed: P-NEW) "<new bullet text>"
 *     conflicts_with: P-EXISTING
 *     existing_text: "<existing bullet text>"
 *     existing_trust: high
 *     new_trust: medium
 *     similarity: 0.91
 *     similarity_backend: substring
 *     detected_at: 2026-05-27T10:00:00Z
 *     resolution: pending
 *
 * Returns { action: 'queued', id, conflictsWith, path }.
 * Audit-log entry written via appendAuditEntry.
 */
export function writeConflictEntry({
  tier,
  projectRoot,
  userDir,
  newId,
  newText,
  newTrust,
  existingId,
  existingText,
  existingTrust,
  similarity,
  similarityBackend,
  detectedAt,
} = {}) {
  if (!VALID_TIERS.has(tier)) {
    return errorResult({
      category: ERROR_CATEGORIES.SCHEMA,
      errors: [`writeConflictEntry: tier must be one of P/U/L (got ${tier})`],
    });
  }
  const tierRoot = resolveTierRoot({ tier, projectRoot, userDir });
  if (!tierRoot) {
    return errorResult({
      category: ERROR_CATEGORIES.SCHEMA,
      errors: ['writeConflictEntry: could not resolve tier root (projectRoot/userDir missing?)'],
    });
  }
  const queuePath = join(tierRoot, ...QUEUE_RELATIVE);
  mkdirSync(join(tierRoot, QUEUE_RELATIVE[0]), { recursive: true });
  const ts = detectedAt ?? nowIso();

  const entry = [
    `- (proposed: ${newId}) ${JSON.stringify(newText)}`,
    `  conflicts_with: ${existingId}`,
    `  existing_text: ${JSON.stringify(existingText)}`,
    `  existing_trust: ${existingTrust}`,
    `  new_trust: ${newTrust}`,
    `  similarity: ${similarity.toFixed(4)}`,
    `  similarity_backend: ${similarityBackend}`,
    `  detected_at: ${ts}`,
    `  resolution: pending`,
    '',
  ].join('\n');

  // Initialize the queue file with a header on first write.
  if (!existsSync(queuePath)) {
    writeFileSync(queuePath, QUEUE_HEADER + entry, 'utf8');
  } else {
    appendFileSync(queuePath, entry, 'utf8');
  }

  appendAuditEntry(tierRoot, {
    ts,
    action: 'queued',
    tier,
    id: newId,
    reasonCode: REASON_CODES.CONFLICT_QUEUED,
    reasonText: `conflict-queue: new write contradicts ${existingId} (similarity=${similarity.toFixed(4)}, backend=${similarityBackend}, new_trust=${newTrust} < existing_trust=${existingTrust})`,
    extra: {
      conflicts_with: existingId,
      similarity,
      similarity_backend: similarityBackend,
      new_trust: newTrust,
      existing_trust: existingTrust,
    },
  });

  return {
    action: 'queued',
    id: newId,
    conflictsWith: existingId,
    path: queuePath,
    similarity,
    similarityBackend,
  };
}

// --- Public: resolveConflictQueue ----------------------------------

const ENTRY_HEADER_RE = /^- \(proposed:\s*([PUL]-[A-Za-z0-9]{8})\)\s+(.+)$/;
const FIELD_LINE_RE = /^\s+(\w+):\s*(.+)$/;

function parseQueue(queueText) {
  const lines = queueText.split(/\r?\n/);
  const entries = [];
  let current = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const headerMatch = line.match(ENTRY_HEADER_RE);
    if (headerMatch) {
      if (current) entries.push(current);
      let proposedText = headerMatch[2];
      // Strip quotes if JSON.stringify'd
      try {
        proposedText = JSON.parse(proposedText);
      } catch {
        /* leave as-is */
      }
      current = {
        startLineIdx: i,
        endLineIdx: i,
        proposedId: headerMatch[1],
        proposedText,
        fields: {},
      };
      continue;
    }
    if (current) {
      const fieldMatch = line.match(FIELD_LINE_RE);
      if (fieldMatch) {
        let value = fieldMatch[2];
        try {
          value = JSON.parse(value);
        } catch {
          /* leave as-is */
        }
        current.fields[fieldMatch[1]] = value;
        current.endLineIdx = i;
      } else if (line.trim() === '') {
        current.endLineIdx = i;
      } else {
        // Non-empty, non-field line breaks the current entry.
        entries.push(current);
        current = null;
      }
    }
  }
  if (current) entries.push(current);
  return { entries, lines };
}

/**
 * Walk pending conflict entries one-at-a-time. The `prompter` is a
 * caller-supplied function: ({proposedEntry, existingEntry}) → 'keep-old' | 'keep-new' | 'merge-both' | 'skip'.
 * Lets the CLI / tests inject behavior; production wires through the
 * interactive `cmk queue conflicts` verb.
 *
 * `mergeFn` is invoked on 'merge-both' actions. Tests can inject a
 * stub; production wires to mergeFacts() from merge-facts.mjs.
 *
 * Returns { resolved: N, kept_old: N, kept_new: N, merged: N, skipped: N }.
 */
export async function resolveConflictQueue({
  tier,
  projectRoot,
  userDir,
  prompter,
  mergeFn,
} = {}) {
  if (!VALID_TIERS.has(tier)) {
    return errorResult({
      category: ERROR_CATEGORIES.SCHEMA,
      errors: [`resolveConflictQueue: tier must be one of P/U/L (got ${tier})`],
    });
  }
  if (typeof prompter !== 'function') {
    return errorResult({
      category: ERROR_CATEGORIES.SCHEMA,
      errors: ['resolveConflictQueue: prompter required (function)'],
    });
  }
  const tierRoot = resolveTierRoot({ tier, projectRoot, userDir });
  const queuePath = join(tierRoot, ...QUEUE_RELATIVE);
  if (!existsSync(queuePath)) {
    return { resolved: 0, kept_old: 0, kept_new: 0, merged: 0, skipped: 0 };
  }

  const queueText = readFileSync(queuePath, 'utf8');
  const { entries } = parseQueue(queueText);
  const pending = entries.filter((e) => e.fields.resolution === 'pending');

  let kept_old = 0;
  let kept_new = 0;
  let merged = 0;
  let skipped = 0;

  // Rewriting strategy: build a new queue file from scratch with
  // resolved entries marked + skipped entries kept as pending.
  const newEntryLines = [];
  for (const entry of entries) {
    if (entry.fields.resolution !== 'pending') {
      // Already resolved — preserve as-is.
      newEntryLines.push(serializeEntry(entry));
      continue;
    }
    const decision = await prompter({
      proposedId: entry.proposedId,
      proposedText: entry.proposedText,
      proposedTrust: entry.fields.new_trust,
      existingId: entry.fields.conflicts_with,
      existingText: entry.fields.existing_text,
      existingTrust: entry.fields.existing_trust,
      similarity: entry.fields.similarity,
      detectedAt: entry.fields.detected_at,
    });

    if (decision === 'skip') {
      skipped++;
      newEntryLines.push(serializeEntry(entry));
      continue;
    }

    // Resolved: rewrite the entry's resolution field.
    const resolvedAt = nowIso();
    if (decision === 'keep-old') {
      kept_old++;
    } else if (decision === 'keep-new') {
      kept_new++;
    } else if (decision === 'merge-both') {
      merged++;
      if (typeof mergeFn === 'function') {
        await mergeFn({
          tier,
          projectRoot,
          userDir,
          proposedId: entry.proposedId,
          proposedText: entry.proposedText,
          existingId: entry.fields.conflicts_with,
          existingText: entry.fields.existing_text,
        });
      }
    } else {
      // Unknown decision — preserve as pending; let the next pass try.
      skipped++;
      newEntryLines.push(serializeEntry(entry));
      continue;
    }

    appendAuditEntry(tierRoot, {
      ts: resolvedAt,
      action: 'resolved',
      tier,
      id: entry.proposedId,
      reasonCode: REASON_CODES.CONFLICT_RESOLVED,
      reasonText: `conflict-queue: ${decision} on ${entry.proposedId} (conflicts_with=${entry.fields.conflicts_with})`,
      extra: {
        decision,
        conflicts_with: entry.fields.conflicts_with,
      },
    });

    const resolved = {
      ...entry,
      fields: {
        ...entry.fields,
        resolution: decision,
        resolved_at: resolvedAt,
      },
    };
    newEntryLines.push(serializeEntry(resolved));
  }

  // Rewrite the queue file.
  const body = QUEUE_HEADER + newEntryLines.join('');
  writeFileSync(queuePath, body, 'utf8');

  return {
    resolved: kept_old + kept_new + merged,
    kept_old,
    kept_new,
    merged,
    skipped,
  };
}

function serializeEntry(entry) {
  const fieldOrder = [
    'conflicts_with',
    'existing_text',
    'existing_trust',
    'new_trust',
    'similarity',
    'similarity_backend',
    'detected_at',
    'resolution',
    'resolved_at',
  ];
  const lines = [`- (proposed: ${entry.proposedId}) ${JSON.stringify(entry.proposedText)}`];
  for (const key of fieldOrder) {
    if (!(key in entry.fields)) continue;
    const value = entry.fields[key];
    const formatted =
      typeof value === 'string' && /["\s]|^\d/.test(value) && !/^-?\d+(\.\d+)?$/.test(value)
        ? JSON.stringify(value)
        : value;
    lines.push(`  ${key}: ${formatted}`);
  }
  lines.push('');
  return lines.join('\n');
}
