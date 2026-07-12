---
id: P-2YXUGHZJ
type: project
shape: State
title: SonarCloud Scanner Crash — Root Cause and Resolution Path
created_at: 2026-07-12T18:38:43Z
write_source: auto-extract
trust: medium
recurrence_count: 1
source_file: auto-extract
source_line: 1
source_sha1: c4c9e5cec137c19e0b8591183865137ec377fe8308d013f8a89d51ca0298c8bd
---

Since 2026-07-11 ~12:42, SonarCloud scans crash with: `opendir '<workspace>/C:/proj/context' — exit 3` (JS/Web analyzer v13.2.0).
- **Investigation finding:** `C:/proj/context` does NOT exist in any tracked repo files (exhaustively grepped config, sources, tests, lcov)
- **Root cause:** Stale server-side SonarCloud project setting (Windows dev path configured in web-UI) or v13.2.0 plugin defect — NOT code-driven
- **Why repo exclusions failed:** Crash is server-level/scan-time, not file-derived — repo-level config cannot stop server-side issues
- **Resolution:** Check SonarCloud web-UI > project settings > Analysis Scope for leftover `C:/proj/context` source path; remove it or confirm Automatic Analysis is disabled; or open SonarCloud support ticket
- **Task:** 224 (D-324) has full diagnosis

**Why:** Prevents fruitless repo-level troubleshooting. Key insight: SonarCloud crashes rooted in server settings are not fixable from the repo.

**How to apply:** If future scans crash on scanner opendir, check Task 224 and verify web-UI project settings before attempting any repo config changes. This is not a gating blocker.
