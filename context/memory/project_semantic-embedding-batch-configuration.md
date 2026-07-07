---
id: P-JBK3XXLK
type: project
shape: State
title: Semantic Embedding Batch Configuration
created_at: 2026-07-07T15:37:45Z
write_source: auto-extract
trust: medium
recurrence_count: 1
source_file: auto-extract
source_line: 1
source_sha1: 8138c7c2c173dd1b4d86e392461ddf4f8cf7b9248675f5249a2443d30eef834c
---

EMBED_BATCH_CHARS = 8000 characters (limit per embedding call). Max observed body in live production: ~5157 chars. Documented invariant ("fact bodies ≤1500 chars") is already violated and not enforced upstream.

**Why:** Batch limit prevents O(corpus) tensor memory blowup during fact sync. No per-item cap enforced, so pathological oversized facts can still create large tensors.

**How to apply:** Use 8000 as the actual batch limit. Update stale documentation to reflect reality (~5k typical max, not ≤1500). Consider adding per-item truncation for robustness.
