---
id: P-7P5XVMK5
type: project
shape: State
title: Byte-Depth Contract — Real Facts Near Top
created_at: 2026-07-20T11:30:23Z
write_source: auto-extract
trust: medium
recurrence_count: 1
source_file: auto-extract
source_line: 1
source_sha1: 5535ab22046b065e8f8a89e0240add6ba945bc046e9048bad9f2b99ab426a359
---

cli-inject-context enforces a byte-depth contract (test in place from Task 18): real facts must appear near top of snapshot. Prepending instructions breaks this by pushing facts too deep. Solution: annotate headings in-place, avoid prepends.

**Why:** Real facts need fast recovery by downstream tools and fresh sessions.

**How to apply:** When modifying snapshot structure, annotate headings in-place.
