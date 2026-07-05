---
id: P-SDYPaDJ9
type: project
shape: State
title: Cursor Agent Windows Native Support — Live Validation
created_at: 2026-07-05T14:54:55Z
write_source: auto-extract
trust: medium
recurrence_count: 1
source_file: auto-extract
source_line: 1
source_sha1: 634a81b70677a288e618d79e20a41f0b72ef6547348f448fa0da43a2c08926ef
---

- **Working command**: `agent -p --trust --model composer-2.5-fast --output-format text "<prompt>"`
- **Entry point**: `%LOCALAPPDATA%\cursor-agent\agent.cmd` (Windows native shim)
- **Login flow**: Terminal → browser prompt → return to PowerShell; uses existing Cursor subscription
- **Critical correction**: Wave 1 stated separate CURSOR_API_KEY needed; user testing proves false
- **Key flag**: `--trust` skips workspace-trust hang
- **Cost tier**: composer-2.5-fast is background/cheap model

**Why:** Resolves Task 200's load-bearing Cursor-Windows question. Wave 1 research (~2.26M tokens) identified native Windows exists; user's live validation now proves no second vendor/API key required. Unblocks CursorAgentBackend implementation.

**How to apply:** Implement CursorAgentBackend mirroring kiro-backend.mjs; use confirmed command/flags; no need for API key fallback mechanism.
