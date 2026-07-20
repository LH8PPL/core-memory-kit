#!/usr/bin/env node
// validate-docs.mjs — the ONE manifest-driven documentation validator
// (Task 186, the D-249 structural graduation).
//
// Why one script
// --------------
//
// Doc-coverage used to be FOUR overlapping validators — validate-doc-registry
// (new-file registration), validate-references (link/ID rot),
// validate-index-completeness (catalog indexes), validate-doc-completeness
// (CLI/MCP verb+tool coverage + deferral honesty) — redundant where they
// overlapped, gap-ridden where none reached (the v0.4.3 stale-docs find).
// D-249 unified the JUDGMENT layer into one per-change walk over the
// source-of-truth table; THIS script unifies the STRUCTURAL layer: one
// entry, one manifest, four check FAMILIES. To add a doc there is ONE
// place: docs/DOCUMENTATION-MAP.md (the manifest).
//
// Original plan (pre-2026-07-20): four standalone scripts, each wired
// separately into `npm test` (see git history for their sources). Pivoted
// by Task 186: their logic lives on here as families with behavior
// preserved (the four scripts-validate-* test suites still pin each
// family through this entry).
//
// The manifest
// ------------
//
// docs/DOCUMENTATION-MAP.md is the single input:
//   - its Registry section lists every high-risk working doc (LIVING docs);
//   - bulk history dirs (docs/research, docs/sources, docs/process,
//     docs/adr, docs/conversation-log, archive) are RECORD zones —
//     registered by zone, never policed file-by-file, never flagged.
//
// The classification is explicit in ZONES below (living high-risk zones vs
// record zones); the file-level membership lives in the map.
//
// Families
// --------
//
//   registry    — every high-risk-zone .md is registered in the map
//                 (direction 1) AND every path-shaped Registry entry exists
//                 on disk (direction 2 — NEW in the consolidation; the old
//                 registry validator was one-directional).
//   references  — internal-reference rot: [label](path), [label](path#anchor),
//                 ADR-NNNN, §N.N (design.md), FR-N, NFR-N, Task N.
//   catalogs    — the hand-maintained catalog indexes (adr/README,
//                 research/INDEX, sources/README, process/README) list every
//                 sibling .md, both directions.
//   coverage    — every CLI verb has a CLI.md heading; every MCP tool +
//                 zod param appears in MCP.md; deferral phrases are
//                 allowlisted with reasons (both directions).
//
// What this does NOT do (honest scope boundary, per the task): judge
// content-STALENESS ("is this §N current for the change") — that stays the
// D-249 per-change walk's judgment. This script owns existence / link /
// registration / coverage only.
//
// Suppression
// -----------
//
// `<!-- validate-docs: ignore -->` on the same line as a reference
// suppresses it. The legacy `<!-- validate-references: ignore -->` marker
// (pre-consolidation) is honored forever — existing docs carry it.
//
// Run: `node scripts/validate-docs.mjs [--only <family>[,<family>...]]`
// Wired into `npm test` as a pre-test step. Honors CMK_VALIDATOR_ROOT for
// sandboxed self-tests (fixture roots should use --only to select the
// family under test; the coverage family needs the real repo's sources).

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve, dirname, relative, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const SCRIPT_REPO = resolve(dirname(__filename), '..');
const REPO = process.env.CMK_VALIDATOR_ROOT
  ? resolve(process.env.CMK_VALIDATOR_ROOT)
  : SCRIPT_REPO;

const MAP_REL = 'docs/DOCUMENTATION-MAP.md';
const SUPPRESSIONS = ['validate-docs: ignore', 'validate-references: ignore'];

/**
 * The living-vs-record classification (the map's zones, as data).
 *
 * `livingHighRisk` — where rogue state surfaces historically appeared; every
 * .md here must be registered in the map. `record` — bulk history dirs,
 * registered by zone, never policed file-by-file (a new research note or
 * ADR is expected history, not a new state surface). `record` dirs marked
 * refSkip are also excluded from the references scan (their internal refs
 * are third-party/frozen worlds — the PR-C audit's corpus boundary).
 */
