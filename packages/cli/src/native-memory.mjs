// Native Anthropic Auto Memory coexistence (Task 60, ADR-0011).
//
// Claude Code ships its own Auto Memory (v2.1.59+, ON by default), writing
// machine-local `~/.claude/projects/<slug>/memory/` in the same shape the kit
// uses in-repo. With the kit installed BOTH inject at session start → context
// bloat. Per ADR-0011 the kit is ADDITIVE, not enforcing: the default is
// coexist (we never touch the user's setting); `cmk disable-native-memory`
// is a one-command, committable opt-in that writes `autoMemoryEnabled: false`
// into the project's `.claude/settings.json` (which travels with `git clone`,
// unlike the user-only `autoMemoryDirectory`). `cmk enable-native-memory`
// reverses it (explicit `true`).
//
// Public boundary:
//   setNativeAutoMemory({ projectRoot, enabled })
//     → { action: 'written' | 'unchanged', settingsPath, enabled }
//     → errorResult({ category: SCHEMA }) when the existing file is unparseable
//       (NEVER clobber a hand-broken file — surface it).
//   getNativeAutoMemoryState({ projectRoot })
//     → { state: 'enabled' | 'disabled' | 'default' | 'unknown', settingsPath }
//   (`default` = key absent ⇒ Anthropic's default, which is ON.)

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { errorResult, ERROR_CATEGORIES } from './result-shapes.mjs';

const SETTINGS_REL = ['.claude', 'settings.json'];

export function nativeMemorySettingsPath(projectRoot) {
  return join(projectRoot, ...SETTINGS_REL);
}

function readSettings(settingsPath) {
  if (!existsSync(settingsPath)) return { settings: {}, existed: false };
  const raw = readFileSync(settingsPath, 'utf8');
  return { settings: JSON.parse(raw), existed: true };
}

/**
 * Read the project's `.claude/settings.json` and report the native-memory
 * state. `default` means the user has not set `autoMemoryEnabled` at all, so
 * Anthropic's default (enabled) applies.
 */
export function getNativeAutoMemoryState({ projectRoot }) {
  const settingsPath = nativeMemorySettingsPath(projectRoot);
  if (!existsSync(settingsPath)) return { state: 'default', settingsPath };
  let settings;
  try {
    ({ settings } = readSettings(settingsPath));
  } catch (err) {
    return { state: 'unknown', settingsPath, error: err?.message ?? String(err) };
  }
  const v = settings?.autoMemoryEnabled;
  if (v === false) return { state: 'disabled', settingsPath };
  if (v === true) return { state: 'enabled', settingsPath };
  return { state: 'default', settingsPath };
}

/**
 * The one-line `cmk install` heads-up about native-vs-kit coexistence
 * (ADR-0011). Returns the note string when the heads-up is relevant (the user
 * has NOT already opted out), or `null` when they've disabled native memory
 * (no point nagging). Pure + trivially testable; runInstall just prints it.
 */
export function nativeMemoryInstallNote(projectRoot) {
  if (getNativeAutoMemoryState({ projectRoot }).state === 'disabled') return null;
  return "  Note: Claude Code's native Auto Memory keeps running alongside the kit (both fill over time). For one lean memory layer, run `cmk disable-native-memory`.";
}

/**
 * Write `autoMemoryEnabled: <enabled>` into the project's committable
 * `.claude/settings.json`. Idempotent (a no-op write reports `unchanged` and
 * leaves the file byte-identical). Preserves every sibling key. On a parse
 * error of an existing file, returns an error WITHOUT overwriting.
 */
export function setNativeAutoMemory({ projectRoot, enabled }) {
  const settingsPath = nativeMemorySettingsPath(projectRoot);

  let settings = {};
  if (existsSync(settingsPath)) {
    try {
      ({ settings } = readSettings(settingsPath));
    } catch (err) {
      return errorResult({
        category: ERROR_CATEGORIES.SCHEMA,
        errors: [`${settingsPath} parse error: ${err?.message ?? err}`],
      });
    }
  }

  if (settings.autoMemoryEnabled === enabled) {
    return { action: 'unchanged', settingsPath, enabled };
  }

  settings.autoMemoryEnabled = enabled;
  mkdirSync(dirname(settingsPath), { recursive: true });
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n', 'utf8');
  return { action: 'written', settingsPath, enabled };
}
