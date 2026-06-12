---
id: P-MY3CHJ94
type: project
title: Memory Evaluation Metrics — Outcome vs. Retrieval Level
created_at: 2026-06-12T06:01:06Z
write_source: auto-extract
trust: medium
source_file: auto-extract
source_line: 1
source_sha1: a88b72f6c61d5d1d03d5c4ecef01d87f3fae7bc0
---

- **Retrieval metrics** (e.g., R@5 on fact retrieval) measure whether the memory system returns relevant facts — validates capability
- **Outcome metrics** (e.g., task completion rate, work success with/without memory) measure whether memory makes the user's work measurably better — validates impact
- Retrieval metrics are tractable for kit engineering and automated testing; outcome metrics are headline-ready for claims like "kit improves Claude's work-resumption success"
- Current implementation: Task-99 bench validates retrieval-level; E1 (cold-open test, run by hand) validates outcome-level

**Why:** The distinction clarifies scope — retrieval validates internal function, outcome validates user value. Different metrics answer different questions and drive different decisions.

**How to apply:** Use retrieval metrics for routine engineering validation (automatable, fast); reserve outcome-level experiments for headline claims or roadmap decisions (task with/without memory, measure completion rate).
