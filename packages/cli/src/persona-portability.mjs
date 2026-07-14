// persona-portability.mjs — Task 72. `cmk persona export` / `cmk persona import`.
//
// The persona (the user tier — USER/HABITS/LESSONS + fragments/) follows the
// HUMAN, not the repo (design §1.1, D-27): it lives machine-local at
// ~/.core-memory-kit and is deliberately OUT of any project repo, because
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
  copyFileSync,
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

// Read + validate a bundle file. Returns { bundle } on success, or { error: <the
// error result> } on any problem. Kept separate so importPersona stays simple.
function readAndValidateBundle(inFile) {
  const err = (msg, cat = 'schema') => ({ error: { action: 'error', errorCategory: cat, errors: [msg] } });
  if (!inFile || !existsSync(inFile)) return err(`bundle not found at ${inFile}`, 'not-found');
  let bundle;
  try {
    bundle = JSON.parse(readFileSync(inFile, 'utf8'));
  } catch (e) {
    return err(`bundle is not valid JSON: ${e.message}`);
  }
  if (bundle?.kind !== BUNDLE_KIND) return err(`not a cmk persona bundle (kind: ${bundle?.kind ?? 'missing'})`);
  if (bundle.version !== BUNDLE_VERSION) {
    return err(`unsupported bundle version ${bundle.version} (this cmk supports v${BUNDLE_VERSION})`);
  }
  if (!bundle.files || typeof bundle.files !== 'object') return err('bundle carries no files');
  return { bundle };
}

// Undo a partial import: remove the files we created, restore the ones we moved
// aside. Best-effort per item — a leaked backup is recoverable; a clobbered live
// file is not, so we always try to put the originals back.
function rollbackImport(created, renamed) {
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
        restoreBackup(bkp, dest);
      }
    } catch {
      /* best-effort — the backup copy still exists for manual recovery */
    }
  }
}

// Restore a backed-up file over `dest` (Task 116.x). `dest` may already hold the
// half-applied NEW content (Phase-2 write before the failure), so this OVERWRITES
// it. The old code used `renameSync(bkp, dest)`, but renaming ONTO an existing
// file can intermittently throw EPERM/EBUSY on Windows under heavy parallel FS
// load — and rollbackImport's silent catch then left the un-rolled-back NEW file
// in place (the rare persona-portability rollback flake). `copyFileSync` overwrites
// the destination reliably on every platform; a short retry covers a transient
// lock. The backup is removed only after a confirmed copy.
export function restoreBackup(bkp, dest) {
  let lastErr;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      copyFileSync(bkp, dest);
      try { unlinkSync(bkp); } catch { /* backup cleanup best-effort */ }
      return;
    } catch (err) {
      lastErr = err; // transient EPERM/EBUSY under load — retry
    }
  }
  throw lastErr;
}

// Apply the bundle's files TRANSACTIONALLY (the Task-91 rollback discipline):
// back up every existing target first, then write all files, and if ANY write
// fails partway, roll the whole thing back so a mid-import disk/permission error
// never leaves the persona half-applied. Returns the count of backed-up files;
// throws on unrecoverable failure (after rolling back).
function applyBundleAtomic(userDir, files, backupRoot) {
  const renamed = []; // {dest, bkp} — existing files moved aside
  const created = []; // dest — files that did NOT exist before (new this import)
  try {
    for (const rel of Object.keys(files)) {
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
    for (const [rel, content] of Object.entries(files)) {
      const dest = join(userDir, ...rel.split('/'));
      mkdirSync(dirname(dest), { recursive: true });
      writeFileSync(dest, content, 'utf8');
    }
  } catch (err) {
    rollbackImport(created, renamed);
    throw err;
  }
  return renamed.length;
}

// Best-effort user-tier reindex — `cmk search` works immediately after import;
// `cmk reindex` can rebuild later if this throws.
function tryReindexUserTier(userDir) {
  try {
    reindex({ tier: 'U', userDir, warn: () => {} });
    return true;
  } catch {
    return false;
  }
}

// Door 4: one operational audit entry (the user tier was bulk-rewritten). The
// individual facts keep their own provenance inside the bundled fact files; this
// records the import event + where overwritten files were backed up. Best-effort.
function writeImportAudit(userDir, { ts, fileCount, backedUp, backupRoot, inFile }) {
  try {
    appendAuditEntry(userDir, {
      ts,
      action: 'persona-imported',
      tier: 'U',
      id: 'persona-bundle',
      reasonCode: REASON_CODES.PERSONA_IMPORTED,
      paths: backedUp > 0 ? { archive: backupRoot } : undefined,
      extra: { fileCount, backedUp, source: inFile },
    });
  } catch {
    /* never fail the import because the audit write failed */
  }
}

/**
 * Import a persona bundle onto this machine's user tier. OVERWRITES, backing up
 * any file it would replace to <userDir>/.import-backups/<ts>/ first (no data
 * loss; transactional — rolls back on a mid-import failure). Rebuilds the
 * user-tier search index from the imported fragments.
 *
 * @param {object} opts
 * @param {string} opts.userDir - the target user-tier root.
 * @param {string} opts.inFile - the bundle to import.
 * @param {string} [opts.now] - ISO timestamp override (tests).
 * @returns {{action:'imported'|'error', fileCount?, backedUp?, backupPath?, reindexed?, errorCategory?, errors?}}
 */
export function importPersona({ userDir, inFile, now } = {}) {
  const { bundle, error } = readAndValidateBundle(inFile);
  if (error) return error;

  const ts = now ?? nowIso();
  mkdirSync(userDir, { recursive: true });
  const backupRoot = join(userDir, '.import-backups', ts.replace(/[:.]/g, '-'));

  let backedUp;
  try {
    backedUp = applyBundleAtomic(userDir, bundle.files, backupRoot);
  } catch (err) {
    return { action: 'error', errorCategory: 'io', errors: [`import failed and was rolled back: ${err?.message ?? err}`] };
  }

  const fileCount = Object.keys(bundle.files).length;
  const reindexed = tryReindexUserTier(userDir);
  writeImportAudit(userDir, { ts, fileCount, backedUp, backupRoot, inFile });

  return {
    action: 'imported',
    fileCount,
    backedUp,
    backupPath: backedUp > 0 ? backupRoot : null,
    reindexed,
  };
}
