---
id: P-49UHTP6a
type: project
shape: State
title: 'Test Suite Pattern: buildMcpServer for MCP Refresh (not repeated runMcpServer)'
created_at: 2026-07-13T13:23:06Z
write_source: auto-extract
trust: medium
recurrence_count: 1
source_file: auto-extract
source_line: 1
source_sha1: 7229bbe400c41695d4cf529938f4e8d7855b7de62e49e1241b19dc3c04cb1a81
---

**Problem:** Calling `runMcpServer` multiple times in-process leaks process listeners (stdin/SIGINT/SIGTERM), destabilizing concurrent tests' fixture teardown.

**Solution:** Use `buildMcpServer` (established suite pattern):
- One long-lived db handle (matches real server lifecycle)
- Close fixtures in `afterEach`
- Refresh wired in tool handlers (zero process side effects)

**Why:** The listener leak caused STACK_TRACE_ERRORs during fixture teardown in full-suite runs but not isolated tests; fix discovered and applied

**How to apply:** When writing MCP tests needing refresh, use `buildMcpServer` with proper fixture lifecycle; reserve `runMcpServer` for actual server startup paths
