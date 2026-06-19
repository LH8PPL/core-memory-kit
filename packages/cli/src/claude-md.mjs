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
//   }
//
//   removeClaudeMdBlock({ projectRoot }) → {
//     action:   'removed'              // managed block found + stripped
//             | 'not-found'            // file exists but no managed markers
//             | 'no-file',             // CLAUDE.md does not exist
//     path:        string,
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
// Exported (Task 162) for version-drift.mjs (HC-9) — reads the managed-block
// version marker without re-implementing the parser. Public contract: returns
// `{version, corrupted, ...}` or null.
export function findManagedBlock(text) {
  const startMatch = text.match(MARKER_START_RE);
  if (!startMatch) return null;

  const endMatch = text.match(MARKER_END_RE);
  if (endMatch && startMatch.index < endMatch.index) {
    return {
      startIdx: startMatch.index,
      endIdx: endMatch.index + endMatch[0].length,
      version: startMatch[1],
      fullText: text.slice(startMatch.index, endMatch.index + endMatch[0].length),
      corrupted: false,
    };
  }

  // Orphan start marker → treat the block as extending to EOF so we
  // can replace it cleanly on the next install.
  return {
    startIdx: startMatch.index,
    endIdx: text.length,
    version: startMatch[1],
    fullText: text.slice(startMatch.index),
    corrupted: true,
  };
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
  const found = findManagedBlock(existing);

  // Case 2 — file exists but no (or corrupted) managed block → append
  if (!found) {
    // If the file ends without a newline, add one before the block for
    // readability. Trim trailing whitespace so we don't accumulate blank
    // lines on repeated installs.
    const sep = existing.endsWith('\n') ? '\n' : '\n\n';
    writeFileSync(claudeMdPath, existing.replace(/\s+$/, '') + sep + newBlock + '\n', 'utf8');
    return { action: 'appended', path: claudeMdPath };
  }

  // Case 3 — managed block present. Compare versions to choose action.
  const cmp = compareVersions(version, found.version);
  const before = existing.slice(0, found.startIdx);
  const after = existing.slice(found.endIdx);

  let action;
  if (cmp === 0) {
    if (found.fullText === newBlock) {
      return { action: 'unchanged', path: claudeMdPath, oldVersion: found.version };
    }
    action = 'replaced';
  } else if (cmp > 0) {
    action = 'upgraded';
  } else {
    // cmp < 0 → incoming version is older than installed
    if (!force) {
      return {
        action: 'downgrade-blocked',
        path: claudeMdPath,
        oldVersion: found.version,
      };
    }
    action = 'forced-downgrade';
  }

  writeFileSync(claudeMdPath, before + newBlock + after, 'utf8');
  return { action, path: claudeMdPath, oldVersion: found.version };
}

export function removeClaudeMdBlock(opts = {}) {
  const projectRoot = opts.projectRoot;
  if (!projectRoot) throw new Error('removeClaudeMdBlock: projectRoot is required');

  const claudeMdPath = join(projectRoot, 'CLAUDE.md');

  if (!existsSync(claudeMdPath)) {
    return { action: 'no-file', path: claudeMdPath };
  }

  const existing = readFileSync(claudeMdPath, 'utf8');
  const found = findManagedBlock(existing);

  if (!found) {
    return { action: 'not-found', path: claudeMdPath };
  }

  // Strip the block. If the block was followed by exactly one trailing
  // newline (the one we wrote at injection time), strip it too so the
  // surrounding content stays clean. We do NOT touch newlines that exist
  // in the user's surrounding content.
  let after = existing.slice(found.endIdx);
  if (after.startsWith('\n') && (after.length === 1 || after[1] !== '\n')) {
    after = after.slice(1);
  }
  const before = existing.slice(0, found.startIdx).replace(/\s+$/, '\n');

  const next = (before + after).trimEnd() + (after.endsWith('\n') ? '\n' : '');

  writeFileSync(claudeMdPath, next, 'utf8');
  return { action: 'removed', path: claudeMdPath };
}

// Internal helpers are intentionally NOT exported — they're implementation
// details. The boundary tests check the public actions + on-disk effects.
