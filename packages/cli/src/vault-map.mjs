// vault-map.mjs — the Obsidian vault map note (Task 254, D-397 companion to the
// own-UI viewer / Task 255).
//
// `context/memory/` is already markdown + frontmatter, so Obsidian opens it as a
// vault for free. What Obsidian's graph/backlinks need to LIGHT UP is resolvable
// links — and the existing corpus's own edges don't resolve on their own: fact
// files are named `<type>_<slug>.md`, but the edges the kit writes reference the
// bare `<slug>` (`related:` frontmatter, `[[slug]]` body wikilinks) or an id
// (`superseded_by`), none of which Obsidian resolves to a `<type>_<slug>.md`
// file by default. Rewriting 2,000 committed fact files to fix that is a
// migration we deliberately do NOT do (Task 254 hard constraint).
//
// Instead: a SINGLE GENERATED map note that renders every fact as a resolvable
// `[[<type>_<slug>]]` wikilink (the filename basename Obsidian DOES resolve) with
// its edges rendered as links too. It lights up the whole corpus graph WITHOUT
// touching any fact file — a pure EXPORT-FORMAT over the same markdown reindex
// already walks (ADR-0002: markdown is the only source of truth; this note is a
// derived, regenerable view, exactly like INDEX.md). Written by reindex.mjs
// beside INDEX.md; byte-stable so two rebuilds over the same corpus are identical.
//
// SHARED-MODULE DISCIPLINE (CLAUDE.md): edge extraction reuses graph-index's
// pure parsers (`extractWikilinks`, `relatedSlugs`, `slugForFactFilename`) — the
// SAME relation model the `edges` table is built from (Task 232) — never a
// re-rolled regex; ordering uses audit-log's `compareCodeUnits`. This is a pure
// string builder: no file IO, no DB. buildVaultMap's OUTPUT IS BYTE-STABLE
// (two builds over the same corpus are identical) — the byte-stability test +
// the committed-map determinism depend on it; every sort here is an EXPLICIT
// code-unit comparator (never locale-dependent) for exactly that reason.

import {
  extractWikilinks,
  relatedSlugs,
  slugForFactFilename,
  computeCitations,
} from './graph-index.mjs';
import { compareCodeUnits } from './audit-log.mjs';

const TIER_LABEL = {
  P: 'project tier',
  L: 'local tier',
  U: 'user tier',
};

// Recover the fact `type` from a `<type>_<slug>.md` filename for grouping.
// Anything without a known type prefix groups under `other` (defensive — the
// walk only yields real fact files, but a hand-dropped file shouldn't crash).
const FACT_TYPE_PREFIX = /^(user|feedback|project|reference|judgment)_/;
function typeForFilename(filename) {
  const m = FACT_TYPE_PREFIX.exec(String(filename));
  return m ? m[1] : 'other';
}

/** Filename basename (no `.md`) — the wikilink target Obsidian resolves. */
function basenameNoExt(filename) {
  return String(filename).replace(/\.md$/i, '');
}

/** Collapse internal whitespace so a multi-line title stays one map line. */
function oneLine(text) {
  return String(text ?? '').replace(/\s+/g, ' ').trim();
}

// Build slug→basename and id→basename resolution maps from the live corpus
// (first writer of a key wins, matching graph-index's slug→id precedence). Lets
// a `related`/`[[slug]]` reference or a `superseded_by` id resolve to a target.
function buildResolutionMaps(facts) {
  const slugToBase = new Map();
  const idToBase = new Map();
  for (const f of facts) {
    const base = basenameNoExt(f.filename);
    const slug = slugForFactFilename(f.filename);
    if (slug && !slugToBase.has(slug)) slugToBase.set(slug, base);
    if (f.id && !idToBase.has(f.id)) idToBase.set(f.id, base);
  }
  return { slugToBase, idToBase };
}

/** Group facts by their type prefix, preserving corpus order within a group. */
function groupFactsByType(facts) {
  const byType = new Map();
  for (const f of facts) {
    const t = typeForFilename(f.filename);
    if (!byType.has(t)) byType.set(t, []);
    byType.get(t).push(f);
  }
  return byType;
}

// The distinct relation targets for one fact: `related:` frontmatter ∪ body
// `[[slug]]` wikilinks (the SAME union graph-index surfaces as a fact's
// out-neighbourhood), deduped in first-seen order.
function relationSlugsFor(fact) {
  const out = [];
  const seen = new Set();
  for (const s of [...relatedSlugs(fact.frontmatter?.related), ...extractWikilinks(fact.body)]) {
    if (!seen.has(s)) {
      seen.add(s);
      out.push(s);
    }
  }
  return out;
}

// The `  - related: …` line for one fact, or null when it has no (non-self)
// relations. A slug pointing back at THIS fact is a self-edge (dropped); a
// resolved target renders as a wikilink; an unresolved (dangling) slug renders
// as plain code text — visible but not a phantom graph node.
function renderRelatedLine(fact, selfBase, slugToBase) {
  const rendered = [];
  const seenTarget = new Set();
  for (const s of relationSlugsFor(fact)) {
    const base = slugToBase.get(s);
    if (!base) {
      rendered.push({ resolved: false, text: s });
      continue;
    }
    if (base === selfBase || seenTarget.has(base)) continue; // self-edge / dup
    seenTarget.add(base);
    rendered.push({ resolved: true, text: base });
  }
  if (!rendered.length) return null;
  // Byte-stable: resolved links first, dangling last; each group in code-unit
  // order (explicit comparator — never locale-dependent).
  rendered.sort((a, b) => {
    if (a.resolved !== b.resolved) return a.resolved ? -1 : 1;
    return compareCodeUnits(a.text, b.text);
  });
  const body = rendered.map((r) => (r.resolved ? `[[${r.text}]]` : `\`${r.text}\``)).join(', ');
  return `  - related: ${body}`;
}

