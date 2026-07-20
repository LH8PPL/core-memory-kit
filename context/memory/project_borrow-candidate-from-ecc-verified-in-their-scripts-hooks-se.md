---
id: P-RYN7KWJJ
type: project
shape: State
title: BORROW CANDIDATE from ECC (verified in their scripts/hooks/session-start.js:651-
created_at: 2026-07-20T07:38:16Z
write_source: user-explicit
trust: high
recurrence_count: 1
source_file: user-explicit
source_line: 1
source_sha1: 974e56c870bd423a5b8afffbdf746c3875f32ce6ea6642f0779f8e6c8b638280
---

BORROW CANDIDATE from ECC (verified in their scripts/hooks/session-start.js:651-671): a STALE-REPLAY GUARD wrapping injected prior-session context in an explicit HISTORICAL REFERENCE ONLY - NOT LIVE INSTRUCTIONS marker, stating that task descriptions and slash-command ARGUMENTS inside are stale-by-default, must not be re-executed without an explicit current user request, and must be verified against git/working-tree state first. They added it after a real production bug (their issue 1534): post-compaction the model re-ran an ARGUMENTS-bearing slash command with the last arguments it saw, duplicating issues, branches and Notion tasks.

**Why:** Our AUTHORITATIVE_MEMORY_PREAMBLE (inject-context.mjs:238-249) ranks injected memory ABOVE the model's own assumptions and says 'lead with memory' / 'injected memory wins' - but draws NO line between durable recorded knowledge (we decided X, the user prefers uv) and stale in-flight work state. Our own snapshots carry Active Threads bullets like 'Task 227: commit teardown fix then PR then automerge' and 'user must accept trust dialog' long after those shipped. That is the exact re-execution hazard ECC hit, and our preamble is MORE forceful than theirs was.

**How to apply:** Candidate v0.6.x rider: add a stale-marker clause to AUTHORITATIVE_MEMORY_PREAMBLE distinguishing durable facts (authoritative) from work-state sections like Active Threads / Pending Decisions / Open Questions (historical, verify against live state before acting). Cheap - preamble is a single exported constant with a len<=700 boundary test to respect. Compose with the 700-byte reserve and the snapshot cap.
