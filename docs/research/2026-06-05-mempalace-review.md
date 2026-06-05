---
date: 2026-06-05
topic: MemPalace (mempalace/mempalace) review — verbatim+vector recall, and what to steal for Task 65/66 + a benchmark
source: WebFetch of github.com/mempalace/mempalace README + benchmark claims (not a source-code read)
tags: [mempalace, semantic-recall, vector-db, sqlite-vec, chroma, longmemeval, benchmark, temporal-validity, Task-65, Task-66, Task-99, competitive, D-70]
---

# MemPalace — review + what to steal

> Reviewed 2026-06-05 (surfaced by the user). [github.com/mempalace/mempalace](https://github.com/mempalace/mempalace).
> **Caveat:** read from the README + published benchmark claims, NOT a source-code read — numbers taken at face value.

## What it is

A **local-first, verbatim** conversation-memory store with **strong, benchmarked semantic recall**. Tagline: *"Local-first AI memory. Verbatim storage, pluggable backend, 96.6% R@5 raw on LongMemEval — zero API calls."* MIT.

- **Stack:** Python 3.9+, **ChromaDB** (default vector backend, pluggable via `backends/base.py`), **SQLite** (a temporal entity-relationship graph with validity windows), NumPy, gRPCio. Embedding model is a local download (Gemma-300m ~300MB, or all-MiniLM-L6-v2 ~30MB). **No API keys for core.**
- **Model:** hierarchy of **Wings** (people/projects) → **Rooms** (topics) → **Drawers** (verbatim messages). Capture by mining project files + Claude Code sessions (`mempalace mine --mode convos`, `sweep <transcript-dir>`). Retrieval = semantic search + optional hybrid (keyword boost + temporal-proximity weighting) + optional LLM rerank.
- **Surface:** CLI (`init`/`mine`/`search`/`wake-up`/`sweep`), an **MCP server (29 tools)**, Claude Code auto-save hooks, per-agent "diaries."
- **Benchmarks (their numbers):** 96.6% R@5 raw on LongMemEval (500q, zero API calls) → 98.4% hybrid v4 (held-out 450q) → ≥99% with LLM rerank. Raw-vs-reranked reported separately, reproducible via `benchmarks/BENCHMARKS.md`.

## The honest read: strong exactly where we're weakest

- **Semantic recall is their whole thing — built + measured.** That's our **Task 65** ("the one true parity gap" on the video scorecard), still keyword-FTS5-only here. They're ahead on retrieval science.
- **They shipped temporal validity windows** (entity graph, validity periods) — our **Task 66** (§16.18), which we only designed.
- **Honest benchmarking** — separates raw retrieval from reranked, reproducible. We have **no** retrieval benchmark, which is a credibility hole given we call recall the #1 function.

## But it's a different product (the same fork we drew vs claude-mem)

| | MemPalace | claude-memory-kit |
| --- | --- | --- |
| Storage | **verbatim** convo, opaque local store (Chroma+SQLite) | **distilled** facts, human-readable markdown **committed to git** |
| Primary access | **retrieval** (you search) | **injection** (always-on @ SessionStart) + search |
| Travels w/ repo / teammates | no (machine-local) | **yes** (the bet) |
| Cross-project persona / cold-open | not obviously (per-project/per-agent recall) | **yes** (the wedge) |
| Stack | Python + Chroma + gRPC + 30–300MB model | Node-only, no vector infra, cross-platform |

Verbatim-everything → unbounded storage + the agent reads raw convo chunks back as context, where we distill to an injectable, readable persona. They took the **heavy-deps bet** (Python/Chroma/gRPC/downloaded model) to buy recall quality — the weight class we deliberately rejected (Milvus = Windows-hostile; the memory-os review, D-64).

## What to steal

1. **→ Task 65 (semantic recall backend bake-off, design §9.3.1).** MemPalace is the **third independent data point** (after the maintainer's personal-wiki search decision and our 2026-05-21 deep-research note) pointing at **embedded vector, not a server**: their ChromaDB choice = pure-Python embedded, the §9.3.1 candidate alongside `sqlite-vec`. **Concrete blueprint to copy:** their **hybrid pipeline** — raw semantic → keyword boost → temporal-proximity weighting → optional LLM rerank — with the **raw vs reranked split reported separately**. We'd do it on `sqlite-vec` (one SQLite extension, llama.cpp/GGUF embeddings) to keep the lightweight/cross-platform/no-server stance; Chroma stays a possible `--backend` option, never a requirement.
2. **→ Task 66 (temporal validity).** Study their **SQLite entity-relationship + validity-window** model before we build ours (§16.18 is designed, not built); they have a shipped reference.
3. **→ Task 99 (NEW): a recall benchmark.** Adopt a **LongMemEval-style R@k** harness so Task 65 has a number to beat, and the "recall is the #1 function" claim has evidence. Honest raw-vs-reranked reporting like theirs.

## Don't adopt

The heavy infra (Python + ChromaDB server libs + gRPC + a downloaded embedding model) and **verbatim-as-primary**. Our committed-readable markdown + distilled injectable persona + cross-project cold-open is the differentiator their architecture can't do (opaque vector store, no git, no injectable persona). The two are arguably **complementary** — they're a deep verbatim recall backend; we're the curated, portable, injectable layer.

## Strategic

Not a reason to change the core bet — a **target to measure Task 65/66 against**, and a nudge to keep the §9.3.1 backend on the **embedded-vector** path (`sqlite-vec` default, Chroma optional). Semantic recall was always a founding premise: it's the **video's L5** ("Master Claude Memory in 23 Minutes," [source](../sources/simon-scrapes-master-claude-memory.md)) and the v0.3.0 wow (recall-with-reasoning = video parity, D-25). _Relates D-64 (memory-os — same "validates + niche" read), D-62 (Anthropic), Task 65/66/99, design §9.3.1, D-27 (niche)._
