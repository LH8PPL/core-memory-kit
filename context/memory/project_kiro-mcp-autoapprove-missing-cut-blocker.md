---
id: P-RBRAJMPX
type: project
title: kiro-mcp-autoapprove-missing-cut-blocker
created_at: 2026-06-23T16:40:20Z
write_source: user-explicit
trust: high
source_file: user-explicit
source_line: 1
source_sha1: 06c0d0188a3704603c205d0ab521c9989ec23af76ee436d732a1a7da2d478683
related: [kiro-trusted-commands-auto-approve, kiro-mcp-trusted-commands]
---

CUT-BLOCKER found live in cut-gate-kiro Session 1 (2026-06-23, 8th cross-agent finding): the kit wires kiroAgent.trustedCommands for SHELL HOOKS (D-194) but does NOT auto-approve the MCP TOOLS — so when Kiro calls mk_remember in chat, the user gets a Reject/Trust/Run prompt on every MCP tool call. Kiro gates MCP-tool calls SEPARATELY from shell-command hooks. THE FIX (primary-source verified, kiro.dev/docs/mcp/configuration): add an `autoApprove` array INSIDE the mcpServers entry in .kiro/settings/mcp.json — `{ "mcpServers": { "claude-memory-kit": { ..., "autoApprove": ["mk_remember","mk_search",...] } } }`. Bare tool names, camelCase key, supports "*" wildcard. This is the RIGHT home (workspace mcp.json, travels with repo, no per-user Trust click). Use the EXPLICIT 11-tool list not "*" (scoped to kit tools only; mk_forget is safe to auto-approve the CALL because it has its own two-step confirm-token before deleting). What WORKED live: the hook trusted-commands (D-194 — capture ran SILENTLY no Run/Reject), SKILL.md valid YAML (D-195 — no reject), KH1 capture fired, M1 Kiro called mk_remember with rich payload.

**Why:** Found live by the user in Kiro Session 1: hooks auto-run (D-194 works) but MCP tool calls (mk_remember etc.) still prompt Reject/Trust/Run because Kiro has a SEPARATE trust gate for MCP tools vs shell hooks. The kit never wired it. User clicked Trust manually and asked to add it to the template.

**How to apply:** Add autoApprove to the MCP entry in install-kiro.mjs (the MCP_ENTRY object that mutateAgentConfig writes to .kiro/settings/mcp.json). List the 11 kit MCP tools explicitly (mk_remember, mk_search, mk_get, mk_timeline, mk_cite, mk_recent_activity, mk_trust, mk_lessons_promote, mk_forget, mk_queue_list, mk_queue_resolve — verify against mcp-server.mjs). Test-first; add to KG2/KG-mcp gate check; sync any needed doc. Mirrors the D-194 trusted-commands pattern but for the MCP surface.
