// mutate-agent-config.mjs — the shared per-agent config-write PRIMITIVE.
//
// Task 50 (cross-agent install). This is the one piece of machinery the whole
// `cmk install --ide <agent>` seam rests on: a single, tested function that
// writes the kit's entry (an MCP-server registration, a hook entry) into ANY
// agent's config file WITHOUT clobbering the user's other keys.
//
// The D-180 finding (research note 2026-06-20): do NOT build a per-agent
// `Installer` base class — claude-mem proved it breaks the moment agents differ
// in format/mechanism, and its ~6 bespoke config writers drifted in rigor (one
// surgical, one whole-file-clobber, one that discards user config on a JSON
// parse error). What actually generalizes is THIS primitive. Each per-agent
// profile is then just DATA (where the file is, which key, which format).
//
// The kit's existing disciplines, applied to third-party files:
//   - touch-only-our-keys      = the marker-block byte-preservation invariant
//   - refuse-on-parse-error    = the safe-write / Poison_Guard fail-closed rule
//   - atomic (tmp + rename)    = the same pattern compress-session/persona use
//   - idempotent changed-bool  = re-running install is a no-op (Codex's pattern)
//
// Public surface (one function — a deep module, narrow interface):
//
//   mutateAgentConfig({ path, format, keyPath, entry, mode? }) → result
//
//     path     absolute path to the agent's config file (may not exist yet)
//     format   'json'  (v0.4.0; 'yaml' / 'toml' deferred until an agent needs them)
//     keyPath  array of keys to the slot we own, e.g. ['mcpServers', 'claude-memory-kit']
//     entry    the object to place at keyPath
//     mode     'merge' (default — deep-merge into an existing entry) | 'replace'
//
//   Result shape (result-shapes.mjs conventions):
//     { action: 'created'|'updated'|'skipped'|'error', changed: boolean, path,
//       errorCategory?, errors? }
//       created  — the file did not exist; we created it with just our key
//       updated  — the file existed; our key was added/changed (siblings preserved)
//       skipped  — our key already matched exactly; nothing written (changed:false)
//       error    — input invalid (schema) or target unparseable (config_parse);
//                  NEVER writes on error

import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, unlinkSync } from 'node:fs';
import { dirname, basename, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { ERROR_CATEGORIES, errorResult } from './result-shapes.mjs';
import { stripBom } from './read-json.mjs';

const SUPPORTED_FORMATS = new Set(['json']);

/**
 * Write the kit's entry into an agent config file, preserving everything else.
 * @returns {{action:string, changed:boolean, path:string, errorCategory?:string, errors?:string[]}}
 */
export function mutateAgentConfig({ path, format, keyPath, entry, mode = 'merge' }) {
  // ── input validation (schema) ───────────────────────────────────────────
  if (typeof path !== 'string' || path.length === 0) {
    return errorResult({ category: ERROR_CATEGORIES.SCHEMA, errors: ['path must be a non-empty string'], changed: false });
  }
  if (!SUPPORTED_FORMATS.has(format)) {
    return errorResult({
      category: ERROR_CATEGORIES.SCHEMA,
      errors: [`unsupported format ${JSON.stringify(format)} — supported: ${[...SUPPORTED_FORMATS].join(', ')}`],
      changed: false,
      path,
    });
  }
  if (!Array.isArray(keyPath) || keyPath.length === 0 || !keyPath.every((k) => typeof k === 'string' && k.length > 0)) {
    return errorResult({ category: ERROR_CATEGORIES.SCHEMA, errors: ['keyPath must be a non-empty array of non-empty strings'], changed: false, path });
  }
  if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
    return errorResult({ category: ERROR_CATEGORIES.SCHEMA, errors: ['entry must be a plain object'], changed: false, path });
  }
  if (mode !== 'merge' && mode !== 'replace') {
    return errorResult({ category: ERROR_CATEGORIES.SCHEMA, errors: [`mode must be 'merge' or 'replace', got ${JSON.stringify(mode)}`], changed: false, path });
  }

  // ── read existing (refuse-to-clobber on parse error) ─────────────────────
  const fileExists = existsSync(path);
  let root;
  if (fileExists) {
    let raw;
    try {
      // stripBom: a user's config file written by a Windows editor may carry a
      // leading UTF-8 BOM, which would otherwise make the JSON.parse below refuse
      // a perfectly valid file as "corrupt" (D-187). Strip only the BOM; the
      // refuse-to-clobber-on-real-corruption guarantee below is unchanged.
      raw = stripBom(readFileSync(path, 'utf8'));
    } catch (err) {
      return errorResult({ category: ERROR_CATEGORIES.CONFIG_PARSE, errors: [`could not read ${path}: ${err.message}`], changed: false, path });
    }
    if (raw.trim() === '') {
      // an empty file is treated as an empty object (not a parse error)
      root = {};
    } else {
      try {
        root = JSON.parse(raw);
      } catch (err) {
        // The crucial guarantee: a corrupt target is NEVER overwritten.
        return errorResult({ category: ERROR_CATEGORIES.CONFIG_PARSE, errors: [`${path} is not valid JSON — refusing to overwrite: ${err.message}`], changed: false, path });
      }
    }
    if (root === null || typeof root !== 'object' || Array.isArray(root)) {
      return errorResult({ category: ERROR_CATEGORIES.CONFIG_PARSE, errors: [`${path} is valid JSON but not an object — refusing to overwrite`], changed: false, path });
    }
  } else {
    root = {};
  }

  // ── compute the next entry at keyPath ────────────────────────────────────
  const existing = getAt(root, keyPath);
  const nextEntry =
    mode === 'merge' && isPlainObject(existing) ? deepMerge(existing, entry) : entry;

  // idempotent: if our slot already deep-equals what we'd write, do nothing.
  if (existing !== undefined && deepEqual(existing, nextEntry)) {
    return { action: 'skipped', changed: false, path };
  }

  // ── apply + atomic write ─────────────────────────────────────────────────
  const next = cloneDeep(root);
  setAt(next, keyPath, nextEntry);

  const serialized = `${JSON.stringify(next, null, 2)}\n`;
  atomicWrite(path, serialized);

  return { action: fileExists ? 'updated' : 'created', changed: true, path };
}

