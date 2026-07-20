---
id: P-DPFVXU4E
type: project
shape: Timeless
title: Refactor Risk Concentrates in the Glue
created_at: 2026-07-20T10:24:41Z
write_source: auto-extract
trust: medium
recurrence_count: 1
source_file: auto-extract
source_line: 1
source_sha1: 91baf456ad10844c9fb0bd02dfa63e06a73287575aed1eb3bfd60ef7d46ea4f2
---

When consolidating code, **highest risk is not in moved pieces but in new logic binding them together**.

Task 186 evidence: all three Blocking findings were in fresh glue code (`--only` parameter handling, `--only=catalogs` fallthrough, direction-2 path harvesting from prose), not in the four ported families. None visible to 3,189 existing tests. Seven new regressions now pin integration points.

**Why:** Moved pieces maintain their prior invariants; new binding code must satisfy untested invariants. This is the defect class most likely to escape review.

**How to apply:** After consolidation, allocate review and regression effort to the glue (parameter combinations, edge cases in binding logic) rather than re-validating ported pieces.
