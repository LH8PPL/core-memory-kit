// read-json.mjs — BOM-tolerant JSON config reading.
//
// Windows editors (and PowerShell `Set-Content -Encoding utf8`) routinely write
// a UTF-8 BOM (U+FEFF / EF BB BF) at the start of a file. A bare
// `JSON.parse(readFileSync(path, 'utf8'))` throws on that leading BOM, so any kit
// reader of a USER-AUTHORED config file (Amazon Q `settings.json`, an agent's
// config) silently mis-reads a BOM'd file. The cut-gate-kiro live-test surfaced
// this: the Kiro default-agent guard read a BOM'd `settings.json`, the parse
// threw into its catch, and the guard concluded "no default agent set" — then
// CLOBBERED the user's existing default (D-187; the same silent-clobber class as
// D-184). These helpers make the kit's config reads BOM-tolerant; route every
// USER-AUTHORED config JSON read through them (kiro-cli-agent, mutate-agent-
// config, doctor HC-1, settings-hooks, config-core, semantic-backend).

import { existsSync, readFileSync } from 'node:fs';

/** Strip a single leading UTF-8 BOM if present. Non-string input passes through. */
export function stripBom(text) {
  if (typeof text !== 'string') return text;
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/**
 * Read + parse a JSON file, tolerating a leading BOM. Never throws: a missing
 * file or malformed JSON returns `fallback` (default `undefined`) so callers can
 * branch on the value instead of wrapping every read in try/catch.
 *
 * NOTE: missing-file and malformed-JSON both collapse to `fallback`. A caller
 * that must DISTINGUISH the two (e.g. to surface a "parse error" message, or to
 * refuse-to-clobber a corrupt file like mutate-agent-config / settings-hooks)
 * should NOT use this — use `stripBom(readFileSync(...))` before its own parse.
 *
 * @param {string} path
 * @param {{ fallback?: any }} [opts]
 */
export function parseJsonFile(path, { fallback = undefined } = {}) {
  if (!existsSync(path)) return fallback;
  try {
    return JSON.parse(stripBom(readFileSync(path, 'utf8')));
  } catch {
    return fallback;
  }
}
