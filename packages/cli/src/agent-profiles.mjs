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
// Kiro wires BOTH hook surfaces (Task 50.N — full Claude-Code parity):
//   • CLI agent-config (.kiro/agents/cmk.json "hooks") — the eventMap below;
//   • IDE Agent-Hooks (.kiro/hooks/*.json v1 + legacy .kiro.hook) — kiro-ide-hooks.mjs.
// Both drive the SAME `cmk hook <event>` dispatcher → the same inject/capture/
// observe/guard cores; only the per-surface trigger names differ (CLI camelCase
// vs IDE v1 PascalCase). All four legs (inject/capture/observe-edit/delete-guard)
// are wired on both surfaces as of 50.N.1–50.N.3.
const kiro = defineAgentProfile({
  name: 'kiro',
  displayName: 'Kiro',
  integrationType: 'native-hooks-mcp',
  detect: { homeDir: '.kiro' },
  // Steering file with `inclusion: always` frontmatter (applied at write time).
  instructionFile: '.kiro/steering/claude-memory-kit.md',
  mcp: { path: '.kiro/settings/mcp.json', serversKey: 'mcpServers' },
  hooks: {
    mechanism: 'agent-config-json', // .kiro/agents/<name>.json "hooks" object (CLI)
    path: '.kiro/agents/cmk.json',
    // The CLI agent-config trigger names. The IDE v1 surface uses PascalCase
    // equivalents (UserPromptSubmit/Stop/PostToolUse/PreToolUse) — see
    // kiro-ide-hooks.mjs. postEdit→postToolUse + the delete-guard (preToolUse)
    // are both wired (50.N.2/50.N.3).
    eventMap: {
      sessionStart: 'agentSpawn',
      promptSubmit: 'userPromptSubmit',
      postEdit: 'postToolUse',
      turnEnd: 'stop',
    },
  },
  // Transcript — TWO schemas (D-200), resolved at capture time by readKiroTurn:
  //   • IDE: per-session JSON under globalStorage, base64url(workspacePath), a
  //     `history[]` array (the dir/key/parse below);
  //   • kiro-CLI: ~/.kiro/sessions/cli/<uuid>.json, matched by `cwd`, a
  //     `session_state.conversation_metadata.user_turn_metadatas[]` shape (the
  //     fallback path — readKiroCliTurn). The fields here describe the IDE shape;
  //     the CLI shape is handled by the readKiroTurn fallback, not a profile field.
  transcript: {
    dir: 'globalStorage/kiro.kiroagent/workspace-sessions',
    workspaceKey: 'base64url',
    parse: 'json-history',
  },
});

// ── Cursor (Task 196) ────────────────────────────────────────────────────────
// Primary-verified against cursor.com/docs (agent/hooks + context/mcp +
// context/rules), 2026-07-03. VS Code fork with a first-class hooks system:
//   • hooks: dedicated `.cursor/hooks.json` `{version: 1, hooks: {<event>: [{command}]}}`.
//     Hooks speak JSON over stdio BOTH directions (payload on stdin, response on
//     stdout) — unlike Claude Code's raw-stdout SessionStart — so every event
//     routes through ONE adapter command, `cmk cursor-hook`, which reads
//     `hook_event_name` from the payload (no per-event argv needed).
//   • inject: `sessionStart` supports `{additional_context}` in the response —
//     a real dynamic inject leg (full Claude-Code parity).
//   • capture: `turnEnd` maps to `afterAgentResponse`, whose payload carries the
//     assistant's final text directly (`{text}`) — no transcript parsing; Cursor's
//     `stop` payload is status-only. Hence NO transcript leg on this profile.
//   • guard: `beforeShellExecution` delivers `{command, cwd}` and accepts
//     `{permission: 'allow'|'deny'}` — the memory delete-guardrail (D-192) leg.
//     `preShell` is a cursor-only abstract event; agents without a shell-guard
//     surface simply don't map it.
//   • instruction: `.cursor/rules/*.mdc` with `alwaysApply: true` frontmatter
//     (plain `.md` files in .cursor/rules are IGNORED by Cursor — the .mdc
//     extension is load-bearing).
const cursor = defineAgentProfile({
  name: 'cursor',
  displayName: 'Cursor',
  integrationType: 'hooks-mcp',
  detect: { homeDir: '.cursor' },
  instructionFile: '.cursor/rules/claude-memory-kit.mdc',
  instructionFrontmatter: 'description: claude-memory-kit — durable in-repo memory (recall + capture)\nalwaysApply: true',
  mcp: { path: '.cursor/mcp.json', serversKey: 'mcpServers' },
  hooks: {
    mechanism: 'hooks-json', // dedicated .cursor/hooks.json (version + hooks keys)
    path: '.cursor/hooks.json',
    eventMap: {
      sessionStart: 'sessionStart',
      promptSubmit: 'beforeSubmitPrompt',
      postEdit: 'afterFileEdit',
      turnEnd: 'afterAgentResponse',
      sessionEnd: 'sessionEnd',
      preShell: 'beforeShellExecution',
    },
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
  cursor,
  'agents-md': agentsmd,
});

export function getAgentProfile(name) {
  return AGENT_PROFILES[name];
}

export function listAgentProfiles() {
  return Object.values(AGENT_PROFILES);
}
