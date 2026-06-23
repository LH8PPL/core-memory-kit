// `cmk repair` (Task 39, T-033, parts 39.1–39.3).
//
// Public boundary:
//   async runRepair({projectRoot, scope: 'hooks'|'locks'|'index'|'all', staleLockMs?, reindexer?})
//     → {action, scope, repairs: [...], errors, duration_ms}
//
// Three repair scopes:
//   - 'hooks'  : deep-merge the kit's canonical hooks block from plugin/hooks/hooks.json
//                into <projectRoot>/.claude/settings.json. Idempotent. Closes HC-2 failures.
//   - 'locks'  : remove stale lock files (default >1h old; configurable via staleLockMs).
//                Live locks (holderAlive: true) are preserved. Closes HC-9 failures.
//   - 'index'  : invoke cmk reindex --full (Task 29's reindexFull boundary). Closes HC-5 failures.
//   - 'all'    : run all three in order. Default scope when --all flag is set OR no scope provided
//                (v0.1.0 defaults to NO-OP if no scope flag — user must opt in to repairs).
//
// Per design §14 + tasks.md 39 (39.1–39.3).

import {
  existsSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import {
  appendAuditEntry,
  nowIso,
  REASON_CODES,
} from './audit-log.mjs';
import { ERROR_CATEGORIES, errorResult } from './result-shapes.mjs';
import { detectStaleLocks } from './lock-discipline.mjs';
import { writeKitHooks } from './settings-hooks.mjs';

const DEFAULT_STALE_LOCK_MS = 60 * 60 * 1000; // 1 hour
const SETTINGS_REL = ['.claude', 'settings.json'];

// Task 49 (2026-05-29): the canonical hooks block + the read-merge-write
// logic moved to settings-hooks.mjs (single source of truth, shared with
// install.mjs). It also switched from the PLUGIN form (`bash
// "${CLAUDE_PLUGIN_ROOT}/bin/<name>"`, 6 events incl. Setup) to the
// npm-route form (PATH-resolved bare bin names, 5 events) so that
// `cmk repair --hooks` produces hooks that work with NO plugin loaded —
// matching `cmk install`'s new posture as a complete entry point. The
// full decision trail (incl. why Setup/cmk-version-check is dropped and
// where the plugin form still lives) is documented in settings-hooks.mjs.
//
// Pre-Task-49 history (kept for the trail): the block was previously
// embedded inline here as a fix for the I1 finding (Task 39 skill-review,
// 2026-05-28) — reading from plugin/hooks/hooks.json broke post-npm-install-g
// because the plugin/ tree is outside the published tarball. The inline
// constant fixed that; Task 49 then extracted it to the shared module.

/**
 * Repair `<projectRoot>/.claude/settings.json` by merging in the kit's
 * canonical hooks block (via the shared writeKitHooks boundary).
 * Preserves any other top-level keys + non-kit hook entries.
 */
function repairHooks({ projectRoot, ts }) {
  const settingsPath = join(projectRoot, ...SETTINGS_REL);
  const r = writeKitHooks(settingsPath);

  if (r.error) {
    return { kind: 'hooks', changed: false, error: r.error };
  }

  // I3 fix (Task 39 skill-review 2026-05-28): emit a Door-4 audit
  // entry per outcome. cmk repair mutates user-visible state; without
  // this, a "cmk repair broke my settings.json" report two weeks from
  // now has no audit trail.
  try {
    appendAuditEntry(join(projectRoot, 'context'), {
      ts,
      action: 'repair',
      tier: 'P',
      id: 'P-RPHKAPLD', // synthetic stable id for hooks-repair events (base32 alphabet)
      reasonCode: r.changed ? REASON_CODES.REPAIR_HOOKS_APPLIED : REASON_CODES.REPAIR_HOOKS_NOOP,
      extra: { settingsPath: r.settingsPath, events: r.events },
    });
  } catch {
    // best-effort — never block repair on audit-log failure
  }

  return {
    kind: 'hooks',
    changed: r.changed,
    settingsPath: r.settingsPath,
    events: r.events,
  };
}

/**
 * Repair stale locks under <projectRoot>/context/.locks/ +
 * <userDir>/.locks/. Removes locks older than staleLockMs whose holder
 * process is no longer alive. Live locks are preserved.
 */
function repairLocks({ projectRoot, userDir, staleLockMs, now, ts }) {
  const stale = detectStaleLocks(projectRoot, { userDir }).filter((r) => r.stale);
  const removed = [];
  const preserved = [];
  // M1 fix (skill-review 2026-05-28): nowMs is anchored once and used
  // for BOTH cutoff comparison AND preserved-entry ageMs reporting. Old
  // code used injected `now` for cutoff but Date.now() for ageMs, which
  // produced confusing test fixtures if anyone asserted on age values.
  const nowMs = now ? new Date(now).getTime() : Date.now();
  const cutoffMs = nowMs - staleLockMs;
  for (const lock of stale) {
    let mtimeMs;
    try {
      mtimeMs = statSync(lock.path).mtimeMs;
    } catch {
      continue;
    }
    if (mtimeMs > cutoffMs) {
      // Stale but recent (within the staleLockMs window) — keep for now
      preserved.push({ path: lock.path, ageMs: nowMs - mtimeMs, reason: 'within-cutoff' });
      continue;
    }
    try {
      unlinkSync(lock.path);
      removed.push({ path: lock.path, reason: lock.reason });
    } catch (err) {
      preserved.push({
        path: lock.path,
        ageMs: nowMs - mtimeMs,
        reason: `unlink-failed: ${err?.message ?? err}`,
      });
    }
  }
  // I3 fix (skill-review 2026-05-28): emit a Door-4 audit entry per
  // removed lock so the audit trail records every file deletion the
  // repair pipeline performed. Without this, a "cmk repair deleted my
  // lock" post-mortem has nothing to read.
  for (const r of removed) {
    try {
      appendAuditEntry(join(projectRoot, 'context'), {
        ts,
        action: 'repair',
        tier: 'P',
        id: 'P-RPLKRMVD', // synthetic stable id for repair-lock-removed events (base32 alphabet)
        reasonCode: REASON_CODES.REPAIR_LOCK_REMOVED,
        extra: { path: r.path, reason: r.reason },
      });
    } catch {
      // best-effort
    }
  }
  return {
    kind: 'locks',
    changed: removed.length > 0,
    removed,
    preserved,
  };
}

/**
 * Repair the SQLite + FTS5 index by invoking the reindex full pipeline
 * (Task 29's reindexFull). Lazy-loaded so test imports don't pull in
 * the better-sqlite3 binary unnecessarily.
 *
 * @param {object} opts
 * @param {Function} [opts.reindexer]  test-injected reindex function; defaults to import('./index-rebuild.mjs').reindexFull
 */
async function repairIndex({ projectRoot, userDir, reindexer }) {
  // Production reindexFull requires a `db` (it calls db.exec) — repairIndex
  // must open + own + close it, exactly like runReindex does. The earlier
  // code called reindexFull({projectRoot,userDir}) with NO db, so
  // `cmk repair --index`/`--all` threw "undefined (reading 'exec')" since
  // Task 49 (cut-gate v0.3.1 finding — every test mocked the reindexer, so
  // the real call-shape was never exercised). An injected reindexer (tests)
  // takes whatever args it wants; we only open a db for the real one.
  let reindexFn = reindexer;
  let db = null;
  if (!reindexFn) {
    const [{ reindexFull }, { openIndexDb }] = await Promise.all([
      import('./index-rebuild.mjs'),
      import('./index-db.mjs'),
    ]);
    reindexFn = reindexFull;
    db = openIndexDb({ projectRoot });
  }
  if (typeof reindexFn !== 'function') {
    if (db) db.close();
    return {
      kind: 'index',
      changed: false,
      error: 'reindexFull is not a function',
    };
  }
  try {
    const r = db
      ? await reindexFn({ projectRoot, userDir, db })
      : await reindexFn({ projectRoot, userDir });
    return {
      kind: 'index',
      changed: true,
      result: r,
    };
  } catch (err) {
    return {
      kind: 'index',
      changed: false,
      error: `reindex failed: ${err?.message ?? err}`,
    };
  } finally {
    if (db) db.close();
  }
}

/**
 * Migrate committed memory markdown to the lint-clean shape (Task 164.9) — so a
 * repo installed before the lint-clean generators (164.1–164.7) brings its
 * existing memory up to the clean format a default markdownlint passes. Today
 * this normalizes `context/DECISIONS.md` (old `### ` entries → `## ` +
 * blank-surrounded). Idempotent + CRLF-tolerant: a no-op on already-clean
 * content (changed:false), so it's safe to run repeatedly. ONLY rewrites a file
 * whose normalized form actually differs — never a gratuitous write.
 */
async function repairMemoryFormat({ projectRoot }) {
  const { normalizeDecisionsJournal } = await import('./decisions-journal.mjs');
  const decisionsPath = join(projectRoot, 'context', 'DECISIONS.md');
  if (!existsSync(decisionsPath)) {
    return { kind: 'format', changed: false, detail: 'no DECISIONS.md' };
  }
  try {
    const before = readFileSync(decisionsPath, 'utf8');
    const after = normalizeDecisionsJournal(before);
    if (after === before) {
      return { kind: 'format', changed: false, detail: 'DECISIONS.md already lint-clean' };
    }
    writeFileSync(decisionsPath, after, 'utf8');
    return { kind: 'format', changed: true, detail: 'DECISIONS.md migrated to lint-clean headings' };
  } catch (err) {
    return { kind: 'format', changed: false, error: `format migration failed: ${err?.message ?? err}` };
  }
}

/**
 * Public boundary: run the repair pipeline.
 *
 * @returns {Promise<object>}
 */
export async function runRepair({
  projectRoot,
  userDir,
  scope = 'all',
  staleLockMs = DEFAULT_STALE_LOCK_MS,
  reindexer,
  now,
} = {}) {
  const ts = now ?? nowIso();
  const t0 = Date.now();
  if (!projectRoot) {
    return errorResult({
      category: ERROR_CATEGORIES.MISSING_PROJECT_ROOT,
      errors: ['projectRoot is required'],
      duration_ms: Date.now() - t0,
    });
  }
  if (!['hooks', 'locks', 'index', 'format', 'all'].includes(scope)) {
    return errorResult({
      category: ERROR_CATEGORIES.SCHEMA,
      errors: [`invalid scope: ${scope}; expected 'hooks' | 'locks' | 'index' | 'format' | 'all'`],
      duration_ms: Date.now() - t0,
    });
  }

  const scopes = scope === 'all' ? ['hooks', 'locks', 'index', 'format'] : [scope];
  const repairs = [];
  let errors = 0;
  for (const s of scopes) {
    if (s === 'hooks') {
      const r = repairHooks({ projectRoot, ts });
      if (r.error) errors += 1;
      repairs.push(r);
    } else if (s === 'locks') {
      const r = repairLocks({ projectRoot, userDir, staleLockMs, now: ts, ts });
      if (r.error) errors += 1;
      repairs.push(r);
    } else if (s === 'index') {
      // eslint-disable-next-line no-await-in-loop
      const r = await repairIndex({ projectRoot, userDir, reindexer });
      if (r.error) errors += 1;
      repairs.push(r);
    } else if (s === 'format') {
      // eslint-disable-next-line no-await-in-loop
      const r = await repairMemoryFormat({ projectRoot });
      if (r.error) errors += 1;
      repairs.push(r);
    }
  }
  return {
    action: 'completed',
    scope,
    repairs,
    errors,
    duration_ms: Date.now() - t0,
  };
}
