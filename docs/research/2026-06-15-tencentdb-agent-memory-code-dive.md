---
date: 2026-06-15
topic: TencentDB Agent Memory — CODE-LEVEL re-dive (write + search paths) vs the kit, ~3 weeks after the README survey
source: Cloned + read the actual TypeScript source — https://github.com/TencentCloud/TencentDB-Agent-Memory (pushedAt 2026-06-15, TS, 5.7k★). Supersedes the README/article-level survey in 2026-05-24-tencentdb-agent-memory.md.
tags: [tencent, competitive-analysis, code-dive, memory-write, search, dedup, hybrid-rrf, llm-merge, conflict-detection, Task-143, Task-151, Task-95, F-D]
---

# TencentDB Agent Memory — code-level re-dive (write + search)

> **Why re-dive.** We have a 2026-05-24 note on this repo, but it was a **README/article survey** ("Manual survey"), never a code read — and the user's standing rule (U-CL7LFRTC, "notes are summaries not implementation; clone the real repo") + this request ("how do they do memory write and search") both demand the code. The repo also moved org (`Tencent` → `TencentCloud`), grew to a full TypeScript implementation, and was **pushed the same day as this dive** (actively developed). Most of what the May note flagged to absorb (auto-persona, semantic backend, skip-on-timeout) has since SHIPPED in the kit — so this dive re-judges what's STILL worth taking against what we now have.

## What I actually read

Cloned to `/c/tmp/tdai-dive`. Load-bearing files: `src/core/record/{l1-extractor,l1-dedup,l1-writer}.ts`, `src/core/store/{sqlite,bm25-local,search-utils,embedding}.ts`, `src/core/tools/{memory-search,conversation-search}.ts`, `src/core/hooks/{auto-capture,auto-recall}.ts`, `src/core/prompts/{l1-extraction,l1-dedup,persona-generation}.ts`.

## How they do SEARCH (the answer to "how do they search")

`executeMemorySearch` (tools/memory-search.ts) — **structurally identical to ours**, independent convergence:

- **Hybrid by default**: FTS5 keyword + vector embedding run **in parallel** (`Promise.all`), merged via **Reciprocal Rank Fusion, k=60** (the canonical RRF constant — same value we use). Graceful degradation: `hasEmbedding`/`hasFts` capability check → `embedding`-only or `fts`-only, and an explicit `message` telling the agent to configure an embedding provider when neither is available (their version of our degraded-recall note, D-113/125.1).
- **Over-retrieve then fuse**: `candidateK = limit * 3` — they pull 3× the requested count from each arm before RRF + filtering. **We already do this** (semantic-backend.mjs:330–332, `k = Math.max(limit * overFetch, limit)`, "D-72: ~3×") so post-filters don't starve the list — independent convergence, no gap.
- **BM25 proper, not FTS5-builtin ranking**: their keyword arm uses a real **BM25 sparse encoder** (`@tencentdb-agent-memory/tcvdb-text`, jieba-wasm tokenization, **TF-weighted for documents / IDF-weighted for queries**, zh/en). We rely on SQLite FTS5's built-in bm25() ranking. Theirs is heavier (a WASM tokenizer dep) but language-aware (Chinese-first — jieba); ours is lighter and English-leaning.
- **No rerank layer.** After RRF they sort and return. **We have MORE here**: our post-fusion rerank (semantic-backend.mjs:528, D-72 — keyword-overlap 0.30 + temporal 0.40 boost). So on the search path we are not behind; if anything our temporal-proximity rerank is a feature they lack.

**Verdict on search: full convergence, nothing to steal.** Both are hybrid-RRF-k60-with-degradation. The only deltas favor us (temporal rerank) or are cosmetic (their ×3 over-retrieve; their BM25-vs-FTS5 choice is a zh-language artifact, not an improvement for our English-first corpus).

## How they do WRITE (the genuinely different part — worth studying)

Their capture path (`hooks/auto-capture.ts` → `l1-extractor` → `l1-dedup` → `l1-writer`):

