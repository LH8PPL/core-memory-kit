---
id: P-LTCCJKT9
type: project
title: Journal Staleness Detection Uses Separate Boolean, Not Verdict
created_at: 2026-06-18T06:55:13Z
write_source: auto-extract
trust: medium
source_file: auto-extract
source_line: 1
source_sha1: c1be883f9b38e2dba07b2a7d966aac25a0a3ae6b001e54f6ae0402e8a15c03a0
---

Research proposed adding `journal-stale` verdict to `detectStaleness`. Implementation instead uses separate `isJournalStale()` boolean. Reason: journal sync is independent from compression — both must run if needed, but `detectStaleness` returns only one verdict. Shared staleness check creates "separately-correct-jointly-broken" failure at composition boundaries.

**Why:** Single-verdict slot constraint makes shared detection impossible for independent concerns. This is a compositional invariant of the kit's architecture.

**How to apply:** Keep journal sync checks separate from compression staleness detection. If future work modifies staleness logic, preserve this independence.
