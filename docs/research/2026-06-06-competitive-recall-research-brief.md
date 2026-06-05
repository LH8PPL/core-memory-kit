---
date: 2026-06-06
topic: Competitive research brief — what to STEAL vs RESEARCH-the-HOW vs RE-VISIT, to make our recall / temporal / trust better (not just copied)
source: Synthesis of the existing research base + the MemPalace (D-70) and memory-os (D-64) reviews; planning doc, not a finding
tags: [research-brief, recall, Task-65, Task-66, Task-97, Task-99, mempalace, memory-os, memsearch, mem0, zep, letta, competitive, D-71]
---

# Competitive research brief — recall / temporal / trust

> **Goal:** close our weakest gaps — **recall** (Task 65), **temporal validity** (Task 66), **dynamic trust** (Task 97) — by understanding *how the leaders actually implement them*, then building an **our-fit** version. **Not** wholesale copy.
>
> **What we will NOT change** (the user 2026-06-06: *"a lot of the things we do are better and more appropriate to how I work… as a developer and a devops person"*): git-committed readable markdown, lightweight / no-server / cross-platform, the cross-project persona wedge, distilled-injectable-first. We mine **algorithms**, not infra.
>
> **The honest gap this brief fixes:** MemPalace (D-70) and memory-os (D-64) were reviewed from **READMEs, not code**. Every "steal" is filed at the *idea* level; the *how* needs source dives.

---

## A. Steal now — idea is clear, just build it (already filed)

| Steal | → Task | Source |
| --- | --- | --- |
| Recall is a **tiered ladder** (Tier 0 → L1 semantic → L2 expand → L3 raw) | 65 | video + MemPalace |
| **Embedded vector, not a server** (sqlite-vec default; Chroma optional) | 65 | claude-mem + MemPalace + 9.3.1 |
| **Temporal validity windows** (concept) | 66 | MemPalace + zep |
| **A recall benchmark** (LongMemEval-style R@k) | 99 | MemPalace |
| **Authoritative-memory instruction** (lead with memory, don't re-derive) | 75.0 | memory-os |
| **Dynamic trust** (re-confirm ↑ / contradict ↓) | 97 | memory-os |

---

## B. Research the HOW — source dives (so we do it *better*)

Prioritized. We read the **algorithm**, not the deployment (Milvus/Qdrant/Redis/Docker all rejected).

| # | Target | Repo / docs | What to extract | Pays off |
| --- | --- | --- | --- | --- |
| **1** | **memsearch** | [`github.com/zilliztech/memsearch`](https://github.com/zilliztech/memsearch) | hybrid fusion recipe, the `search`/`expand`/`transcript` tiers, bge-m3 chunker, the haiku-compress-to-bullets Stop hook | Task 65 — it IS the video's ladder. **NB: Zilliz/Milvus-backed + needs API key → take the algorithm, do NOT wrap the tool.** |
| **2** | **MemPalace** retrieval | [mempalaceofficial.com/guide/searching](https://mempalaceofficial.com/guide/searching.html) + the repo | keyword-boost + **temporal-proximity weights**, fusion, rerank prompt, the LongMemEval harness | Task 65 + 99 — the actual 96.6%→99% recipe |
| **3** | **MemPalace** knowledge graph + contradiction | [concepts/knowledge-graph](https://mempalaceofficial.com/concepts/knowledge-graph.html) + [concepts/contradiction-detection](https://mempalaceofficial.com/concepts/contradiction-detection.html) | SQLite schema for entities/relations + **validity windows** (open/close logic) + how they detect contradictions | Task 66 (we only *designed* §16.18) + F-D (auto-supersede) |
| **4** | **zep / Graphiti** | `github.com/getzep/graphiti` | their **temporal knowledge graph** — the leader; bi-temporal model (event time vs ingestion time), edge invalidation | Task 66 — likely the strongest temporal model out there |
| **5** | **mem0** | `github.com/mem0ai/mem0` | LLM **fact-extraction** + vector+graph hybrid + their published benchmark methodology | Task 65/99 + our auto-extract (compare their extraction prompt to ours) |
| **6** | **memory-os** Layer 7 + Layer 3 | `github.com/ClaudioDrews/memory-os` | the exact `SOUL.md`/`rulebook.md` "Ground Truth" instruction wording + how injected; the dynamic-trust formula (score store, ↑/↓ deltas, decay) | Task 75.0 (near-copyable phrasing) + Task 97 |

---

## C. Re-visit what we already saw — with the question we didn't have then

When first reviewed we were pre-§19, pre-recall-focus. Each gets **one specific new question.** Full product list (from a grep of `docs/research/`), grouped by current relevance:

### Tier 1 — directly on an open question

- **zep / Graphiti** → *the bi-temporal graph* — the reference model for Task 66. (Under-weighted first time; 25 mentions but never source-dived.)
- **mem0** → *their fact-extraction prompt + their benchmark* — compare to our auto-extract; Task 65/99. (65 mentions, never source-dived for extraction.)
- **memsearch** → *the recall ladder algorithm* (= B#1).
- **claude-mem** → *how does its OPTIONAL vector recall actually work?* — we noted "SQLite + optional vector" but never read the retrieval path / whether it has a ladder.
- **claude-remember** → *does it have a recall TRIGGER?* — Task 75's missing half (our code dive was for capture, not trigger).

### Tier 2 — relevant, lower urgency

- **letta / MemGPT** → *memory hierarchy / context paging* — informs our §19 inject/graduation (what stays hot vs paged out).
- **Anthropic Dreams** (2026-06-04) → *the re-curation algorithm* — we filed Task 95 from the README, never saw the mechanism.
- **Hermes** → *re-confirm the cap/snapshot numbers* (already the source of our 2500/1375 + frozen snapshot, via the video).
- **gstack** → skill-layer patterns (already mined for Task 69).

### Tier 3 — contextual, revisit only if a specific need arises

- **GBrain, OpenClaw, TencentDB, Google Antigravity, Noema, qmd, knowledge-base-server** — surveyed; no current open question points at them. (qmd = a Node/MCP-native GGUF-embedding option worth remembering for the Task-65 backend bake-off alongside sqlite-vec.)

---

## Recommended order

1. **This brief** (filed, D-71).
2. **Dive #1+#2+#3 first** (memsearch algorithm + MemPalace searching/knowledge-graph/contradiction) → one research note → answers "exact hybrid recipe + build-on-sqlite-vec + the temporal+contradiction model." De-risks Task 65/66/99 most.
3. **Dive #4 (zep) + #5 (mem0)** next — the two we under-weighted; temporal + extraction.
4. **Dive #6 (memory-os wording)** — a ~20-min steal foldable into Task 75/97.

_Relates D-64 (memory-os), D-70 (MemPalace), Task 65/66/75/97/99, design §9.3.1, the Simon Scrapes video source, the 2026-06-01 source-level deep dive._
