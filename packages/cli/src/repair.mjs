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
  mkdirSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import {
  appendAuditEntry,
  nowIso,
  REASON_CODES,
} from './audit-log.mjs';
import { ERROR_CATEGORIES, errorResult } from './result-shapes.mjs';
import { detectStaleLocks } from './lock-discipline.mjs';

const DEFAULT_STALE_LOCK_MS = 60 * 60 * 1000; // 1 hour
const SETTINGS_REL = ['.claude', 'settings.json'];

// I1 fix (Task 39 skill-review 2026-05-28): the canonical hooks block
// is embedded INLINE as a JS constant instead of being read from
// plugin/hooks/hooks.json. Rationale: packages/cli/package.json `files`
// lists ['bin/', 'src/', 'README.md'] — the plugin/ tree is OUTSIDE the
// published @claude-memory-kit/cli tarball. Reading from plugin/ works
// in-repo (where __dirname resolves up to the repo root) but breaks
// post-`npm install -g` where plugin/ doesn't exist.
//
// Same Task-33-B1 class of bug: cron-emission paths were also broken
// post-npm-install-g until they embedded absolute paths at registration
// time. The embed-the-canonical-constant pattern is the durable fix.
//
// Source of truth: keep this in sync with plugin/hooks/hooks.json. A
// future validator (scripts/validate-hooks-block-sync.mjs) would catch
// drift automatically; v0.1.x candidate.
const KIT_HOOKS_BLOCK = Object.freeze({
  Setup: [{ hooks: [{ type: 'command', command: 'bash "${CLAUDE_PLUGIN_ROOT}/bin/cmk-version-check"', timeout: 30 }] }],
  SessionStart: [{ hooks: [{ type: 'command', command: 'bash "${CLAUDE_PLUGIN_ROOT}/bin/cmk-inject-context"', timeout: 30 }] }],
  UserPromptSubmit: [{ hooks: [{ type: 'command', command: 'bash "${CLAUDE_PLUGIN_ROOT}/bin/cmk-capture-prompt"', timeout: 10 }] }],
  PostToolUse: [{ matcher: 'Write|Edit|MultiEdit', hooks: [{ type: 'command', command: 'bash "${CLAUDE_PLUGIN_ROOT}/bin/cmk-observe-edit"', async: true, timeout: 120 }] }],
  Stop: [{ hooks: [{ type: 'command', command: 'bash "${CLAUDE_PLUGIN_ROOT}/bin/cmk-capture-turn"', timeout: 30 }] }],
  SessionEnd: [{ hooks: [{ type: 'command', command: 'bash "${CLAUDE_PLUGIN_ROOT}/bin/cmk-compress-session"', timeout: 60 }] }],
});

/**
 * Repair `<projectRoot>/.claude/settings.json` by merging in the kit's
 * canonical hooks block. Preserves any other top-level keys + non-kit
 * hook entries (e.g., the user's own PreToolUse hooks under different
 * matchers).
 */
function repairHooks({ projectRoot, ts }) {
  // I1 fix: use the inlined KIT_HOOKS_BLOCK constant; no file read,
  // no npm-install-g brittleness.
  const kitHooks = KIT_HOOKS_BLOCK;

  const settingsPath = join(projectRoot, ...SETTINGS_REL);
  let settings = {};
  if (existsSync(settingsPath)) {
    try {
      settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
    } catch (err) {
      return {
        kind: 'hooks',
        changed: false,
        error: `${settingsPath} parse error: ${err?.message ?? err}`,
      };
    }
  }

  const before = JSON.stringify(settings);
  if (!settings.hooks || typeof settings.hooks !== 'object') {
    settings.hooks = {};
  }

  // Merge each event array: replace the kit's hook entries (matched by
  // command substring) with the canonical version; keep any user-added
  // entries that don't reference the kit.
  const KIT_COMMAND_TOKENS = [
    'cmk-version-check',
    'cmk-inject-context',
    'cmk-capture-prompt',
    'cmk-observe-edit',
    'cmk-capture-turn',
    'cmk-compress-session',
  ];
  const isKitEntry = (entry) => {
    if (!entry || typeof entry !== 'object') return false;
    // Entry shape varies: {command} or {hooks: [{command}]}.
    const collectCommands = (e) => {
      const cmds = [];
      if (typeof e.command === 'string') cmds.push(e.command);
      if (Array.isArray(e.hooks)) {
        for (const h of e.hooks) if (typeof h.command === 'string') cmds.push(h.command);
      }
      return cmds;
    };
    const cmds = collectCommands(entry);
    return cmds.some((c) => KIT_COMMAND_TOKENS.some((t) => c.includes(t)));
  };

  for (const [eventName, kitEntries] of Object.entries(kitHooks)) {
    const existing = Array.isArray(settings.hooks[eventName])
      ? settings.hooks[eventName]
      : [];
    const userEntries = existing.filter((e) => !isKitEntry(e));
    settings.hooks[eventName] = [...userEntries, ...kitEntries];
  }

  const after = JSON.stringify(settings);
  const changed = before !== after;

  if (changed) {
    mkdirSync(dirname(settingsPath), { recursive: true });
    writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n', 'utf8');
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
      reasonCode: changed ? REASON_CODES.REPAIR_HOOKS_APPLIED : REASON_CODES.REPAIR_HOOKS_NOOP,
      extra: { settingsPath, events: Object.keys(kitHooks) },
    });
  } catch {
    // best-effort — never block repair on audit-log failure
  }

  return {
    kind: 'hooks',
    changed,
    settingsPath,
    events: Object.keys(kitHooks),
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
  let reindexFn = reindexer;
  if (!reindexFn) {
    const mod = await import('./index-rebuild.mjs');
    reindexFn = mod.reindexFull;
  }
  if (typeof reindexFn !== 'function') {
    return {
      kind: 'index',
      changed: false,
      error: 'reindexFull is not a function',
    };
  }
  try {
    const r = await reindexFn({ projectRoot, userDir });
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
  if (!['hooks', 'locks', 'index', 'all'].includes(scope)) {
    return errorResult({
      category: ERROR_CATEGORIES.SCHEMA,
      errors: [`invalid scope: ${scope}; expected 'hooks' | 'locks' | 'index' | 'all'`],
      duration_ms: Date.now() - t0,
    });
  }

  const scopes = scope === 'all' ? ['hooks', 'locks', 'index'] : [scope];
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
