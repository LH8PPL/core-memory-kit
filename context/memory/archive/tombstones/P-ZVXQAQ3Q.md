---
deleted_at: 2026-06-10T12:32:10Z
deleted_reason: rulebook duplicate + misstates the gate (the gate is 5/5 first invocation; 4/5 is the narrow jitter exception) — rules live in CLAUDE.md (D-108/D-112 class)
deleted_by: user-explicit
id: P-ZVXQAQ3Q
type: project
title: Jitter Gate Exception (4/5 + 2×5/5)
created_at: 2026-06-10T12:18:46Z
write_source: auto-extract
trust: medium
source_file: auto-extract
source_line: 1
source_sha1: 675dfaa2d4dbe2e8885b4347a2d1e2b2c1803f09
---

Test suite has a 4/5 pass gate with a narrow exception for live-Haiku network jitter:
- **Condition**: 4/5 is acceptable *only* if the single failure is in the documented jitter set (e.g., `spawn-smoke-weekly-curate`)
- **Jitter class**: transient failures (API timeouts, 5xx, blips) — not code bugs, lock contention, or fixture races
- **Follow-up**: 4/5 must be followed by 2 consecutive 5/5 runs to merge
- **Other failures**: block the PR; require fixing before merge

**Why:** Real Haiku calls inherit actual network failure modes; exception tolerates *only* transient issues while catching code/fixture bugs

**How to apply:** When CI shows 4/5, verify the failure is jitter-class and 2×5/5 followed; otherwise it blocks merge
