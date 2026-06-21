// kiro-cli-agent.mjs — the Kiro CLI agent-config + guarded default-agent (Task 50.L).
//
// Kiro CLI IS Amazon Q Developer CLI (D-182). Its hooks live in an agent-config
// JSON under `.amazonq/cli-agents/<name>.json`, and they auto-fire ONLY for the
// resolved-ACTIVE agent — so to get automatic memory with no `--agent` flag, cmk
// must be the DEFAULT agent. Real memory systems do this by naming the agent
// `q_cli_default` at the user tier (vibekit/Auriti precedent) OR setting
// `chat.defaultAgent` (naas/coder-registry). We write `q_cli_default.json`.
//
// GUARDED (D-182): never clobber a user's existing default. If a `q_cli_default`
// agent OR a `chat.defaultAgent` setting already exists, we install a NAMED
// `cmk.json` instead (the user runs `kiro-cli --agent cmk`, or sets it default
// themselves) and report `skipped-existing` so `cmk doctor` / the install
// summary can surface the one manual step.
//
// The hook shape is the authoritative Rust contract (NOT the stale agent-v1.json):
// `hooks` is an object keyed by trigger → array of `{command, timeout_ms}`;
// triggers agentSpawn / userPromptSubmit / stop; timeout_ms (default 30000).
// The command reuses the SAME `cmk hook <event>` dispatcher as the IDE surface +
// Claude Code (the shared core), platform-wrapped for Windows/WSL.
//
// Public surface:
//   installKiroCliAgent({ awsDir?, mcpEntry? }) → { action, defaultAgent, path }
//   uninstallKiroCliAgent({ awsDir? }) → { action, changed }
//   (awsDir overrides the ~/.aws base; defaults to $MEMORY_KIT_AWS_DIR or ~/.aws.)

import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { kiroHookCommand } from './kiro-hook-command.mjs';

const DEFAULT_AGENT_NAME = 'q_cli_default';
const NAMED_AGENT_NAME = 'cmk';

// A structural ownership marker (M-2): uninstall keys on THIS, not a free-text
// `description` substring — so a user agent that merely mentions "claude-memory-kit"
// in its description is never mistaken for ours and deleted. Mirrors the kit's
// managed-marker-block discipline. (Amazon Q ignores unknown top-level keys.)
const MANAGED_BY = 'claude-memory-kit';

// The MCP server entry for the Amazon-Q (= Kiro CLI) AGENT-CONFIG. NOTE: this is a
// DIFFERENT schema from the IDE `.kiro/settings/mcp.json` entry (which is
// `{type:'stdio', command, args}`). The Amazon-Q agent-config `mcpServers` shape is
// `{command, args, timeout}` (no `type`; a `timeout` in ms) — verified against the
// Amazon-Q agent contract, NOT carried over from the IDE surface. The two surfaces
// legitimately diverge; do not unify them.
const DEFAULT_MCP_ENTRY = Object.freeze({ command: 'cmk', args: ['mcp', 'serve'], timeout: 120000 });

// The Amazon Q (= Kiro CLI) config root is `~/.aws/amazonq/`. An explicit
// `awsDir` (or $MEMORY_KIT_AWS_DIR) overrides the base — REQUIRED in tests so the
// user-tier write lands in a sandbox, never the real ~/.aws (the test-isolation
// rule for user-tier writes). Production passes nothing → the real ~/.aws.
function amazonqRoot(awsDir) {
  const base = awsDir || process.env.MEMORY_KIT_AWS_DIR || join(homedir(), '.aws');
  return join(base, 'amazonq');
}

// Build the agent-config in the Rust-contract shape.
function buildAgentConfig(name, mcpEntry) {
  const cfg = {
    name,
    managedBy: MANAGED_BY, // structural ownership marker — the uninstall key (M-2)
    description: 'claude-memory-kit — automatic per-session memory (inject + capture)',
    prompt: 'file://AGENTS.md',
    mcpServers: { cmk: mcpEntry },
    resources: ['file://.kiro/steering/cmk.md', 'file://AGENTS.md'],
    useLegacyMcpJson: false,
  };
  // hooks: object keyed by trigger → array of {command, timeout_ms}. Built without
  // a static `hooks:` literal carrying agentSpawn/stop so the structure stays
  // plain data; timeout_ms (NOT `timeout`) per the Rust contract.
  //
  // By design the CLI agent wires only agentSpawn (inject) + stop (capture) — NOT
  // the contract's `userPromptSubmit` (per-prompt recall). agentSpawn caches the
  // whole-conversation inject for the session, so a once-at-spawn inject is
  // sufficient; per-prompt recall would re-inject the same snapshot every turn.
  // (The dispatcher still RECOGNIZES `userPromptSubmit` → inject, so adding the
  // trigger here later is a one-line change with no router drift — the I-1 seam.)
  cfg.hooks = {
    agentSpawn: [{ command: kiroHookCommand('agentSpawn'), timeout_ms: 10000 }],
    stop: [{ command: kiroHookCommand('stop'), timeout_ms: 30000 }],
  };
  return cfg;
}

