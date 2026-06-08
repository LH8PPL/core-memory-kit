# Claude Code MCP install-config — verified findings (for Task 108b.6 / R2 / D-80)

Research for `cmk install` registering the kit's MCP server + allowlisting its
tools, so the model drives memory ops through MCP tools (no per-call bash
permission friction). Primary source: <https://code.claude.com/docs/en/mcp>
(fetched 2026-06-08; `docs.claude.com/en/docs/claude-code/*` now 301-redirects
to `code.claude.com/docs/en/*`).

## VERIFIED

- **`.mcp.json` is the project-scoped config**, committed at the project root,
  shared with everyone on the project (scope `project`). Local/user scopes live
  in `~/.claude.json`. Shape (standard, as emitted by `claude mcp add-json`):
  ```json
  {
    "mcpServers": {
      "cmk": { "type": "stdio", "command": "cmk", "args": ["mcp", "serve"] }
    }
  }
  ```
  `type` accepts `stdio` | `http` | `streamable-http` (alias for `http`) | `ws`.
  stdio servers also take `env` (KEY=value map).
- **`CLAUDE_PROJECT_DIR` is set in the spawned server's environment** to the
  project root — so `cmk mcp serve` can resolve `projectRoot` from
  `process.env.CLAUDE_PROJECT_DIR` rather than `process.cwd()`. (TODO for 108b.6:
  confirm `runMcpDispatch` / the `mcp serve` action reads it; today it may rely on
  cwd.) For project/user-scoped `.mcp.json`, `${VAR}` expansion in `command`/`args`
  needs a default like `${CLAUDE_PROJECT_DIR:-.}`; plugin-provided configs
  substitute `${CLAUDE_PROJECT_DIR}` directly.
- **`enableAllProjectMcpServers: true`** (in `.claude/settings.json`) auto-approves
  every server defined in project `.mcp.json` files — this clears the
  per-**server** "approve this MCP server?" prompt. It operates at server level,
  NOT tool level.
- **MCP tool naming** is `mcp__<server>__<tool>` — so the kit's tools are
  `mcp__cmk__mk_remember`, `mcp__cmk__mk_forget`, etc.
- `cmk mcp serve` is the server entrypoint (parent `mcp` + child `serve`, per
  subcommands.mjs).

## ✅ RESOLVED 2026-06-08 — the permission-specifier question (verified, then shipped in 108b.6)

Verified against **<https://code.claude.com/docs/en/permissions>** (the "MCP" subsection under "Tool-specific permission rules"). All three forms work:

- `mcp__cmk` — matches **any** tool from the `cmk` server (server-level).
- **`mcp__cmk__*`** — the documented tool **wildcard** ("wildcard syntax that also matches all tools from the `…` server"). ✅ Supported — this is what the kit writes.
- `mcp__cmk__mk_remember` — matches one specific tool.

So the gate to writing the allowlist is cleared: `cmk install` writes `permissions.allow: ["mcp__cmk__*"]` (via `writeKitHooks`'s `KIT_ALLOW`). The same page also confirmed the **R2/D-80 rationale** — *"Combining `cd` with `git` in one compound command always prompts, regardless of the target directory"* — so a `cd … && cmk …` compound can't be allowlisted on the bash path, and running the op as an allow-listed MCP tool sidesteps the prompt. `enableAllProjectMcpServers` was deliberately NOT set (it auto-approves ALL project servers — too broad; the one-time per-server approval is a Claude Code safety feature the kit shouldn't bypass silently). Shipped in 108b.6 (PR #131). The "did you check?" discipline held: the allowlist was written only after the wildcard was confirmed at the primary source.

## Design intent for 108b.6 (pending the OPEN verification)

`cmk install` should (idempotently, merging — never clobbering a user's existing
file): (a) write/merge `.mcp.json` with the `cmk` stdio server; (b) set
`enableAllProjectMcpServers` and/or the correct `permissions.allow` MCP specifier
in `.claude/settings.json` so the model can call `mcp__cmk__*` without per-call
approval — the R2 / D-80 payoff (the `cd`-compound bash-permission edge goes away
when memory ops run as allowlisted MCP tools instead of `Bash(cmk …)`). The
`memory-write` skill should point the model at the MCP tools when present.
Decision-trail: this composes with the existing settings-hooks writer
(`settings-hooks.mjs`) — reuse its merge discipline, don't roll a new JSON writer.
