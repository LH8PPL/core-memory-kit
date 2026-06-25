// kiro-permissions.mjs — write Kiro IDE 1.0's authoritative trust store so the
// kit's surfaces run prompt-free (Task 50.N.5 / D-203h/D-203i).
//
// On Kiro IDE 1.0, the LIVE trust is `~/.kiro/workspace-roots/<hash>/
// permissions.yaml` (capability/match/effect), NOT `.vscode/settings.json` — Kiro
// auto-MIGRATES the latter into the former at first open (D-203i: proven by the
// `.trust-migration.json` sibling + MCP running prompt-free with no `.vscode`
// trustedMcpTools). There is NO `.vscode` setting for SKILL trust, so the only
// reliable pre-trust for the memory-write skill-load prompt is to write
// permissions.yaml directly.
//
// <hash> = sha256( projectRoot, normalized: forward-slash + no-trailing-slash +
// lowercase ).hexdigest().slice(0,16) — VERIFIED on a real install (D-203h:
// c:/temp/kiro-ide-gate → a7ffdb64ec4c31c8).
//
// Format (ground-truth, read from a real grant — D-203h):
//   rules:
//     - { capability: shell, match: [cmd.exe /c cmk hook *, ...], effect: allow }
//     - { capability: mcp,   match: [claude-memory-kit/mk_remember, ...], effect: allow }
//     - { capability: skill, match: [memory-write, memory-search], effect: allow }
//
// Public surface:
//   kiroWorkspaceHash(projectRoot) → string (the 16-hex workspace key)
//   installKiroPermissions({ projectRoot, env? }) → { action, changed, path }
//   uninstallKiroPermissions({ projectRoot, env? }) → { action, changed }
//
// Managed-merge: we own ONLY the rules whose capability+match are ours (matched
// by the kit's known tokens); a user's own rules are byte-preserved on install +
// uninstall (the over-mutation discipline).

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import yaml from 'js-yaml';

import { MCP_AUTO_APPROVE } from './kiro-constants.mjs';

// The kit's MCP tools, namespaced as Kiro's permissions.yaml lists them
// (server/tool). MCP_AUTO_APPROVE is the shared source of the 11 tool names
// (also used for the IDE's mcp.json autoApprove), so the two never drift.
const MCP_MATCH = MCP_AUTO_APPROVE.map((t) => `claude-memory-kit/${t}`);
const SHELL_MATCH = Object.freeze(['cmd.exe /c cmk hook *', 'cmd.exe /c cmk-guard-memory*']);
const SKILL_MATCH = Object.freeze(['memory-write', 'memory-search']);

/** The kit's three trust rules (the canonical D-203h shape). */
function ourRules() {
  return [
    { capability: 'shell', match: [...SHELL_MATCH], effect: 'allow' },
    { capability: 'mcp', match: [...MCP_MATCH], effect: 'allow' },
    { capability: 'skill', match: [...SKILL_MATCH], effect: 'allow' },
  ];
}

// A rule is "ours" if its capability+match line up with the kit's tokens. Keyed
// loosely (capability + any of our signature match entries) so a user's unrelated
// shell/mcp/skill rule is NOT mistaken for ours.
const OUR_SIGNATURES = Object.freeze({
  shell: 'cmk hook',
  mcp: 'claude-memory-kit/mk_remember',
  skill: 'memory-write',
});
function isOurRule(rule) {
  if (!rule || typeof rule.capability !== 'string') return false;
  const sig = OUR_SIGNATURES[rule.capability];
  if (!sig) return false;
  const match = Array.isArray(rule.match) ? rule.match : [];
  return match.some((m) => typeof m === 'string' && m.includes(sig));
}

/**
 * Kiro IDE 1.0's workspace-roots hash for a project path.
 * sha256(forward-slash + no-trailing-slash + lowercase).slice(0,16). (D-203h)
 */
export function kiroWorkspaceHash(projectRoot) {
  const norm = String(projectRoot).replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
  return createHash('sha256').update(norm).digest('hex').slice(0, 16);
}

function permissionsPath(projectRoot, env) {
  const home = env.USERPROFILE || env.HOME || homedir();
  return join(home, '.kiro', 'workspace-roots', kiroWorkspaceHash(projectRoot), 'permissions.yaml');
}

// Parse an existing permissions.yaml → its rules array (defensive: a missing/
// malformed file yields []). Returns { rules, raw } so install can detect change.
function readRules(path) {
  if (!existsSync(path)) return { rules: [], existed: false };
  let parsed;
  try {
    parsed = yaml.load(readFileSync(path, 'utf8'));
  } catch {
    return { rules: [], existed: true }; // unreadable → treat as no rules (don't clobber-crash)
  }
  const rules = parsed && Array.isArray(parsed.rules) ? parsed.rules : [];
  return { rules, existed: true };
}

function serialize(rules) {
  // js-yaml dump; flow-style for the compact match arrays Kiro uses is optional —
  // block style is equally valid YAML and is what Kiro itself wrote.
  return yaml.dump({ rules }, { lineWidth: -1, noRefs: true });
}

export function installKiroPermissions({ projectRoot, env = process.env } = {}) {
  if (!projectRoot) throw new Error('installKiroPermissions: projectRoot is required');
  const path = permissionsPath(projectRoot, env);
  const { rules: existing } = readRules(path);
  // keep the user's rules (drop any prior copy of ours so we re-add the current set)
  const userRules = existing.filter((r) => !isOurRule(r));
  const merged = [...userRules, ...ourRules()];
  const serialized = serialize(merged);

  const prior = existsSync(path) ? readFileSync(path, 'utf8') : null;
  let changed = false;
  if (prior !== serialized) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, serialized, 'utf8');
    changed = true;
  }
  return { action: 'installed', changed, path };
}

export function uninstallKiroPermissions({ projectRoot, env = process.env } = {}) {
  if (!projectRoot) throw new Error('uninstallKiroPermissions: projectRoot is required');
  const path = permissionsPath(projectRoot, env);
  if (!existsSync(path)) return { action: 'uninstalled', changed: false };
  const { rules: existing } = readRules(path);
  const userRules = existing.filter((r) => !isOurRule(r));
  if (userRules.length === existing.length) return { action: 'uninstalled', changed: false }; // none of ours
  // preserve the user's rules; write back without ours (never delete the file —
  // it may hold the user's own + Kiro's migration data).
  writeFileSync(path, serialize(userRules), 'utf8');
  return { action: 'uninstalled', changed: true };
}
