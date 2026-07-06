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
// ── WHY GLOBAL (~/.kiro/), NOT project-local (<project>/.kiro/) — the forced choice
//    (verified 2026-07-06 against kiro.dev/docs/cli/chat/configuration) ───────────
// kiro-cli reads agents from BOTH `.kiro/agents/` (project-local) and
// `~/.kiro/agents/` (global), and a local agent WINS precedence over a same-named
// global one (kiro.dev/docs/cli/custom-agents/configuration-reference, "Agent
// precedence", read directly 2026-07-06). So the agent FILE could be project-local.
// What CANNOT be project-local is ACTIVATION: a local agent is only "available when
// running from that directory" — discoverable/selectable, NOT auto-active (same
// page has no auto-default statement). Activation needs either the global
// `chat.defaultAgent` (a SETTING, and settings are global-only per the
// chat/configuration scope table: Settings | User:Yes | Project:N/A | Agent:N/A)
// OR an explicit `--agent cmk` per invocation. Automatic memory = the hooks{} below
// firing every INTERACTIVE session with no flag = cmk must be the ACTIVE agent =
// a GLOBAL `chat.defaultAgent: cmk`. We write the agent globally too so that global
// default resolves everywhere (a local-only file would leave the default dangling
// in projects without a copy). This is the ACTIVATION constraint, not Amazon-Q
// legacy. EMPIRICALLY PROVEN (D-284, kiro-cli 2.10.0, full matrix): a project-local
// agent does NOT auto-activate — with no `chat.defaultAgent`, kiro-cli resolves to
// the built-in `kiro_default` and the local agent's hooks never fire (holds both
// headless AND interactive). Local precedence is real but DOWNSTREAM of a
// global/flag activation. Moving the file project-local was considered + REJECTED:
// it can't remove the global default (still required), and a global default naming
// `cmk` would warn/fall-through in projects without a local copy — so you'd need
// BOTH files, i.e. MORE footprint, not less. Global-only agent stays. The
// default-agent write is GUARDED — a user's foreign existing default is never
// clobbered (D-198/D-283/D-284).
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
    // ★ `tools` is the agent's CAPABILITY SET — what it CAN use. WITHOUT it, a
    // custom agent has NO tools: it cannot run shell commands at all, so the model
    // "calls" cmk remember but nothing executes (the cut-gate-kiro-cli silent
    // failure — kiro.dev/docs/cli/custom-agents/configuration-reference: "the
    // tools field lists all tools the agent can potentially use"). `'*'` = all
    // built-in tools (incl. shell, so `cmk remember`/`cmk search` actually run) +
    // any MCP tools. This was THE missing piece behind the explicit-memory failure.
    //
    // ★ Do NOT "tighten" this to a scoped list. `tools` is the CAPABILITY set, NOT
    // the security boundary — auto-execution is gated separately by `allowedTools`
    // (absent) + `toolsSettings.shell.allowedCommands` (scoped to `^cmk …`) + the
    // `preToolUse` delete-guardrail. With `'*'` but no `allowedTools`, every tool
    // call EXCEPT the pre-trusted `^cmk` shell commands still hits kiro-cli's native
    // Run/Reject/Trust prompt — so `'*'` widens capability, not silent execution.
    // A hardcoded scoped list (e.g. `execute_bash`) would also silently drop the
    // shell tool across the V2→V3 rename (`execute_bash`→`execute_command`),
    // re-breaking this version-dependently. The approval gate is the boundary.
    tools: ['*'],
    // INLINE prompt — NOT `file://AGENTS.md`. kiro-cli resolves a config's
    // `prompt`/`resources` file:// paths RELATIVE TO THE AGENT FILE'S DIR
    // (~/.kiro/agents/), per kiro.dev/docs/cli/custom-agents/configuration-
    // reference — so `file://AGENTS.md` would point at ~/.kiro/agents/AGENTS.md,
    // NOT the project root (D-198). AGENTS.md is AUTO-INCLUDED by kiro-cli from
    // the workspace root with no ref needed (it's "always included"), so the
    // project instruction loads regardless; this inline prompt is the
    // belt-and-suspenders recall/persist directive that travels WITH the agent.
    // ★ kiro-cli memory = HOOKS (automatic) + CLI commands (explicit), NOT MCP.
    // WHY no MCP here (the cut-gate-kiro-cli findings + Kiro issues #5873/#5662):
    // kiro-cli does NOT wire MCP tools to a CUSTOM agent's LLM (only the built-in
    // kiro_default gets them), so the MCP memory tools silently no-op. Loading the
    // MCP server in the kiro-cli agent gains NOTHING (dead tools) and COSTS a
    // visible `cmd.exe /C cmk mcp serve` console window every session on Windows
    // (kiro's MCP launcher — not suppressible from the kit). So `includeMcpJson:
    // false` keeps the kiro-cli agent OFF MCP entirely → no dead tools, no popup.
    // (The Kiro IDE keeps its OWN MCP via `.kiro/settings/mcp.json`, where MCP
    // WORKS — the IDE does not read this agent config, so it's unaffected.)
    //
    // The working memory paths in kiro-cli:
    //   • AUTOMATIC — the agentSpawn (inject) + stop (capture) hooks below run
    //     `cmk hook`, which kiro feeds the project cwd via the hook stdin payload,
    //     so they capture/recall correctly with no model action.
    //   • EXPLICIT recall — `cmk search` (a pre-trusted shell command).
    prompt:
      'You have claude-memory-kit memory for this project, captured automatically ' +
      'each turn by the kit\'s hooks. Use the kit\'s SHELL COMMANDS for explicit ' +
      'recall/save. ### CRITICAL command form — do NOT prefix a kit command with ' +
      '`cd`. A `cd … && cmk …` prefix breaks kiro-cli\'s command allowlist (the ' +
      'command then needs manual approval and may be skipped). Instead pass the ' +
      'project root with `--project` and run the bare command. To RECALL: `cmk ' +
      'search "<topic>" --project "<absolute project path>"` before answering (do ' +
      'not re-derive what memory records). To SAVE: `cmk remember "<the fact>" ' +
      '--project "<absolute project path>"` (add `--why "..." --how "..." --type ' +
      'user|feedback|project` for a rich preference). The absolute project path is ' +
      'this workspace\'s root. Treat AGENTS.md as authoritative project instruction.',
    // includeMcpJson:false — the kiro-cli agent does NOT load any MCP server (see
    // the rationale above: dead tools + a popup, no benefit). The IDE's MCP is
    // wired separately in `.kiro/settings/mcp.json` and is untouched by this.
    includeMcpJson: false,
    // NO `allowedTools` — there are no MCP tools to pre-approve (includeMcpJson is
    // false). The kit's shell commands are trusted via toolsSettings below.
    // NO `resources` file:// refs: a project-relative path can't resolve from the
    // GLOBAL agent dir (~/.kiro/agents/) — D-198. AGENTS.md auto-loads anyway.
    // Pre-trust the kit's OWN hook + CLI commands (no per-command approval) — D-194.
    toolsSettings: { shell: { allowedCommands: kiroCliAllowedCommands() } },
  };
  // hooks: object keyed by trigger → array of {command, timeout_ms}. agentSpawn
  // (inject) + userPromptSubmit (inject + prompt-capture) + stop (capture) +
  // preToolUse (the delete-guardrail). timeout_ms (NOT `timeout`). preToolUse
  // `matcher: '*'` (all tools) — kiro-cli matchers are literal strings, not regex
  // (D-197); the bin exits 2 to BLOCK. userPromptSubmit (50.N.1) routes to BOTH
  // inject AND capturePrompt (the <private>-strip + transcript-append half of
  // Claude Code's UserPromptSubmit); kiro-cli's userPromptSubmit stdin carries
  // `prompt`, which capturePrompt reads.
  // postToolUse (50.N.2) → observe-edit, scoped to the file-write tool with
  // `matcher: 'fs_write'` (kiro-cli matchers are literal tool names — the runHook
  // adapter maps fs_write → Write for the shared observeEdit core). Only fires on
  // a file write, so it's cheap.
  cfg.hooks = {
    agentSpawn: [{ command: kiroHookCommand('agentSpawn'), timeout_ms: 10000 }],
    userPromptSubmit: [{ command: kiroHookCommand('userPromptSubmit'), timeout_ms: 10000 }],
    postToolUse: [{ command: kiroHookCommand('postToolUse'), timeout_ms: 10000, matcher: 'fs_write' }],
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
