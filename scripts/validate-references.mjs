#!/usr/bin/env node
// validate-references.mjs — internal-reference rot scanner.
//
// PR-C closed the prose-only audit of cross-references; this validator
// is the structural enforcement that CLAUDE.md's "primary-source
// verification" rule extension demanded (internal cross-references
// are subject to the same primary-source check as external citations).
//
// Reference classes enforced
// --------------------------
//
//   1. `[label](relative/path)` — file-link rot. Resolves the path
//      relative to the referencing file; reports broken paths.
//   2. `[label](path#anchor)` — anchor-link rot. Resolves the path,
//      then checks the anchor exists as a heading slug in the target.
//   3. `ADR-NNNN` (NNNN = 4 digits) — checks `docs/adr/NNNN-*.md` exists.
//   4. `§N.N` / `§N.N.N` (inside design.md only, for now) — checks the
//      heading exists somewhere in design.md.
//   5. `FR-N` / `FR-NN` — checks the ID appears as a definition in
//      requirements.md OR requirements-revisions-proposed.md.
//   6. `NFR-N` / `NFR-NN` — same as FR.
//   7. `Task N` / `Task NN` — checks the ID appears as a parent task
//      heading in tasks.md.
//
// Scope
// -----
//
// Scans every .md file under CLAUDE.md (repo root), specs/, docs/,
// HEALTH-CHECKS.md, SETUP.md, SOURCES.md, plus the *.md files at the
// repo root. Skips template/ (those are seed files for end-user
// installs; their internal refs are end-user-resolved, not kit-internal).
//
// Suppression
// -----------
//
// Add `<!-- validate-references: ignore -->` on the same line as a
// reference that intentionally points at a not-yet-shipping anchor
// (e.g., a roadmap doc that names a future ADR-NNNN by reserved
// number).
//
// Modes
// -----
//
// Default: violations exit 1. There is no warning mode — link rot is
// not a half-discipline.
//
// Run: `node scripts/validate-references.mjs`
// Wired into `npm test` as a pre-test step (after exit-doors).

import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, resolve, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
// REPO_ROOT defaults to scripts/'s parent; honors CMK_VALIDATOR_ROOT
// env var for testability (sandboxed self-tests set this to point at
// a fixture directory).
const REPO_ROOT = process.env.CMK_VALIDATOR_ROOT
  ? resolve(process.env.CMK_VALIDATOR_ROOT)
  : resolve(dirname(__filename), '..');
const SUPPRESSION = 'validate-references: ignore';

// --- Corpus enumeration ---------------------------------------------

function walkMd(dir, results, skip) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (skip.has(path)) continue;
    if (entry.isDirectory()) {
      walkMd(path, results, skip);
      continue;
    }
    if (entry.name.endsWith('.md')) results.push(path);
  }
}

const SKIP = new Set([
  // Per-template seed files have their own internal-reference world.
  join(REPO_ROOT, 'template'),
  // Loaded skills (not part of the kit corpus).
  join(REPO_ROOT, '.claude'),
  // Generated / ignored.
  join(REPO_ROOT, 'node_modules'),
  join(REPO_ROOT, '.git'),
  // Research notes and external sources. These contain third-party
  // ID conventions (e.g., Cursor's FR-001..FR-060, ChatGPT's
  // proposed FR list) that are NOT the kit's FR/NFR/Task namespace.
  // The PR-C audit established that "the kit's spec stack" is the
  // authoritative corpus; research/sources/conversation-log are
  // INPUTS to that corpus, not part of it.
  join(REPO_ROOT, 'docs', 'research'),
  join(REPO_ROOT, 'docs', 'sources'),
  join(REPO_ROOT, 'docs', 'conversation-log'),
  // archive/ holds frozen, superseded/retired docs (moved here by the
  // documentation-governance restructure, 2026-05-31). Their internal +
  // outbound links are not ref-validated — they're history, not live.
  join(REPO_ROOT, 'archive'),
]);

const mdFiles = [];
walkMd(REPO_ROOT, mdFiles, SKIP);

// --- ADR index ------------------------------------------------------

const adrDir = join(REPO_ROOT, 'docs', 'adr');
const adrFiles = new Set();
if (existsSync(adrDir)) {
  for (const f of readdirSync(adrDir)) {
    const m = f.match(/^(\d{4})-/);
    if (m) adrFiles.add(m[1]);
  }
}

// --- FR / NFR / Task index ------------------------------------------

function readMdIfExists(rel) {
  const p = join(REPO_ROOT, rel);
  if (!existsSync(p)) return '';
  return readFileSync(p, 'utf8');
}

const requirementsText =
  readMdIfExists('specs/requirements.md') +
  '\n' +
  readMdIfExists('specs/requirements-revisions-proposed.md');

const tasksText = readMdIfExists('specs/tasks.md');

