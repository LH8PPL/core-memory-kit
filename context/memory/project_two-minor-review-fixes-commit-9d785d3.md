---
id: P-ZZ3GYLUY
type: project
title: Two Minor Review Fixes (Commit 9d785d3)
created_at: 2026-06-30T15:00:13Z
write_source: auto-extract
trust: medium
source_file: auto-extract
source_line: 1
source_sha1: d42bfdbb1f80b694f4daeb4fb85f4bcec0654a814f564aa600c52985b62ffb42
---

**Recurrence-Default Consistency**: `index-rebuild` was the only reader keeping `rc=0`; aligned to floor rule `<1 → 1` like other 4 readers.
**Per-Call DB-Open**: `applyTrustSignal` takes optional shared `db` handle; merge paths (merge-facts + mergeScratchpadBullets) now reuse one connection. New test pins helper never closes caller's handle.

**Why:** Resolved minor review findings; ensures consistent initialization and resource efficiency

**How to apply:** Reference when auditing recurrence readers or DB connection contracts