export const ZONES = {
  livingHighRisk: [
    { dir: '.', recursive: false }, // repo-root *.md
    { dir: 'specs', recursive: true },
    { dir: 'docs', recursive: false },
    { dir: 'docs/journey', recursive: false },
  ],
  record: [
    { dir: 'docs/research', refSkip: true },
    { dir: 'docs/sources', refSkip: true },
    { dir: 'docs/conversation-log', refSkip: true },
    { dir: 'archive', refSkip: true },
    { dir: 'docs/adr', refSkip: false }, // records, but ref-scanned (live citations point in)
    { dir: 'docs/process', refSkip: false },
  ],
};

function relPosix(root, abs) {
  return relative(root, abs).split(sep).join('/');
}

function topLevelMd(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.md'))
    .map((e) => join(dir, e.name));
}

function walkMdRec(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walkMdRec(p, out);
    else if (e.name.endsWith('.md')) out.push(p);
  }
  return out;
}

// ====================================================================
// Family: registry
// ====================================================================

/**
 * Path-shaped .md tokens from the map's Registry section (from the
 * `## Registry` heading to EOF). Accepts backticked or bare tokens; a
 * token is path-shaped when it is a repo-root filename or a specs/ or
 * docs/-prefixed path ending in .md. Tokens in other zones (archive/…)
 * are provenance prose, not registry entries.
 *
 * @param {string} mapText full DOCUMENTATION-MAP.md source
 * @returns {string[]} unique path-shaped registry entries
 */
