---
id: P-La4FVXJY
type: project
title: Comparative Memory System Analysis — TencentDB as Counter-Example
created_at: 2026-06-29T17:20:16Z
write_source: auto-extract
trust: medium
source_file: auto-extract
source_line: 1
source_sha1: c45c2c6ad56e24aa2ce068c829bf5dbd01f58212b6e31c4caf80977da6b066b7
---

- **Research goal:** Validate Option B (recurrence-earned gates vs LLM-judged gates) by analyzing 7+ real memory systems
- **TencentDB role:** Counter-example class — uses `priority:number`, exhibits same cold-open fragility as phrasing-based gates
- **Workflow:** Async analysis in progress; sources fed incrementally by user; findings fold into tally as they arrive

**Why:** Concrete counter-examples prevent overconfidence; TencentDB proves fragility is structural to LLM gates, not judgment rubric

**How to apply:** Queue new repos as they arrive, classify against existing taxonomy (recurrence-earned / LLM-judged / event-time-validity), fold into rationale
