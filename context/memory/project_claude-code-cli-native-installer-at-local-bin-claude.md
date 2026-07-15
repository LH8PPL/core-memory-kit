---
id: P-6C4HT4YX
type: project
shape: State
title: Claude Code CLI Native Installer at ~/.local/bin/claude
created_at: 2026-07-15T13:55:24Z
write_source: auto-extract
trust: medium
recurrence_count: 1
source_file: auto-extract
source_line: 1
source_sha1: 1fc479343d38cdce89e53cce425f3131221c1e9b6c92b7cf32f58f896925cde8
---

Claude Code CLI is installed as a native executable at `~/.local/bin/claude`, not via npm or package manager. Self-updates via `claude update` command in place. Running `claude doctor` displays the install type/method.

**Why:** Understanding the install method determines update path and troubleshooting approach; knowing the exact location matters for scripts or documentation.

**How to apply:** Refer to `~/.local/bin/claude` as the canonical location. Use `claude update` for CLI updates; never use package managers.
