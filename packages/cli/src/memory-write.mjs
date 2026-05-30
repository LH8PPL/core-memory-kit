// memory-write — the public boundary for durable memory writes (Task
// 24, T-021). Invoked by two callers, same code path (design §6.3):
//
//   1. The auto-extract subagent (programmatic) — passes
//      {action: 'add', source: 'auto-extract', ...} after Haiku
//      identifies a high-trust durable fact. Closes the Poison_Guard
//      bypass gap Task 23 left documented.
//
//   2. The user-explicit Skill — plugin/skills/memory-write/SKILL.md.
//      Claude Code's harness invokes the skill body when the user's
//      prompt matches the description+when_to_use signals (e.g.
//      "remember this"). The skill body delegates here.
//
// Three actions per design §6.3:
//   - add     → Poison_Guard → consolidate-if-over-cap → append bullet
//   - replace → Poison_Guard → substring match → strip old, append new
//   - remove  → substring match → ALWAYS-confirm gate → tombstone
//
// Poison_Guard runs BEFORE any disk write. A rejection produces an
// NDJSON entry in .locks/poison-guard.log with the redacted excerpt
// (cleartext never leaves checkPoisonGuard()), and the caller gets
// action: 'error', errorCategory: 'poison_guard', pattern_id.
//
// Tombstone discipline (design §6.5): `remove` NEVER silently
// deletes. The matched bullet + its provenance comment are copied
// into a tombstone file at <tier-root>/archive/tombstones/<id>.md
// with `deleted_at` / `deleted_reason` / `deleted_by` frontmatter,
// then stripped from the scratchpad. `mk_get(<id>)` (Layer 6) can
// still resolve via the tombstone for audit purposes.
//
// Uses shared modules per CLAUDE.md "Shared modules" rule:
//   tier-paths.mjs       — tier/scratchpad path resolution
//   audit-log.mjs        — nowIso(), appendAuditEntry()
//   result-shapes.mjs    — ERROR_CATEGORIES, errorResult()
//   scratchpad.mjs       — appendScratchpadBullet() (add path)
//   provenance.mjs       — parseBulletProvenance() (replace/remove bullet match)
//   poison-guard.mjs     — checkPoisonGuard(), logPoisonGuardRejection()

import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { generateId } from '@lh8ppl/cmk-canonicalize';
import {
  resolveTierRoot,
  resolveScratchpadPath,
  VALID_TIERS,
  ID_PATTERN,
} from './tier-paths.mjs';
import { nowIso, appendAuditEntry, REASON_CODES } from './audit-log.mjs';
import { ERROR_CATEGORIES, errorResult } from './result-shapes.mjs';
import { appendScratchpadBullet } from './scratchpad.mjs';
import { parseBulletProvenance } from './provenance.mjs';
import { checkPoisonGuard, logPoisonGuardRejection } from './poison-guard.mjs';
import { detectConflicts, writeConflictEntry } from './conflict-queue.mjs';
import { sanitizeHomePaths } from './sanitize.mjs';

const VALID_ACTIONS = new Set(['add', 'replace', 'remove']);

// --- Validation ----------------------------------------------------

function validateCommon(opts) {
  const errors = [];
  if (!VALID_ACTIONS.has(opts.action)) {
    errors.push(
      `action: required, one of ${[...VALID_ACTIONS].join(' / ')} (got ${JSON.stringify(opts.action)})`,
    );
  }
  if (!opts.tier || !VALID_TIERS.has(opts.tier)) {
    errors.push(`tier: required, one of 'U', 'P', 'L'`);
  }
  if (!opts.scratchpad || typeof opts.scratchpad !== 'string') {
    errors.push('scratchpad: required, non-empty string');
  }
  if (!opts.section || typeof opts.section !== 'string') {
    errors.push('section: required, non-empty string');
  }
  if (!opts.source || typeof opts.source !== 'string') {
    errors.push('source: required, non-empty string');
  }
  return errors;
}

function validateText(opts, errors) {
  if (opts.text == null || typeof opts.text !== 'string' || !opts.text.trim()) {
    errors.push('text: required, non-empty string');
  }
}

// --- Poison_Guard integration --------------------------------------

