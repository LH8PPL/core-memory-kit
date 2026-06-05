---
date: 2026-06-06
topic: Source-level dive — memsearch + MemPalace retrieval / temporal graph / contradiction (the HOW behind their recall)
source: Cloned + read the code — github.com/zilliztech/memsearch + github.com/mempalace/mempalace (incl. its in-repo website/ docs + benchmarks/HYBRID_MODE.md)
tags: [recall, hybrid-search, rrf, sqlite-vec, fts5, temporal, knowledge-graph, contradiction, longmemeval, Task-65, Task-66, Task-95, Task-99, memsearch, mempalace, zep, D-72]
---

# Source dive — memsearch + MemPalace (the HOW)

> Dive #1–3 of the D-71 brief. **Read the actual code**, not the README. The official docs are also in the MemPalace repo (`website/concepts/`, `website/guide/`) — the bot-blocked site pages, verbatim. Clones in `c:/tmp/dive-memsearch` + `c:/tmp/dive-mempalace` (deleted after).

## Headline

Recall is a **solved, lightweight problem** — both projects converge on **semantic + keyword + temporal** reranking, and **the no-LLM hybrid already hits ~98% R@5** on LongMemEval (the LLM rerank adds only ~1pp). Their heavy infra (Milvus / ChromaDB) is **not** load-bearing for the algorithm — every constant below drops onto **our existing FTS5 + planned sqlite-vec** with no server.

## Two proven hybrid recipes (Task 65)

### memsearch (`store.py`, `core.py`) — dense + BM25, RRF

- Milvus collection with **dense vector + BM25 sparse vector** fields (BM25 is a Milvus `Function`).
- `search()` = two `AnnSearchRequest`s (dense + BM25) fused by **`RRFRanker(k=60)`**; scores normalized to [0,1] via `max_rrf = num_retrievers/(k+1)`.
- `core.search()` **over-fetches `fetch_k = top_k*3`** when a reranker is set, then cross-encoder `rerank(query, results, top_k)`.
- Embedders are pluggable (`onnx` bge-m3, ollama, openai, voyage, jina, google, mistral, local) — **ONNX = local/no-API/cross-platform**.

### MemPalace (`benchmarks/HYBRID_MODE.md`) — semantic + keyword-overlap + temporal, NO BM25/LLM

- **Stage 1:** semantic top-**50** (raw uses 10).
- **Stage 2 keyword rerank:** keywords = 3+ char non-stopword (explicit stop-word set); per doc compute overlap; **`fused = dist * (1 − 0.30·overlap)`** (≤30% distance cut for full overlap).
- **Temporal date boost** (for "N weeks ago"): parse offset → `target_date`; `temporal_boost = max(0, 0.40·(1 − days_diff/window))`; `fused *= (1 − temporal_boost)`.
- **Two-pass for "you said…" questions:** detect assistant-reference triggers → re-index only the top-5 sessions with full (user+assistant) text → re-query. (We capture assistant turns already, so less relevant.)
- **Optional Haiku rerank** last.

**Their numbers (LongMemEval, 500q, session granularity):** raw 96.6% → keyword/temporal hybrid **98.4%** (no LLM) → +Haiku rerank 99.4% R@5. Only 3 misses/500.

### → The Task-65 recipe for US (lightweight, no server)

We already have **FTS5 (with `bm25()`)** + planned **sqlite-vec**. So take **memsearch's shape** (it fits our stack natively) + **MemPalace's reranks** (cheap, no infra):

1. Retrieve dense (sqlite-vec cosine) + sparse (FTS5 `bm25()`), **over-fetch ~3× / top-50**.
2. **Fuse with RRF, k=60** (replaces design §9.3's 0.5/0.5 weighted sum — RRF is the proven choice).
3. **Keyword-overlap rerank** (weight **0.30**) + **temporal-date boost** (weight **0.40**) — pure Python, deterministic, no API.
4. **Optional** Haiku cross-encoder rerank as a flag (the last ~1pp), off by default to stay zero-API.
5. **Tiered ladder** (Tier 0 in-context → L1 this hybrid → L2 expand-to-section → L3 raw transcript), escalate-only.

**The lightweight sweet spot:** steps 1-3 get ~98% with **zero API calls** — exactly our stance. The LLM rerank is opt-in polish, not the foundation.

## Temporal validity (Task 66) — MemPalace's `knowledge_graph.py`

Explicitly *"like Zep's Graphiti, but SQLite instead of Neo4j. Local and free."* Two tables:

- **`entities`**: `id` (lowercase-normalized name), `name`, `type` (person/project/tool/concept), `properties` (JSON).
- **`triples`**: `subject → predicate → object`, **`valid_from`**, **`valid_to`** (NULL = current), **`confidence`** (0.0–1.0), **`source_closet`** (link back to the verbatim memory).
- API: `add_triple(s,p,o,valid_from)`, **`invalidate(s,p,o,ended)`** (sets `valid_to`), **`query_entity(e, as_of=date)`** (point-in-time), `timeline(entity)`.

**→ For us:** the **model** is exactly our §16.18 design (`started_at`/`ended_at`/`status`). Take their triple + validity-window + confidence + **source-link-back** + **`as_of` point-in-time query** + **invalidate-sets-valid_to** semantics — but keep it **markdown-native** (validity fields in fact-file frontmatter, committed) instead of a separate SQLite triple store, to hold our committed-readable stance. MemPalace + Zep both being bi-temporal **re-confirms Task 66's direction.**

## Contradiction detection (F-D / Task 95) — *not shipped by them either*

MemPalace's `contradiction-detection.md` is flagged **Experimental — "a planned capability, not a shipped end-to-end feature."** They have the KG primitives, not the tool. The intended model: check an assertion against KG validity-window facts → **attribution conflict / temporal error / stale info**, with ages/dates computed dynamically. **So we're not behind here** — it's an open frontier; this becomes buildable once Task 66's validity windows exist (assert-vs-KG check). Reinforces sequencing F-D/95 *after* 66.

## Benchmark (Task 99)

MemPalace ships `benchmarks/{longmemeval,convomem,locomo,membench}_bench.py` + dated reports + `BENCHMARKS.md`/`HYBRID_MODE.md`. Metric: **R@5 / R@10 / NDCG@10** at session granularity, with **per-question-type breakdown** (knowledge-update / multi-session / temporal-reasoning / single-session-{user,assistant,preference}) and **raw-vs-reranked reported separately**. **→ Adopt this harness shape for Task 99**; LongMemEval is the dataset; the per-type breakdown is what tells you *which* recall fix to build next.

## What we keep / reject

- **Take:** the RRF-k60 + keyword(0.30) + temporal(0.40) recipe; over-fetch-3×-then-rerank; the triple/validity-window model + `as_of`/`invalidate`; the LongMemEval harness + per-type breakdown; ONNX bge-m3 as the local embedder candidate.
- **Reject (unchanged):** Milvus (memsearch) + ChromaDB (MemPalace) servers, verbatim-as-primary, the Neo4j managed path (Zep). We build the same algorithm on **sqlite-vec + FTS5 + markdown**, committed + no-server.

_Relates D-71 (the brief), D-70 (MemPalace), D-64 (memory-os), Task 65/66/95/99, design §9.3/§9.3.1/§16.18. Next dives: zep/Graphiti (#4), mem0 extraction (#5), memory-os wording (#6)._
