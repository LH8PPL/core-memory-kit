// graduation.mjs — Task 91 (D-54 / D-57). The 3rd MEMORY.md shrink mechanism.
//
// When appendScratchpadBullet() hits cap pressure and consolidate() (stale-drop)
// can't free enough — because high-trust bullets are NEVER dropped — graduation
// moves the OLDEST high-trust bullets OUT of the byte-capped hot index into the
// permanent, indexed fact store (context/memory/<type>_<slug>.md via writeFact),
// so the new write lands instead of returning CAP_EXCEEDED.
//
// Decision A (D-57): SEARCH-ONLY (graduated facts are not injected; reliable
// recall of them is Task 75, v0.3) and PROJECT MEMORY.md ONLY — the caller gates
// the tier/scratchpad so this never fires on user-tier persona scratchpads.
//
// Reuses writeFact(), which gives four lifecycle-edge guarantees for free:
//   - cross-store dedup (content-id keyed → re-graduating the same fact is a
//     no-op `skipped`, not a duplicate file),
//   - home-path sanitization + Poison_Guard (the safe write path),
//   - reindex-on-write (the FTS5/INDEX.md view stays consistent — map edge #8).

import { writeFact } from './write-fact.mjs';
import { parseBulletProvenance, isProvenanceCommentLine } from './provenance.mjs';

// Loose enough to match whatever id a bullet carries (graduation moves the
// bullet regardless of id-alphabet validity; that's the writer's concern).
const BULLET_RE = /^- \(([PUL]-[A-Za-z0-9]+)\)\s*(.*)$/;

const VALID_WRITE_SOURCES = new Set([
  'user-explicit',
  'auto-extract',
  'compressor',
  'manual-edit',
  'imported',
]);

function slugify(s) {
  // Collapse non-alphanumerics to single dashes, cap, trim edges (string ops,
  // no trailing-dash quantifier — matches subcommands.slugifyFact's ReDoS-safe
  // shape).
  let base = String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
  if (base.startsWith('-')) base = base.slice(1);
  if (base.endsWith('-')) base = base.slice(0, -1);
  return base || 'fact';
}

function deriveTitle(text) {
  const t = String(text).trim().slice(0, 80).trim();
  return t || 'graduated fact';
}

// One bullet → one project-tier fact file. writeFact action 'error' means it
// could NOT be stored (collision / poison / schema) → the caller must keep the
// bullet; anything else ('created' or a dedup 'skipped') means it's safely in
// the permanent store → the caller removes the bullet from the hot index.
function graduateOne({ id, text, prov, tier, projectRoot, userDir, now }) {
  // Slug carries a content-derived tail so two distinct facts never collide on
  // `project_<slug>.md`, while the SAME fact re-graduates to the same filename
  // (→ writeFact dedups by id instead of creating a duplicate).
  const slugTail = id.replace(/^[PUL]-/, '').toLowerCase();
  return writeFact({
    tier,
    type: 'project',
    slug: `${slugify(text)}-${slugTail}`,
    title: deriveTitle(text),
    body: text,
    writeSource: VALID_WRITE_SOURCES.has(prov.write) ? prov.write : 'manual-edit',
    trust: 'high',
    sourceFile: prov.source || 'MEMORY.md',
    sourceLine: prov.source_line || 1,
    sourceSha1: prov.sha1,
    id, // preserve the citation id across graduation; also the dedup key
    createdAt: prov.at, // keep the original capture time
    projectRoot,
    userDir,
    now,
  });
}

/**
 * Graduate oldest high-trust bullets out of `text` until it fits `capBytes`.
 *
 * @returns {{ text: string, graduated: string[] }} the new scratchpad content
 *   (graduated bullets removed) and the ids that were graduated.
 */
export function graduateForCapRelief({
  text,
  capBytes,
  tier,
  projectRoot,
  userDir,
  now,
}) {
  const lines = text.split('\n');
  const entries = [];
  for (let i = 0; i < lines.length - 1; i++) {
    const m = lines[i].match(BULLET_RE);
    if (!m) continue;
    if (!isProvenanceCommentLine(lines[i + 1])) continue;
    const prov = parseBulletProvenance(lines[i + 1]);
    if (!prov || prov.trust !== 'high' || !prov.at) continue;
    entries.push({ bulletIdx: i, commentIdx: i + 1, id: m[1], text: m[2], prov });
  }
  // Feasibility gate (composition safety): if graduating EVERY eligible bullet
  // still wouldn't get under cap, graduate NOTHING. Otherwise writeFact would
  // persist fact files that the failed-append error path then strands — the
  // bullets stay in the unchanged on-disk MEMORY.md AND now also exist as fact
  // files: the exact double-capture this task exists to kill. Returning early
  // lets CAP_EXCEEDED fire cleanly with zero side effects.
  const bulletBytes = (e) =>
    Buffer.byteLength(`${lines[e.bulletIdx]}\n${lines[e.commentIdx]}\n`, 'utf8');
  const totalGraduatable = entries.reduce((sum, e) => sum + bulletBytes(e), 0);
  const startBytes = Buffer.byteLength(text, 'utf8');
  if (startBytes - totalGraduatable > capBytes) {
    return { text, graduated: [] };
  }

  // Oldest first: graduate aged durable facts before recent ones. The just-
  // appended bullet (newest `at`) sorts last and only graduates if still needed.
  entries.sort(
    (a, b) => new Date(a.prov.at).getTime() - new Date(b.prov.at).getTime(),
  );

  const removeIdx = new Set();
  const graduated = [];
  let curBytes = Buffer.byteLength(text, 'utf8');
  for (const e of entries) {
    if (curBytes <= capBytes) break;
    const res = graduateOne({
      id: e.id,
      text: e.text,
      prov: e.prov,
      tier,
      projectRoot,
      userDir,
      now,
    });
    if (res.action === 'error') continue; // couldn't store → keep the bullet
    removeIdx.add(e.bulletIdx);
    removeIdx.add(e.commentIdx);
    graduated.push(e.id);
    curBytes -= Buffer.byteLength(
      `${lines[e.bulletIdx]}\n${lines[e.commentIdx]}\n`,
      'utf8',
    );
  }

  if (removeIdx.size === 0) return { text, graduated: [] };
  const out = lines.filter((_, i) => !removeIdx.has(i)).join('\n');
  return { text: out, graduated };
}
