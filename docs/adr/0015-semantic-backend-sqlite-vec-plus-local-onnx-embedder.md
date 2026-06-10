# ADR-0015 — Layer-5b semantic backend: sqlite-vec inside the existing index + an optional local ONNX embedder (bge-base-en-v1.5)

- **Status**: Accepted (2026-06-10)
- **Resolves**: the design §9.3.1 backend deferral (open since 2026-05-31)
- **Relates**: ADR-0002 (markdown is truth), D-23 (node-only/no-server), D-70/D-71/D-72 (the recall research lane), D-105 (the ladder plan), D-107 (the benchmark bar), D-109 (this decision's log entry), Task 65/99

## Decision

1. **Vector store: `sqlite-vec`** (v0.1.9, ~300 KB prebuilt, a regular dependency) loaded into the kit's **existing** better-sqlite3 index — one store, no server, no second index to keep in sync. Markdown stays the source of truth (ADR-0002); vectors are a rebuildable cache keyed to `observations` rowids.
2. **Embedder: a LOCAL ONNX model via `@huggingface/transformers`, as an OPTIONAL dependency** (~258 MB with onnxruntime — too heavy to force on every install; lazy-imported, absent → actionable hint, keyword FTS5 stays the always-available default). Anthropic has no embeddings API, so local is the only no-API path.
3. **Model: `Xenova/bge-base-en-v1.5`** (768-dim, q8 ≈ 110 MB one-time download), chosen by the D-105 ladder on the Task-99 benchmark — measured, not assumed:

   | rung | R@5 overall | paraphrase |
   | --- | --- | --- |
   | keyword one-shot (pre-65) | 0.176 | 0.000 |
   | agentic + Haiku (the bar) | 0.529 | 0.300 |
   | bge-small semantic | 0.824 | 0.900 |
   | **bge-base semantic** | **0.941** | **1.000** |
   | bge-m3 semantic | 0.765 | 0.800 |

   The multilingual giant (bge-m3) LOSES to the English-tuned base model on short memory facts — the ladder found its ceiling at rung 2, vindicating the benchmark-decides rule.
4. **Fusion: RRF k=60** (per D-72) for hybrid mode; the deterministic rerank stage (keyword-overlap 0.30 / temporal 0.40) is implemented and benchmarked but **not wired as a default** — it showed no gain over raw on the bench corpus (raw-vs-reranked reported separately, the MemPalace honesty norm). Notable measured result: **semantic-raw outperformed hybrid-RRF on the bench corpus** (0.941 vs 0.882) — keyword fusion adds robustness for exact tokens at scale, but the weighting deserves revisiting with the dogfood corpus (future work, not a blocker).
5. **The async boundary lives in the caller**: `search()` and its `semanticBackend` DI seam stay synchronous (the Task-120 contract); `prepareSemanticBackend()` embeds the query up front and hands the seam a sync closure.

## Rejected

- **Milvus/memsearch, Chroma server** — re-rejected (§9.3.1, Task 120/D-101): server-weight for a single-user local kit.
- **alibaba/zvec** — the named fallback (embedded, Node, Windows); not needed — the sqlite-vec spike passed on Windows first try. Stays the documented plan-B if sqlite-vec's single-maintainer risk ever materializes.
- **bge-m3 as default** — measured worse than bge-base on the kit's corpus shape at 5× the weight.
- **Embedder as a hard dependency** — 258 MB betrays the kit's lean-install ethos; Task 46 (`cmk install --with-semantic`) ships the guided opt-in.

## Consequences

- `cmk search --mode=semantic|hybrid` and `mk_search` work end-to-end wherever the optional embedder is installed; everywhere else they degrade to an actionable hint and keyword search is unaffected.
- `CMK_DISABLE_SEMANTIC=1` force-disables (metered machines; also the deterministic test hook).
- The embedding cache is content-addressed (`sha256(model+body)`) — re-syncs embed only new/changed observations; model/dims changes rebuild the vec table automatically.
- The benchmark bar moves: future recall work (75.1/75.2, Task 104 L3, Task 66 temporal) measures against R@5 0.941 / paraphrase 1.000 on the Task-99 corpus.