// ── internal helpers ───────────────────────────────────────────────────────

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function getAt(obj, keyPath) {
  let cur = obj;
  for (const k of keyPath) {
    if (!isPlainObject(cur) || !(k in cur)) return undefined;
    cur = cur[k];
  }
  return cur;
}

function setAt(obj, keyPath, value) {
  let cur = obj;
  for (let i = 0; i < keyPath.length - 1; i += 1) {
    const k = keyPath[i];
    if (!isPlainObject(cur[k])) cur[k] = {};
    cur = cur[k];
  }
  cur[keyPath[keyPath.length - 1]] = value;
}

// Deep-merge `source` onto a copy of `target`. Objects merge recursively;
// arrays + scalars from source replace target's (no array concat — replacing
// args/command is the intended semantics).
function deepMerge(target, source) {
  const out = cloneDeep(target);
  for (const [k, v] of Object.entries(source)) {
    if (isPlainObject(v) && isPlainObject(out[k])) {
      out[k] = deepMerge(out[k], v);
    } else {
      out[k] = cloneDeep(v);
    }
  }
  return out;
}

function cloneDeep(v) {
  return v === undefined ? undefined : JSON.parse(JSON.stringify(v));
}

function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

// Atomic write: serialize to a temp sibling, then rename over the target.
// rename is atomic on the same filesystem, so a reader never sees a partial file.
// Exported so install-agent.mjs (the per-agent wiring) shares ONE implementation
// — the kit's shared-module discipline (no two copies to drift).
//
// Two Windows-specific hazards this guards against (BOTH real, BOTH surfaced by
// the Task-50 stress runs — not "flakes": concrete EPERM-under-load failures):
//   1. The tmp suffix is UNIQUE PER CALL (randomUUID), not `process.pid` — a
//      single install sequence writes the same path several times (write →
//      uninstall → prune) and vitest runs files concurrently in one worker
//      (shared pid), so a pid-keyed tmp name could collide.
//   2. `renameSync(tmp, target)` ONTO an existing file intermittently throws
//      EPERM/EBUSY on Windows when the target is transiently locked (AV /
//      indexer / another handle) under heavy parallel FS load. The kit already
//      hit + documented this in persona-portability.mjs (restoreBackup); the
//      proven fix is a short bounded retry. Without it, a `cmk install` on a
//      busy Windows machine could spuriously fail mid-write.
export function atomicWrite(path, contents) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = join(dirname(path), `.${basename(path)}.${randomUUID()}.tmp`);
  try {
    writeFileSync(tmp, contents, 'utf8');
    renameWithRetry(tmp, path);
  } finally {
    if (existsSync(tmp)) {
      try {
        unlinkSync(tmp);
      } catch {
        /* best-effort cleanup; the rename already succeeded or threw */
      }
    }
  }
}

// renameSync with a bounded retry + BACKOFF on transient Windows EPERM/EBUSY
// (the target briefly locked by AV/indexer/another handle under load). A
// no-delay spin doesn't work — the lock lasts milliseconds while 5 immediate
// retries finish in microseconds (the Task-50 stress proved this: retry fired
// but exhausted instantly). So we sleep between attempts with a synchronous
// backoff (Atomics.wait — real sync sleep, no busy-spin). A non-transient error
// (e.g. ENOENT on the source) reraises immediately so we don't mask a real bug.
//
// `rename` + `sleep` are injectable so the retry policy is unit-testable WITHOUT
// mocking node:fs or actually sleeping — production passes nothing.
export function renameWithRetry(from, to, attempts = 8, rename = renameSync, sleep = sleepMs) {
  let lastErr;
  for (let i = 0; i < attempts; i += 1) {
    try {
      rename(from, to);
      return;
    } catch (err) {
      if (err && (err.code === 'EPERM' || err.code === 'EBUSY' || err.code === 'EACCES')) {
        lastErr = err; // transient lock under load — back off + retry
        if (i < attempts - 1) sleep(Math.min(10 * 2 ** i, 250)); // 10,20,40…≤250ms
        continue;
      }
      throw err; // anything else is a real error — don't mask it
    }
  }
  throw lastErr;
}

// Synchronous sleep via Atomics.wait on a throwaway SharedArrayBuffer — blocks
// the thread for `ms` without a CPU busy-spin. Used only on the (rare) Windows
// transient-lock retry path, so the block is bounded + infrequent.
function sleepMs(ms) {
  if (ms <= 0) return;
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}
