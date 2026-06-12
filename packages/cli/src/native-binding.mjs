// Native-binding health probes (Task 141a, D-129/D-133).
//
// npm 12 (~July 2026) flips `allowScripts` OFF by default: dependency
// install scripts — including the IMPLICIT node-gyp build a binding.gyp
// package gets — silently don't run on a fresh `npm install -g`. The kit's
// two native deps are exactly that shape:
//   - better-sqlite3 (core: the search index) — kit-level remedy
//   - onnxruntime-node (inside the optional @huggingface/transformers
//     embedder) — semantic-level remedy
//
// Without the binding the package LOOKS installed but `cmk search`/reindex
// crash at first use. These probes detect that state cheaply so:
//   - `cmk install` can ask the user and fix INLINE (the primary UX — the
//     user's 2026-06-12 steer: ask at install, not a secondary command);
//   - `cmk doctor` HC-8 stays as the ongoing backstop;
//   - the --with-semantic runner passes the allow flag itself.
//
// Remediation verified against the primary sources (2026-06-12): GitHub
// changelog "Upcoming breaking changes for npm v12" + npm v11 config docs —
// the `allow-scripts` CONFIG (comma-separated package list) is the
// documented path "for one-off and global contexts: npm exec, npx, and
// npm install -g"; the project-level `npm approve-scripts` allowlist in
// package.json does not apply to `-g` installs. Warnings (and the config
// key) exist from npm 11.16.0.

import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';

export const KIT_BINDING_REMEDY =
  'npm install -g @lh8ppl/claude-memory-kit --allow-scripts=better-sqlite3';
export const EMBEDDER_BINDING_REMEDY =
  'npm install -g @huggingface/transformers --allow-scripts=onnxruntime-node';

// The `allow-scripts` config key ships (as warnings + config) in 11.16.0.
const ALLOW_SCRIPTS_MIN = [11, 16, 0];

const requireFromHere = createRequire(import.meta.url);

/**
 * Probe the kit's own native dep (better-sqlite3). A bare require is NOT
 * enough: better-sqlite3 v12 loads its .node binding LAZILY — `bindings()`
 * fires inside `new Database(...)`, so on a script-blocked install the
 * require succeeds and only instantiation throws ("Could not locate the
 * bindings file"). Live-verified 2026-06-12 against a real
 * `--ignore-scripts` install (npm 12's exact effect): require → loaded,
 * `new Database(':memory:')` → the bindings error. The probe therefore
 * opens (and closes) an in-memory DB. Synchronous on purpose (CJS) so
 * install and doctor call it without changing their flow.
 *
 * @param {object} [opts] - { requireImpl } test seam (throw = broken).
 * @returns {{ok: true} | {ok: false, reason: string, remedy: string}}
 */
export function checkKitBinding({ requireImpl } = {}) {
  const req =
    requireImpl ??
    (() => {
      const Database = requireFromHere('better-sqlite3');
      const db = new Database(':memory:');
      db.close();
    });
  try {
    req();
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      reason: err?.message ?? String(err),
      remedy: KIT_BINDING_REMEDY,
    };
  }
}

/**
 * Probe the optional semantic embedder. Distinguishes NOT-INSTALLED (the
 * normal opt-out state — `installed: false`) from INSTALLED-BUT-BROKEN
 * (npm 12 blocked onnxruntime-node's script — `installed: true`). The
 * semantic-backend's own loader collapses both into "not installed"
 * (loadExtractor's catch), which under npm 12 would report the wrong
 * reason — this probe is what tells the truth.
 *
 * Honest limitation: this is an IMPORT-level probe. Like better-sqlite3,
 * onnxruntime may bind lazily — an installed-but-script-blocked embedder
 * can pass the import and only fail at pipeline construction. The deep
 * check is `warmEmbedder` (it builds a real pipeline), which runs at
 * `--with-semantic` install time; and the runner's `--allow-scripts`
 * flag prevents the broken state from being created at all. A broken
 * embedder also degrades GRACEFULLY (keyword fallback + note, D-111) —
 * unlike the kit binding, it can't crash search.
 *
 * @param {object} [opts] - { importImpl } test seam.
 * @returns {Promise<{ok: true} | {ok: false, installed: boolean, reason: string, remedy: string}>}
 */
export async function checkEmbedderBinding({ importImpl } = {}) {
  const imp = importImpl ?? (() => import('@huggingface/transformers'));
  try {
    await imp();
    return { ok: true };
  } catch (err) {
    const message = err?.message ?? String(err);
    const notInstalled =
      err?.code === 'ERR_MODULE_NOT_FOUND' && message.includes('@huggingface/transformers');
    return {
      ok: false,
      installed: !notInstalled,
      reason: notInstalled ? 'not-installed' : message,
      remedy: EMBEDDER_BINDING_REMEDY,
    };
  }
}

/**
 * Whether the host npm understands the `allow-scripts` config (≥ 11.16.0).
 * Conservative on any probe failure: report unsupported so callers never
 * emit a flag the host npm would reject as unknown.
 *
 * @param {object} [opts] - { spawnSyncImpl } test seam.
 * @returns {{supported: boolean, version: string | null}}
 */
export function npmSupportsAllowScripts({ spawnSyncImpl = spawnSync } = {}) {
  try {
    // Constant command under shell:true — npm is npm.cmd on Windows; the
    // shell resolves it cross-platform (the buildDefaultNpmRunner pattern).
    const r = spawnSyncImpl('npm --version', {
      encoding: 'utf8',
      shell: true,
      timeout: 30_000,
    });
    if (r.status !== 0 || !r.stdout) return { supported: false, version: null };
    const version = String(r.stdout).trim();
    const parts = version.split('.').map((n) => Number.parseInt(n, 10));
    if (parts.length < 3 || parts.some(Number.isNaN)) {
      return { supported: false, version };
    }
    for (let i = 0; i < 3; i++) {
      if (parts[i] > ALLOW_SCRIPTS_MIN[i]) return { supported: true, version };
      if (parts[i] < ALLOW_SCRIPTS_MIN[i]) return { supported: false, version };
    }
    return { supported: true, version };
  } catch {
    return { supported: false, version: null };
  }
}
