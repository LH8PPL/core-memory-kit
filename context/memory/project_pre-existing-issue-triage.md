---
id: P-G6GWaMaZ
type: project
title: Pre-Existing Issue Triage
created_at: 2026-06-26T09:48:37Z
write_source: auto-extract
trust: medium
source_file: auto-extract
source_line: 1
source_sha1: 01dbf6f58cbd5de83839f3224e149850756fee8aa165cde7e94b5a796d9fa9c7
---

When verification surfaces test failures unrelated to the current feature/task:
1. Flag them in the feature PR (transparency)
2. File a separate task (explicit ownership)
3. Do NOT bundle into the feature PR (keeps root causes clear)

Example: Task 167 PR identified 3 pre-existing environmental failures (2 tier-budget, 1 tmpdir-short-path) → filed Task 168.

**Why:** Bundling obscures which failures the current change caused vs. which predate it. Separate filing prevents silent accumulation.

**How to apply:** When unrelated failures surface, flag in PR description but create a separate task. Don't block the feature on pre-existing environmental issues.