// The `  - superseded by: …` line, or null when the fact has no `superseded_by`.
// Resolve to the live successor's filename when it's in the corpus; else emit
// the bare `[[id]]` (resolves via the successor's id alias — Task 254 shape a —
// or shows as a phantom, honest either way: a superseded fact is MOVED to
// archive/ so its successor may legitimately not be in this walk).
function renderSupersededLine(fact, idToBase) {
  const sup = fact.frontmatter?.superseded_by;
  if (typeof sup !== 'string' || !sup.trim()) return null;
  const key = sup.trim();
  const base = idToBase.get(key);
  return `  - superseded by: [[${base ?? key}]]`;
}

/** The lines for one fact: its wikilink entry + any edge lines. */
function renderFactEntry(fact, slugToBase, idToBase) {
  const selfBase = basenameNoExt(fact.filename);
  const lines = [`- [[${selfBase}]] — ${oneLine(fact.frontmatter?.title) || '(untitled)'}`];
  const related = renderRelatedLine(fact, selfBase, slugToBase);
  if (related) lines.push(related);
  const superseded = renderSupersededLine(fact, idToBase);
  if (superseded) lines.push(superseded);
  return lines;
}

// The lines for one type group: heading + the group's facts sorted by id
// (explicit code-unit comparator — byte-stable across rebuilds).
function renderGroup(type, groupFacts, slugToBase, idToBase) {
  const sorted = [...groupFacts].sort((a, b) => compareCodeUnits(a.id, b.id));
  const lines = ['', `## ${type}`, ''];
  for (const f of sorted) lines.push(...renderFactEntry(f, slugToBase, idToBase));
  return lines;
}

// Task 256 — the `## Cited anchors` constellation section. Doc-anchors
// (D-nnn/Task nnn/ADR/FR/NFR) densely cited across fact BODIES become visible
// hubs: each qualifying anchor lists the facts that cite it as wikilinks, so the
// map (already the graph's hub note) clusters around decision/task anchors.
// Reuses graph-index.computeCitations — the SAME guard/aggregation the `edges`
// table is built from (Task 232/256), so the map and the queryable graph never
// drift. Byte-stable: anchors sorted by their display token, citers by base,
// both with the explicit code-unit comparator (never locale-dependent).
function renderAnchorSection(facts, idToBase) {
  const { qualifying, anchorCiters } = computeCitations(facts);
  if (qualifying.size === 0) return [];
  const anchors = [...qualifying]
    .map((node) => ({ node, label: node.slice('anchor:'.length) }))
    .sort((a, b) => compareCodeUnits(a.label, b.label));
  const lines = ['', '## Cited anchors', ''];
  for (const { node, label } of anchors) {
    const bases = [...anchorCiters.get(node)]
      .map((id) => idToBase.get(id))
      .filter(Boolean)
      .sort(compareCodeUnits);
    if (!bases.length) continue; // every citer resolved out of the walk (defensive)
    const links = bases.map((b) => `[[${b}]]`).join(', ');
    lines.push(`- **${label}** ← ${links}`);
  }
  return lines;
}

/** The map's header block (title + generated banner + fact count). */
function buildHeader(tier, factCount) {
  return [
    `# Memory vault map — ${TIER_LABEL[tier] ?? 'project tier'}`,
    '',
    '<!-- GENERATED by `cmk reindex` — do not edit; rewritten on every memory write. -->',
    '<!-- Browse this folder as an Obsidian vault. Each [[link]] opens a fact file. -->',
    '<!-- How to open + the read-vs-write rule: docs/OBSIDIAN.md -->',
    '',
    `Facts: ${factCount}`,
  ];
}

/**
 * Build the MAP.md content for one tier's fact corpus. Pure + deterministic
 * (byte-stable across rebuilds over the same corpus).
 *
 * @param {Array<{id: string, filename: string, frontmatter: object, body: string}>} facts
 *   Parsed facts (the shape fact-store's `eachFactIn` yields). Tombstoned/
 *   malformed facts should already be filtered by the caller (reindex does).
 * @param {object} [opts]
 * @param {'P'|'L'|'U'} [opts.tier='P']
 * @returns {string} the MAP.md markdown
 */
export function buildVaultMap(facts, { tier = 'P' } = {}) {
  const { slugToBase, idToBase } = buildResolutionMaps(facts);
  const byType = groupFactsByType(facts);
  // Sort type headings with an EXPLICIT code-unit comparator (S2871). The
  // default Array#sort is already UTF-16 code-unit order — deterministic +
  // locale-independent, which byte-stability REQUIRES — but stating it
  // explicitly (never localeCompare) locks that guarantee against drift.
  const types = [...byType.keys()].sort(compareCodeUnits);
  const lines = buildHeader(tier, facts.length);
  for (const t of types) {
    lines.push(...renderGroup(t, byType.get(t), slugToBase, idToBase));
  }
  lines.push(...renderAnchorSection(facts, idToBase));
  return lines.join('\n') + '\n';
}
