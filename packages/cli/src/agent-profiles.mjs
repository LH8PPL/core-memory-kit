// agent-profiles.mjs — the per-agent profile REGISTRY (Task 50.C/50.E).
//
// Each agent is a pure-DATA profile built via defineAgentProfile (the D-180
// "data, not classes" seam). The kit's core (store / compression / search / CLI
// / MCP server) is identical across agents; only these declarations differ.
//
// Scope discipline (D-180): a plain object keyed by name, NOT a registry
// framework — single-digit agent count; opencode's data-row registry pays off
// at N≈75, premature here. Adding an agent in a later version = one more entry.
//
// Public surface:
//   AGENT_PROFILES — frozen map { name → frozen descriptor }
//   getAgentProfile(name) → descriptor | undefined
//   listAgentProfiles() → descriptor[]

import { defineAgentProfile } from './agent-profile.mjs';

// ── Claude Code ──────────────────────────────────────────────────────────────
// The reference profile. Declares the SAME legs install.mjs wires today (the
// KIT_HOOKS_BLOCK in settings-hooks.mjs + the `cmk` MCP server in .mcp.json),
// expressed as data. install.mjs keeps using its existing Claude-Code path for
// v0.4.0 (regression-proof); this profile is the canonical declaration the
// routing (50.F) dispatches on and the parity validator (50.D) checks.
const claudeCode = defineAgentProfile({
  name: 'claude-code',
  displayName: 'Claude Code',
  integrationType: 'native-hooks-mcp',
  detect: { command: 'claude' },
  // Claude Code's instruction surface is the managed block in CLAUDE.md.
  instructionFile: 'CLAUDE.md',
  mcp: { path: '.mcp.json', serversKey: 'mcpServers' },
  hooks: {
    mechanism: 'settings-json', // <projectRoot>/.claude/settings.json hooks[] entries
    path: '.claude/settings.json',
    // abstract lifecycle event → Claude Code's event name (here they coincide).
    eventMap: {
      sessionStart: 'SessionStart',
      promptSubmit: 'UserPromptSubmit',
      postEdit: 'PostToolUse',
      turnEnd: 'Stop',
      sessionEnd: 'SessionEnd',
    },
  },
  // Claude Code transcripts: ~/.claude/projects/<slug>/<session>.jsonl (JSONL).
  transcript: { dir: '~/.claude/projects', workspaceKey: 'slug', parse: 'jsonl' },
});

// ── Kiro (Task 50.E) ─────────────────────────────────────────────────────────
// Primary-verified against kiro.dev + a real install (D-180). VS Code fork.
// Target the CLI agent-hook surface (agentSpawn/stop in .kiro/agents/<name>.json),
// NOT the IDE Agent-Hooks surface.
const kiro = defineAgentProfile({
  name: 'kiro',
  displayName: 'Kiro',
  integrationType: 'native-hooks-mcp',
  detect: { homeDir: '.kiro' },
  // Steering file with `inclusion: always` frontmatter (applied at write time).
  instructionFile: '.kiro/steering/claude-memory-kit.md',
  mcp: { path: '.kiro/settings/mcp.json', serversKey: 'mcpServers' },
  hooks: {
    mechanism: 'agent-config-json', // .kiro/agents/<name>.json "hooks" object
    path: '.kiro/agents/cmk.json',
    eventMap: {
      sessionStart: 'agentSpawn',
      promptSubmit: 'userPromptSubmit',
      postEdit: 'postToolUse',
      turnEnd: 'stop',
    },
  },
  // Per-session JSON under globalStorage, keyed by base64url(workspacePath).
  // (Path is the VS-Code-fork globalStorage; resolved at capture time.)
  transcript: {
    dir: 'globalStorage/kiro.kiroagent/workspace-sessions',
    workspaceKey: 'base64url',
    parse: 'json-history',
  },
});

// ── AGENTS.md (Task 50.G — the instruction-only breadth rung) ────────────────
// The cheap multi-tool reach: emit a managed block in AGENTS.md (the cross-tool
// instruction-file convention several non-Claude agents read — Cursor, Zed,
// Codex, gemini-cli, …). NO hooks, NO MCP — instruction surface only. For tools
// we haven't built a full adapter for; a thin rung, not the depth play. (D-180 §5.)
const agentsmd = defineAgentProfile({
  name: 'agents-md',
  displayName: 'AGENTS.md',
  integrationType: 'instruction-only',
  detect: { always: true }, // any repo can carry an AGENTS.md
  instructionFile: 'AGENTS.md',
});

export const AGENT_PROFILES = Object.freeze({
  'claude-code': claudeCode,
  kiro,
  'agents-md': agentsmd,
});

export function getAgentProfile(name) {
  return AGENT_PROFILES[name];
}

export function listAgentProfiles() {
  return Object.values(AGENT_PROFILES);
}
