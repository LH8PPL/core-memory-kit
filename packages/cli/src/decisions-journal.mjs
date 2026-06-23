// The append-only decision journal — context/DECISIONS.md (Task 147, D-161).
//
// A chronological, human-readable page of every decision + its why. The VIEW
// the kit was missing: decisions are captured as facts but scattered across N
// per-fact files with no chronological decision page (cmk search is pull, not
// browse; MEMORY.md is bounded + rolls). This is the squad `decisions.md` /
// our own DECISION-LOG.md equivalent, made automatic.
//
// LIFECYCLE — APPEND-ONLY, never regenerated, never parked (D-161):
//   - This is NOT a derived view like INDEX.md. Regenerating from live facts
//     would silently ERASE superseded/forgotten decisions — rewriting history
//     to look like the current state was always obvious (the exact failure the
//     decision-trail-preservation rule exists to prevent).
//   - A decision journal is unbounded by design: old decisions are the MOST
//     valuable part (they explain why the codebase is shaped as it is), so the
//     MEMORY.md rolling-window must NOT apply.
//   - Mechanics: new decision → appended; tombstoned → its entry MARKED
//     retracted IN PLACE (never removed); every pre-existing entry survives
//     every update.
//
// The update is triggered like a derived view (runs where reindex runs, so the
// journal stays current) but its WRITE LOGIC is append-only — the file is the
// accumulator, the facts are only the trigger. Each entry carries a stable
// machine marker `<!-- decision:P-XXXXXXXX -->` so the updater knows which ids
// are already journaled + which entries to annotate, without parsing prose
// (and so a human can freely add their own prose between entries — preserved).
//
// v0.3.2 scope: explicit signals only (capture appends; forget marks retracted;
// explicit supersession annotates). AUTOMATIC semantic contradiction-detection
// is deferred to F-D / Task 95.

import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseFrontmatter } from './frontmatter.mjs';
import { ID_PATTERN } from './tier-paths.mjs';

export const DECISIONS_HEADER =
  '# Decisions\n\n' +
  '> Append-only decision journal — every decision the kit captured, in order, with its why.\n' +
  '> Maintained by claude-memory-kit (`cmk digest`). Superseded/retracted entries stay (the trail is the point).';

// Only this fact type is a "decision" in the kit taxonomy (the project/state
// category — what project-memory's decisions.md and our DECISION-LOG track).
const DECISION_TYPE = 'project';

const markerFor = (id) => `<!-- decision:${id} -->`;
const RETRACT_TAG = '_(retracted';

/** The yyyy-mm-dd slice of an ISO timestamp, or the raw value if unparseable. */
function dateOnly(iso) {
  if (typeof iso !== 'string') return 'unknown-date';
  const m = iso.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : iso;
}

/**
 * Render ONE journal entry for a decision fact. The machine marker lets the
 * updater dedup + annotate; the human-readable lines are Title / date / Why / id.
 *
 * @param {{id:string,title:string,createdAt?:string,why?:string|null}} f
 * @returns {string} the entry block (no trailing newline)
 */
export function buildDecisionEntry(f) {
  const date = dateOnly(f.createdAt);
  // Blank lines around the `###` heading so the committed journal is lint-clean
  // markdown (markdownlint MD022 "blanks-around-headings"). The HTML marker, the
  // heading, and the When/Why block are each separated by a blank line — the
  // generated memory passes a strict linter by construction, not by exemption.
  const lines = [
    markerFor(f.id),
    '',
    `## ${f.title}`,
    '',
    `**When:** ${date} · **Fact:** \`${f.id}\``,
  ];
  if (f.why && String(f.why).trim()) {
    lines.push(`**Why:** ${String(f.why).trim()}`);
  }
  return lines.join('\n');
}

// The kit's id matcher, DERIVED from the canonical ID_PATTERN (tier-paths.mjs)
// so the base32 alphabet lives in exactly ONE place and can't drift. The
// original bug: this module hardcoded `[A-Z2-9]` (uppercase only), but the real
// alphabet includes a lowercase `a` — so any id containing `a` never matched
// "already journaled" → re-appended on EVERY digest run (the cut-gate find).
// Strip the `^…$` anchors to embed the pattern inside larger regexes.
const ID_CHARS = ID_PATTERN.source.replace(/^\^/, '').replace(/\$$/, '');

/** ids already present in the journal body (by their machine marker). */
function journaledIds(content) {
  const ids = new Set();
  const re = new RegExp(`<!-- decision:(${ID_CHARS}) -->`, 'g');
  let m;
  while ((m = re.exec(content)) !== null) ids.add(m[1]);
  return ids;
}

/**
 * Append-only journal update (D-161). Pure: content in → content out.
 *
 * @param {object} a
 * @param {string}   a.existingContent  current DECISIONS.md (‘’ if absent)
 * @param {Array}    a.facts            live decision-class facts ({id,type,title,createdAt,why})
 * @param {Set<string>} a.tombstonedIds ids whose fact has been forgotten
 * @param {string}   a.now             ISO timestamp for retraction stamps
 * @returns {string} the new DECISIONS.md content
 */
