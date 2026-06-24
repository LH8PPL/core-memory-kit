---
id: P-U7UUPTA2
type: project
title: Kiro-CLI MCP Registration Configuration Gap
created_at: 2026-06-24T10:30:25Z
write_source: auto-extract
trust: medium
source_file: auto-extract
source_line: 1
source_sha1: 3948cf7d7f24da778f712786ac3478ab1e1731a73d82038d90db00b86fa48da6
---

The `install-kiro.mjs` (and `install-agent.mjs`) MCP server registration still uses `command: 'cmk'` (the shim). Should be converted to node-direct (`process.execPath` + resolved `cmk.mjs` path) following the Task 81/D-190 pattern. Manual gate test confirmed node-direct MCP start succeeds.

**Why:** Without conversion, kiro-cli shows persistent cmd.exe window on spawn. Claude Code avoids it by spawning headless, which masks the gap in headless contexts.

**How to apply:** Update MCP `command` field in install-kiro.mjs to node-direct. Test with `mk_search` to verify memory still works.
