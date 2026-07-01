---
id: P-G9KBKA6B
type: project
title: Retrieval Ranking Strategy — Avoid Score-Based Hot-Path Ranking
created_at: 2026-07-01T13:04:18Z
write_source: auto-extract
trust: medium
recurrence_count: 1
source_file: auto-extract
source_line: 1
source_sha1: c753021f0e8c148a56bda076625150cf57558269deaee99df59810dea073abb2
---

Design decision (§20.3, Task 151, ADR-0016): The kit does NOT rank retrieval by learned utility scores.

- `trust_score` is floor/protection only (guards against low-confidence entries)
- Actual ranking uses BM25 keyword relevance + coarse priority enum
- This sidesteps cold-start entirely rather than mitigating it

External validation: U-Mem (arXiv 2602.22406, NUS/Oxford) independently identified the same cold-start risk and mitigated it with Thompson sampling. Both approaches are valid; ours is simpler for single-user-local scale.

**Why:** Kit authors foresaw the risk before external evidence appeared. U-Mem confirms the risk is real. Our approach (no-score-ranking) is validated as a defensible tradeoff, not a missed optimization.

**How to apply:** If any future decision threatens to reintroduce score-based hot-path ranking, refer to ADR-0016. Thompson sampling is the named mitigation *if* ADR-0016 is ever reversed.