// FR / NFR definitions appear as headings like `### FR-12 ...` or as
// table rows `| FR-12 | ...` or as inline anchors `FR-12:`. We accept
// ANY occurrence as a definition for the purposes of "does this ID
// exist in the corpus?" — link rot is "no occurrence anywhere", which
// is the failure mode the validator catches.
//
// Leading-zero expectation (D1-MIN-E, deferred from PR-D1 code-review):
// `FR-13` and `FR-013` produce DISTINCT keys here (the regex's `\d+`
// captures the literal digits). The kit's own FRs are 1-2 digit
// (FR-1..FR-31 ish); 3-digit IDs in the wild belong to external specs
// (Cursor uses FR-001..FR-152). External-spec references should be
// wrapped in backticks — inline-code spans are stripped before scanning
// (see `scanLine` below). A future regression where someone writes
// `FR-013` for the kit's FR-13 would falsely fail; the fix in that case
// is the citing line, not the validator. Normalization (strip leading
// zeros, treat 013 == 13) was considered + rejected because it would
// silently coerce Cursor's FR-052 → kit FR-52 if that ID ever exists.
function indexIds(text, prefix) {
  const ids = new Set();
  const re = new RegExp(`\\b${prefix}-(\\d+)\\b`, 'g');
  for (const m of text.matchAll(re)) ids.add(m[1]);
  return ids;
}

const frIds = indexIds(requirementsText, 'FR');
const nfrIds = indexIds(requirementsText, 'NFR');

