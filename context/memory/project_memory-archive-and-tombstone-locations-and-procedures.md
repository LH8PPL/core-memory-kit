---
id: P-4RR6HLS7
type: project
shape: State
title: Memory Archive and Tombstone Locations and Procedures
created_at: 2026-07-07T18:06:15Z
write_source: auto-extract
trust: medium
recurrence_count: 1
source_file: auto-extract
source_line: 1
source_sha1: 006a80111dbcda5f6118d6fd6019cd3aaf0399729457331452a890a7395ab070
---

- **Archive location**: context/memory/archive/superseded/
- **When used**: completed session-resume checkpoints (Task 151.3, PR-243, v0.4.0 kiro gate, etc.) archived here for recovery but out of live access
- **Archive metadata**: files include `superseded_by` pointers to replacement facts for cross-referencing
- **Tombstone location**: archive/tombstones/
- **Tombstone format**: each deletion record includes reason, creating audit trail (not silent deletes)

**Why:** Archival and tombstoning structure is essential for verifying memory system integrity; knowing both locations allows auditing fact lifecycle and confirming no data loss.

**How to apply:** In future sessions, when verifying memory health, check context/memory/archive/superseded/ for archived facts and archive/tombstones/ for deletion audit trails. This separates archival (recoverable) from true loss (audit-tracked).
