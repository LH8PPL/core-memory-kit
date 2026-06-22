---
id: P-453YJ3aW
type: project
title: BOM Handling in Config File Readers
created_at: 2026-06-21T16:48:59Z
write_source: auto-extract
trust: medium
source_file: auto-extract
source_line: 1
source_sha1: 2ea759635abf79e9461b8faec1f89f9e3acfe15d4b709dc64ba500af442b1c30
---

Windows may save JSON config files with a Byte Order Mark (BOM), which silently breaks parsing. Six separate systems parse user-facing JSON configs:
- `kiro-cli-agent` guard — silently clobbered user's default agent
- `settings-hooks` (×2) — `cmk install` refused to wire hooks/MCP
- `doctor` health check — false parse-error FAIL
- `config-core` — `cmk config get` returned wrong values
- `semantic-backend` — silent hybrid→keyword downgrade
- `mutate-agent-config` — false "corrupt" refusal

All six now use shared `read-json.mjs` module with `parseJsonFile` and `stripBom` helpers.

**Why:** BOM is a recurring, silent, high-impact failure in Windows; cascades across multiple subsystems causing corrupted behavior or false refusals

**How to apply:** New JSON config readers must use `read-json.mjs` helpers; code review flags any bypasses
