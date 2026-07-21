---
id: P-ZRRAMUQ9
type: project
shape: Timeless
title: Copy-Paste Errors Persist in Headers Across Months
created_at: 2026-07-21T18:43:17Z
write_source: auto-extract
trust: medium
recurrence_count: 1
source_file: auto-extract
source_line: 1
source_sha1: e4bee2910381492b4950112f1167ba5e3ff8f66c76cee0a7b553bacfe6842d05
---

D-384's "Node 24" reference in bench-storage remained after an identical fix one month prior (during last Node floor sweep). Same class fired twice.

**Why:** Single-site fixes don't scale; human review catches one instance but misses duplicates in sister files

**How to apply:** After node floor updates, `grep` for the old floor across tree to catch stragglers; consider whether to template headers to prevent drift
