---
id: P-TV55UZNC
type: project
shape: State
title: Kit's Own Loops Are Real Detection Targets
created_at: 2026-07-22T16:54:09Z
write_source: auto-extract
trust: medium
recurrence_count: 1
source_file: auto-extract
source_line: 1
source_sha1: 590b1e395ca24ae71080fd07d5f9d195fad3c0519e5a14f2e35007e4167a5b58
---

The kit has actual loops that loop-detection should address:
  - Compress retries loop
  - Auto-extract children loop
  - D-298 cron that starved five nights straight
These are not hypothetical; they are concrete instances from kit experience.

**Why:** Loop detection is not just theoretical — the kit has real problems that must be solved

**How to apply:** When finalizing loop-detection implementation, validate it against these known kit loops to ensure comprehensive coverage
