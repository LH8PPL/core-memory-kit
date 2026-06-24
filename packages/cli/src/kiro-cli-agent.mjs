// kiro-cli-agent.mjs — the Kiro CLI agent-config + default-agent registration (Task 50.L / D-198).
//
// kiro-cli (= Amazon Q Developer CLI) hooks live in an agent-config JSON. Its
// hooks auto-fire ONLY for the resolved-ACTIVE agent, so for automatic memory
// with no `--agent` flag, cmk must be the DEFAULT agent. TWO files, verified
// against a real kiro-cli 2.8.1 (`kiro-cli agent list` + `agent validate`):
//
//   1. ~/.kiro/agents/cmk.json        — the agent config (hooks/mcp/prompt/…)
//   2. ~/.kiro/settings/cli.json      — {"chat.defaultAgent":"cmk"} (the
//                                        LOAD-BEARING registration; without it
//                                        the built-in `kiro_default` runs and
//                                        NO kit hooks fire)
//
// ── D-198 (the cut-gate-kiro root cause) ──────────────────────────────────────
// The original impl wrote `~/.aws/amazonq/cli-agents/q_cli_default.json`. That is
// the WRONG location for kiro-cli 2.8.1: `kiro-cli agent list` resolves agents
// from `~/.kiro/agents/` (global) + `<project>/.kiro/agents/` (workspace), and
// the default is the built-in `kiro_default`. Our `~/.aws/...` file was NEVER
// loaded — so the instrumented cut-gate probe showed NEITHER agentSpawn NOR
// preToolUse firing, and KG-guard let a memory delete through every time. Our own
// research (2026-06-20-kiro-automatic-memory-deep-research §3, "the load-bearing
// step the kit is missing") had `~/.kiro/agents/cmk.json` + `~/.kiro/settings/
// cli.json` correct; the impl dropped it. This module follows the research +
// the live-verified contract. The matcher fix (D-197, `'*'`) was correct but
// secondary — a right fix to a file kiro-cli never read.
//
// Also: kiro-cli's `agent validate` is STRICT — it rejects unknown top-level
// fields. The old `managedBy` marker FAILS validation (`unknown field
// managedBy`). Ownership is now tracked structurally WITHOUT an invalid field:
// the agent file lives at our well-known path (`agents/cmk.json`) and the
// settings pointer names `cmk`; uninstall keys on that, plus a marker carried in
// a VALID field (the `description`, which validate accepts) as a belt.
//
// Public surface:
//   installKiroCliAgent({ kiroDir? }) → { action, defaultAgent, changed, path }
//   uninstallKiroCliAgent({ kiroDir? }) → { action, changed }
//   hasOurCliAgent({ kiroDir? }) → boolean
//   (kiroDir overrides the ~/.kiro base; defaults to $MEMORY_KIT_KIRO_DIR or ~/.kiro.
//    $MEMORY_KIT_AWS_DIR is still honored as a back-compat alias for the base.)

import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { kiroHookCommand, kiroGuardCommand, kiroCliAllowedCommands } from './kiro-hook-command.mjs';
import { parseJsonFile } from './read-json.mjs';

// The kit's agent name. NOT `q_cli_default` — that name doesn't exist in kiro-cli
// (the built-in default is `kiro_default`). We register `cmk` and point
// chat.defaultAgent at it.
const AGENT_NAME = 'cmk';

// A marker carried in the `description` (a VALID schema field — unlike the old
// top-level `managedBy`, which kiro-cli's strict `agent validate` rejects). Used
// as a belt on top of the well-known path for ownership detection on uninstall.
const MANAGED_MARKER = '[claude-memory-kit]';

// The kiro config root is `~/.kiro/`. $MEMORY_KIT_KIRO_DIR (or the back-compat
// $MEMORY_KIT_AWS_DIR) overrides the BASE — REQUIRED in tests so the user-tier
// write lands in a sandbox, never the real ~/.kiro. Production passes nothing.
function kiroRoot(kiroDir) {
  const base = kiroDir || process.env.MEMORY_KIT_KIRO_DIR || process.env.MEMORY_KIT_AWS_DIR;
  return base ? base : join(homedir(), '.kiro');
}

function agentsDirOf(kiroDir) {
  return join(kiroRoot(kiroDir), 'agents');
}
function agentPathOf(kiroDir) {
  return join(agentsDirOf(kiroDir), `${AGENT_NAME}.json`);
}
function cliSettingsPathOf(kiroDir) {
  return join(kiroRoot(kiroDir), 'settings', 'cli.json');
}

