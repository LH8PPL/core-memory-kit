// persona-portability.mjs — Task 72. `cmk persona export` / `cmk persona import`.
//
// The persona (the user tier — USER/HABITS/LESSONS + fragments/) follows the
// HUMAN, not the repo (design §1.1, D-27): it lives machine-local at
// ~/.claude-memory-kit and is deliberately OUT of any project repo, because
// committing it would leak your working-style to teammates who clone. So
// portability across YOUR machines is per-human, not per-repo: export the user
// tier to one OS-agnostic bundle file, carry it (USB / private repo / Dropbox),
// import it on the other machine.
//
// This is the EXPLICIT primitive (decided in Task 72): no merge, no collision
// control. Import OVERWRITES, backing up anything it would replace so nothing is
// lost. The seamless auto-merge path (`cmk persona sync <git-url>`, Task 72.2)
// is deferred — git handles transport + conflicts there.
//
// Bundle format: a single self-describing JSON file (no tar/zip dependency, and
// human-inspectable). `{ kind, version, exportedAt, fileCount, files: { relpath:
// content } }`.

import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  readdirSync,
  statSync,
  renameSync,
  unlinkSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { reindex } from './reindex.mjs';
import { appendAuditEntry, nowIso, REASON_CODES } from './audit-log.mjs';

const BUNDLE_KIND = 'cmk-persona-bundle';
const BUNDLE_VERSION = 1;

// The persona surface to bundle: the 3 user-tier scratchpads + a settings
// override, plus the fact-store / queue subdirs (walked recursively). Everything
// else under the user tier is machine-local + regenerable and is NEVER bundled —
// runtime locks/audit (.locks/), the FTS cache (.index/), and prior import
// backups (.import-backups/). Using an explicit allow-list (rather than
// "everything minus excludes") guarantees a new runtime dir can't leak in later.
const TOP_LEVEL_FILES = ['USER.md', 'HABITS.md', 'LESSONS.md', 'settings.json'];
const SUBDIRS = ['fragments', 'queues'];

function walkFiles(absDir, relPrefix, out) {
  for (const name of readdirSync(absDir)) {
    const abs = join(absDir, name);
    const rel = relPrefix ? `${relPrefix}/${name}` : name;
    if (statSync(abs).isDirectory()) walkFiles(abs, rel, out);
    else out.push({ rel, abs });
  }
}

/**
 * Export the user tier to a portable bundle file.
 *
 * @param {object} opts
 * @param {string} opts.userDir - the user-tier root to export.
 * @param {string} opts.outFile - where to write the bundle.
 * @param {string} [opts.now] - ISO timestamp override (tests).
 * @returns {{action:'exported'|'error', path?, fileCount?, bytes?, errorCategory?, errors?}}
 */
export function exportPersona({ userDir, outFile, now } = {}) {
  if (!userDir || !existsSync(userDir)) {
    return {
      action: 'error',
      errorCategory: 'not-found',
      errors: [`user tier not found at ${userDir} — run \`cmk init-user-tier\` first`],
    };
  }
  if (!outFile) {
    return { action: 'error', errorCategory: 'schema', errors: ['no output file given'] };
  }

  const files = {};
  for (const f of TOP_LEVEL_FILES) {
    const abs = join(userDir, f);
    if (existsSync(abs) && statSync(abs).isFile()) {
      files[f] = readFileSync(abs, 'utf8');
    }
  }
  for (const sub of SUBDIRS) {
    const absSub = join(userDir, sub);
    if (existsSync(absSub) && statSync(absSub).isDirectory()) {
      const collected = [];
      walkFiles(absSub, sub, collected);
      for (const { rel, abs } of collected) files[rel] = readFileSync(abs, 'utf8');
    }
  }

  const bundle = {
    kind: BUNDLE_KIND,
    version: BUNDLE_VERSION,
    exportedAt: now ?? nowIso(),
    fileCount: Object.keys(files).length,
    files,
  };
  const json = JSON.stringify(bundle, null, 2);
  mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(outFile, json, 'utf8');

  return {
    action: 'exported',
    path: outFile,
    fileCount: bundle.fileCount,
    bytes: Buffer.byteLength(json, 'utf8'),
  };
}

/**
 * Import a persona bundle onto this machine's user tier. OVERWRITES, backing up
 * any file it would replace to <userDir>/.import-backups/<ts>/ first (no data
 * loss). Rebuilds the user-tier search index from the imported fragments.
 *
 * @param {object} opts
 * @param {string} opts.userDir - the target user-tier root.
 * @param {string} opts.inFile - the bundle to import.
 * @param {string} [opts.now] - ISO timestamp override (tests).
 * @returns {{action:'imported'|'error', fileCount?, backedUp?, backupPath?, reindexed?, errorCategory?, errors?}}
 */
