---
date: 2026-06-06
topic: Source-level dive #4-6 — Graphiti (bi-temporal) + mem0 (LLM memory-manager) + memory-os (authoritative-memory wording + trust decay)
source: Cloned + read the code — getzep/graphiti, mem0ai/mem0, ClaudioDrews/memory-os
tags: [temporal, bi-temporal, graphiti, mem0, memory-os, authoritative-memory, ground-truth, trust-decay, Task-66, Task-75, Task-95, Task-97, F-D, D-73]
---

# Source dive #4-6 — Graphiti / mem0 / memory-os

> Dives #4-6 of the D-71 brief. **Read the actual code.** Clones in `c:/tmp/dive-{graphiti,mem0,memoryos}` (deleted after).

## #4 Graphiti (Zep) — the bi-temporal model (Task 66)

`graphiti_core/edges.py` tracks **TWO time axes** per edge:

- **`valid_at`** — "when the fact became true"; **`invalid_at`** — "when the fact stopped being true" → the **world-truth** timeline.
- **`created_at`** / **`expired_at`** — "when the node was invalidated" → the **system-knowledge** (ingestion) timeline.
- `reference_time` = the episode timestamp that produced the edge.
- Edges are extracted by an LLM (`prompts/extract_edges.py`) that emits `valid_at`/`invalid_at`; a new edge that contradicts an old one sets the old one's `expired_at` (system retraction) while keeping it queryable.

**→ For us (Task 66): we need only the TRUTH axis in frontmatter.** Graphiti's second axis (created_at/expired_at = "when we learned/retracted it") **we already get for free** from **git history (`git blame`/log) + `.locks/audit.log`** — our committed-markdown shape *is* the system-time record. So Task 66 = add `valid_from`/`valid_to` (+ optional `status`) to fact frontmatter; the bi-temporal "as-of" query falls out of (frontmatter validity) × (git/audit ingestion). That's a genuinely better fit than a Neo4j/SQLite triple store, and it's *less* to build. MemPalace = single-axis (valid_from/valid_to); Graphiti = bi-temporal; **we = single-axis-in-frontmatter + git/audit as the second axis.**

## #5 mem0 — the LLM "memory manager" (ADD/UPDATE/DELETE/NONE)

`mem0/configs/prompts.py`:
- **Two-step:** (1) `FACT_RETRIEVAL_PROMPT` extracts facts/preferences → JSON (separate **USER** vs **AGENT** extraction prompts — same user/assistant-origin split we do); (2) `DEFAULT_UPDATE_MEMORY_PROMPT` = a "smart memory manager" that, given *(existing memory + newly-retrieved facts)*, decides per fact: **ADD** (new info), **UPDATE** (existing changed), **DELETE** (contradicted), **NONE** (duplicate/irrelevant) — and rewrites the memory set.

**→ For us:** this is the semantic-merge we currently do **deterministically** (canonical-ID dedup + Task-25 conflict queue) — mem0 spends an **LLM call per memory update**. Keep our deterministic path for the **per-write** edge (cheap, zero-API, the kit's stance). But the **ADD/UPDATE/DELETE/NONE framing is exactly what the periodic re-curation pass should do** — fold it into **Task 95 (dream re-curation)** and **F-D (auto-supersede)**: a batched LLM pass over the fact corpus that emits update/delete ops (handles "moved Postgres→SQLite" as UPDATE, not a contradicting ADD), reviewable, not per-write. mem0's prompt is a ready template.

## #6 memory-os — the authoritative-memory instruction (Task 75) + trust decay (Task 97)

### Layer 07 "Ground Truth Hierarchy" — near-copyable for Task 75.0

`layers/07-ground-truth.md`. **Its problem statement IS our cold-open failure** (verbatim symptom): *"injects context… But the agent ignores them. Runs search_files/read_file to rediscover information that [the injection] already provided. Treats every question as novel even when the answer is in the prompt."* (= our D-40.)

**The fix = a ranked source-of-truth hierarchy in the identity docs (SOUL.md + rulebook.md):**

```
1. Terminal output      → Ground Truth for system state (runtime)
2. Injected memory      → Ground Truth for documented knowledge & prior decisions
3. Official docs        → Authoritative for APIs/configs/version-specifics
4. Training knowledge   → Reference only; always verify against 1-3
```

**The key line to drop into our `SOUL.md` (Task 75.0), near-verbatim:**

> *"When injected memory contradicts your assumptions, injected memory wins. Never treat a question as novel when the answer is already in your prompt."*

Plus a small conflict table (terminal wins for system state; injected memory wins for project context/prior decisions; official docs win for version-sensitive specifics; training knowledge always loses). **This is the cheapest, highest-leverage recall fix we have** — an instruction, not a backend. Adapt the source labels to ours (the injected `context/` snapshot + `cmk search`), keep the ranking + the key line.

### Trust decay (Task 97) — source-confidence init + access-recency decay

`scripts/backfill_decay_metadata.py`: each memory carries `created_at`, `last_accessed_at`, `importance_score` (0.5 flat), `confidence_score`, `archived`. **`confidence_score` is initialized by SOURCE:** wiki/curated → **0.85**, session → **0.70**, default → **0.75**. A `decay_scanner` then uses `last_accessed_at` to **decay + archive** memories that go unaccessed.

**→ For us (Task 97):** the model is **(a) source-based confidence init** (curated/`user-explicit` starts higher than `auto-extract`) + **(b) `last_accessed_at` tracking → decay/archive the never-accessed.** Note it's *access-recency* decay, not the re-confirmation-bump I assumed from the README. For us this composes cleanly: trust (high/med/low) is the init; add a `last_accessed` bump when `cmk search`/recall surfaces a fact; let the consolidate/graduate sweep prefer dropping **low-trust AND long-unaccessed** (vs our current pure 14-day age). Access-aware staleness > pure-age staleness.

## Net (all 6 dives)

- **Recall (65):** RRF k=60 (sqlite-vec+FTS5) + keyword(0.30)+temporal(0.40) rerank → ~98% no-API.
- **Temporal (66):** validity windows in frontmatter; git/audit = the free second time-axis.
- **Trust (97):** source-init confidence + access-recency decay (not just age).
- **Recall trigger (75.0):** memory-os's Ground Truth hierarchy + "never treat a question as novel" — copy it.
- **Curate/supersede (95/F-D):** mem0's ADD/UPDATE/DELETE/NONE as a batched re-curation pass, not per-write.
- **Everything stays our shape:** committed markdown, sqlite-vec+FTS5, no server, no per-write LLM. We took algorithms, rejected all infra (Milvus/Chroma/Neo4j/Qdrant/Redis/Docker).

_Relates D-71 (brief), D-72 (dive #1-3), D-64 (memory-os first pass), Task 66/75/95/97, F-D, design §16.18._
