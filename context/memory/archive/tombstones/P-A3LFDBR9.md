---
deleted_at: 2026-07-21T18:14:11Z
deleted_reason: 'Superseded by P-CG4aK6TB: Task 243 raised .nvmrc to 22, the D-384 crash-floor reason evaporated, the allowlist is legitimately empty'
deleted_by: task-243
id: P-A3LFDBR9
type: project
shape: State
title: '"bench-storage" Allowlist Entry Is Pinned and Cannot Be Removed'
created_at: 2026-07-21T14:30:27Z
write_source: auto-extract
trust: medium
recurrence_count: 1
source_file: auto-extract
source_line: 1
source_sha1: c8645ec8c699b4ad3a547b15653c70c929ce903d6f654493a9fb4477a2b33eae
---

The `bench-storage` allowlist entry must NOT be emptied, despite appearing to be stray configuration. It is pinned by a regression test and is not technical debt. See D-384 for detailed rationale.

**Why:** Removing it would break the regression test; it is a deliberate, load-bearing constraint.

**How to apply:** When tidying configuration or reviewing allowlists, do not remove this entry.
