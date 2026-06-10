---
id: P-EARXNS9G
type: reference
title: memweave reference patterns
created_at: 2026-06-10T07:22:13Z
write_source: user-explicit
trust: high
source_file: user-explicit
source_line: 1
source_sha1: 58919640a77faaae228426166a81d64d05ebefed
---

memweave is the reference implementation for the Task-65 build details

**Why:** it ships our exact architecture (markdown truth + SQLite FTS5+sqlite-vec derived index) with four patterns worth stealing; the article is author-written so the code gets dived before adopting (D-105)

**How to apply:** steal: content-addressed embedding cache (sha256 chunk to vector), temporal decay with evergreen exemption, min_score noise gate ~0.35, Jaccard-MMR dedup; its 0.7/0.3 weighted merge vs our RRF k=60 is decided by the bench harness
