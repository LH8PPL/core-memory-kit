---
deleted_at: 2026-07-18T07:02:49Z
deleted_reason: ''
deleted_by: user-explicit
id: P-LQ9ZQHPZ
type: project
shape: State
title: SonarCloud Stale Source Path Requires Manual Web-UI Clear
created_at: 2026-07-12T18:58:01Z
write_source: auto-extract
trust: medium
recurrence_count: 1
source_file: auto-extract
source_line: 1
source_sha1: 184997e7fbb6b3b03f3892003743fcc21b0a45dd44b777842d69122bac16e8fe
---

SonarCloud flagged a stale source path that must be manually removed:
- **Stale path:** `C:/proj/context`
- **Action location:** SonarCloud web UI (user must log in)
- **Severity:** Advisory; not blocking v0.5.2
- **Reference:** Task 224 has full details

**Why:** The path is no longer valid (codebase refactored) and causes red flags in the build dashboard; clearing it via web UI will resolve the flag.

**How to apply:** When convenient, log into SonarCloud web UI, locate the old source path config, and remove `C:/proj/context`. See Task 224 for step-by-step details.
