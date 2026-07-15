---
id: P-MNR7R9UW
type: project
shape: Relationship
title: SonarCloud A3S Security-Taint Server-Side Bug Root Cause
created_at: 2026-07-15T18:52:50Z
write_source: auto-extract
trust: medium
recurrence_count: 1
source_file: auto-extract
source_line: 1
source_sha1: fea99a9091cd07a3233d582be3fc9fe3179a94385e018472a3f4e9a655037c98
---

- Root cause of C:/proj/context scan crash: SonarCloud's A3S security-taint context feature (server-side SonarSource bug)
- Not a configuration problem on our side
- Handling: reverted diagnostic commits; evidence filed with SonarSource
- Status: awaiting vendor fix from SonarSource

**Why:** Clarifies that the crash is third-party, not our config/code. Explains why reverting diagnostics was the right approach rather than deep-diving into our setup.

**How to apply:** If future debugging encounters similar SonarCloud scan crashes on context paths, check whether A3S is the culprit before troubleshooting our config.
