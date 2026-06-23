---
deleted_at: 2026-06-23T19:12:44Z
deleted_reason: ''
deleted_by: user-explicit
id: P-R4WaaWN6
type: project
title: kiro-cli-v3-trust-model-allowedtools-not-honored
created_at: 2026-06-23T19:12:05Z
write_source: user-explicit
trust: high
source_file: user-explicit
source_line: 1
source_sha1: a58a623e6f3f10486ff7a4ed5c189cf4fa270b4c4c075d0a27bf151c54d73697
related: [kiro-mcp-autoapprove-missing-cut-blocker, kiro-session1-complete-wedge-proven-live]
---

FINDING (Kiro Session 2, kiro-cli, 2026-06-23): the kiro-cli we tested is KIRO CLI V3 (early release — banner: "An early release of Kiro CLI V3 is now available... an improved trust model. Migration tooling to bring your V2 configurations to V3 is coming soon. https://kiro.dev/docs/cli/v3/"). KC1 ✅ (cmk resolved as default agent, kiro-cli chat with no --agent started it) and KC2 ✅ (it called mk_search query="rules preferences habits lessons" tier=U — inject/recall firing, searching the user tier for cross-project rules). BUT the MCP tool STILL PROMPTED ("mk_search requires approval — Yes / Trust always allow / No") despite our allowedTools:["@cmk"] (D-196). Root cause: allowedTools is the V2 agent-config trust format; V3 changed the trust model and "migration tooling is coming soon" — so our V2 config isn't fully honored by the V3 CLI yet. This is a Kiro-VERSION transition issue, not purely a kit bug. The IDE side (Session 1) worked perfectly (autoApprove honored). NEEDS: research kiro.dev/docs/cli/v3/ for the V3 MCP-trust format and whether the kit should emit it (or both V2+V3). For NOW: click "Trust, always allow in this session" to continue the gate.

**Why:** Found live in cut-gate-kiro Session 2: the kiro-cli is V3 (early release) with a new trust model; our V2 allowedTools:@cmk doesn't suppress the MCP prompt there. The IDE autoApprove worked. This is a forward-compat gap as Kiro CLI moves V2→V3.

**How to apply:** Research kiro.dev/docs/cli/v3/ for the V3 agent-config / MCP-tool trust format. Decide: emit the V3 format, or both V2+V3, in kiro-cli-agent.mjs. NOT urgent for v0.4.0 IF the IDE surface (which works) is the primary path — but the kiro-cli surface is a shipped feature, so flag honestly. The hooks (agentSpawn/stop/preToolUse) may ALSO be affected by V3 — verify KC2/KC3/KG-guard still fire in V3 (they appear to: mk_search fired). For the gate NOW: 'Trust always allow in this session' to proceed.
