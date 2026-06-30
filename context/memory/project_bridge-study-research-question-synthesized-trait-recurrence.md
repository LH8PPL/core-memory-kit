---
id: P-752LM39L
type: project
title: Bridge-Study Research Question — Synthesized Trait Recurrence Signal
created_at: 2026-06-29T21:16:32Z
write_source: auto-extract
trust: medium
source_file: auto-extract
source_line: 1
source_sha1: b67157b844f43bec786d9da561742912c39274778e186553ec5eb2b6f97086cb
---

**Key asymmetry:** The 5 strong-yes systems gate a pre-existing unit (session segment, dedup cluster). Our synthesized trait is born from the LLM. 
**Question:** When a trait is synthesized by the LLM, how does it receive its recurrence signal — counted by the LLM itself, or by arithmetic after LLM synthesis?
**Study approach:** Review 5 existing gate→synthesis handoff code to find how each handles recurrence for LLM-born outputs.

**Why:** The recurrence signal is critical to the promotion gate. Current code assumes a pattern that may not match how the 5 systems actually work; bridge study avoids guessing.

**How to apply:** When bridge-study results come back, apply the discovered pattern to wire the recurrence signal in 151.3 test + implementation.