// Build the agent-config in the live-verified kiro-cli schema. ONLY valid
// top-level fields (kiro-cli `agent validate` is strict): name, description,
// prompt, mcpServers, tools, allowedTools, resources, hooks, toolsSettings,
// includeMcpJson, useLegacyMcpJson, model. NO `managedBy` (rejected).
function buildAgentConfig() {
  const cfg = {
    name: AGENT_NAME,
    description: `claude-memory-kit — automatic per-session memory (inject + capture). ${MANAGED_MARKER}`,
    // INLINE prompt — NOT `file://AGENTS.md`. kiro-cli resolves a config's
    // `prompt`/`resources` file:// paths RELATIVE TO THE AGENT FILE'S DIR
    // (~/.kiro/agents/), per kiro.dev/docs/cli/custom-agents/configuration-
    // reference — so `file://AGENTS.md` would point at ~/.kiro/agents/AGENTS.md,
    // NOT the project root (D-198). AGENTS.md is AUTO-INCLUDED by kiro-cli from
    // the workspace root with no ref needed (it's "always included"), so the
    // project instruction loads regardless; this inline prompt is the
    // belt-and-suspenders recall/persist directive that travels WITH the agent.
    prompt:
      'You have claude-memory-kit memory for this project. At the start of work, ' +
      'recall relevant prior decisions/preferences via the cmk MCP tools (mk_search / ' +
      'mk_recent_activity) before answering — do not re-derive what memory already ' +
      'records. When a durable fact, decision, or preference arises, persist it with ' +
      'mk_remember. Treat the project AGENTS.md as authoritative project instruction.',
    // NO inline `mcpServers` here — the agent reads the kit's MCP server from the
    // PROJECT `.kiro/settings/mcp.json` via `includeMcpJson: true` (which the docs
    // describe as additive: "all MCP servers defined in the global and local
    // configurations in addition to the agent's"). WHY this matters (the
    // cut-gate-kiro-cli silent-data-loss fix): the project mcp.json carries
    // `env.CMK_PROJECT_DIR` (the absolute project root) so `cmk mcp serve` knows
    // which project to write to — kiro-cli launches the server from a NON-project
    // cwd, so without that env mk_remember silently wrote nowhere. A GLOBAL agent
    // (~/.kiro/agents/cmk.json covers every project) CANNOT bake a per-project env
    // into an inline mcpServers entry; the per-project mcp.json can. So we route
    // ALL MCP through the env-carrying project mcp.json — ONE source, correct env.
    includeMcpJson: true,
    // NO `resources` file:// refs: a project-relative path (.kiro/steering/cmk.md,
    // AGENTS.md) cannot resolve from the GLOBAL agent dir (~/.kiro/agents/) — it
    // would resolve there, not at the project (D-198). AGENTS.md auto-loads from
    // the workspace; the inline prompt carries the recall/persist directive.
    // Pre-approve the kit's own MCP server's tools (no per-call Reject/Trust/Run).
    // MUST match the server NAME in the project `.kiro/settings/mcp.json`, which is
    // `claude-memory-kit` (install-kiro MCP_SERVER_NAME) — NOT `cmk`. When the
    // agent carried its own inline `mcpServers: { cmk: … }` this was `@cmk`; once
    // MCP moved to the project mcp.json via includeMcpJson (the env→args fix), the
    // server is `claude-memory-kit`, so `@cmk` orphaned → mk_remember wasn't
    // approved → kiro silently dropped the tool call (the gate3 finding).
    allowedTools: ['@claude-memory-kit'],
    // Pre-trust the kit's OWN hook commands (no per-command approval) — D-194.
    toolsSettings: { shell: { allowedCommands: kiroCliAllowedCommands() } },
  };
  // hooks: object keyed by trigger → array of {command, timeout_ms}. agentSpawn
  // (inject) + stop (capture) + preToolUse (the delete-guardrail). timeout_ms
  // (NOT `timeout`). preToolUse `matcher: '*'` (all tools) — kiro-cli matchers
  // are literal strings, not regex (D-197); the bin exits 2 to BLOCK.
  cfg.hooks = {
    agentSpawn: [{ command: kiroHookCommand('agentSpawn'), timeout_ms: 10000 }],
    stop: [{ command: kiroHookCommand('stop'), timeout_ms: 30000 }],
    preToolUse: [{ command: kiroGuardCommand(), timeout_ms: 5000, matcher: '*' }],
  };
  return cfg;
}

