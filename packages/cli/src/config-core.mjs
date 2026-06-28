// `cmk config get/set/--show-origin` core (Task 129, D-121).
//
// The v0.1.0 stub became real the day `--with-semantic` shipped:
// context/settings.json now carries a user-facing setting
// (search.default_mode) and hand-editing JSON was the only path. This is
// the read-merge-write surface over the kit's settings files.
//
// Settings live in `<tier-root>/settings.json` for each of the three tiers
// (resolveTierRoot — the shared module, not re-derived). Resolution
// precedence mirrors the kit's memory model + git config semantics:
//   local (context.local/) > project (context/) > user (~/.claude-memory-kit/)
// A `get` returns the highest-precedence tier that defines the dotted key;
// `--show-origin` lists every tier that defines it (winner + shadowed), the
// direnv lesson (design §7.2: "without --show-origin, users rage-quit when
// settings appear from nowhere"). `set` writes one tier (project default),
// preserving every sibling key (the mergeProjectSettings discipline,
// generalized per tier).
//
// Scope (D-121): the kit's own JSON settings files. NOT the richer
// settings-or-observation `--show-origin` sketch in design §7.2's example
// (observations have their own provenance/shadowed_by surface, §6); this is
// the concrete settings half the semantic default forced into existence.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { resolveTierRoot } from './tier-paths.mjs';
import { parseJsonFile } from './read-json.mjs';

// Highest-precedence first.
const TIERS = Object.freeze([
  { name: 'local', tier: 'L' },
  { name: 'project', tier: 'P' },
  { name: 'user', tier: 'U' },
]);

// Keys that would pollute the prototype chain — rejected on both read and
// write. `cmk config set __proto__.x y` must never reach Object.prototype
// (skill-review blocking finding); a key path containing any of these is
// invalid, not a silent no-op.
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
function hasForbiddenSegment(dottedKey) {
  return dottedKey.split('.').some((p) => FORBIDDEN_KEYS.has(p));
}

function settingsPathFor(tierName, { projectRoot, userDir }) {
  const tier = TIERS.find((t) => t.name === tierName)?.tier;
  return join(resolveTierRoot({ tier, projectRoot, userDir }), 'settings.json');
}

function readSettings(path) {
  // BOM-tolerant (parseJsonFile): a settings.json written by a Windows editor
  // carries a UTF-8 BOM that a bare JSON.parse would reject (D-187). A missing
  // OR malformed file resolves to null — never throw on a read (a hand-broken
  // JSON shouldn't crash `cmk config get`).
  return parseJsonFile(path, { fallback: null });
}

// Walk a dotted path; returns {found, value}. `found` distinguishes a key
// set to `undefined`-ish from a key that isn't there (the honesty contract).
function dig(obj, dottedKey) {
  if (obj == null || typeof obj !== 'object') return { found: false };
  const parts = dottedKey.split('.');
  let cur = obj;
  for (const p of parts) {
    if (cur == null || typeof cur !== 'object' || !(p in cur)) return { found: false };
    cur = cur[p];
  }
  return { found: true, value: cur };
}

/**
 * Resolve a dotted setting key across tiers (local > project > user).
 *
 * @returns {{found: boolean, value?: *, tier?: 'local'|'project'|'user'}}
 */
export function configGet(key, { projectRoot, userDir } = {}) {
  if (!key || !String(key).trim()) return { found: false };
  if (hasForbiddenSegment(key)) return { found: false };
  for (const { name } of TIERS) {
    const settings = readSettings(settingsPathFor(name, { projectRoot, userDir }));
    const hit = dig(settings, key);
    if (hit.found) return { found: true, value: hit.value, tier: name };
  }
  return { found: false };
}

/** Scalar coercion: true/false/null → primitives, integer/float strings →
 *  numbers, everything else stays a string. JSON settings are typed, and a
 *  CLI arg is always a string — `cmk config set x true` should write a bool. */
function coerce(raw) {
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (raw === 'null') return null;
  if (/^-?\d+$/.test(raw)) return Number.parseInt(raw, 10);
  if (/^-?\d*\.\d+$/.test(raw)) return Number.parseFloat(raw);
  return raw;
}

// Exported for a direct unit test: this guard holds a security invariant
// (prototype-pollution resistance) and is analyzed by CodeQL in isolation, so
// it's tested at its own boundary, not only through configSet.
export function setDeep(obj, dottedKey, value) {
  // Defense-in-depth: refuse prototype-polluting segments INSIDE the walker
  // itself, not only at the public entry points (configGet/Set/ShowOrigin all
  // pre-check via hasForbiddenSegment). A self-guarding utility stays safe even
  // if a future caller forgets the guard — and it closes the CodeQL
  // js/prototype-pollution-utility finding. Reuses the same helper as the entry
  // points so the forbidden-segment set can't drift.
  if (hasForbiddenSegment(dottedKey)) {
    throw new Error(
      `setDeep: forbidden key segment (${[...FORBIDDEN_KEYS].join('/')}) — prototype-pollution guard`,
    );
  }
  const parts = dottedKey.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    if (cur[p] == null || typeof cur[p] !== 'object' || Array.isArray(cur[p])) cur[p] = {};
    cur = cur[p];
  }
  cur[parts[parts.length - 1]] = value;
}

/**
 * Set a dotted key in one tier's settings.json (project default), preserving
 * every sibling key (read-merge-write).
 *
 * @returns {{ok: boolean, tier?: string, path?: string, error?: string}}
 */
export function configSet(key, rawValue, { projectRoot, userDir, tier = 'project' } = {}) {
  if (!key || !String(key).trim()) return { ok: false, error: 'key is required (dotted path)' };
  if (hasForbiddenSegment(key)) {
    return { ok: false, error: `key contains a forbidden segment (${[...FORBIDDEN_KEYS].join('/')}) — prototype-pollution guard` };
  }
  if (!TIERS.some((t) => t.name === tier)) {
    return { ok: false, error: `tier must be one of local/project/user (got ${tier})` };
  }
  const path = settingsPathFor(tier, { projectRoot, userDir });
  try {
    const current = readSettings(path) ?? {};
    setDeep(current, key, coerce(String(rawValue)));
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(current, null, 2) + '\n', 'utf8');
    return { ok: true, tier, path };
  } catch (err) {
    return { ok: false, error: err?.message ?? String(err) };
  }
}

/**
 * Every tier that defines the key, highest-precedence first. The winner is
 * the first; the rest carry `shadowedBy` = the winning tier (the direnv
 * "where did this come from?" surface).
 *
 * @returns {{found: boolean, entries: Array<{tier, value, path, winner, shadowedBy?}>}}
 */
export function configShowOrigin(key, { projectRoot, userDir } = {}) {
  const entries = [];
  if (!key || !String(key).trim()) return { found: false, entries };
  if (hasForbiddenSegment(key)) return { found: false, entries };
  for (const { name } of TIERS) {
    const path = settingsPathFor(name, { projectRoot, userDir });
    const hit = dig(readSettings(path), key);
    if (hit.found) entries.push({ tier: name, value: hit.value, path });
  }
  if (entries.length === 0) return { found: false, entries: [] };
  const winnerTier = entries[0].tier;
  for (let i = 0; i < entries.length; i++) {
    entries[i].winner = i === 0;
    if (i > 0) entries[i].shadowedBy = winnerTier;
  }
  return { found: true, entries };
}
