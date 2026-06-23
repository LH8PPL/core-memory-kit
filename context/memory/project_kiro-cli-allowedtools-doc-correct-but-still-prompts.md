---
id: P-XPYaGJU4
type: project
title: kiro-cli-allowedtools-doc-correct-but-still-prompts
created_at: 2026-06-23T19:14:59Z
write_source: user-explicit
trust: high
source_file: user-explicit
source_line: 1
source_sha1: 59305fe474f599a3fd93b38697731d15a93197df395da6cb86d2809c22c6f756
related: [kiro-mcp-autoapprove-missing-cut-blocker, kiro-session1-complete-wedge-proven-live]
---

CORRECTED FINDING (Kiro Session 2, kiro-cli 2.8.1 — NOT V3; the V3 banner was just an upgrade AD, I misread it): the kiro-cli MCP tool (mk_search) STILL PROMPTED for approval despite the agent-config having allowedTools:["@cmk"]. PRIMARY-SOURCE VERIFIED our format is CORRECT: kiro.dev/docs/cli/custom-agents/configuration-reference says "@server_name" (bare, no slash) approves ALL tools from that server — exactly what we wrote (mcpServers key=cmk, allowedTools=["@cmk"], useLegacyMcpJson=false). So the FORMAT is right but it didn't take. Likely causes to investigate: (1) the resolved agent isn't loading q_cli_default.json's allowedTools, (2) useLegacyMcpJson:false changes MCP-trust resolution, (3) runtime MCP server name != 'cmk'. WHAT WORKS in kiro-cli: KC1 (cmk = default agent, no --agent flag), KC2 (agentSpawn inject fired → mk_search called with tier=U query for cross-project rules). The IDE side (Session 1) fully works (autoApprove honored, all silent). NOT a v0.4.0 blocker — the IDE is the primary surface + works; kiro-cli inject/capture/default-agent all fire, only the MCP auto-approve prompt remains in the terminal. Compare to the IDE autoApprove which DID work — so the two surfaces' MCP-trust behave differently in practice even though both configs are doc-correct.

**Why:** Corrects my earlier WRONG 'V3' finding (the banner was an ad; kiro-cli is 2.8.1). The real gap: allowedTools:@cmk is doc-verified-correct format yet the MCP tool still prompts in kiro-cli, while the IDE autoApprove works. A genuine kiro-cli MCP-trust gap to diagnose, but not a v0.4.0 blocker.

**How to apply:** Diagnose after the gate: (1) does kiro-cli actually resolve q_cli_default.json (check `kiro-cli` agent-list / which config loads)? (2) try the explicit per-tool form allowedTools:["@cmk/mk_search",...] as a fallback; (3) check if useLegacyMcpJson affects it; (4) check the runtime MCP server name. For the gate NOW: click 'Trust always allow in this session' and continue — KG-guard (preToolUse delete-block) is the important remaining test.