// Tasks: a "definition" is either a parent heading `## N. ...` /
// `### N. ...` in tasks.md, OR a sub-task line `N.N`. Treat any
// `Task N` reference as valid if N (the parent number) appears at
// the start of a heading or list-item line.
const taskIds = new Set();
for (const line of tasksText.split(/\r?\n/)) {
  const m = line.match(/^\s*(?:#{1,6}\s+|[-*]\s+\[.\]\s+|[-*]\s+)?(\d{1,3})[.) ]/);
  if (m) taskIds.add(m[1]);
}

// --- Design-section index (§N.N anchors) ----------------------------

const designText = readMdIfExists('specs/design.md');
const designSections = new Set();
// Accept both `## 6. Title` and `### 6.1 Title` forms.
for (const m of designText.matchAll(/^\s*#{2,6}\s+(\d+(?:\.\d+){0,3})[.\s]/gm)) {
  designSections.add(m[1]);
}

// --- Heading slug index per file (for [label](file#anchor)) ---------

function slugify(headingText) {
  return headingText
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

const slugIndex = new Map(); // abs path -> Set of slugs
for (const path of mdFiles) {
  const slugs = new Set();
  try {
    const text = readFileSync(path, 'utf8');
    for (const m of text.matchAll(/^#{1,6}\s+(.+?)\s*$/gm)) {
      slugs.add(slugify(m[1]));
    }
  } catch {
    /* unreadable; will be reported when referenced */
  }
  slugIndex.set(path, slugs);
}

// --- Reference extraction + verification ----------------------------

const violations = [];

function recordViolation(file, lineNumber, message) {
  violations.push(`${relative(REPO_ROOT, file).split(sep).join('/')}:${lineNumber}: ${message}`);
}

function isHttpUrl(s) {
  return /^(?:https?:)?\/\//i.test(s) || s.startsWith('mailto:');
}

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

  // Track fenced code block state with fence-length tracking
  // (D1-IMP-A, deferred from PR-D1 code-review). CommonMark allows
  // fences of 3+ backticks; an opening fence is closed only by a
  // same-language-or-longer same-character fence. This lets writers
  // nest a `` ``` `` example INSIDE a `` ```` `` block without
  // toggling the outer state. We capture the opening fence's exact
  // length and only flip back to non-fence when we see a closing
  // fence of length >= opener.
  let fenceLen = 0; // 0 = not in a fence; >0 = inside a fence of this length
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fenceMatch = line.match(/^\s*(`{3,})\s*\S*\s*$/);
    if (fenceMatch) {
      const len = fenceMatch[1].length;
      if (fenceLen === 0) {
        fenceLen = len; // opening fence
      } else if (len >= fenceLen) {
        fenceLen = 0; // closing fence (length >= opener)
      }
      // else: a shorter fence inside an open block — ignore, it's example content
      continue;
    }
    if (fenceLen > 0) continue;
    if (line.includes(SUPPRESSION)) continue;
    const lineNumber = i + 1;
    // Strip inline-code spans (`...`) before scanning for links — examples
    // like `[label](filename.md)` inside backticks are illustrative.
    const scanLine = line.replace(/`[^`]*`/g, '');

    // (1) and (2): file + anchor links
    FILE_LINK_RE.lastIndex = 0;
    let m;
    while ((m = FILE_LINK_RE.exec(scanLine)) !== null) {
      const target = m[2];
      if (isHttpUrl(target)) continue;
      // Pure-anchor refs (`#section`) are intra-file — check this file's slugs.
      const [pathPart, anchor] = target.split('#');
      if (pathPart === '') {
        if (anchor && !slugIndex.get(file)?.has(slugify(decodeURIComponent(anchor)))) {
          recordViolation(file, lineNumber, `intra-file anchor "${anchor}" not found in this document`);
        }
        continue;
      }
      // Resolve relative to the referencing file.
      const resolved = resolve(fileDir, pathPart.split('/').join(sep));
      if (!existsSync(resolved)) {
        recordViolation(
          file,
          lineNumber,
          `broken link target: ${target} (resolved to ${relative(REPO_ROOT, resolved).split(sep).join('/')})`,
        );
        continue;
      }
      // Anchor check only when target is .md (we don't slugify other formats).
      if (anchor && resolved.endsWith('.md')) {
        const slugs = slugIndex.get(resolved);
        if (slugs) {
          if (!slugs.has(slugify(decodeURIComponent(anchor)))) {
            recordViolation(
              file,
              lineNumber,
              `anchor "${anchor}" not found in ${relative(REPO_ROOT, resolved).split(sep).join('/')}`,
            );
          }
        } else if (process.env.CMK_REFS_DEBUG === '1') {
          // D1-IMP-B (deferred from PR-D1 code-review): the target
          // resolves to an .md file but isn't in our scanned corpus
          // (e.g., template/ files referenced from CLAUDE.md). The
          // anchor goes un-checked. Surface this as a debug note so
          // a future maintainer can see "did we forget to index this
          // file?" vs "deliberately not checked". Quiet by default;
          // set CMK_REFS_DEBUG=1 to print.
          console.error(
            `validate-references: DEBUG anchor "${anchor}" on out-of-corpus target ${relative(REPO_ROOT, resolved).split(sep).join('/')} (skipped; set CMK_REFS_DEBUG=1 to see all such skips) — referenced from ${relative(REPO_ROOT, file).split(sep).join('/')}:${lineNumber}`,
          );
        }
      }
    }

    // (3) ADR-NNNN
    ADR_RE.lastIndex = 0;
    while ((m = ADR_RE.exec(scanLine)) !== null) {
      if (!adrFiles.has(m[1])) {
        recordViolation(file, lineNumber, `ADR-${m[1]} has no file under docs/adr/`);
      }
    }

    // (4) §N.N (only checked when the referencing file is design.md;
    //     other files can name §N.N as shorthand for design's sections
    //     but the convention is `design §N.N` and we'd need richer
    //     parsing to be sure).
    if (file === join(REPO_ROOT, 'specs', 'v0.1.0', 'design.md')) {
      DESIGN_SECTION_RE.lastIndex = 0;
      while ((m = DESIGN_SECTION_RE.exec(scanLine)) !== null) {
        if (!designSections.has(m[1])) {
          recordViolation(file, lineNumber, `§${m[1]} has no matching heading in design.md`);
        }
      }
    }

    // (5) FR-N
    FR_RE.lastIndex = 0;
    while ((m = FR_RE.exec(scanLine)) !== null) {
      if (!frIds.has(m[1])) {
        recordViolation(
          file,
          lineNumber,
          `FR-${m[1]} not defined in requirements.md or requirements-revisions-proposed.md`,
        );
      }
    }

    // (6) NFR-N
    NFR_RE.lastIndex = 0;
    while ((m = NFR_RE.exec(scanLine)) !== null) {
      if (!nfrIds.has(m[1])) {
        recordViolation(
          file,
          lineNumber,
          `NFR-${m[1]} not defined in requirements.md or requirements-revisions-proposed.md`,
        );
      }
    }

    // (7) Task N
    TASK_RE.lastIndex = 0;
    while ((m = TASK_RE.exec(scanLine)) !== null) {
      if (!taskIds.has(m[1])) {
        recordViolation(file, lineNumber, `Task ${m[1]} not defined in tasks.md`);
      }
    }
  }
}

if (violations.length > 0) {
  console.error(`validate-references: FAIL — ${violations.length} broken reference(s)`);
  for (const v of violations) console.error('  ' + v);
  console.error('');
  console.error(
    '  If a violation is intentional (e.g., reserved-future ADR number), add ',
  );
  console.error(`  <!-- ${SUPPRESSION} --> on the same line as the reference.`);
  process.exit(1);
}

console.log(
  `validate-references: OK — ${mdFiles.length} markdown files scanned; ` +
    `${adrFiles.size} ADR files indexed; ${frIds.size} FR / ${nfrIds.size} NFR / ${taskIds.size} Task IDs indexed`,
);
