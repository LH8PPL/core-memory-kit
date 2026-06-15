---
id: P-YLWTT5aG
type: project
title: TencentDB-Agent-Memory Write/Search Implementation Comparison
created_at: 2026-06-15T07:55:57Z
write_source: auto-extract
trust: medium
source_file: auto-extract
source_line: 1
source_sha1: 3f5f98a572dd64a96b82362fda6203ee3791bd2ee723fd526d6dced2a8e9300d
---

- **Search convergence:** Hybrid FTS5+vector, RRF k=60 (same as us). They lack our post-fusion rerank and content-addressed portable IDs.
- **Write divergence:** They use detect-and-resolve-inline (batch LLM call, returns per-fact store/update/merge/skip decisions + target_ids + timestamp union). We use detect-and-queue (route to queue, keep-old auto-drain or user resolution).
- **Design blueprint:** Their batch-LLM decision layer (prompt shape, decision enum, timestamp-union merge) informs F-D's AI-judged resolution layer.

**Why:** Comparative code-level review of adjacent implementation reveals convergence areas (no action) and architectural alternatives (design patterns for roadmap).

**How to apply:** When designing/building F-D (fact-layer auto-supersede, v0.3 lane), reference their batch LLM prompt structure and decision enum as prior art. Keep our queue-based keep-old fallback as safe default for non-embedding scenarios.
