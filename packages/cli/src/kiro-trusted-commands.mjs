// kiro-trusted-commands.mjs — pre-trust the kit's Kiro hook commands (D-194).
//
// THE PROBLEM (found live in the v0.4.0 cut-gate-kiro, 50.M): Kiro gates a hook's
// shell command behind a "Run / Reject" approval prompt unless it's pre-trusted
// (kiro.dev/docs/cli/chat/permissions). So the kit's inject/capture/guard hooks —
// `cmd.exe /c cmk hook promptSubmit`, etc. — prompt the user EVERY turn, and
// "automatic memory" isn't automatic. On Claude Code a registered hook just fires;
// on Kiro it must be trusted (the 6th cross-agent "Claude-Code-shaped assumption"
// cut-blocker — D-185/186/187/188/190).
//
// THE FIX: write the kit's OWN hook-command prefixes into the WORKSPACE
// `.vscode/settings.json` under `kiroAgent.trustedCommands` — Kiro's IDE
// command-trust list (an array of wildcard-PREFIX patterns; `npm *` trusts any
// command starting `npm `). Workspace scope (not the user-global
// `…/Kiro/User/settings.json`) so the trust travels with the repo and never
// touches the user's machine-wide trust.
//
// We trust ONLY the kit's own commands by SPECIFIC prefix — never the
// over-permissive `cmd.exe /c *` or `*` (the docs warn wildcards over-trust, and
// trust matches only the command PREFIX, so a broad prefix would also trust any
// chained command after it).
//
// Disciplines (same as mutateAgentConfig): array-UNION (a user's existing trusted
// commands are preserved + deduped, never clobbered), refuse-to-clobber on a
// corrupt file, BOM-tolerant read (D-187), idempotent, atomic write. Uninstall
// removes ONLY our patterns and prunes an emptied key (no orphan empty array) —
// the over-mutation guard.
//
// Public surface:
//   installKiroTrustedCommands({ projectRoot }) → { action, changed, path }
//   uninstallKiroTrustedCommands({ projectRoot }) → { action, changed, path }
//   kitTrustedCommandPatterns() → string[]  (the patterns we own — also the
//                                            uninstall key + the doctor/gate check)

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseJsonFile } from './read-json.mjs';
import { atomicWrite } from './mutate-agent-config.mjs';
import { ERROR_CATEGORIES, errorResult } from './result-shapes.mjs';

const SETTINGS_PATH = ['.vscode', 'settings.json'];
const TRUSTED_KEY = 'kiroAgent.trustedCommands';

const IS_WINDOWS = process.platform === 'win32';

// The kit's hook commands, as TRUST PREFIXES. These must prefix-match the actual
// commands kiro-hook-command.mjs emits:
//   IDE/CLI hooks → `[cmd.exe /c ]cmk hook <event>`   → `…cmk hook *`
//   delete-guard  → `[cmd.exe /c ]cmk-guard-memory`   → `…cmk-guard-memory*`
// Windows wraps in `cmd.exe /c ` (the WSL-no-node finding, P-PM2CD6CB); POSIX runs
// the bare command. We keep these in lockstep with kiro-hook-command.mjs by
// mirroring its exact platform prefix — a SPECIFIC prefix, not a blanket wildcard.
const WIN_PREFIX = 'cmd.exe /c ';
export function kitTrustedCommandPatterns() {
  const base = ['cmk hook *', 'cmk-guard-memory*'];
  return IS_WINDOWS ? base.map((b) => WIN_PREFIX + b) : base;
}

// Read settings.json, distinguishing missing (→ {}) from corrupt (→ throw-marker).
// BOM-tolerant: a Windows-editor BOM must not read as corrupt (D-187). Returns
// { root } on success or { error } on a genuine parse failure (refuse-to-clobber).
function readSettings(path) {
  if (!existsSync(path)) return { root: {} };
  let raw;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (err) {
    return { error: `could not read ${path}: ${err.message}` };
  }
  if (raw.trim() === '') return { root: {} };
  // parseJsonFile strips the BOM and returns the sentinel on bad JSON.
  const CORRUPT = Symbol('corrupt');
  const parsed = parseJsonFile(path, { fallback: CORRUPT });
  if (parsed === CORRUPT) return { error: `${path} is not valid JSON — refusing to overwrite` };
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { error: `${path} is valid JSON but not an object — refusing to overwrite` };
  }
  return { root: parsed };
}

export function installKiroTrustedCommands({ projectRoot } = {}) {
  if (!projectRoot) throw new Error('installKiroTrustedCommands: projectRoot is required');
  const path = join(projectRoot, ...SETTINGS_PATH);
  const fileExists = existsSync(path);

  const { root, error } = readSettings(path);
  if (error) return errorResult({ category: ERROR_CATEGORIES.CONFIG_PARSE, errors: [error], changed: false, path });

  const existing = Array.isArray(root[TRUSTED_KEY]) ? root[TRUSTED_KEY] : [];
  const want = kitTrustedCommandPatterns();

  // array-UNION: keep the user's entries (and order), append only the kit
  // patterns not already present. Idempotent: if all ours are present, no write.
  const missing = want.filter((p) => !existing.includes(p));
  if (missing.length === 0) return { action: 'skipped', changed: false, path };

  const next = { ...root, [TRUSTED_KEY]: [...existing, ...missing] };
  atomicWrite(path, `${JSON.stringify(next, null, 2)}\n`);
  return { action: 'installed', changed: true, path, created: !fileExists };
}

export function uninstallKiroTrustedCommands({ projectRoot } = {}) {
  if (!projectRoot) throw new Error('uninstallKiroTrustedCommands: projectRoot is required');
  const path = join(projectRoot, ...SETTINGS_PATH);
  if (!existsSync(path)) return { action: 'noop', changed: false, path };

  const { root, error } = readSettings(path);
  // A corrupt file on uninstall: leave it alone (don't error-out the whole
  // uninstall; just report no change for this leg).
  if (error || !Array.isArray(root[TRUSTED_KEY])) return { action: 'noop', changed: false, path };

  // Ownership is by exact-string membership (skill-review M1): if a user had
  // MANUALLY added a pattern byte-identical to one of ours, uninstall removes it
  // too — we can't distinguish who added an identical string without a separate
  // ownership-marker array, which would be over-engineering for this surface.
  // Collision is near-zero (our patterns are kit-specific: `cmd.exe /c cmk hook *`).
  const ours = new Set(kitTrustedCommandPatterns());
  const kept = root[TRUSTED_KEY].filter((c) => !ours.has(c));
  if (kept.length === root[TRUSTED_KEY].length) return { action: 'noop', changed: false, path };

  const next = { ...root };
  if (kept.length === 0) {
    // prune an emptied key — no orphan empty array left behind.
    delete next[TRUSTED_KEY];
  } else {
    next[TRUSTED_KEY] = kept;
  }
  atomicWrite(path, `${JSON.stringify(next, null, 2)}\n`);
  return { action: 'uninstalled', changed: true, path };
}
