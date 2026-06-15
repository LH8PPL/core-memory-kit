#!/usr/bin/env node
// validate-index-completeness.mjs — the hand-maintained doc indexes must list
// every sibling .md (Task 152).
//
// The recurring index-lag drift class: a catalog doc (adr/README, research/INDEX,
// sources/README, process/README) silently falls behind the files it catalogs.
// The 2026-06-15 docs review found FOUR stale at once — new ADR rows missing, a
// "CURRENT" marker on a superseded guide, 4 unindexed research notes, 2 unindexed
// deep-dives — while validate-references / -doc-completeness / -doc-registry all
// stayed green (those check link-resolution + verb/tool coverage + registry
// membership, NOT "does each index list every sibling file").
//
// This makes presence structural, BOTH directions:
//   - a sibling .md the index does NOT link  → FAIL (the lag)
//   - an index link to a sibling-shaped file that does not exist → FAIL (stale)
//
// Presence-only by design: it asserts a file APPEARS as a link, not that its
// description is good (content quality is a false-positive magnet). Mirrors
// validate-pack-completeness (Task 135) + validate-skill-allowlist (137.2).
//
// Run: `node scripts/validate-index-completeness.mjs`
// Wired into `npm test` as a pre-test step.

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO = process.env.CMK_VALIDATOR_ROOT
  ? resolve(process.env.CMK_VALIDATOR_ROOT)
  : resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * The catalog docs to police. Each: the dir (repo-relative posix), the index
 * file within it, and any siblings deliberately NOT indexed (allowlist).
 *
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
 * `[text](target.md)` only; skips external URLs (`http`/`https`/`mailto`),
 * anchors (`#…`), and paths that escape the directory (`../`, `/`). Drops any
 * `#anchor` or `?query` suffix on a local target.
 *
 * @param {string} md the markdown source
 * @returns {string[]} unique same-dir `.md` targets
 */
export function extractLinkedFiles(md) {
  const out = new Set();
  // [text](target) — capture the target, then filter to same-dir .md files.
  const re = /\]\(([^)]+)\)/g;
  let m;
  while ((m = re.exec(md)) !== null) {
    let target = m[1].trim();
    // Strip an optional markdown link title: [text](file.md "title").
    target = target.replace(/\s+["'].*$/, '');
    // Strip a trailing #anchor / ?query.
    target = target.replace(/[#?].*$/, '');
    if (target === '') continue;
    // External or out-of-dir targets are not this index's responsibility.
    if (/^[a-z][a-z0-9+.-]*:/i.test(target)) continue; // scheme: http:, mailto:, …
    if (target.startsWith('#')) continue;
    if (target.includes('/')) continue; // sub-path or parent — not a sibling
    if (!target.toLowerCase().endsWith('.md')) continue;
    out.add(target);
  }
  return [...out];
}

/** Real `.md` filenames directly under cfg.dir (non-recursive — siblings only). */
export function listSiblingMarkdown(cfg) {
  const abs = join(REPO, cfg.dir);
  return readdirSync(abs, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.toLowerCase().endsWith('.md'))
    .map((e) => e.name)
    .sort();
}

/**
 * Pure check. Every sibling .md (minus the index file + allowlisted exclusions)
 * must appear in `linked`; and every `linked` entry must exist on disk.
 *
 * @param {object} a
 * @param {string}   a.dir        repo-relative dir (for messages)
 * @param {string}   [a.indexFile] the index filename, auto-excluded from siblings
 * @param {string[]} a.linked     `.md` targets the index links (from extractLinkedFiles)
 * @param {string[]} a.siblings   real `.md` filenames in the dir
 * @param {string[]} [a.exclude]  siblings deliberately not indexed
 * @returns {string[]} human-readable errors ([] = OK)
 */
export function checkIndexCompleteness({ dir, indexFile, linked, siblings, exclude = [] }) {
  const errors = [];
  const excludeSet = new Set([...(exclude ?? []), ...(indexFile ? [indexFile] : [])]);
  const linkedSet = new Set(linked);
  const siblingSet = new Set(siblings);

  // Direction 1: every required sibling must be listed.
  for (const file of siblings) {
    if (excludeSet.has(file)) continue;
    if (!linkedSet.has(file)) {
      errors.push(
        `${dir}/${indexFile ?? 'index'}: sibling '${file}' is not listed — the index has drifted behind the directory. ` +
          `Add a link to it, or add it to the validator's exclude list if it is deliberately uncatalogued.`,
      );
    }
  }

  // Direction 2: every listed sibling-shaped link must exist on disk.
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

function runCli() {
  const allErrors = [];
  let totalChecked = 0;
  for (const cfg of CATALOG_INDEXES) {
    const indexPath = join(REPO, cfg.dir, cfg.indexFile);
    if (!existsSync(indexPath)) {
      allErrors.push(`${cfg.dir}/${cfg.indexFile}: index file not found`);
      continue;
    }
    const linked = extractLinkedFiles(readFileSync(indexPath, 'utf8'));
    const siblings = listSiblingMarkdown(cfg);
    totalChecked += siblings.length;
    allErrors.push(
      ...checkIndexCompleteness({
        dir: cfg.dir,
        indexFile: cfg.indexFile,
        linked,
        siblings,
        exclude: cfg.exclude,
      }),
    );
  }

  if (allErrors.length > 0) {
    console.error('validate-index-completeness: FAIL');
    for (const e of allErrors) console.error('  - ' + e);
    process.exit(1);
  }
  console.log(
    `validate-index-completeness: OK — ${CATALOG_INDEXES.length} catalog index(es), ${totalChecked} sibling file(s) all listed`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  runCli();
}
