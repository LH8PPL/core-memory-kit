---
date: 2026-07-19
topic: Task 176 — graph-memory code sweep (9 systems, actual code read) + the kit-fit analysis feeding the graph-recall ADR
source: Cloned repos at research depth (graphiti, mem0, cognee, MemOS, MemoryOS, iwe, sift-kg, pulse8-cortex-vault, Memora) + the kit's own code/corpus inspection
tags: [recall, graph, research, ADR-0023, D-361]
---

# Graph-memory code sweep (Task 176) — feeds ADR-0023

The D-153/149 discipline applied: every claim below is from the ACTUAL CODE of the cloned
repos, not note summaries. Kit-side citations are first-hand; several per-system citations
were gathered via reading agents (flagged in Gaps).

## Part 1 — per-system findings (condensed; the load-bearing facts)

| System | Node/edge model | Edges created by | Query surface | Derived? |
| --- | --- | --- | --- | --- |
| **graphiti** (getzep) | Typed: Episodic/Entity/Community nodes; `EntityEdge` carries relation name + fact + `valid_at`/`invalid_at`/`expired_at` (`edges.py:263-282`) | LLM fact-triple extraction per episode (`prompts/extract_edges.py:94`) | The richest: Cypher BFS `*1..depth` (`search_utils.py:551`), edge vector/fulltext, node-distance rerank (:1798), RRF, MMR, temporal WHERE filters | Fully auto |
| **mem0** (this clone) | **No graph store** — zero graph refs in `memory/main.py` (verified). spaCy-NER entities in a 2nd vector collection + `linked_memory_ids`; query = vector + entity co-occurrence score **boost** (`main.py:1757`) | n/a | n/a — no traversal | (the famous Neo4j graph memory is absent from the shipped snapshot) |
| **cognee** | LLM-labeled loose schema (`shared/data_models.py:49-77`); edge description = an embedded fact sentence | LLM per chunk (`extract_graph_from_data.py:173`); optional ontology | `brute_force_triplet_search`: vector-search nodes AND edges, project a k-hop neighborhood into memory, score triplets (`retrieval/utils/…`) — **vector search with graph as the expansion structure**, not Cypher-first | Fully auto; LLM-costly, non-deterministic rebuild |
| **MemOS** | 2-value edge enum `RELATED\|PARENT` (`graph_dbs/item.py:14`) | A 100-second reorganizer clusters embeddings → PARENT rollups (`organize/reorganizer.py:627`); the LLM pairwise relation path is **commented out** | Recall = vector+filters; `get_neighbors`/`get_path` are `NotImplementedError` (neo4j.py:670,758) | Auto — from embedding structure, not content. A topic hierarchy, not a KG |
| **MemoryOS** | Not a graph — JSON+FAISS pages with `pre_page`/`next_page` pointers never traversed at query time | n/a | 3 parallel FAISS searches heap-merged | n/a |
| **iwe** (Rust) | Structural: markdown AST nodes; exactly `inclusion` + `reference` edges (`graph/index.rs:8`) | Deterministic lift of **human-typed** wikilinks; zero LLM (verified) | Real bounded BFS (`graph/walk.rs:22-95`) + a path-predicate query DSL, token-budgeted retrieval | Hand-authored (structurally lifted). **The cleanest rebuildable-index reference** — and confirmation the iwe model presupposes a hand-built note web our auto-capture users never make |
| **sift-kg** | Typed NetworkX MultiDiGraph; direction-constrained relation types; per-edge confidence/evidence/support_count | One combined LLM prompt per chunk; **discover-then-freeze** schema (`domains/discovery.py:84-138`) kills type drift; 3-layer entity resolution (deterministic → SemHash → LLM-propose-human-approve, `graph/prededup.py`) | Entity lookup, Louvain communities, bridges, BFS subgraph — no DSL | Auto with optional human review. But the frozen schema is a 2nd source of truth; rebuild is LLM-costly |
| **pulse8 cortex-vault** | Typed NetworkX; NodeType + EdgeType incl. CONTRADICTS/SUPERSEDES (`vault/models.py:10-31`) | Structural edges (wikilinks/tags/source_path) auto at build + live file-watcher; **semantic edges (CONTRADICTS/SUPERSEDES) only via an agent calling `vault_link`** — and they live ONLY in graph.json (delete it, they're gone — the exact edge-data-outside-markdown hazard our rebuildable-index constraint forbids) | `vault_context`: hybrid seeds → BFS depth-2 → rank by `search×0.6 + degree-centrality×0.4` → surface CONTRADICTS explicitly (`graph/context.py:18-131`) — "graph as reranker", no query language | Structural auto; semantic agent-authored |
| **Memora** (MSR) | Schema-free bipartite memory↔cue; shared cues ARE the graph | LLM 1-3 cue anchors per memory at capture (`core/cue_index_generator.py:110-153`); auto-pruned when orphaned | Frontier expansion: working-set cues → relaxed frontier via *similar* cues (θ=0.85, top-4) → pull linked memories (`core/memory_expander.py:70-198`) — vector-over-cues + set membership, **no graph store** | Fully auto, zero schema. The cheapest real multi-hop mechanism surveyed; their ablation attributes the multi-hop gains entirely to it |

**Field honesty:** two of the field's "graph memory" flagships aren't graphs in shipped code
(mem0 clone: entity score-boost only; MemOS: the relational path commented out). And Letta —
the canonical agentic-memory system (same-day deep-read, [letta note](2026-07-19-letta-deep-read.md))
— ships **no graph recall at all** (tags + time + RRF hybrid is its whole relational surface).

## Part 2 — the kit-fit analysis

### The kit's actual edge inventory (verified)

- **`related:`** (from `links`) — written by `remember-core.mjs:72-76` → `write-fact.mjs` frontmatter. Corpus: **90 of 1,779 fact files (~5%)**; 7 `[[wikilinks]]` total. **Auto-extract never sets links** (grep: zero hits) — the default capture path writes no edges. **NOT in the SQLite index** (no column) and **`mk_get` doesn't return it** — the written edge is invisible even to a willing agent. And (probe, 2026-07-19) the `related:` targets do **not** land in the FTS body — backlink queries are genuinely unanswerable today.
- **`superseded_by`** — a real FK (`index-db.mjs`), consumed only as a Task-209 state LABEL (says *superseded*, never *by what*).
- Adjacent shipped axes: `mk_timeline` (time), `expand` (source-file neighborhood, Task 226), `--scope decisions` (evolution). A graph mode = the **fourth axis: relational**.
- A corpus property no surveyed system has: **anchor density** — 319/1,779 facts mention a `D-nnn`, 338 a `Task nnn`; FTS exact-token search resolves these perfectly (exact R=1.000, D-107). The corpus has built-in entity resolution graphiti/sift-kg spend LLM calls approximating.

### Real relational queries vs the honest hybrid check (6 shapes)

Of six concrete query shapes built from this repo's real memory (the Kiro cut-blocker saga
cluster; supersession-chain walking; backlinks; decision-evolution; D-109→D-360 multi-hop;
cross-type fact↔task): **hybrid + the agentic ladder substantially answers four** (dense
shared vocabulary; the ladder's iterative queries ARE a BFS engine over anchor tokens; the
decisions scope already ships evolution). The two genuinely-graph-only shapes are
**supersession-chain walking** (state labels never name the successor; the successor may
share no vocabulary) and **backlinks** ("what points AT this fact" — not a similarity
question, and `related:` isn't FTS-visible). Both real; both low-frequency today (~10 + 90
edge-carrying files).