function runPoisonGuard({ text, projectRoot, source, sessionId, now }) {
  const result = checkPoisonGuard(text);
  if (!result.rejected) return null;
  // Schema-class rejections (non-string input) don't need a log entry
  // — there's no input to redact, and the caller will surface schema
  // through the normal error path.
  if (result.pattern_id === 'schema') {
    return errorResult({
      category: ERROR_CATEGORIES.SCHEMA,
      errors: ['text: must be a non-empty string'],
    });
  }
  const sourceFile = sessionId
    ? `${source}-${sessionId}`
    : source;
  logPoisonGuardRejection({
    projectRoot,
    ts: now ?? nowIso(),
    pattern_id: result.pattern_id,
    source_file: sourceFile,
    source_line: 1,
    redacted_excerpt: result.redacted_excerpt,
  });
  // Route through errorResult() (not a hand-rolled object) so the result
  // shape carries the `errors: [...]` array that downstream callers
  // (review-queue.resolveReviewQueue → subcommands.runQueueReview's
  // `err.errors.join('; ')`) expect. Without this, `cmk queue review`
  // crashes with `TypeError: Cannot read properties of undefined`
  // when the user promotes a candidate that contains a Poison_Guard
  // pattern. The `pattern_id` + `redacted_excerpt` stay reachable on
  // the returned object for analytics use.
  return errorResult({
    category: ERROR_CATEGORIES.POISON_GUARD,
    errors: [
      `Poison_Guard rejected write: pattern_id=${result.pattern_id}`,
    ],
    pattern_id: result.pattern_id,
    redacted_excerpt: result.redacted_excerpt,
  });
}

// --- Bullet search helpers (for replace + remove) -------------------

// Walk the scratchpad lines and find the first bullet (in the
// caller's section) whose text contains the substring. Returns
// {bulletIdx, commentIdx, id, bulletText, commentLine} or null.
// The bullet shape per provenance.mjs writeBullet():
//   - (P-XXXXXXXX) <text>
//     <!-- source:..., source_line:..., sha1:..., write:..., trust:..., at:... -->
//
// ID class is derived from the canonical ID_PATTERN exported by
// tier-paths.mjs (the kit's base32 alphabet: 2345679ABCDEFGHJKLMNPQRSTUVWXYZa,
// note the lowercase `a`). An earlier draft hard-coded [A-Z0-9]{8}
// which silently failed on the ~22% of IDs that canonicalize emits
// with a lowercase `a` — surfaced by the holistic code-review pass
// for Task 24.
const ID_TIER_PREFIX = '(U|P|L)';
const ID_BODY_CLASS = '[2345679ABCDEFGHJKLMNPQRSTUVWXYZa]{8}';
const BULLET_LINE_RE = new RegExp(`^- \\(${ID_TIER_PREFIX}-(${ID_BODY_CLASS})\\)\\s+(.*)$`);

// Sanity check: the regex we just built must accept anything
// ID_PATTERN does. Caught at module load — if a future edit to
// tier-paths.mjs adds a character we forgot to mirror here, this
// fails fast instead of silently producing not-found errors.
{
  const sample = 'P-a2RH5GMN';
  if (!ID_PATTERN.test(sample)) {
    throw new Error(`memory-write: ID_PATTERN regression — sample ${sample} rejected`);
  }
  if (!BULLET_LINE_RE.test(`- (${sample}) example`)) {
    throw new Error(`memory-write: BULLET_LINE_RE does not cover ID_PATTERN alphabet`);
  }
}

