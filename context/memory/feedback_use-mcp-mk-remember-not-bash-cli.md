---
id: P-6UH9AC9F
type: feedback
title: use-mcp-mk-remember-not-bash-cli
created_at: 2026-06-22T18:23:10Z
write_source: user-explicit
trust: high
source_file: user-explicit
source_line: 1
source_sha1: 788db22dab30c987054372cb18de4bd6baa17b99c73c583fc4f5c3f0e2d15d78
related: [self-identifying-backup-names, never-overwrite-backups]
---

When capturing memory during a session on THIS repo (which dogfoods the kit), use the mk_remember MCP tool — NOT a Bash shell-out to `node packages/cli/bin/cmk.mjs remember` or `cmk remember`. The MCP tool is the in-conversation surface the kit is built to exercise; reaching for the raw CLI bypasses it and is the make-the-user-the-orchestrator anti-pattern.

**Why:** The kit dogfoods itself here (D-108); mk_remember is the tool a real user's agent uses. Shelling to the CLI is both an anti-pattern (Skill/tool agency) and skips testing the actual conversational path. The user flagged it twice this session ("you are doing bash cmk remember again").

**How to apply:** For any durable capture in this repo, call the mk_remember MCP tool with text/why/how/type/title. Only use the Bash CLI when explicitly testing the CLI surface itself (e.g. a cut-gate C-probe), never for ordinary fact capture.
