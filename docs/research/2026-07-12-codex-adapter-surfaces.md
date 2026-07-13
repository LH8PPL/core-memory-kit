---
date: 2026-07-12
topic: Codex adapter surfaces (Task 196 tail) — primary-source verification + live probes on the real binary; the June-20 "plugin-marketplace, out of scope" classification is OBSOLETE
source: developers.openai.com/codex docs (redirect to learn.chatgpt.com/docs/*) + live probes on the installed codex-cli 0.142.5 (the Codex desktop app's bundled binary)
tags: [cross-agent, codex, adapter, task-196, hooks, mcp, D-327]
---

# Codex adapter surfaces (2026-07-12) — the primary-source record for the v0.5.2 build

_The §5.1 rule applied before code: every path below is verified against OpenAI's own docs
and/or a live probe of the real binary on the dev machine. This note supersedes the Codex
classification in the [2026-06-20 seam note](2026-06-20-cross-agent-adapter-seam-task50.md)._

## The headline: the old classification is OBSOLETE

The June-20 seam research classed Codex as **`plugin-marketplace`** ("highest effort, lowest
reuse — out of v0.4.0 scope"). Since then Codex shipped a **first-class hooks system**
(UserPromptSubmit merged 2026-03-18; Pre/PostToolUse ~v0.117; the installed binary is
0.142.5) whose events AND response contract are near byte-compatible with Claude Code's.
Codex is now a **`hooks-json` + MCP** agent — the same integration type family as Cursor,
genuinely patch-sized on the Task-50 seam.

## Hooks (doc-verified at learn.chatgpt.com/docs/hooks)

- **Files:** project `<repo>/.codex/hooks.json` · user `~/.codex/hooks.json` · inline
  `[[hooks.EventName]]` tables in the same-layer `config.toml`. Global kill-switch:
  `[features] hooks = false`.
- **Events (exact strings):** `SessionStart`, `SubagentStart`, `PreToolUse`,
  `PermissionRequest`, `PostToolUse`, `PreCompact`, `PostCompact`, `UserPromptSubmit`,
  `SubagentStop`, `Stop`. **No `SessionEnd`** (the kit's sessionEnd leg stays unmapped, like
  Kiro).
- **Schema (Claude-Code-shaped matcher groups, in a dedicated file):**
  `{"hooks": {"EventName": [{"matcher": "<regex>", "hooks": [{"type": "command",
  "command": "...", "timeout": 600, "statusMessage": "...", "commandWindows": "..."}]}]}}`
  — note `commandWindows` (a per-OS command override; useful for the kit's Windows path).
- **Stdin payload (all events):** `session_id`, `transcript_path`, `cwd`,
  `hook_event_name`, `model`, `permission_mode` (+ event-specifics like `turn_id`).
  `transcript_path` on stdin means capture can read the exact rollout file — no
  workspace-key derivation needed.
- **Response contract (the Claude-compatible part):**
  - inject: `{"hookSpecificOutput": {"hookEventName": "SessionStart", "additionalContext":
    "..."}}` — plain stdout text is ALSO added as developer context.
  - guard: PreToolUse deny = `{"hookSpecificOutput": {"hookEventName": "PreToolUse",
    "permissionDecision": "deny", "permissionDecisionReason": "..."}}` (legacy
    `{"decision": "block", "reason"}` also honored). Shell commands arrive as
    `tool_name: "Bash"`; file edits as `apply_patch` (matchers accept
    `apply_patch`/`Edit`/`Write`).
  - `Stop`/`SubagentStop`: continue-only (no block) — fine, the kit's turnEnd capture is
    fire-and-forget.
- **⚠️ Trust model (the honest-docs item):** non-managed hooks are **hash-trusted — new or
  CHANGED hook scripts are SKIPPED until the user reviews + trusts them via `/hooks`**.
  So `cmk install --ide codex` writes the hooks but the automatic layer starts only after a
  one-time `/hooks` trust in Codex (same class as Kiro's one-time MCP trust click — document
  in docs/CODEX.md, never claim zero-step). Managed hooks (`requirements.toml`) bypass this
  but are enterprise-MDM surface, not the kit's.

## MCP (doc + live-probe verified)

- Config: TOML `[mcp_servers.<name>]` in `~/.codex/config.toml`; a **project
  `.codex/config.toml` is a real config layer but TRUSTED-PROJECTS-ONLY** (untrusted →
  silently ignored), and Desktop builds have open issues honoring project-level MCP
  (openai/codex #13025/#13056).
- **The safe write path (live-verified 0.142.5): `codex mcp add <NAME> -- <COMMAND>...`**
  (+ `list`/`get`/`remove`) — writes the user-level config without the kit parsing/serializing
  TOML. Decision for the build: use `codex mcp add cmk -- node <cmk-mcp-bin>` at install;
  fall back to printing the manual command when the binary isn't found.

## Instructions

- `AGENTS.md` at repo root — Codex's native instruction file; the kit's existing
  `agents-md` managed-block leg (Task 50.G) is exactly this surface. The codex profile's
  `instructionFile` = `AGENTS.md` (shared with the generic rung; the managed-block fold from
  Task 220 keeps double-installs safe).

## Transcripts

- `~/.codex/sessions/YYYY/MM/DD/rollout-YYYY-MM-DDTHH-MM-SS-*.jsonl` (JSONL, full turns +
  tool calls; archived moves to `~/.codex/archived_sessions/`, same structure). For hooks,
  prefer the payload's `transcript_path` over directory discovery. (Also a future
  `cmk import-sessions` source — Task 225/228.)

## Headless backend (live-verified 0.142.5)

- `codex exec [OPTIONS] [PROMPT]` — "Run Codex non-interactively"; prompt as arg or stdin
  (`-`). This is the Task-200 agent-relative backend leg for Codex-only users (exact flags
  for output shape probed at build time; the CMK_BACKEND_SPAWN recursion guard from D-271
  applies — codex hooks would otherwise re-fire the kit).

## The dev machine (live-test plan)

The maintainer's machine runs the **Codex desktop app** with bundled
`codex-cli 0.142.5` at
`%LOCALAPPDATA%\OpenAI\Codex\bin\<hash>\codex.exe` (NOT on PATH — the build's live-tests
invoke it by absolute path; `~/.codex/` carries real auth). CLI-side legs (install / mcp add
/ hooks.json shape / exec probe) are live-testable NOW; the interactive-session gate (real
Codex chat driving inject/capture) is the user's manual step, same class as Task 208's
Cursor gate.
