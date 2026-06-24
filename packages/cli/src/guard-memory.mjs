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

// A command is destructive if it invokes a delete/destroy verb OR an equivalent
// data-destroying mechanism that carries no `rm` token (find -delete, truncate,
// a `>`/`:>` redirection that truncates a file). Skill-review I2: a memory file
// can be destroyed with no `rm` at all.
const DESTRUCTIVE = [
  /\brm\b/i, // unix rm
  /\bRemove-Item\b/i, // PowerShell
  /\brmdir\b/i,
  /\brd\b/i, // cmd rd
  /\bdel\b/i, // cmd del
  /\bunlink\b/i,
  /\bgit\s+clean\b/i,
  /\bgit\s+reset\s+--hard\b/i,
  /\bfind\b[^|]*-delete\b/i, // find … -delete
  /\btruncate\b/i, // truncate -s0 file
  /(^|[\s;&|])>\s*\S/, // a `>`/`> file` redirection (truncates the target to empty)
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

// A SEGMENT (not the whole command) may be exempt: it only MENTIONS a delete in
// its text and can't itself execute one — a `git commit` whose message describes
// a delete, an `echo`/`grep`/`cat` of text about a delete. (oh-my-kiro's
// block-dangerous.sh exempts `git commit` for the same reason.) CRITICAL: this
// is applied PER SEGMENT, never to a whole compound command — `echo x && rm -rf
// context/memory` must NOT be exempted by its leading `echo` (skill-review B1).
const SEGMENT_EXEMPT = [
  /^\s*git\s+commit\b/i,
  /^\s*git\s+log\b/i,
  /^\s*echo\b/i,
  /^\s*(grep|rg|cat|less|head|tail|sed -n|awk)\b/i,
];

// Split a shell command into its sequenced segments on the separators that start
// a NEW command: && || ; | and newlines. (A `>` redirection is NOT a separator —
// it's handled as a destructive mechanism on its own segment.) Also surface any
// $(...) / `...` command substitution as its own segment so a delete hidden in a
// commit-message arg (`git commit -m "$(rm -rf context/memory)"`) is evaluated
// on its own and can't ride the outer command's exemption (skill-review I1).
function splitSegments(cmd) {
  const segments = [];
  // pull out command substitutions first, add them as standalone segments
  const subRe = /\$\(([^)]*)\)|`([^`]*)`/g;
  let m;
  while ((m = subRe.exec(cmd)) !== null) {
    const inner = m[1] ?? m[2];
    if (inner && inner.trim()) segments.push(inner);
  }
  const stripped = cmd.replace(subRe, ' '); // remove subs so they don't leak into outer segments
  for (const seg of stripped.split(/&&|\|\||;|\||\r?\n/)) {
    if (seg.trim()) segments.push(seg);
  }
  return segments;
}

function isSegmentExempt(seg) {
  return SEGMENT_EXEMPT.some((re) => re.test(seg));
}

/**
 * The pure decision. Returns { block: boolean, reason?: string }.
 * Splits the command into segments and BLOCKS if ANY non-exempt segment is both
 * destructive AND aimed at a memory path. Per-segment so an exempt verb in front
 * (`echo …`, `git commit …`) cannot launder a chained real delete (B1/I1).
 */
export function decideGuard(cmd) {
  if (typeof cmd !== 'string' || cmd.trim() === '') return { block: false };
  const offending = splitSegments(cmd).some(
    (seg) => !isSegmentExempt(seg) && isDestructive(seg) && touchesMemory(seg),
  );
  if (offending) {
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
// Kiro / Amazon-Q: `execute_bash` (+ legacy alias `executeBash`); kiro-cli V3
// (2.9.0) RENAMED it to `execute_command` (D-198, observed live in the cut-gate).
// Payload `.tool_name` + `.tool_input.command` on STDIN — the SAME shape as
// Claude Code, so one bin guards every agent. D-192.
const SHELL_TOOLS = new Set([
  'Bash',
  'PowerShell',
  'execute_bash',
  'executeBash',
  'execute_command', // kiro-cli V3 (2.9.0) rename — D-198
  'shell',
]);

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