export function updateDecisionsJournal({ existingContent = '', facts = [], tombstonedIds = new Set(), now }) {
  let content = existingContent.trim() === '' ? DECISIONS_HEADER + '\n' : existingContent;
  const already = journaledIds(content);

  // 1) Append entries for decision-class facts not yet journaled.
  const newEntries = [];
  for (const f of facts) {
    if (f.type !== DECISION_TYPE) continue; // only decisions
    if (already.has(f.id)) continue; // already journaled — never duplicate
    newEntries.push(buildDecisionEntry(f));
    already.add(f.id);
  }
  if (newEntries.length > 0) {
    if (!content.endsWith('\n')) content += '\n';
    content += '\n' + newEntries.join('\n\n') + '\n';
  }

  // 2) Mark retracted (in place) any journaled entry whose fact is now
  //    tombstoned and not already marked. Never removes the entry.
  const stamp = dateOnly(now);
  for (const id of tombstonedIds) {
    const marker = markerFor(id);
    const idx = content.indexOf(marker);
    if (idx === -1) continue; // not journaled — nothing to retract
    // Bound the search to THIS entry's span — up to the next decision marker
    // (or end-of-file). Prevents a malformed/hand-edited entry with no heading
    // from attaching the retraction note to the NEXT entry's heading.
    const nextMarker = content.indexOf('<!-- decision:', idx + marker.length);
    const spanEnd = nextMarker === -1 ? content.length : nextMarker;
    // Find this entry's heading line (the `## …` after the marker, within span).
    // Anchor on a line-start `## ` (newline-prefixed) so body text containing
    // `##` can't be mistaken for the heading. buildDecisionEntry emits the
    // heading on its own line right after the marker + a blank line.
    const headingNl = content.indexOf('\n## ', idx);
    const headingStart = headingNl === -1 ? -1 : headingNl + 1;
    if (headingStart === -1 || headingStart >= spanEnd) continue;
    const headingEnd = content.indexOf('\n', headingStart);
    if (headingEnd === -1) continue;
    // Already retracted? (the note sits right after the heading)
    const afterHeading = content.slice(headingEnd + 1, headingEnd + 1 + RETRACT_TAG.length);
    if (afterHeading === RETRACT_TAG) continue;
    const note = `${RETRACT_TAG} ${stamp})_`;
    content = content.slice(0, headingEnd + 1) + note + '\n' + content.slice(headingEnd + 1);
  }

  if (!content.endsWith('\n')) content += '\n';
  return content;
}

// --- File-IO orchestration (the impure shell over the pure core) ----------

// Leading indent is [ \t]* (NOT \s*) so it can't match the newline the
// (?:^|\n) anchor already consumed — that overlap is the backtracking
// ambiguity SonarCloud flags as ReDoS. Disjoint character classes = linear.
const RICH_WHY_RE = /(?:^|\n)[ \t]*\*\*Why:\*\*[ \t]*([^\n]+)/;

/** Read decision-class facts (type:project) from the project tier. */
function readProjectDecisionFacts(projectRoot) {
  const dir = join(projectRoot, 'context', 'memory');
  const out = [];
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (!name.endsWith('.md') || name === 'INDEX.md') continue;
    try {
      const { frontmatter, body } = parseFrontmatter(readFileSync(join(dir, name), 'utf8'));
      if (!frontmatter?.id || frontmatter.type !== DECISION_TYPE) continue;
      if (frontmatter.deleted_at) continue;
      const whyMatch = String(body ?? '').match(RICH_WHY_RE);
      out.push({
        id: frontmatter.id,
        type: frontmatter.type,
        title: frontmatter.title ?? frontmatter.id,
        createdAt: frontmatter.created_at ?? null,
        why: whyMatch ? whyMatch[1].trim() : null,
      });
    } catch {
      // unparseable file — reindex/HC-4 own that class; the journal skips it
    }
  }
  // Stable chronological order (oldest first) so appends read like a timeline.
  out.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  return out;
}

/** ids of forgotten facts (tombstone archive). */
function readTombstonedIds(projectRoot) {
  const ids = new Set();
  const dir = join(projectRoot, 'context', 'memory', 'archive', 'tombstones');
  if (!existsSync(dir)) return ids;
  for (const name of readdirSync(dir)) {
    const m = name.match(new RegExp(`^(${ID_CHARS})\\.md$`));
    if (m) ids.add(m[1]);
  }
  return ids;
}

/**
 * Read → append-only update → write context/DECISIONS.md. Idempotent: a run
 * with nothing new is a no-op write (same bytes). Best-effort: never throws
 * into the caller (a journal failure must not break a capture/read path).
 *
 * @returns {{written:boolean, path:string, appended:number}|{written:false,error:string}}
 */
export function syncDecisionsJournal({ projectRoot, now } = {}) {
  try {
    const path = join(projectRoot, 'context', 'DECISIONS.md');
    const existingContent = existsSync(path) ? readFileSync(path, 'utf8') : '';
    const facts = readProjectDecisionFacts(projectRoot);
    const tombstonedIds = readTombstonedIds(projectRoot);
    const before = existingContent;
    const next = updateDecisionsJournal({
      existingContent,
      facts,
      tombstonedIds,
      now: now ?? new Date().toISOString(),
    });
    if (next !== before) {
      writeFileSync(path, next, 'utf8');
      return { written: true, path, appended: next.length - before.length };
    }
    return { written: false, path, appended: 0 };
  } catch (err) {
    return { written: false, error: err?.message ?? String(err) };
  }
}