export function installKiroCliAgent({ awsDir, mcpEntry = DEFAULT_MCP_ENTRY } = {}) {
  const root = amazonqRoot(awsDir);
  const agentsDir = join(root, 'cli-agents');
  const defaultPath = join(agentsDir, `${DEFAULT_AGENT_NAME}.json`);
  const settingsPath = join(root, 'settings.json');

  // Guard: is there already a user default? (either a q_cli_default file they
  // authored, or a chat.defaultAgent setting). If so, don't take over the default.
  const hasDefaultFile = existsSync(defaultPath) && !isOurAgent(defaultPath);
  const hasDefaultSetting = readDefaultAgentSetting(settingsPath) != null;
  const takeDefault = !hasDefaultFile && !hasDefaultSetting;

  mkdirSync(agentsDir, { recursive: true });

  if (takeDefault) {
    // we own the default — write q_cli_default.json (the zero-touch automatic path)
    const changed = writeIfChanged(defaultPath, buildAgentConfig(DEFAULT_AGENT_NAME, mcpEntry));
    return { action: 'installed', defaultAgent: 'set', changed, path: defaultPath };
  }

  // a default already exists — install a NAMED cmk agent, don't clobber theirs.
  const namedPath = join(agentsDir, `${NAMED_AGENT_NAME}.json`);
  const changed = writeIfChanged(namedPath, buildAgentConfig(NAMED_AGENT_NAME, mcpEntry));
  return { action: 'installed', defaultAgent: 'skipped-existing', changed, path: namedPath };
}

// Write the serialized config only if it differs from what's on disk, so a
// re-install of byte-identical content reports `changed: false` (idempotency —
// the I-2 fix; mirrors kiro-ide-hooks' content-compare).
function writeIfChanged(path, config) {
  const serialized = `${JSON.stringify(config, null, 2)}\n`;
  const existing = existsSync(path) ? readFileSync(path, 'utf8') : null;
  if (existing === serialized) return false;
  writeFileSync(path, serialized, 'utf8');
  return true;
}

export function uninstallKiroCliAgent({ awsDir } = {}) {
  const agentsDir = join(amazonqRoot(awsDir), 'cli-agents');
  let changed = false;
  for (const name of [DEFAULT_AGENT_NAME, NAMED_AGENT_NAME]) {
    const p = join(agentsDir, `${name}.json`);
    // only remove OUR agent files (the q_cli_default we wrote, or the named cmk)
    if (existsSync(p) && isOurAgent(p)) {
      rmSync(p, { force: true });
      changed = true;
    }
  }
  return { action: 'uninstalled', changed };
}

// Does a cmk-owned CLI agent exist in ~/.aws/amazonq/cli-agents/ ? (either the
// default `q_cli_default.json` we took, or the guarded `cmk.json`). Keyed on the
// `managedBy` marker — a user's own agent never counts. Used by `cmk doctor`
// HC-1: for a kiro-cli user, capture/inject fires via THIS surface, not the IDE
// .kiro/hooks/ — so HC-1 must treat the CLI agent as a valid capture surface
// (the D-186 fix; without it HC-1 false-FAILs a working kiro-cli-only install).
export function hasOurCliAgent({ awsDir } = {}) {
  const agentsDir = join(amazonqRoot(awsDir), 'cli-agents');
  return [DEFAULT_AGENT_NAME, NAMED_AGENT_NAME].some((name) => {
    const p = join(agentsDir, `${name}.json`);
    return existsSync(p) && isOurAgent(p);
  });
}

// ── internal ─────────────────────────────────────────────────────────────────

// Is the agent file at `path` one WE wrote? Keyed on the structural `managedBy`
// marker (M-2), NOT a free-text description substring — so a user's own agent
// can never be mistaken for ours and deleted on uninstall.
function isOurAgent(path) {
  try {
    const j = JSON.parse(readFileSync(path, 'utf8'));
    return j.managedBy === MANAGED_BY;
  } catch {
    return false;
  }
}

function readDefaultAgentSetting(settingsPath) {
  if (!existsSync(settingsPath)) return null;
  try {
    const j = JSON.parse(readFileSync(settingsPath, 'utf8'));
    return j['chat.defaultAgent'] ?? null;
  } catch {
    return null;
  }
}
