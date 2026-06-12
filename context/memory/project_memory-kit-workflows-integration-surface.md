---
id: P-GRUJ3P7Q
type: project
title: Memory Kit + Workflows Integration Surface
created_at: 2026-06-12T06:24:57Z
write_source: auto-extract
trust: medium
source_file: auto-extract
source_line: 1
source_sha1: 8d39daa8c3255612e195458c21edaad641864375
---

Workflow agents (subagent swarms: up to 1000 agents, 16 concurrent) integrate with kit through two existing paths:
- **CLAUDE.md**: loaded when agents work in project
- **MCP tools**: workflow agents inherit tool allowlist; `mcp__cmk__*` tools available (`mk_search`, `mk_get`) for recall without orchestrator prompting
- **Stop hook**: captures workflow final report → session memory

**Why:** Workflow agents start cold (no context on user setup/decisions); kit multiplies core utility across swarm scale.

**How to apply:** Kit-enabled projects gain memory leverage in workflows. Testing surface exists: concurrent MCP reads (safe) vs concurrent `mk_remember` calls (potential SQLite lock contention) is untested—candidate for v0.3.x investigation.
