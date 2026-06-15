---
date: 2026-06-15
topic: Qdrant (vector database) — assessed against our settled semantic-backend decision (ADR-0015); re-rejected as the server-vector-DB class, no new evidence to re-open
source: Repo metadata + description — https://github.com/qdrant/qdrant (Rust, 32k★, Apache-2.0). NOT cloned: the architectural mismatch is decisive from the product shape + our settled ADRs; cloning a Rust vector-DB server to confirm "it's a server" would be wasted effort.
tags: [qdrant, vector-db, semantic-backend, ADR-0015, D-23, no-server, rejected, hnsw, competitive-analysis]
---

# Qdrant — vector-DB assessment (re-rejected, settled line)

> **What it is.** A high-performance, massive-scale **vector database + search engine**, Rust, 32k★, Apache-2.0 — runs as a **server process** (or a hosted cloud). HNSW ANN index, payload filtering, quantization, billions-of-vectors scale. **It is not a memory/agent system** — it's a storage/retrieval ENGINE, a candidate for the kit's vector BACKEND only.

> **Verdict: re-rejected, no new evidence.** This is the **server-vector-DB class the kit already evaluated and rejected in ADR-0015** ("Milvus/memsearch, Chroma server — re-rejected: server-weight for a single-user local kit"). Qdrant is a stronger/faster instance of the SAME class, not a new option. Per the decision-log rule, a recommendation against a SETTLED line needs *new evidence* — there is none here; Qdrant's strengths (massive scale, distributed ANN) are exactly the axis the kit doesn't need.

## Why it collides with three SETTLED lines

| Kit decision (settled) | Qdrant |
| --- | --- |
| **D-23 — node-only / no-server** | A separate **Rust server daemon** (or hosted cloud). Can't embed in the Node `cmk` CLI; requires running + managing a process. Direct violation. |
| **ADR-0002 — markdown is truth, vectors are a rebuildable cache** | Qdrant wants to BE the store (the vectors + payload live in it). We deliberately keep vectors a disposable cache keyed to markdown observation rowids. |
| **ADR-0015 + lean-install ethos** | We balked at a **258 MB OPTIONAL** embedder; a vector-DB server is a far heavier, HARD external dependency for a single-user local kit. |

ADR-0015 chose **sqlite-vec inside the existing better-sqlite3 index** precisely to avoid "a second index to keep in sync" and "server-weight." Qdrant is the opposite of every constraint that decision optimized for.

## The narrower question — is there a TECHNIQUE worth borrowing (even if the product doesn't fit)?

Two Qdrant techniques are worth a sentence each, both **non-actionable at our scale**:

- **HNSW (approximate nearest-neighbor) indexing.** Qdrant's headline is sub-linear ANN over millions–billions of vectors. **The kit's corpus is hundreds–low-thousands of facts** — at that scale a brute-force exact cosine scan (what sqlite-vec does, ~ms) is already instant; HNSW's benefit is negligible and its index-maintenance cost is pure overhead. Our recall bottleneck was never ANN speed — it was **embedding quality**, which the bge-base ladder (ADR-0015, R@5 0.941) already solved. Nothing to take.
- **Scalar/product quantization + payload filtering.** Memory-footprint tricks for billions of vectors; irrelevant at our footprint. Payload filtering (filter-by-metadata during search) we already do — tier/trust/since filters in `semanticBackend` (semantic-backend.mjs), with the ×3 over-fetch so filters don't starve RRF. Convergent, already have it.

## What we already have that makes Qdrant unnecessary

- **sqlite-vec** — embedded, no server, in the same SQLite file as FTS5 (one store), passed the cross-platform `loadExtension` spike on Windows first try (ADR-0015).
- **Hybrid FTS5 + vector via RRF k=60** + a benchmarked rerank stage (D-72).
- **Content-addressed embedding cache** (`sha256(model+body)`) — re-syncs embed only new/changed facts.
- **alibaba/zvec** as the documented embedded plan-B if sqlite-vec's single-maintainer risk ever materializes — and even the fallback is *embedded*, not a server.

## Net

**No action. No new task. ADR-0015 stands unchanged.** Qdrant is an excellent product for its actual use case (massive-scale, multi-tenant, distributed vector search) — which is the use case the kit deliberately is NOT (single-user, local, file-based, bounded corpus). Reviewed and re-rejected as the server-vector-DB class already settled in ADR-0015; logged for the audit trail so a future session doesn't re-open the question. The only conceivable future trigger: if the kit ever pivots to a hosted/team-server product (Task 127 team layer — but D-119 settled that as git-native, NOT a central vector server), a server vector DB *might* re-enter scope; until then it's out.

## Reference

- Repo: <https://github.com/qdrant/qdrant> (Rust, 32k★, Apache-2.0, pushedAt 2026-06-15)
- Settled lines it collides with: [ADR-0015](../adr/0015-semantic-backend-sqlite-vec-plus-local-onnx-embedder.md) (semantic backend), [ADR-0002](../adr/0002-markdown-source-of-truth-over-opaque-db.md) (markdown is truth), D-23 (node-only/no-server), D-101 (the Milvus/memsearch removal), Task 127/D-119 (team layer = git-native, not a server).
