// claude-md.mjs — managed-block injection into the target project's CLAUDE.md.
//
// Public contract (tests assert this; internals can change freely):
//
//   injectClaudeMdBlock({
//     projectRoot,   // <repo> root
//     content,       // body of the block (without markers)
//     version,       // kit version string, e.g. "0.1.0"
//     force,         // allow downgrade (replace newer block with older)
//   }) → {
//     action:   'created'              // no CLAUDE.md before; one was created
//             | 'appended'             // CLAUDE.md existed without our markers; block appended at EOF
//             | 'replaced'             // same-version block content updated in place
//             | 'upgraded'             // older-version block replaced (kit version is newer)
//             | 'downgrade-blocked'    // newer-version block present and force not set
//             | 'forced-downgrade'     // newer-version block replaced because force=true
//             | 'unchanged',           // existing block content + version match the inputs exactly
//     path:        string,             // absolute path to the CLAUDE.md
//     oldVersion?: string,             // version of the block we replaced (when applicable)
//     duplicatesFolded?: number,       // Task 220: extra managed blocks folded into the one
//                                      // refreshed block (present only when > 0; also set on
//                                      // 'downgrade-blocked' — duplicates heal even when the
//                                      // version change is refused)
//   }
//
//   removeClaudeMdBlock({ projectRoot }) → {
//     action:   'removed'              // managed block(s) found + stripped (ALL of them — Task 220)
//             | 'not-found'            // file exists but no managed markers
//             | 'no-file',             // CLAUDE.md does not exist
//     path:        string,
//     removedCount?: number,           // Task 220: present only when > 1 blocks were removed
//   }
//
// Design notes:
//   - Deep module: the two boundary functions above are the only public
//     surface. Internal helpers parse markers, compare versions, and
//     splice the block — all private.
//   - Markers wrap the kit-managed content. Everything outside markers is
//     byte-preserved across inject + remove. This is what makes the
//     installer safe to re-run.
//   - Version comparison is semver-style (MAJOR.MINOR.PATCH). Prerelease
//     suffixes (-dev, -alpha.1) are ignored when comparing.
//   - Marker pattern is intentionally the same shape as the .gitignore
//     marker pattern in install.mjs — same idea, same conventions.