export function importPersona({ userDir, inFile, now } = {}) {
  if (!inFile || !existsSync(inFile)) {
    return { action: 'error', errorCategory: 'not-found', errors: [`bundle not found at ${inFile}`] };
  }
  let bundle;
  try {
    bundle = JSON.parse(readFileSync(inFile, 'utf8'));
  } catch (e) {
    return { action: 'error', errorCategory: 'schema', errors: [`bundle is not valid JSON: ${e.message}`] };
  }
  if (bundle?.kind !== BUNDLE_KIND) {
    return { action: 'error', errorCategory: 'schema', errors: [`not a cmk persona bundle (kind: ${bundle?.kind ?? 'missing'})`] };
  }
  if (bundle.version !== BUNDLE_VERSION) {
    return {
      action: 'error',
      errorCategory: 'schema',
      errors: [`unsupported bundle version ${bundle.version} (this cmk supports v${BUNDLE_VERSION})`],
    };
  }
  if (!bundle.files || typeof bundle.files !== 'object') {
    return { action: 'error', errorCategory: 'schema', errors: ['bundle carries no files'] };
  }

  const ts = now ?? nowIso();
  mkdirSync(userDir, { recursive: true });

  // Transactional import (the Task-91 rollback discipline applied here): back up
  // every existing target the import would overwrite, then write the bundle —
  // and if ANY write fails partway, roll the whole thing back (remove the files
  // we created, restore the originals from backup) so a mid-import disk/permission
  // error can never leave the persona half-applied. Without this the user tier
  // could end up with some new files + some missing (recoverable from backup, but
  // not automatically) — separately-correct-jointly-broken on a partial failure.
  const backupRoot = join(userDir, '.import-backups', ts.replace(/[:.]/g, '-'));
  const renamed = []; // {dest, bkp} — existing files moved aside
  const created = []; // dest — files that did NOT exist before (new this import)
  try {
    for (const rel of Object.keys(bundle.files)) {
      const dest = join(userDir, ...rel.split('/'));
      if (existsSync(dest)) {
        const bkp = join(backupRoot, ...rel.split('/'));
        mkdirSync(dirname(bkp), { recursive: true });
        renameSync(dest, bkp);
        renamed.push({ dest, bkp });
      } else {
        created.push(dest);
      }
    }
    for (const [rel, content] of Object.entries(bundle.files)) {
      const dest = join(userDir, ...rel.split('/'));
      mkdirSync(dirname(dest), { recursive: true });
      writeFileSync(dest, content, 'utf8');
    }
  } catch (err) {
    // Roll back: remove anything we created, restore everything we moved aside.
    for (const dest of created) {
      try {
        if (existsSync(dest)) unlinkSync(dest);
      } catch {
        /* best-effort */
      }
    }
    for (const { dest, bkp } of renamed) {
      try {
        if (existsSync(bkp)) {
          mkdirSync(dirname(dest), { recursive: true });
          renameSync(bkp, dest);
        }
      } catch {
        /* best-effort — the backup copy still exists for manual recovery */
      }
    }
    return {
      action: 'error',
      errorCategory: 'io',
      errors: [`import failed and was rolled back: ${err?.message ?? err}`],
    };
  }
  const backedUp = renamed.length;

  // Rebuild the user-tier search index from the imported fragments so `cmk
  // search` works immediately on the new machine. Best-effort — `cmk reindex`
  // can rebuild it later if this throws.
  let reindexed = false;
  try {
    reindex({ tier: 'U', userDir, warn: () => {} });
    reindexed = true;
  } catch {
    /* best-effort */
  }

  // Door 4: one operational audit entry (the user tier was bulk-rewritten). The
  // individual facts keep their own provenance inside the bundled fact files;
  // this records the import event + where the overwritten files were backed up.
  try {
    appendAuditEntry(userDir, {
      ts,
      action: 'persona-imported',
      tier: 'U',
      id: 'persona-bundle',
      reasonCode: REASON_CODES.PERSONA_IMPORTED,
      paths: backedUp > 0 ? { archive: backupRoot } : undefined,
      extra: { fileCount: Object.keys(bundle.files).length, backedUp, source: inFile },
    });
  } catch {
    /* best-effort — never fail the import because the audit write failed */
  }

  return {
    action: 'imported',
    fileCount: Object.keys(bundle.files).length,
    backedUp,
    backupPath: backedUp > 0 ? backupRoot : null,
    reindexed,
  };
}
