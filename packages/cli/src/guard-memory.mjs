// guard-memory.mjs — the memory delete-guardrail core (D-192).
//
// A Claude Code `PreToolUse` hook (wired by `cmk install`) calls the
// `cmk-guard-memory` bin before every Bash/PowerShell tool call. This module
// is the pure decision: given a shell command, should it be BLOCKED because it
// would delete a claude-memory-kit memory path?
//
// Why this exists: 2026-06-22 (D-192), a `cd` that silently failed left a
// following `rm -f context/sessions/* context/transcripts/*` running in the
// wrong repo, deleting gitignored (non-recoverable) memory. A prose rule relies
// on the agent remembering; this hook enforces it structurally — the command
// never runs. Recovered only via an off-machine backup; this prevents the next.
//
// Design: BROAD by intent. A false block is recoverable (the user rephrases or
// deletes by hand); a false allow is the data loss we're preventing. So the
// predicates favor over-blocking a memory delete over under-blocking one.

// A command is destructive if it invokes a delete/destroy verb.
const DESTRUCTIVE = [
  /\brm\b/i, // unix rm
  /\bRemove-Item\b/i, // PowerShell
  /\brmdir\b/i,
  /\brd\b/i, // cmd rd
  /\bdel\b/i, // cmd del
  /\bgit\s+clean\b/i,
  /\bgit\s+reset\s+--hard\b/i,
];

// A path is a MEMORY path if the command mentions any of these. The bare
// `context` segment matcher requires a path-ish boundary so the WORD "context"
// (e.g. `grep context`, `rm contextual.md`) is not a false positive.
const MEMORY_TOKENS = [
  /context\/sessions/i,
  /context\/transcripts/i,
  /context\/memory/i,
  /context\.local/i,
  // a `context` path segment: `context/`, `context\`, `./context`, `repo/context`,
  // or a bare ` context` argument (e.g. `git clean -fd context`).
  /(^|[\s'"./\\])context([\s'"/\\]|$)/i,
  /\.claude-memory-kit/i, // the cross-project user tier
  /MEMORY\.md/i,
  /DECISIONS\.md/i,
];

/** True if the command invokes a delete/destroy verb. */
export function isDestructive(cmd) {
  return typeof cmd === 'string' && DESTRUCTIVE.some((re) => re.test(cmd));
}

/** True if the command references a claude-memory-kit memory path. */
export function touchesMemory(cmd) {
  return typeof cmd === 'string' && MEMORY_TOKENS.some((re) => re.test(cmd));
}

/**
 * The pure decision. Returns { block: boolean, reason?: string }.
 * Blocks only when the command is BOTH destructive AND aimed at a memory path.
 */
export function decideGuard(cmd) {
  if (isDestructive(cmd) && touchesMemory(cmd)) {
    return {
      block: true,
      reason:
        'BLOCKED by the claude-memory-kit delete-guardrail: this command deletes a ' +
        'memory path (context/ , the persona tier ~/.claude-memory-kit, or a memory ' +
        'file). Memory is precious and a delete here is often non-recoverable. If you ' +
        'REALLY mean to delete memory, do it by hand after a backup — or ask the user. ' +
        'NEVER run a delete after a `cd` you have not verified with `pwd`.',
    };
  }
  return { block: false };
}

// The shell-tool names across agents. Claude Code: `Bash` / `PowerShell`.
// Kiro / Amazon-Q: `execute_bash` (and the legacy alias `executeBash`). Verified
// from the real oh-my-kiro + vibekit preToolUse hooks (their guards match
// `execute_bash|Bash`, payload `.tool_name` + `.tool_input.command` on STDIN —
// the SAME shape as Claude Code, so one bin guards both agents). D-192.
const SHELL_TOOLS = new Set(['Bash', 'PowerShell', 'execute_bash', 'executeBash', 'shell']);

/**
 * Evaluate a PreToolUse payload (already parsed) from EITHER Claude Code or Kiro
 * — both deliver `{ tool_name, tool_input: { command } }` on stdin. Only shell
 * tools are inspected; everything else is allowed. Returns { block, reason? }.
 */
export function evaluatePayload(payload) {
  const tool = payload?.tool_name;
  if (!SHELL_TOOLS.has(tool)) return { block: false };
  const cmd = payload?.tool_input?.command;
  if (typeof cmd !== 'string' || cmd === '') return { block: false };
  return decideGuard(cmd);
}