### The verdict inputs

1. **ACTIVATE-EXISTING-EDGES (D-219)** — parse `related:` (+ resolve `[[slug]]`) into the
   index at reindex (an `edges(src,dst,type)` table, rebuilt exactly like FTS), one recursive
   CTE for supersession chains, surface `related` in `mk_get`, a `cmk links <id>` verb +
   `mk_links` parity, state labels upgraded to `[superseded by P-XXXX]`. S-sized, zero LLM,
   zero drift, iwe-grade deterministic rebuild. Also the precondition for the model ever
   WRITING more edges (today `links` is write-only — no reinforcement loop).
2. **DERIVE-MORE-EDGES, ranked:** (1) deterministic mention-anchor co-occurrence edges (~30
   lines, a byproduct of the edges table, exploits anchor density); (2) **Memora cue anchors**
   — the best LLM-derive candidate (a `cues:` frontmatter list riding the SAME Haiku call
   auto-extract already makes; markdown-native, schema-free, rebuildable, proven multi-hop
   gains — the only surveyed mechanism designed for auto-captured memory); (3) sift-kg
   discover-then-freeze (the right typed derivation, wrong fit: a frozen-schema second source
   of truth + LLM-costly rebuild); (4) graphiti typed temporal edges (the kit already
   extracted its gems — Task 66/209 — without the graph; needs a graph DB or reification);
   (5) RAPTOR summary-tree (an abstraction hierarchy, not relational — routed to Task 95).
3. **Cost/benefit honesty:** the Task-99 benchmark has NO relational/multi-hop question type,
   so graph value is unmeasured while the flat baseline it must beat is measured at R@5 0.941 /
   paraphrase 1.000 — and D-360 (same day) shows the fusion stage has no headroom left. No
   observed recall failure on file is relational.

## Gaps (honest)

- Nothing measured — the "hybrid would answer it" checks are reasoned from corpus inspection
  + D-107/D-109 numbers; the ADR's deferral trigger converts them into measurements.
- mem0's upstream Neo4j graph store wasn't read (absent from the clone); MemOS reported
  as-shipped (relational path disabled), not as-intended.
- cognee read = extraction + graph-completion retrieval + storage; the wider ECL surface
  (memify/temporal_awareness) not deep-read.
- graphiti/mem0/MemOS/MemoryOS/sift-kg/iwe citations gathered via reading agents, not
  independently re-verified; cognee/pulse8/Memora/kit citations first-hand.

**Verdict → [ADR-0023](../adr/0023-graph-recall-activate-edges-defer-derivation.md):**
ADOPT the activation slice · DEFER derivation behind a measurable trigger · REJECT
graph-DB / typed-KG / hand-authored shapes. D-361.
