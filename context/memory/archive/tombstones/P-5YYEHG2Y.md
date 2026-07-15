---
deleted_at: 2026-07-15T14:07:59Z
deleted_reason: ''
deleted_by: user-explicit
id: P-5YYEHG2Y
type: project
shape: Absence
title: Claude Code Updates Don't Take Effect Until Session Restart
created_at: 2026-07-15T13:55:24Z
write_source: auto-extract
trust: medium
recurrence_count: 1
source_file: auto-extract
source_line: 1
source_sha1: 284fdda2f831ad4dc61d83bdcd4b79345b2a84c67a68e3cd91b8ae6952cc2cf0
---

Running `claude update` while inside an active Claude Code session does not immediately affect that session. The new version loads only when Claude Code is closed and reopened.

**Why:** Tool startup is when new versions are loaded; mid-session updates are silent and can cause confusion about which version is running.

**How to apply:** Before updating Claude Code, finish and commit pending work, close Claude Code, run `claude update`, then reopen. Do not expect the update to take effect in the current session.