import {
  existsSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

const MARKER_START_RE =
  /<!--\s*claude-memory-kit:start\s+v([\d.]+(?:-[\w.]+)?)\s*-->/;
const MARKER_END_RE = /<!--\s*claude-memory-kit:end\s*-->/;

/**
 * Wrap a content string with kit markers at the given version.
 */
function buildBlock(content, version) {
  return `<!-- claude-memory-kit:start v${version} -->\n${content.trim()}\n<!-- claude-memory-kit:end -->`;
}

/**
 * Find the start + end marker positions in the source text.
 *   - Returns null when no start marker is present (no managed block).
 *   - When a start marker is present but the end marker is missing or
 *     misplaced, treats the block as extending to EOF. This recovers
 *     gracefully from a corrupted block (e.g. the user accidentally
 *     deleted the end marker by hand).
 */
// Task 220 (D-322): scan for EVERY managed block, not just the first. A
// duplicate block (manual copy-paste, kept-both-sides merge resolution) was
// previously invisible: inject refreshed only the first and remove left the
// rest behind. Pairing is greedy in document order: each start marker closes
// at the first end marker after it; a start with no end extends to EOF
// (corrupted — the same orphan recovery the single-block finder always had,
// and necessarily the LAST block since it consumes the rest of the text).
function findAllManagedBlocks(text) {
  const startRe = new RegExp(MARKER_START_RE.source, 'g');
  const endRe = new RegExp(MARKER_END_RE.source, 'g');
  const blocks = [];
  let from = 0;
  for (;;) {
    startRe.lastIndex = from;
    const s = startRe.exec(text);
    if (!s) break;
    endRe.lastIndex = s.index;
    const e = endRe.exec(text);
    if (e) {
      const endIdx = e.index + e[0].length;
      blocks.push({
        startIdx: s.index,
        endIdx,
        version: s[1],
        fullText: text.slice(s.index, endIdx),
        corrupted: false,
      });
      from = endIdx;
    } else {
      blocks.push({
        startIdx: s.index,
        endIdx: text.length,
        version: s[1],
        fullText: text.slice(s.index),
        corrupted: true,
      });
      break;
    }
  }
  return blocks;
}

// Exported (Task 162) for version-drift.mjs (HC-9) — reads the managed-block
// version marker without re-implementing the parser. Public contract: returns
// `{version, corrupted, duplicateCount, ...}` or null. `duplicateCount` (Task
// 220) is the number of ADDITIONAL blocks past the first — HC-9 flags > 0.
export function findManagedBlock(text) {
  const blocks = findAllManagedBlocks(text);
  if (blocks.length === 0) return null;
  return { ...blocks[0], duplicateCount: blocks.length - 1 };
}

/**
 * Strip trailing -prerelease, parse MAJOR.MINOR.PATCH integers.
 * Tolerates partial versions ("0.1" → [0,1,0]).
 */
function parseVersion(v) {
  const base = String(v).replace(/^v/, '').split('-')[0];
  const parts = base.split('.').map((n) => parseInt(n, 10) || 0);
  while (parts.length < 3) parts.push(0);
  return parts.slice(0, 3);
}

/**
 * Semver-style comparator. Returns -1 / 0 / 1.
 *   compareVersions('0.1.0', '0.2.0') === -1
 *   compareVersions('1.0.0', '1.0.0') === 0
 *   compareVersions('2.0.0', '1.9.9') === 1
 */
// Exported (Task 162) for version-drift.mjs (HC-9). Public contract: -1/0/1,
// strips a `-prerelease` suffix before comparing.
export function compareVersions(a, b) {
  const av = parseVersion(a);
  const bv = parseVersion(b);
  for (let i = 0; i < 3; i++) {
    if (av[i] < bv[i]) return -1;
    if (av[i] > bv[i]) return 1;
  }
  return 0;
}

export function injectClaudeMdBlock(opts = {}) {
  const projectRoot = opts.projectRoot;
  const content = String(opts.content || '');
  const version = String(opts.version || '0.0.0');
  const force = !!opts.force;
  if (!projectRoot) throw new Error('injectClaudeMdBlock: projectRoot is required');

  const claudeMdPath = join(projectRoot, 'CLAUDE.md');
  const newBlock = buildBlock(content, version);

  // Case 1 — no CLAUDE.md
  if (!existsSync(claudeMdPath)) {
    writeFileSync(claudeMdPath, newBlock + '\n', 'utf8');
    return { action: 'created', path: claudeMdPath };
  }

  const existing = readFileSync(claudeMdPath, 'utf8');
  const blocks = findAllManagedBlocks(existing);

  // Case 2 — file exists but no (or corrupted) managed block → append
  if (blocks.length === 0) {
    // If the file ends without a newline, add one before the block for
    // readability. Trim trailing whitespace so we don't accumulate blank
    // lines on repeated installs.
    const sep = existing.endsWith('\n') ? '\n' : '\n\n';
    writeFileSync(claudeMdPath, existing.replace(/\s+$/, '') + sep + newBlock + '\n', 'utf8');
    return { action: 'appended', path: claudeMdPath };
  }

  // Case 3 — managed block(s) present. Compare versions to choose action.
  // Task 220: with duplicates, compare against the NEWEST version across all
  // blocks — conservative downgrade-blocking (a stale duplicate must not let
  // an older kit clobber a newer scaffold).
  const found = blocks[0];
  const newestVersion = blocks.reduce(
    (m, b) => (compareVersions(b.version, m) > 0 ? b.version : m),
    found.version,
  );
  const cmp = compareVersions(version, newestVersion);

  let action;
  if (cmp === 0) {
    // 'unchanged' only when there is exactly ONE block and it is byte-identical;
    // duplicates always fold (Task 220), even at the same version.
    if (blocks.length === 1 && found.fullText === newBlock) {
      return { action: 'unchanged', path: claudeMdPath, oldVersion: found.version };
    }
    action = 'replaced';
  } else if (cmp > 0) {
    action = 'upgraded';
  } else {
    // cmp < 0 → incoming version is older than installed
    if (!force) {
      // Skill-review finding 1 (Task 220): still FOLD duplicates here — to the
      // NEWEST existing block's content, never ours — otherwise HC-9's "re-run
      // cmk install" advice loops forever in the exact scenario this task
      // heals (a merge importing a newer-versioned duplicate while the local
      // kit is older). The version downgrade itself stays blocked.
      if (blocks.length > 1) {
        const newest = blocks.find((b) => b.version === newestVersion) ?? found;
        let healed = existing.slice(0, found.startIdx) + newest.fullText;
        for (let i = 0; i < blocks.length; i++) {
          const segEnd = i + 1 < blocks.length ? blocks[i + 1].startIdx : existing.length;
          healed += existing.slice(blocks[i].endIdx, segEnd);
        }
        writeFileSync(claudeMdPath, healed, 'utf8');
        return {
          action: 'downgrade-blocked',
          path: claudeMdPath,
          oldVersion: newestVersion,
          duplicatesFolded: blocks.length - 1,
        };
      }
      return {
        action: 'downgrade-blocked',
        path: claudeMdPath,
        oldVersion: newestVersion,
      };
    }
    action = 'forced-downgrade';
  }

  // Fold: ONE fresh block at the first block's position; every other block is
  // dropped; user bytes outside the blocks — including BETWEEN duplicates —
  // are preserved in order (the byte-preserve-outside-markers contract).
  let rebuilt = existing.slice(0, found.startIdx) + newBlock;
  for (let i = 0; i < blocks.length; i++) {
    const segEnd = i + 1 < blocks.length ? blocks[i + 1].startIdx : existing.length;
    rebuilt += existing.slice(blocks[i].endIdx, segEnd);
  }
  writeFileSync(claudeMdPath, rebuilt, 'utf8');
  return {
    action,
    path: claudeMdPath,
    oldVersion: newestVersion,
    ...(blocks.length > 1 ? { duplicatesFolded: blocks.length - 1 } : {}),
  };
}

export function removeClaudeMdBlock(opts = {}) {
  const projectRoot = opts.projectRoot;
  if (!projectRoot) throw new Error('removeClaudeMdBlock: projectRoot is required');

  const claudeMdPath = join(projectRoot, 'CLAUDE.md');

  if (!existsSync(claudeMdPath)) {
    return { action: 'no-file', path: claudeMdPath };
  }

  const existing = readFileSync(claudeMdPath, 'utf8');
  const blocks = findAllManagedBlocks(existing);

  if (blocks.length === 0) {
    return { action: 'not-found', path: claudeMdPath };
  }

  // Strip ALL managed blocks (Task 220 — the uninstall contract is "no kit
  // markers remain", duplicates included), back-to-front so indices stay
  // valid. Per block: if it was followed by exactly one trailing newline
  // (the one we wrote at injection time), strip it too; the preceding
  // whitespace run collapses to a single newline. We do NOT touch newlines
  // that exist in the user's surrounding content.
  let text = existing;
  let lastAfterEndsWithNewline = false;
  for (let i = blocks.length - 1; i >= 0; i--) {
    const b = blocks[i];
    let after = text.slice(b.endIdx);
    if (after.startsWith('\n') && (after.length === 1 || after[1] !== '\n')) {
      after = after.slice(1);
    }
    if (i === blocks.length - 1) lastAfterEndsWithNewline = after.endsWith('\n');
    const before = text.slice(0, b.startIdx).replace(/\s+$/, '\n');
    text = before + after;
  }

  const next = text.trimEnd() + (lastAfterEndsWithNewline ? '\n' : '');

  writeFileSync(claudeMdPath, next, 'utf8');
  return {
    action: 'removed',
    path: claudeMdPath,
    ...(blocks.length > 1 ? { removedCount: blocks.length } : {}),
  };
}

// Internal helpers are intentionally NOT exported — they're implementation
// details. The boundary tests check the public actions + on-disk effects.