export function installKiroCliAgent({ kiroDir, awsDir } = {}) {
  kiroDir = kiroDir ?? awsDir; // `awsDir` accepted as a back-compat alias for the sandbox base
  const agentsDir = agentsDirOf(kiroDir);
  const agentPath = agentPathOf(kiroDir);
  const settingsPath = cliSettingsPathOf(kiroDir);

  mkdirSync(agentsDir, { recursive: true });

  // 1. write the agent config
  const changedAgent = writeIfChanged(agentPath, `${JSON.stringify(buildAgentConfig(), null, 2)}\n`);

  // 2. register chat.defaultAgent — the LOAD-BEARING step. GUARDED: never clobber
  //    a user's existing default that ISN'T ours. If they already point at a
  //    different agent, we install `cmk` but leave their default alone (they run
  //    `kiro-cli --agent cmk` or set it themselves) and report skipped-existing.
  const existingDefault = readDefaultAgentSetting(settingsPath);
  const userHasForeignDefault = existingDefault != null && existingDefault !== AGENT_NAME;

  let defaultAgent;
  let changedSettings = false;
  if (userHasForeignDefault) {
    defaultAgent = 'skipped-existing';
  } else {
    changedSettings = mergeDefaultAgentSetting(settingsPath, AGENT_NAME);
    defaultAgent = 'set';
  }

  return {
    action: 'installed',
    defaultAgent,
    changed: changedAgent || changedSettings,
    path: agentPath,
  };
}

// Write only if the serialized content differs (idempotent re-install).
function writeIfChanged(path, serialized) {
  const existing = existsSync(path) ? readFileSync(path, 'utf8') : null;
  if (existing === serialized) return false;
  writeFileSync(path, serialized, 'utf8');
  return true;
}

// Merge {"chat.defaultAgent": name} into ~/.kiro/settings/cli.json, BYTE-
// PRESERVING every other key (managed-merge discipline — same as the Claude
// settings path). Returns true if the file changed.
function mergeDefaultAgentSetting(settingsPath, name) {
  mkdirSync(join(settingsPath, '..'), { recursive: true });
  const current = parseJsonFile(settingsPath, { fallback: null }) ?? {};
  if (current['chat.defaultAgent'] === name) return false;
  current['chat.defaultAgent'] = name;
  writeFileSync(settingsPath, `${JSON.stringify(current, null, 2)}\n`, 'utf8');
  return true;
}

export function uninstallKiroCliAgent({ kiroDir, awsDir } = {}) {
  kiroDir = kiroDir ?? awsDir;
  const agentPath = agentPathOf(kiroDir);
  const settingsPath = cliSettingsPathOf(kiroDir);
  let changed = false;

  // remove OUR agent file only (well-known path + our marker)
  if (existsSync(agentPath) && isOurAgent(agentPath)) {
    rmSync(agentPath, { force: true });
    changed = true;
  }

  // un-register the default ONLY if it points at us (byte-preserve other keys)
  const current = parseJsonFile(settingsPath, { fallback: null });
  if (current != null && current['chat.defaultAgent'] === AGENT_NAME) {
    delete current['chat.defaultAgent'];
    writeFileSync(settingsPath, `${JSON.stringify(current, null, 2)}\n`, 'utf8');
    changed = true;
  }

  return { action: 'uninstalled', changed };
}

// Does a cmk-owned kiro-cli agent exist? (the well-known ~/.kiro/agents/cmk.json
// with our marker). Used by `cmk doctor` HC-1 — a kiro-cli user's capture/inject
// fires via THIS surface (D-186).
export function hasOurCliAgent({ kiroDir, awsDir } = {}) {
  kiroDir = kiroDir ?? awsDir;
  const agentPath = agentPathOf(kiroDir);
  return existsSync(agentPath) && isOurAgent(agentPath);
}

// ── internal ─────────────────────────────────────────────────────────────────

// Is the agent at `path` ours? Keyed on our marker in the (valid) `description`
// field — NOT a rejected top-level field. BOM-tolerant.
function isOurAgent(path) {
  const j = parseJsonFile(path, { fallback: null });
  return j != null && typeof j.description === 'string' && j.description.includes(MANAGED_MARKER);
}

// Read the user's chat.defaultAgent from ~/.kiro/settings/cli.json. BOM-tolerant.
function readDefaultAgentSetting(settingsPath) {
  const j = parseJsonFile(settingsPath, { fallback: null });
  return j != null ? (j['chat.defaultAgent'] ?? null) : null;
}
