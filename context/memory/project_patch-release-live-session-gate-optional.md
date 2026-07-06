---
id: P-T7YJENCG
type: project
shape: Timeless
title: Patch Release Live-Session Gate Optional
created_at: 2026-07-06T12:02:59Z
write_source: auto-extract
trust: medium
recurrence_count: 1
source_file: auto-extract
source_line: 1
source_sha1: 9f66a762e45e97d27b634e58058439fda4b4951f9e24588c4f0367111261227f
---

For a patch release where the backend is CLI-verified and suite tests pass, the live-session gate (MCP tools in real conversation, session boundary tests) is optional per the D-84 rule.

**Why:** CLI and suite validation sufficient for narrowly-scoped patches

**How to apply:** After CLI gates and suite tests pass, tag immediately without running a live session first