1. **Extract** (l1-extraction prompt): one Haiku-class LLM call does **scene segmentation + memory extraction** together. Three types only — `persona` / `episodic` / `instruction` (note: they FOLDED "preference" into persona, v3 change). Numeric **`priority` 0–100** (−1 = strict global instruction), not our `high/medium/low` enum. "宁缺毋滥" (rather-omit-than-over-include) — same anti-noise stance as our auto-extract.
2. **Candidate recall** (l1-dedup, `batchDedup`): for the batch of new memories, recall top-K=5 existing candidates **per new memory** — vector cosine (primary) → FTS5 BM25 (degraded) → **skip dedup entirely** if neither available (explicitly: "removed the JSONL Jaccard fallback — don't pay O(N) full-file-scan"). Note the parallel: **we** kept a Jaccard literal fallback (Task 143's `prepareNearDupGuard` falls back to per-pair Jaccard on cache miss); **they deleted theirs** as too costly and prefer skip-dedup.
3. **Batch LLM judgment** (l1-dedup prompt): **ONE LLM call** sees ALL new memories + a de-duplicated **unified candidate pool**, and returns per-memory `action ∈ {store, update, merge, skip}` with `target_ids[]` (multi-target) + `merged_content` + `merged_type` + `merged_priority` + `merged_timestamps` (union of all timestamps, dedup-sorted — a temporal-trail). It does **cross-type merge** (an episodic + a persona about the same fact merge into one) and **many-to-many** (one new memory can replace several old ones).
4. **Write** (l1-writer, `writeMemory`): applies the decision — `store`=append, `update`/`merge`=delete target_ids from the vector store in real-time + append the merged record, `skip`=nothing. **Dual-write**: JSONL daily shards (`records/YYYY-MM-DD.jsonl`) are the append-only source of truth; SQLite/vector is the rebuildable retrieval engine. (Same split as ours: markdown is truth, SQLite is the cache — ADR-0002.)

### The key contrast — detect-and-RESOLVE-inline vs our detect-and-QUEUE

This is the one real architectural difference on the write path, and it maps **directly onto two of our open tasks**:

| | TencentDB Agent Memory | claude-memory-kit (today) |
| --- | --- | --- |
| On a near-dup / contradiction at write | **LLM decides + resolves inline**: store/update/merge/skip, produces merged text, deletes old in real-time | **Detect + route to the conflict queue** (Task 143/D-139); resolution is the auto-drain (D-6 keep-old) or the user |
| Who merges | the LLM, at capture time, in a batch call | nobody at write; the auto-drain keeps-old, or a human resolves |
| Merge granularity | many-to-many, cross-type, with priority bump + timestamp union | pairwise supersede / keep-old |

**They are living proof of the F-D / Task-95 direction** (fact-layer auto-supersede via LLM semantic-contradiction judgment) and partially the **Task-151** direction (AI-judged, not queue-gated). Their `batchDedup` is almost exactly the "mem0 add/update/skip per-fact pattern" we cited as the Task-151 target (D-154) — except they extend it to merge + cross-type + a batch/unified-pool framing.

## What's worth taking (judged against what we already shipped)

1. **The batch unified-candidate-pool LLM-merge pattern → design input for F-D / Task-95 (fact-layer auto-supersede) AND Task-151 (AI-judged persona promotion).** This is the highest-value find. When we build F-D, their `formatBatchConflictPrompt` shape is a concrete, working blueprint: recall candidates per new fact → build ONE de-duplicated pool → single LLM call returns per-fact {store/update/merge/skip} + target_ids + merged text + merged metadata. The **merged_timestamps union** (keep the full temporal trail through a merge) is a clean idea that also feeds **Task 66** (temporal validity). Cross-type merge is more than we need today but the store/update/merge/skip enum + multi-target is exactly F-D's missing decision layer.
   - **Adoption (D-?? when F-D/95/151 are built):** take the **prompt SHAPE + the decision enum + the timestamp-union**, NOT the code (it's TS, zh-first, OpenClaw-coupled). Keep our queue as the fallback when no LLM/embedder is present (they skip-dedup; we already have keep-old, which is safer than skip).

2. **Over-retrieve `limit * 3` before RRF — small, free, worth verifying.** Pulling 3× candidates per arm before fusion+filter gives RRF more to work with (an item ranked #8 in FTS but #2 in vector still surfaces). Worth a one-line check of our `searchHybrid` to see if we cap each arm at `limit` (which would under-feed RRF) and, if so, bump the per-arm pull. _Low effort; verify-then-maybe-fix, not a task on its own._

3. **`priority: number` (0–100) vs our `trust: high/medium/low` — NOTE, not adopt.** Their numeric priority enables finer eviction/ranking ordering. But our trust enum is load-bearing across the whole kit (conflict keep-higher-trust, inject importance-ordering, the persona confidence gate) and a 3-bucket scheme composes with human judgment better than a number Haiku invents. **Deliberate divergence** — record it, don't churn it. (If Task 97 dynamic-trust ever wants a continuous score, this is prior art.)

## What we have that they don't (for the record)

- **Post-fusion temporal+keyword rerank** (D-72) — they stop at RRF.
- **3-tier scope** (user/project/local) — they're single-workspace (`~/.openclaw/memory-tdai/`), unchanged from May.
- **Content-addressed IDs** (cross-machine determinism) — they use `m_<timestamp>_<rand>` (machine-local, non-portable).
- **Poison_Guard secret screen + `<private>` strip + home-path sanitization** at the write boundary — no equivalent seen.
- **Committed-to-git, travels-with-clone memory** — theirs is a local workspace dir, not a repo artifact.
- **Conflict/review queue with keep-old auto-drain** — they skip-dedup when no LLM/embedder; we degrade to a safe keep-old.

## What we deliberately still won't take

- **OpenClaw/Hermes coupling, TCVDB cloud option, jieba/zh-first BM25, DeepSeek-default model** — all vendor/ecosystem coupling, same divergence as the May note.
- **Skip-dedup-when-no-recall** — they delete the Jaccard fallback; we keep a literal-Jaccard fallback (Task 143) so capture still de-dups without an embedder. Ours is the better default for a local-first kit that may run without the optional embedder.

## Net

**Search: converged, nothing to steal (we're marginally ahead via rerank).** **Write: their batch LLM store/update/merge/skip over a unified candidate pool is the concrete blueprint for F-D / Task-95 and a strong input to Task-151** — it's the AI-judged-resolution layer we've roadmapped but not built. No new task created (F-D/95/151 already exist + are design-gated); this note is logged as their design input. The May note's "absorb auto-persona / semantic backend / skip-on-timeout" items have all shipped — this dive's one durable yield is the **merge-decision prompt shape for the contradiction-resolution layer**.

## Reference

- Repo: <https://github.com/TencentCloud/TencentDB-Agent-Memory> (TS, 5.7k★, pushedAt 2026-06-15)
- Supersedes (code-level): [`2026-05-24-tencentdb-agent-memory.md`](2026-05-24-tencentdb-agent-memory.md) (README/article survey)
- Relates: F-D (fact-layer auto-supersede), Task 95 (re-curation), Task 151 (AI-judged persona promotion, D-154), Task 66 (temporal validity — the timestamp-union idea), Task 143 (our near-dup-at-write, D-139), D-72 (our rerank), ADR-0002 (markdown-is-truth, shared), ADR-0015 (our semantic backend).
