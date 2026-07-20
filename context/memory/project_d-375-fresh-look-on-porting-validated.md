---
id: P-99WUZ6LJ
type: project
shape: Event
title: D-375 Fresh-Look-on-Porting Validated
created_at: 2026-07-20T16:58:47Z
write_source: auto-extract
trust: medium
recurrence_count: 1
source_file: auto-extract
source_line: 1
source_sha1: 24e3f0bb3fc2f5462d50d58ef7f1e34d282e3d7444b9be57e8d219b9241f9ea0
---

Re-read ECC's pre-compact.js at HEAD before porting. Took: always-exit-0, always-log-event. Skipped: their synchronous inline LLM call (makes users wait). First real use of D-375 rule earned its keep.

**Why:** Porting without review can embed anti-patterns; fresh look catches differences in context/constraints

**How to apply:** When copying approach from another project, always re-read source at current HEAD; selective about what to take
