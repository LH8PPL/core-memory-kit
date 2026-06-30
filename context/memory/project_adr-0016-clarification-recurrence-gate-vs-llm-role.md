---
id: P-M7PHRC7G
type: project
title: ADR-0016 Clarification — Recurrence Gate vs. LLM Role
created_at: 2026-06-29T16:46:30Z
write_source: auto-extract
trust: medium
source_file: auto-extract
source_line: 1
source_sha1: b59f880c858a2285c2fbc8d620ff6f4b6624c3c89df14d982059d3fda7f0b852
---

**Actual design:** Promotion gate = arithmetic `recurrence_count ≥ 3` (hot path). LLM kept for off-hot-path consolidation/synthesis only.

**Prior framing error:** "Replace LLM entirely" overstated it. LLM stays for synthesizing candidate wording (e.g., `auto-persona` classifier); gate mechanism shifts from LLM-graded confidence to arithmetic recurrence.

**Rationale:** mem0 abandoned per-fact LLM judge due to cost/instability. D-169 forbids LLM on capture loop. Recurrence is the deterministic gate signal; synthesis remains LLM's job.

**Implementation (Option B):** Recurrence_count ≥ 3 gates promotion on hot path; LLM synthesizes candidate wording in consolidation pass.

**Why:** User returned for clarification; prior explanation risked misdirecting task-151 and option choice. Corrected framing is essential for sound implementation.

**How to apply:** Task-151: use recurrence_count as hot-path promotion gate (≥3). Preserve LLM for off-hot-path synthesis in consolidation pass.