// Find the bullet by section scope: walk only the section identified
// by `sectionTitle`. Without this, a substring that appears in two
// sections would match the first occurrence file-wide (wrong section).
function findSectionRange(lines, sectionTitle) {
  const startIdx = lines.findIndex((l) => l.trim() === `## ${sectionTitle}`);
  if (startIdx === -1) return null;
  let endIdx = lines.findIndex((l, i) => i > startIdx && /^##\s/.test(l));
  if (endIdx === -1) endIdx = lines.length;
  return { startIdx, endIdx };
}

function findMatchingBullet({ lines, substring, sectionTitle }) {
  if (typeof substring !== 'string' || substring === '') return null;
  const range = sectionTitle
    ? findSectionRange(lines, sectionTitle)
    : { startIdx: 0, endIdx: lines.length };
  if (!range) return null;
  for (let i = range.startIdx; i < range.endIdx - 1; i++) {
    const m = lines[i].match(BULLET_LINE_RE);
    if (!m) continue;
    const [, tier, idShort, bulletText] = m;
    if (!bulletText.includes(substring)) continue;
    const commentLine = lines[i + 1];
    if (!commentLine || !/^\s*<!--.*-->\s*$/.test(commentLine)) continue;
    return {
      bulletIdx: i,
      commentIdx: i + 1,
      id: `${tier}-${idShort}`,
      bulletText,
      commentLine,
    };
  }
  return null;
}

// --- Tombstone writer (design §6.5) --------------------------------

function writeTombstone({
  tierRoot,
  id,
  bulletText,
  commentLine,
  deletedAt,
  deletedReason,
  deletedBy,
}) {
  const tombstoneDir = join(tierRoot, 'archive', 'tombstones');
  mkdirSync(tombstoneDir, { recursive: true });
  const tombstonePath = join(tombstoneDir, `${id}.md`);
  const provenance = parseBulletProvenance(commentLine) ?? {};
  const body = [
    '---',
    `id: ${id}`,
    `deleted_at: ${deletedAt}`,
    `deleted_reason: ${JSON.stringify(deletedReason)}`,
    `deleted_by: ${deletedBy}`,
    provenance.source ? `original_source: ${JSON.stringify(provenance.source)}` : null,
    provenance.at ? `original_at: ${provenance.at}` : null,
    provenance.trust ? `original_trust: ${provenance.trust}` : null,
    '---',
    '',
    bulletText,
    '',
  ].filter((l) => l !== null).join('\n');
  writeFileSync(tombstonePath, body, 'utf8');
  return tombstonePath;
}

// --- Action: add ---------------------------------------------------
//
// Split into two functions on purpose: `doAdd` is the public path
// (validate → Poison_Guard → write); `appendBulletGuarded` is the
// inner write-only step that assumes the caller has ALREADY gated
// through Poison_Guard. `doReplace` calls the inner directly so the
// guard doesn't fire twice on the same text. This isn't just
// performance — the guard call has a side effect (NDJSON log write),
// and double-rejecting a still-fine text would produce log noise the
// moment Poison_Guard ever becomes non-deterministic (e.g. settings-
// driven extension patterns from design §6.7's tunability hook).

function doAdd(opts) {
  const errors = [];
  validateText(opts, errors);
  if (errors.length > 0) {
    return errorResult({ category: ERROR_CATEGORIES.SCHEMA, errors });
  }
  // Privacy (write-path fix #1): abstract home-dir paths to `~` for
  // committed/shared tiers (P/U) BEFORE the bullet is screened, conflict-
  // checked, dedup-keyed, and written — so a captured fact never ships the
  // local username and stays portable. Local tier (L) keeps machine paths
  // verbatim (its purpose). Everything downstream uses `addOpts`.
  const sanitizedText =
    opts.tier === 'P' || opts.tier === 'U'
      ? sanitizeHomePaths(opts.text)
      : opts.text;
  const addOpts =
    sanitizedText === opts.text ? opts : { ...opts, text: sanitizedText };

  const poisonResult = runPoisonGuard({
    text: addOpts.text,
    projectRoot: opts.projectRoot,
    source: opts.source,
    sessionId: opts.sessionId,
    now: opts.now,
  });
  if (poisonResult) return poisonResult;

  // Conflict-queue check (Task 25, design §6.8). Runs BEFORE the append:
  //   - new.trust < existing.trust → route to queues/conflicts.md
  //   - new.trust >= existing.trust ('supersede' action) → for v0.1.0
  //     this continues to normal append; auto-marking the existing
  //     bullet's provenance with `superseded_by:` is deferred to v0.1.x
  //     (callers can use the explicit `replace` action when they want
  //     that semantics today).
  const newTrust = opts.trust ?? 'high';
  const scratchpadPath = resolveScratchpadPath({
    tier: opts.tier,
    scratchpad: opts.scratchpad,
    projectRoot: opts.projectRoot,
    userDir: opts.userDir,
  });
  const conflict = detectConflicts({
    newText: addOpts.text,
    newTrust,
    scratchpadPath,
    sectionTitle: opts.section,
  });
  // Defensive guard against a future detectConflicts schema-error
  // path. Today the upstream validator catches bad opts before this
  // call, so action:'error' from detectConflicts is unreachable.
  // The guard is brittleness insurance: a future change to
  // detectConflicts that adds a new schema check (e.g., for malformed
  // existing scratchpad bullets) would otherwise fall through to
  // appendBulletGuarded and silently drop the error.
  if (conflict.action === 'error') {
    return conflict;
  }
  if (conflict.conflict === true && conflict.action === 'queue') {
    // Compute the proposed ID using the same canonical-id derivation
    // appendScratchpadBullet would have used, then route to the queue.
    // (Task 25b fix: generateId is positional `(tier, text)`, not
    // named-args — Task 25 originally called it as an object.)
    const proposedId = generateId(addOpts.tier, addOpts.text);
    const ts = opts.now ?? nowIso();
    return writeConflictEntry({
      tier: opts.tier,
      projectRoot: opts.projectRoot,
      userDir: opts.userDir,
      newId: proposedId,
      newText: addOpts.text,
      newTrust,
      existingId: conflict.existingId,
      existingText: conflict.existingText,
      existingTrust: conflict.existingTrust,
      similarity: conflict.similarity,
      similarityBackend: conflict.similarityBackend,
      detectedAt: ts,
    });
  }
  return appendBulletGuarded(addOpts);
}

function appendBulletGuarded(opts) {
  // Caller MUST have run Poison_Guard already. This is the inner
  // write step — delegates to the existing scratchpad writer which
  // handles dedup + cap + consolidation + audit + ID derivation.
  const sha1 = createHash('sha1').update(opts.text, 'utf8').digest('hex');
  const ts = opts.now ?? nowIso();
  return appendScratchpadBullet({
    tier: opts.tier,
    scratchpad: opts.scratchpad,
    section: opts.section,
    text: opts.text,
    projectRoot: opts.projectRoot,
    userDir: opts.userDir,
    now: ts,
    settings: opts.settings,
    provenance: {
      source: opts.sessionId
        ? `${opts.source}-${opts.sessionId}`
        : opts.source,
      source_line: 1,
      sha1,
      write: opts.source === 'auto-extract' ? 'auto-extract' : 'user-explicit',
      trust: opts.trust ?? 'high',
      at: ts,
    },
  });
}

// --- Action: replace -----------------------------------------------

function doReplace(opts) {
  const errors = [];
  validateText(opts, errors);
  if (!opts.oldText || typeof opts.oldText !== 'string') {
    errors.push('oldText: required for action=replace, non-empty string');
  }
  if (errors.length > 0) {
    return errorResult({ category: ERROR_CATEGORIES.SCHEMA, errors });
  }
  // Poison_Guard against the NEW text — never accept a write whose
  // replacement contains a secret.
  const poisonResult = runPoisonGuard({
    text: opts.text,
    projectRoot: opts.projectRoot,
    source: opts.source,
    sessionId: opts.sessionId,
    now: opts.now,
  });
  if (poisonResult) return poisonResult;

  const path = resolveScratchpadPath({
    tier: opts.tier,
    scratchpad: opts.scratchpad,
    projectRoot: opts.projectRoot,
    userDir: opts.userDir,
  });
  if (!existsSync(path)) {
    return errorResult({
      category: ERROR_CATEGORIES.NOT_FOUND,
      errors: [`scratchpad does not exist: ${path}`],
      path,
    });
  }
  const original = readFileSync(path, 'utf8');
  const lines = original.split('\n');
  const match = findMatchingBullet({
    lines,
    substring: opts.oldText,
    sectionTitle: opts.section,
  });
  if (!match) {
    // Canonical "operation failed because target wasn't found" shape:
    // action='error' + errorCategory='not-found'. The bare
    // notFoundResult() shape (action='not-found') is for read-side
    // boundaries where "I couldn't find it" is the success path of
    // a lookup. For a write that needed an existing target,
    // matching the user's expectation that a failed replace is an
    // error.
    return errorResult({
      category: ERROR_CATEGORIES.NOT_FOUND,
      errors: [
        `replace: no bullet in ${opts.scratchpad} § ${opts.section} contains substring "${opts.oldText}"`,
      ],
      path,
    });
  }
  // Strip the matched bullet + provenance comment.
  const stripped = [
    ...lines.slice(0, match.bulletIdx),
    ...lines.slice(match.commentIdx + 1),
  ].join('\n');
  writeFileSync(path, stripped, 'utf8');

  // Append the new bullet via the GUARDED inner path. We already ran
  // Poison_Guard at the top of doReplace — calling doAdd() here
  // would re-run it on the same text, with side effects (NDJSON log
  // writes) that double-count once Poison_Guard becomes settings-
  // driven per design §6.7. The inner appendBulletGuarded() skips
  // the guard since the caller already gated.
  const addResult = appendBulletGuarded({
    ...opts,
    action: 'add',
    text: opts.text,
  });
  if (addResult.action !== 'appended') {
    // Append failed AFTER we stripped the old (e.g. cap_exceeded
    // after consolidation). Roll back: restore the original file so
    // the user isn't left with a partial state.
    writeFileSync(path, original, 'utf8');
    return addResult;
  }

  // Audit the replace as a curated-merge-style event so analytics
  // can distinguish from raw appends.
  const tierRoot = resolveTierRoot({
    tier: opts.tier,
    projectRoot: opts.projectRoot,
    userDir: opts.userDir,
  });
  appendAuditEntry(tierRoot, {
    ts: opts.now ?? nowIso(),
    action: 'replaced',
    tier: opts.tier,
    id: addResult.id,
    reasonCode: REASON_CODES.CURATED_MERGE,
    reasonText: `replace via memory-write: old=${match.id}`,
    paths: { before: path, after: path },
    extra: { oldId: match.id, newId: addResult.id, scratchpad: opts.scratchpad },
  });

  return {
    action: 'replaced',
    oldId: match.id,
    newId: addResult.id,
    path: addResult.path,
  };
}

// --- Action: remove ------------------------------------------------

function doRemove(opts) {
  const errors = [];
  validateText(opts, errors);
  if (opts.confirmRemove !== true) {
    errors.push(
      'confirmRemove: must be explicitly true for action=remove (safety gate — tombstoning is irreversible from user perspective)',
    );
  }
  if (errors.length > 0) {
    return errorResult({ category: ERROR_CATEGORIES.SCHEMA, errors });
  }

  const path = resolveScratchpadPath({
    tier: opts.tier,
    scratchpad: opts.scratchpad,
    projectRoot: opts.projectRoot,
    userDir: opts.userDir,
  });
  if (!existsSync(path)) {
    return errorResult({
      category: ERROR_CATEGORIES.NOT_FOUND,
      errors: [`scratchpad does not exist: ${path}`],
      path,
    });
  }
  const original = readFileSync(path, 'utf8');
  const lines = original.split('\n');
  const match = findMatchingBullet({
    lines,
    substring: opts.text,
    sectionTitle: opts.section,
  });
  if (!match) {
    return errorResult({
      category: ERROR_CATEGORIES.NOT_FOUND,
      errors: [
        `remove: no bullet in ${opts.scratchpad} § ${opts.section} contains substring "${opts.text}"`,
      ],
      path,
    });
  }

  const tierRoot = resolveTierRoot({
    tier: opts.tier,
    projectRoot: opts.projectRoot,
    userDir: opts.userDir,
  });
  const ts = opts.now ?? nowIso();
  const tombstonePath = writeTombstone({
    tierRoot,
    id: match.id,
    bulletText: match.bulletText,
    commentLine: match.commentLine,
    deletedAt: ts,
    deletedReason: `user said: forget about "${opts.text}"`,
    deletedBy: opts.source === 'auto-extract' ? 'auto-extract' : 'user-explicit',
  });

  // Strip from scratchpad.
  const stripped = [
    ...lines.slice(0, match.bulletIdx),
    ...lines.slice(match.commentIdx + 1),
  ].join('\n');
  writeFileSync(path, stripped, 'utf8');

  appendAuditEntry(tierRoot, {
    ts,
    action: 'tombstoned',
    tier: opts.tier,
    id: match.id,
    reasonCode: REASON_CODES.USER_REQUESTED,
    reasonText: `tombstone via memory-write remove: substring="${opts.text}"`,
    paths: { before: path, archive: tombstonePath },
    extra: { scratchpad: opts.scratchpad },
  });

  return {
    action: 'tombstoned',
    id: match.id,
    path,
    tombstonePath,
  };
}

// --- Public boundary -----------------------------------------------

export function memoryWrite(opts = {}) {
  const errors = validateCommon(opts);
  if (errors.length > 0) {
    return errorResult({ category: ERROR_CATEGORIES.SCHEMA, errors });
  }
  switch (opts.action) {
    case 'add':
      return doAdd(opts);
    case 'replace':
      return doReplace(opts);
    case 'remove':
      return doRemove(opts);
    default:
      // Unreachable — validateCommon catches unknown actions — but
      // be explicit so the switch is exhaustive.
      return errorResult({
        category: ERROR_CATEGORIES.SCHEMA,
        errors: [`unknown action: ${JSON.stringify(opts.action)}`],
      });
  }
}
