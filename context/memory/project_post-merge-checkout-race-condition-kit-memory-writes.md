---
id: P-XUQK356C
type: project
title: Post-Merge Checkout Race Condition (Kit Memory Writes)
created_at: 2026-06-11T11:13:07Z
write_source: auto-extract
trust: medium
source_file: auto-extract
source_line: 1
source_sha1: 10eb5cb05f198a3e5b2eb381c8f36cf8790dc030
---

**Issue:** Post-merge checkout can collide with the kit's own mid-run memory writes, briefly re-creating the feature branch with the annotation commit.

**Resolution:** Cherry-pick the annotation commit onto main → commit the memory churn → delete the remote branch.

**Status:** Recurring issue ("our running race, again").

**Why:** The kit maintains and actively modifies its own `context/` during operations. Merge/checkout operations can race with these writes, causing transient stale branches.

**How to apply:** If post-merge creates an unexpected branch with annotation, follow the cherry-pick → memory commit → branch-delete sequence. Monitor for this during high-activity merge windows (e.g., around CI annotation steps).
