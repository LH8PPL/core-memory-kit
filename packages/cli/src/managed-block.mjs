// managed-block.mjs — shared helpers for agent-config + instruction-file writes.
//
// install-agent.mjs (the generic per-agent installer) and install-kiro.mjs (the
// Kiro 4-surface orchestrator) both need the same primitives: a managed
// marker-block instruction-file writer, JSON-key removal that preserves siblings,
// empty-parent pruning, and the non-regex newline trims (ReDoS-safe). These were
// duplicated verbatim across the two; centralizing them here removes the drift
// hazard (the kit's shared-module discipline — the same lesson the duplicated
// atomicWrite taught earlier in Task 50).
//
// Public surface:
//   writeManagedBlock(path, {body, frontmatter, markStart, markEnd}) → changed:bool
//   removeManagedBlock(path, {markStart, markEnd}) → changed:bool
//   removeJsonKey(path, keyPath) → changed:bool   (preserves siblings)
//   pruneEmptyParent(path, keyPath) → void         (drops an emptied {} we leave)
//   escapeRe / trimLeadingNewlines / trimTrailingNewlines (ReDoS-safe utils)

import { existsSync, readFileSync } from 'node:fs';
import { atomicWrite } from './mutate-agent-config.mjs';

export const DEFAULT_MARK_START = '<!-- claude-memory-kit:start -->';
export const DEFAULT_MARK_END = '<!-- claude-memory-kit:end -->';

/**
 * Write/refresh a managed marker block in an instruction file, byte-preserving
 * everything outside the markers. `frontmatter` (e.g. Kiro's `inclusion: always`)
 * is prepended only when the file is created fresh. Idempotent: identical content
 * → no write, returns false.
 * @returns {boolean} whether a write happened.
 */
export function writeManagedBlock(path, { body, frontmatter = '', markStart = DEFAULT_MARK_START, markEnd = DEFAULT_MARK_END } = {}) {
  const block = `${markStart}\n${body}\n${markEnd}`;
  const desired = `${frontmatter}${block}\n`;
  const existing = existsSync(path) ? readFileSync(path, 'utf8') : '';

  let next;
  if (existing === '') {
    next = desired;
  } else if (existing.includes(markStart) && existing.includes(markEnd)) {
    // refresh in place — replace only the managed block, byte-preserve the rest.
    next = existing.replace(
      new RegExp(`${escapeRe(markStart)}[\\s\\S]*?${escapeRe(markEnd)}`),
      block,
    );
  } else {
    // append our block to the user's existing file.
    next = `${trimTrailingNewlines(existing)}\n\n${block}\n`;
  }

  if (next === existing) return false;
  atomicWrite(path, next);
  return true;
}

/** Strip our managed block (+ surrounding blank lines), byte-preserve the rest. */
export function removeManagedBlock(path, { markStart = DEFAULT_MARK_START, markEnd = DEFAULT_MARK_END } = {}) {
  if (!existsSync(path)) return false;
  const existing = readFileSync(path, 'utf8');
  if (!existing.includes(markStart)) return false;
  // The inner [\s\S]*? is lazy + bounded by two fixed literal delimiters → linear,
  // not ReDoS-prone. Newline trims are non-regex (no `\n*$`/`^\n+` super-linear
  // shapes); the `\n{3,}` collapse is a bounded quantifier, also linear.
  const blockRe = new RegExp(`${escapeRe(markStart)}[\\s\\S]*?${escapeRe(markEnd)}`);
  const stripped = trimLeadingNewlines(existing.replace(blockRe, '').replace(/\n{3,}/g, '\n\n'));
  atomicWrite(path, stripped);
  return true;
}

/**
 * Remove a nested key from a JSON file, preserving everything else. Skips
 * (returns false) on a missing file / parse error (never clobbers a corrupt file).
 * @returns {boolean} whether a change was written.
 */
export function removeJsonKey(path, keyPath) {
  if (!existsSync(path)) return false;
  let root;
  try {
    root = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return false;
  }
  let cur = root;
  for (let i = 0; i < keyPath.length - 1; i += 1) {
    if (!cur || typeof cur !== 'object' || !(keyPath[i] in cur)) return false;
    cur = cur[keyPath[i]];
  }
  const last = keyPath[keyPath.length - 1];
  if (!cur || typeof cur !== 'object' || !(last in cur)) return false;
  delete cur[last];
  atomicWrite(path, `${JSON.stringify(root, null, 2)}\n`);
  return true;
}

/**
 * If the object at keyPath exists and is now empty ({}), remove it — so an
 * uninstall doesn't leave a kit-shaped `{"mcpServers":{}}` husk. No-op on a
 * missing file / parse error / non-empty target.
 */
export function pruneEmptyParent(path, keyPath) {
  if (!existsSync(path)) return;
  let root;
  try {
    root = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return;
  }
  let cur = root;
  for (let i = 0; i < keyPath.length - 1; i += 1) {
    if (!cur || typeof cur !== 'object' || !(keyPath[i] in cur)) return;
    cur = cur[keyPath[i]];
  }
  const last = keyPath[keyPath.length - 1];
  const target = cur && typeof cur === 'object' ? cur[last] : undefined;
  if (target && typeof target === 'object' && !Array.isArray(target) && Object.keys(target).length === 0) {
    delete cur[last];
    atomicWrite(path, `${JSON.stringify(root, null, 2)}\n`);
  }
}

// ── ReDoS-safe string utils ──────────────────────────────────────────────────

export function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Non-regex newline trims — avoid the `\n*$` / `^\n+` super-linear-backtracking
// shapes a static analyzer (rightly) flags as ReDoS-prone. O(n), no backtracking.
export function trimTrailingNewlines(s) {
  let end = s.length;
  while (end > 0 && s[end - 1] === '\n') end -= 1;
  return s.slice(0, end);
}

export function trimLeadingNewlines(s) {
  let start = 0;
  while (start < s.length && s[start] === '\n') start += 1;
  return s.slice(start);
}