export function parseRegistryEntries(mapText) {
  const idx = mapText.search(/^## Registry\b/m);
  if (idx === -1) return [];
  const section = mapText.slice(idx);
  const out = new Set();
  // BACKTICKED tokens ONLY — a registry ENTRY is structural (`path/to/doc.md`),
  // never free prose.
  //
  // Skill-review B3: matching bare tokens too made direction-2 harvest paths out
  // of ORDINARY SENTENCES. On the real map it was already pulling three paths from
  // a prose line ("_Reclassified 2026-05-31 …_"), green only because those files
  // happen to exist — and it would FAIL the build the moment the map narrated an
  // archived or renamed doc ("the old plan lived in docs/journey/OLD-PLAN.md
  // before it was archived"). That is exactly what the decision-trail-preservation
  // rule REQUIRES the map to be able to say, so the check would have punished the
  // repo for following its own binding rule. A validator that fires on correct
  // prose is worse than none; restrict to the structural form.
  const re = /`((?:[A-Za-z0-9._-]+|(?:specs|docs)\/[A-Za-z0-9._/-]+)\.md)`/g;
  for (const m of section.matchAll(re)) out.add(m[1]);
  return [...out];
}

function familyRegistry() {
  const errors = [];
  const mapAbs = join(REPO, ...MAP_REL.split('/'));
  if (!existsSync(mapAbs)) {
    return {
      errors: [
        `${MAP_REL} is missing. The documentation registry is the single manifest of where every doc lives; create it before adding working docs.`,
      ],
      summary: 'registry: MAP MISSING',
    };
  }
  const mapText = readFileSync(mapAbs, 'utf8');

  // Direction 1 — every high-risk-zone file is registered somewhere in the map.
  const highRisk = [];
  for (const zone of ZONES.livingHighRisk) {
    const abs = zone.dir === '.' ? REPO : join(REPO, ...zone.dir.split('/'));
    highRisk.push(...(zone.recursive ? walkMdRec(abs) : topLevelMd(abs)));
  }
  const seen = new Set();
  for (const abs of highRisk) {
    const rel = relPosix(REPO, abs);
    if (seen.has(rel)) continue;
    seen.add(rel);
    if (!mapText.includes(rel)) {
      errors.push(
        `${rel} — unregistered doc surface (not listed in ${MAP_REL}). Register it in the Registry section in the same change — or, if this is a new kind of state surface, DON'T: route the content into requirements/design/tasks.`,
      );
    }
  }

  // Direction 2 (NEW) — every path-shaped Registry entry exists on disk.
  const entries = parseRegistryEntries(mapText);
  for (const rel of entries) {
    if (!existsSync(join(REPO, ...rel.split('/')))) {
      errors.push(
        `${MAP_REL}: registers '${rel}' which does not exist — a stale registry entry (file renamed/deleted). Remove or fix the entry.`,
      );
    }
  }

  return {
    errors,
    summary: `registry: ${seen.size} high-risk doc(s) all registered, ${entries.length} manifest entr${entries.length === 1 ? 'y' : 'ies'} live`,
  };
}

// ====================================================================
// Family: references
// ====================================================================

function slugify(headingText) {
  return headingText
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function familyReferences() {
  const errors = [];

  const SKIP = new Set([
    // Per-template seed files have their own internal-reference world.
    join(REPO, 'template'),
    join(REPO, '.claude'),
    join(REPO, 'node_modules'),
    join(REPO, '.git'),
    // Record zones flagged refSkip (frozen/third-party reference worlds).
    ...ZONES.record.filter((z) => z.refSkip).map((z) => join(REPO, ...z.dir.split('/'))),
    // Dogfood volatile buffers (Task 52 / D-108): conversation capture is
    // data, not corpus — a growing now.md broke the prerun mid-stress once.
    join(REPO, 'context', 'sessions'),
    join(REPO, 'context', 'transcripts'),
    join(REPO, 'context.local'),
  ]);

  const mdFiles = [];
  (function walk(dir) {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (SKIP.has(path)) continue;
      if (entry.isDirectory()) walk(path);
      else if (entry.name.endsWith('.md')) mdFiles.push(path);
    }
  })(REPO);

  // ADR index.
  const adrDir = join(REPO, 'docs', 'adr');
  const adrFiles = new Set();
  if (existsSync(adrDir)) {
    for (const f of readdirSync(adrDir)) {
      const m = f.match(/^(\d{4})-/);
      if (m) adrFiles.add(m[1]);
    }
  }

  const readMdIfExists = (rel) => {
    const p = join(REPO, ...rel.split('/'));
    return existsSync(p) ? readFileSync(p, 'utf8') : '';
  };

  // FR / NFR / Task ID indexes. Any occurrence in the requirements corpus
  // counts as a definition — rot is "no occurrence anywhere". FR-13 and
  // FR-013 are DISTINCT keys deliberately (external specs use 3-digit IDs;
  // normalization would silently coerce them — see git history D1-MIN-E).
  const requirementsText =
    readMdIfExists('specs/requirements.md') +
    '\n' +
    readMdIfExists('specs/requirements-revisions-proposed.md');
  const indexIds = (text, prefix) => {
    const ids = new Set();
    for (const m of text.matchAll(new RegExp(`\\b${prefix}-(\\d+)\\b`, 'g'))) ids.add(m[1]);
    return ids;
  };
  const frIds = indexIds(requirementsText, 'FR');
  const nfrIds = indexIds(requirementsText, 'NFR');

  const taskIds = new Set();
  for (const line of readMdIfExists('specs/tasks.md').split(/\r?\n/)) {
    const m = line.match(/^\s*(?:#{1,6}\s+|[-*]\s+\[.\]\s+|[-*]\s+)?(\d{1,3})[.) ]/);
    if (m) taskIds.add(m[1]);
  }

  // Design-section anchors (§N.N).
  const designText = readMdIfExists('specs/design.md');
  const designSections = new Set();
  for (const m of designText.matchAll(/^\s*#{2,6}\s+(\d+(?:\.\d+){0,3})[.\s]/gm)) {
    designSections.add(m[1]);
  }

  // Heading-slug index per file (for [label](file#anchor)).
  const slugIndex = new Map();
  for (const path of mdFiles) {
    const slugs = new Set();
    try {
      const text = readFileSync(path, 'utf8');
      for (const m of text.matchAll(/^#{1,6}\s+(.+?)\s*$/gm)) slugs.add(slugify(m[1]));
    } catch {
      /* unreadable; reported when referenced */
    }
    slugIndex.set(path, slugs);
  }

  const record = (file, lineNumber, message) => {
    errors.push(`${relPosix(REPO, file)}:${lineNumber}: ${message}`);
  };
  const isHttpUrl = (s) => /^(?:https?:)?\/\//i.test(s) || s.startsWith('mailto:');

  const FILE_LINK_RE = /\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
  const ADR_RE = /\bADR-(\d{4})\b/g;
  const DESIGN_SECTION_RE = /§(\d+(?:\.\d+){0,3})/g;
  const FR_RE = /\bFR-(\d+)\b/g;
  const NFR_RE = /\bNFR-(\d+)\b/g;
  const TASK_RE = /\bTask\s+(\d+)(?:[.)\s]|$)/g;

  for (const file of mdFiles) {
    let text;
    try {
      text = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    const fileDir = dirname(file);
    const lines = text.split(/\r?\n/);

    // Fence tracking with fence-length semantics (CommonMark: an opening
    // fence of N backticks closes only on a same-char fence of length >= N,
    // so ``` examples nest inside ```` blocks without toggling state).
    let fenceLen = 0;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const fenceMatch = line.match(/^\s*(`{3,})\s*\S*\s*$/);
      if (fenceMatch) {
        const len = fenceMatch[1].length;
        if (fenceLen === 0) fenceLen = len;
        else if (len >= fenceLen) fenceLen = 0;
        continue;
      }
      if (fenceLen > 0) continue;
      if (SUPPRESSIONS.some((s) => line.includes(s))) continue;
      const lineNumber = i + 1;
      // Inline-code spans are illustrative — strip before scanning.
      const scanLine = line.replace(/`[^`]*`/g, '');

      FILE_LINK_RE.lastIndex = 0;
      let m;
      while ((m = FILE_LINK_RE.exec(scanLine)) !== null) {
        const target = m[2];
        if (isHttpUrl(target)) continue;
        const [pathPart, anchor] = target.split('#');
        if (pathPart === '') {
          if (anchor && !slugIndex.get(file)?.has(slugify(decodeURIComponent(anchor)))) {
            record(file, lineNumber, `intra-file anchor "${anchor}" not found in this document`);
          }
          continue;
        }
        const resolved = resolve(fileDir, pathPart.split('/').join(sep));
        if (!existsSync(resolved)) {
          record(
            file,
            lineNumber,
            `broken link target: ${target} (resolved to ${relPosix(REPO, resolved)})`,
          );
          continue;
        }
        if (anchor && resolved.endsWith('.md')) {
          const slugs = slugIndex.get(resolved);
          if (slugs) {
            if (!slugs.has(slugify(decodeURIComponent(anchor)))) {
              record(file, lineNumber, `anchor "${anchor}" not found in ${relPosix(REPO, resolved)}`);
            }
          } else if (process.env.CMK_REFS_DEBUG === '1') {
            // Out-of-corpus .md target — anchor un-checked; quiet by default.
            console.error(
              `validate-docs: DEBUG anchor "${anchor}" on out-of-corpus target ${relPosix(REPO, resolved)} (skipped) — referenced from ${relPosix(REPO, file)}:${lineNumber}`,
            );
          }
        }
      }

      ADR_RE.lastIndex = 0;
      while ((m = ADR_RE.exec(scanLine)) !== null) {
        if (!adrFiles.has(m[1])) {
          record(file, lineNumber, `ADR-${m[1]} has no file under docs/adr/`);
        }
      }

      // §N.N is only enforced inside design.md itself (elsewhere the
      // convention is `design §N.N` prose we can't parse reliably).
      if (file === join(REPO, 'specs', 'design.md')) {
        DESIGN_SECTION_RE.lastIndex = 0;
        while ((m = DESIGN_SECTION_RE.exec(scanLine)) !== null) {
          if (!designSections.has(m[1])) {
            record(file, lineNumber, `§${m[1]} has no matching heading in design.md`);
          }
        }
      }

      FR_RE.lastIndex = 0;
      while ((m = FR_RE.exec(scanLine)) !== null) {
        if (!frIds.has(m[1])) {
          record(file, lineNumber, `FR-${m[1]} not defined in requirements.md or requirements-revisions-proposed.md`);
        }
      }

      NFR_RE.lastIndex = 0;
      while ((m = NFR_RE.exec(scanLine)) !== null) {
        if (!nfrIds.has(m[1])) {
          record(file, lineNumber, `NFR-${m[1]} not defined in requirements.md or requirements-revisions-proposed.md`);
        }
      }

      TASK_RE.lastIndex = 0;
      while ((m = TASK_RE.exec(scanLine)) !== null) {
        if (!taskIds.has(m[1])) {
          record(file, lineNumber, `Task ${m[1]} not defined in tasks.md`);
        }
      }
    }
  }

  return {
    errors,
    summary: `references: ${mdFiles.length} markdown files scanned (${adrFiles.size} ADR / ${frIds.size} FR / ${nfrIds.size} NFR / ${taskIds.size} Task IDs indexed)`,
  };
}

// ====================================================================
// Family: catalogs
// ====================================================================

/**
 * The catalog docs to police. Each: the dir (repo-relative posix), the index
 * file within it, and any siblings deliberately NOT indexed (allowlist).
 * The index file itself is auto-excluded — an index need not link itself.
 */
export const CATALOG_INDEXES = [
  { dir: 'docs/adr', indexFile: 'README.md', exclude: [] },
  { dir: 'docs/research', indexFile: 'INDEX.md', exclude: [] },
  { dir: 'docs/sources', indexFile: 'README.md', exclude: [] },
  { dir: 'docs/process', indexFile: 'README.md', exclude: [] },
];

/**
 * Extract same-directory `.md` link targets from a markdown body. Inline links
 * `[text](target.md)` only; skips external URLs, anchors, and paths that
 * escape the directory. Drops `#anchor` / `?query` suffixes.
 *
 * @param {string} md the markdown source
 * @returns {string[]} unique same-dir `.md` targets
 */
export function extractLinkedFiles(md) {
  const out = new Set();
  const re = /\]\(([^)]+)\)/g;
  let m;
  while ((m = re.exec(md)) !== null) {
    let target = m[1].trim();
    target = target.replace(/\s+["'].*$/, '');
    target = target.replace(/[#?].*$/, '');
    if (target === '') continue;
    if (/^[a-z][a-z0-9+.-]*:/i.test(target)) continue;
    if (target.startsWith('#')) continue;
    if (target.includes('/')) continue;
    if (!target.toLowerCase().endsWith('.md')) continue;
    out.add(target);
  }
  return [...out];
}

/** Real `.md` filenames directly under cfg.dir (non-recursive — siblings only). */
export function listSiblingMarkdown(cfg) {
  const abs = join(REPO, ...cfg.dir.split('/'));
  return readdirSync(abs, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.toLowerCase().endsWith('.md'))
    .map((e) => e.name)
    .sort();
}

/**
 * Pure check. Every sibling .md (minus the index file + allowlisted
 * exclusions) must appear in `linked`; every `linked` entry must exist.
 *
 * @param {object} a
 * @param {string}   a.dir        repo-relative dir (for messages)
 * @param {string}   [a.indexFile] the index filename, auto-excluded
 * @param {string[]} a.linked     `.md` targets the index links
 * @param {string[]} a.siblings   real `.md` filenames in the dir
 * @param {string[]} [a.exclude]  siblings deliberately not indexed
 * @returns {string[]} human-readable errors ([] = OK)
 */
export function checkIndexCompleteness({ dir, indexFile, linked, siblings, exclude = [] }) {
  const errors = [];
  const excludeSet = new Set([...(exclude ?? []), ...(indexFile ? [indexFile] : [])]);
  const linkedSet = new Set(linked);
  const siblingSet = new Set(siblings);

  for (const file of siblings) {
    if (excludeSet.has(file)) continue;
    if (!linkedSet.has(file)) {
      errors.push(
        `${dir}/${indexFile ?? 'index'}: sibling '${file}' is not listed — the index has drifted behind the directory. ` +
          `Add a link to it, or add it to the validator's exclude list if it is deliberately uncatalogued.`,
      );
    }
  }
  for (const file of linked) {
    if (excludeSet.has(file)) continue;
    if (!siblingSet.has(file)) {
      errors.push(
        `${dir}/${indexFile ?? 'index'}: links '${file}' which does not exist — a stale entry (file renamed/deleted). ` +
          `Remove or fix the link.`,
      );
    }
  }
  return errors;
}

function familyCatalogs() {
  const errors = [];
  let totalChecked = 0;
  for (const cfg of CATALOG_INDEXES) {
    const indexPath = join(REPO, ...cfg.dir.split('/'), cfg.indexFile);
    if (!existsSync(indexPath)) {
      errors.push(`${cfg.dir}/${cfg.indexFile}: index file not found`);
      continue;
    }
    const linked = extractLinkedFiles(readFileSync(indexPath, 'utf8'));
    const siblings = listSiblingMarkdown(cfg);
    totalChecked += siblings.length;
    errors.push(
      ...checkIndexCompleteness({
        dir: cfg.dir,
        indexFile: cfg.indexFile,
        linked,
        siblings,
        exclude: cfg.exclude,
      }),
    );
  }
  return {
    errors,
    summary: `catalogs: ${CATALOG_INDEXES.length} catalog index(es), ${totalChecked} sibling file(s) all listed`,
  };
}

// ====================================================================
// Family: coverage (CLI.md / MCP.md / deferral honesty)
// ====================================================================

// Commands that deliberately have no CLI.md section, each with a reason.
export const CLI_DOC_EXEMPT = new Map([
  ['help', 'commander built-in (auto-generated help text)'],
  ['version', 'trivial — `cmk --version` is shown in the quickstart'],
]);

// Legitimate deferral phrases — each entry pins ONE documented stub.
// Shipping the feature means deleting both the phrase and its entry here.
// Decision trail (preserved from the pre-consolidation script per the
// decision-trail-preservation rule — skill-review M7 caught its loss):
//   - `config` shipped real in Task 129 (D-121) — its stub deferral entry removed.
//   - `purge` shipped real in Task 96 (ADR-0022, D-346) — its entry removed.
export const DEFERRAL_ALLOWLIST = [];

const DEFERRAL_PATTERN = /not yet (shipped|implemented)|deferred to a later release/i;
const USER_FACING_DOCS = ['README.md', 'packages/cli/README.md', 'docs/CLI.md', 'docs/MCP.md'];

// Full regex-escape (CodeQL js/incomplete-sanitization).
const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&');

/** Check — every CLI verb has a CLI.md heading mention. Pure. */
export function checkCliDocs({ cliVerbs, cliDocText, exempt = CLI_DOC_EXEMPT }) {
  const errors = [];
  const headings = cliDocText
    .split('\n')
    .filter((l) => l.startsWith('### '))
    .join('\n');
  for (const verb of cliVerbs) {
    if (exempt.has(verb)) continue;
    // The verb must appear DIRECTLY after `cmk ` in some heading — a loose
    // contains-match would false-pass 'get' via '### cmk config get'.
    const re = new RegExp(`cmk ${escapeRegExp(verb)}\\b`);
    if (!re.test(headings)) {
      errors.push(
        `CLI.md: command 'cmk ${verb}' has no \`### \` section heading — document it (or add it to CLI_DOC_EXEMPT with a reason)`,
      );
    }
  }
  return errors;
}

/** Check — every MCP tool + every schema param appears in MCP.md. Pure. */
export function checkMcpDocs({ toolParams, mcpDocText }) {
  const errors = [];
  for (const [tool, params] of toolParams) {
    if (!mcpDocText.includes(tool)) {
      errors.push(`MCP.md: tool '${tool}' is not documented`);
      continue;
    }
    for (const param of params) {
      if (!new RegExp(`\\b${param}\\b`).test(mcpDocText)) {
        errors.push(`MCP.md: tool '${tool}' parameter '${param}' is not documented`);
      }
    }
  }
  return errors;
}

/** Check — deferral phrases require an allowlist entry, both directions. Pure. */
export function checkDeferralPhrases({ docs, allowlist = DEFERRAL_ALLOWLIST }) {
  const errors = [];
  const used = new Set();
  for (const { path, text } of docs) {
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (!DEFERRAL_PATTERN.test(lines[i])) continue;
      const hit = allowlist.findIndex(
        (a) => a.file === path && lines[i].includes(a.mustContain),
      );
      if (hit === -1) {
        errors.push(
          `${path}:${i + 1}: deferral phrase without an allowlist entry — either the feature shipped (delete the phrase) or it's a legitimate stub (add a DEFERRAL_ALLOWLIST entry with a reason): ${lines[i].trim().slice(0, 100)}`,
        );
      } else {
        used.add(hit);
      }
    }
  }
  allowlist.forEach((a, i) => {
    if (!used.has(i)) {
      errors.push(
        `DEFERRAL_ALLOWLIST entry ${i} ('${a.mustContain}' in ${a.file}) matched nothing — the stub shipped or the wording moved; remove/update the entry`,
      );
    }
  });
  return errors;
}

/** Parse tool → Set(param names) from mcp-server.mjs source. */
export function parseMcpToolParams(src) {
  const out = new Map();
  const segments = src.split(/registerTool\(\s*['"]/).slice(1);
  for (const seg of segments) {
    const tool = seg.match(/^([a-z_]+)['"]/)?.[1];
    if (!tool) continue;
    const schemaStart = seg.indexOf('inputSchema:');
    if (schemaStart === -1) {
      out.set(tool, new Set());
      continue;
    }
    // Bounded to the segment so the NEXT tool's keys can't bleed in.
    const block = seg.slice(schemaStart, seg.indexOf('},', schemaStart) + 1);
    out.set(tool, new Set([...block.matchAll(/\b([a-z_]+):\s*z\./g)].map((m) => m[1])));
  }
  return out;
}

async function familyCoverage() {
  // The verb list + tool schemas come from the kit's SOURCES (the script's
  // own repo); the docs come from REPO (root-overridable). In practice both
  // are the real repo — fixture tests select other families via --only.
  // Skill-review I4: under a fixture CMK_VALIDATOR_ROOT these reads threw a raw
  // ENOENT stack trace instead of a diagnostic. The header said fixture roots
  // "should use --only", which is prose, not enforcement. Fail with a real error.
  const missing = [];
  const readDoc = (rel) => {
    const abs = join(REPO, ...rel.split('/'));
    if (!existsSync(abs)) {
      missing.push(rel);
      return '';
    }
    return readFileSync(abs, 'utf8');
  };

  const { subcommands } = await import(
    pathToFileURL(join(SCRIPT_REPO, 'packages', 'cli', 'src', 'subcommands.mjs')).href
  );
  const cliVerbs = new Set(subcommands.map((s) => s.name));
  const cliDocText = readDoc('docs/CLI.md');
  const mcpDocText = readDoc('docs/MCP.md');
  const toolParams = parseMcpToolParams(
    readFileSync(join(SCRIPT_REPO, 'packages', 'cli', 'src', 'mcp-server.mjs'), 'utf8'),
  );
  const docs = USER_FACING_DOCS.map((p) => ({ path: p, text: readDoc(p) }));

  if (missing.length > 0) {
    return {
      errors: [
        `coverage: missing user-facing doc(s) under ${REPO}: ${missing.join(', ')} — ` +
          `the coverage family needs the real repo's docs (a sandboxed CMK_VALIDATOR_ROOT should select other families with \`--only\`)`,
      ],
      summary: 'coverage: SKIPPED (docs not found)',
    };
  }

  const errors = [
    ...checkCliDocs({ cliVerbs, cliDocText }),
    ...checkMcpDocs({ toolParams, mcpDocText }),
    ...checkDeferralPhrases({ docs }),
  ];
  const paramCount = [...toolParams.values()].reduce((n, s) => n + s.size, 0);
  return {
    errors,
    summary: `coverage: ${cliVerbs.size} CLI verbs documented, ${toolParams.size} MCP tools / ${paramCount} params documented, deferral phrases accounted`,
  };
}

// ====================================================================
// CLI
// ====================================================================

const FAMILIES = new Map([
  ['registry', familyRegistry],
  ['references', familyReferences],
  ['catalogs', familyCatalogs],
  ['coverage', familyCoverage],
]);

async function runCli() {
  const args = process.argv.slice(2);
  let selected = [...FAMILIES.keys()];
  const valid = [...FAMILIES.keys()].join(', ');
  const die = (msg) => {
    console.error(`validate-docs: ${msg} — valid families: ${valid}`);
    console.error('  usage: validate-docs.mjs [--only <family>[,<family>...]]');
    process.exit(1);
  };

  // Accept BOTH `--only x` and `--only=x`. Skill-review B2: matching only the
  // bare flag meant `--only=catalogs` was silently ignored and the run fell
  // through to ALL families — failing open in the opposite direction from B1.
  const onlyIdx = args.findIndex((a) => a === '--only' || a.startsWith('--only='));
  if (onlyIdx !== -1) {
    const arg = args[onlyIdx];
    const raw = arg.startsWith('--only=') ? arg.slice('--only='.length) : (args[onlyIdx + 1] ?? '');
    // Skill-review B1 (the worst one): `--only` with no value produced an EMPTY
    // selection, so the loop ran zero families and printed `OK` with exit 0 — a
    // validator reporting success while checking nothing. An empty value is now
    // the same loud error as an unknown family.
    const names = [...new Set(raw.split(',').map((s) => s.trim()).filter(Boolean))];
    if (names.length === 0) die("`--only` requires at least one family");
    for (const n of names) if (!FAMILIES.has(n)) die(`unknown family '${n}'`);
    selected = names;
  }
  // Reject unknown flags rather than ignoring them (the same fail-open class).
  for (const a of args) {
    if (a.startsWith('--') && a !== '--only' && !a.startsWith('--only=')) die(`unknown flag '${a}'`);
  }

  const summaries = [];
  let failed = false;
  const ranReferences = selected.includes('references');
  for (const name of selected) {
    const result = await FAMILIES.get(name)();
    if (result.errors.length > 0) {
      failed = true;
      console.error(`validate-docs[${name}]: FAIL — ${result.errors.length} issue(s)`);
      for (const e of result.errors) console.error('  - ' + e);
    }
    summaries.push(result.summary);
  }

  if (failed) {
    // Skill-review M6: the suppression hint only applies to the `references`
    // family — printing it after a registry/catalogs/coverage failure gave
    // irrelevant remediation (markers aren't honored outside references).
    if (ranReferences) {
      console.error('');
      console.error('  If a REFERENCE violation is intentional (e.g. a reserved-future ADR');
      console.error('  number), add <!-- validate-docs: ignore --> on the same line.');
      console.error('  (Suppression markers apply to the `references` family only.)');
    }
    process.exit(1);
  }
  console.log(`validate-docs: OK — ${summaries.join('; ')}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  runCli();
}
