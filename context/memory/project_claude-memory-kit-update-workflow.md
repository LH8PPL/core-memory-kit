---
id: P-497V47QC
type: project
title: Claude Memory Kit Update Workflow
created_at: 2026-06-18T18:44:10Z
write_source: auto-extract
trust: medium
source_file: auto-extract
source_line: 1
source_sha1: 300f2667d954bf783287ee2d8d8ae7abc053c2a0015a5b911b315ad683b0d79f
---

- Update global binary: `npm install -g @lh8ppl/claude-memory-kit@latest`
- Per-project refresh: `cd <project> && cmk install` (idempotent; refreshes version-stamped blocks in CLAUDE.md)
- Restart Claude Code to load new hooks/MCP server
- The two-step is non-obvious but required — updating npm alone does NOT update project scaffolds

**Why:** Users need a clear process to adopt new versions; the kit has no `cmk update` wrapper command yet (v0.3.3)

**How to apply:** Document in README/QUICKSTART; consider adding `cmk update` wrapper + `cmk doctor` drift detection for v0.3.4
