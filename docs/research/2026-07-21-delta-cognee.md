# Delta re-read: cognee (topoteretes/cognee) — 2026-07-19 → 2026-07-21

**Date:** 2026-07-21
**Source:** C:/Projects/research-clones/cognee (`git fetch` + `git pull origin main`; local `main` was at `6df1eda76` (2026-07-18 23:39 +0200), origin/main advanced to `548d87ae0` (2026-07-20 19:28 +0200) — 15 commits since the 2026-07-19 sweep's clone state)

## What it claims (the 15 new commits)

Two are graph-relevant on their face; the rest are unrelated (ladybug-migration fix + revert, eval-report docs, EXIF/perceptual-hash image loader, MCP `system_prompt` forwarding fix, a CLI dry-run guard):

1. `e3fb4e67e` **feat(graph): add Turso (libSQL) graph database backend (SDK-176) (#4080)** — a new selectable `GRAPH_DATABASE_PROVIDER=turso` backend, storing the graph as two relational tables (`graph_node`/`graph_edge`) with parameterized SQL (JOINs for neighbors/triplets, `WITH RECURSIVE` CTEs for k-hop/components), mirroring the existing Postgres adapter. Local/embedded libSQL only — remote sync explicitly deferred.
2. `597bc1c25` **feat(code-graph): enola-backed deterministic code graph extraction task [COG-5837] (#4037)** — a brand-new, opt-in `cognee/tasks/code_graph/` package that shells out to an external `enola` binary (tree-sitter-based, Apache-2.0, not vendored) to build a **deterministic, no-LLM** architectural graph of a code repository (calls/imports/implements/depends_on/… across Go/Python/TS/Java/Kotlin/Swift/Ruby/C++/PHP/Vue/Svelte/OpenAPI/gRPC). Ships with a new `CODE` `SearchType`, a 1316-line deterministic `code_retriever.py` (graph-only, zero LLM/embeddings, exact operations `query_facts`/`explore`/`traverse`/`find_path`/`impact_analysis`), and a new `graph_only` flag on `add_data_points` (skip vector-engine writes for deterministic pipelines).

## What the evidence actually shows (re-verified against current code, not the commit messages)

I re-checked every load-bearing citation from `2026-07-19-graph-memory-code-sweep.md`'s cognee row against the pulled tree:

- **`shared/data_models.py`** — `Node`/`Edge`/`KnowledgeGraph` pydantic models unchanged in shape: `Node.type: str` (free-text, LLM-labeled), `Edge.description` still documented as "Concrete one-sentence fact expressed by this edge, using endpoint names." **Confirmed unchanged.**
- **`extract_graph_from_data.py`** — the per-chunk LLM call (`extract_content_graph(chunk.text, graph_model, …)` gathered over `asyncio.gather` for every non-DLT chunk) is still there and still the mechanism that builds the document knowledge graph. **Confirmed unchanged** (only a new DLT-chunk partitioning optimization sits above it, unrelated to the LLM-extraction claim).
- **`retrieval/utils/brute_force_triplet_search.py`** — still present, still the vector-search-with-graph-as-expansion-structure retrieval path (`TripletSearchContextProvider.py`, `graph_completion_retriever.py` both still wired to it). **Confirmed unchanged.**
- **`get_default_tasks()` in `cognee/api/v1/cognify/cognify.py`** — the default pipeline is still `classify_documents → … → extract_events_and_timestamps → extract_knowledge_graph_from_events → add_data_points` (plus the pre-existing deterministic `extract_dlt_fk_edges` for tabular/DLT rows). **The new `code_graph` task package is NOT in this default list** — it's a separate, explicitly-invoked pipeline (`get_code_graph_tasks(repo_path)` → `run_custom_pipeline`), requiring the external `enola` binary on `PATH`/`ENOLA_PATH`.

So: the mechanism our 2026-07-19 note characterized ("LLM-labeled loose schema … LLM per chunk … vector search with graph as the expansion structure, not Cypher-first … fully auto, LLM-costly, non-deterministic rebuild") is **unchanged for the document/memory graph path** — that's still what runs when a user calls `cognify()` on text.

## Mechanism detail — what's actually new

**Code graph (opt-in, separate from cognify):**
```
extract_code_graph(repo_path)          # spawns `enola --generate` subprocess (async, timeout)
  → streams .enola/facts.jsonl          # tolerant: corrupt/non-object lines skipped+counted
  → maps 6 fact kinds → DataPoint models (CodeModule/CodeSymbol/ApiEndpoint/
    StorageResource/ExternalDependency/CodeService/CodeTestReference/CodeFileReference)
  → deterministic uuid5(repo, kind, name) ids
add_code_graph_edges(...)
  → typed relations (calls/imports/implements/declares/depends_on/instantiates/
    injects/has_method/handled_by) via graph_engine.add_edges(graph_only=True)
    — no vector engine touched
code_retriever.py (SearchType.CODE)
  → deterministic graph-only queries: query_facts / explore / traverse /
    find_path / impact_analysis — zero LLM, zero embeddings, cached
    dataset-scoped subgraph indexes (bounded LRU/TTL)
```
This is a second, parallel graph-construction mechanism that lives entirely outside the LLM-extraction path — narrow-domain (source code only), external-tool-dependent, and additive (it does not touch or replace `extract_graph_from_data.py`).

**Turso backend:** purely a new `GraphDBInterface` implementation (SQL-table-backed, mirrors the Postgres adapter's query shapes); no change to what gets extracted or how — only where the resulting nodes/edges are stored.

## Relevance to core-memory-kit

- **Task 95 (dream re-curation) / design.md §21:** none — no commit touches memify, dreaming, consolidation, or curation in this window (checked via `--grep` across the 15 commits; zero hits).
- **Task 232/ADR-0023 (graph edges):** weak-to-moderate, directionally confirming rather than changing the ADR. ADR-0023 already concluded: activate the kit's existing deterministic `related:` edges now, defer LLM-derived edge extraction behind a measured trigger, reject a graph-DB. Cognee's own July 2026 direction is the same split, expressed at their scale: deterministic extraction reserved for a structurally-parseable domain (source code, via an external tree-sitter tool) with its own retriever and search type, while the general/unstructured (document/memory) path stays LLM-per-chunk and unchanged. This is a second data point — from a project already surveyed as the field's "fully-auto, LLM-costly" reference case — that even a mature graph-memory system doesn't reach for LLM-graph-extraction for everything; it reserves LLM extraction for genuinely unstructured input and goes deterministic wherever the input has exploitable structure (their case: an AST; our case: `related:` frontmatter + anchor tokens). This does **not** change any number or verdict in ADR-0023 — the ADR's document-graph reasoning was never about code repos.

## Verdict

**NOTHING-MATERIAL to the graph-recall ADR's document/memory-graph claims** — every specific citation (`data_models.py`, `extract_graph_from_data.py`, `brute_force_triplet_search.py`, the default task list) re-verified unchanged against the pulled tree (`548d87ae0`, 2026-07-20). The two graph-shaped commits (`597bc1c25` enola code-graph, `e3fb4e67e` Turso backend) are both real, both substantial (5299 and multiple-hundred lines respectively), and both additive-and-orthogonal: a new opt-in deterministic *code*-graph pipeline with its own SearchType/retriever, and a new *storage* backend for the existing graph. Neither touches the LLM-per-chunk document-extraction path or the vector-search-triplet retrieval path our ADR's per-system comparison table was built on.

## Borrow candidates

- The **`graph_only` flag pattern on `add_data_points`** (skip vector-engine initialization/writes entirely for a deterministic pipeline) is a clean small idea if the kit ever builds a dedicated deterministic-edge writer distinct from its fact-write path — avoids paying for infrastructure a deterministic pipeline doesn't need. Low priority; the kit's `edges(src,dst,type)` table (ADR-0023's activation slice) already has no vector-engine coupling to avoid.
- Nothing else meets the bar — the enola integration is Python/tree-sitter/external-binary specific and doesn't map onto markdown fact files.

## Reject candidates

- **The enola code-graph mechanism wholesale** — it operates on source code ASTs via an external multi-language tree-sitter binary. The kit's corpus is markdown memory facts, not source code; there's no analogous "AST" to deterministically walk. Not a fit.
- **Turso/libSQL as a graph backend** — the kit rejected a graph DB entirely in ADR-0023 (SQLite `edges` table via reindex, not a dedicated graph store); a new storage-backend option for cognee's graph doesn't bear on that rejection.

## Honest gaps

- Did not deep-read `code_retriever.py` (1316 lines) beyond its docstring/header/type tables — its five deterministic operations were not individually traced.
- Did not run cognee's test suite or the `enola` binary itself; all claims are from static code reading of the pulled tree, matching the methodology of the 2026-07-19 base note.
- Did not check whether any of the 15 commits' non-graph changes (ladybug migration, EXIF/perceptual-hash loader, eval runner) have second-order relevance to other kit tasks (e.g. Tasks 233/161/203 context-compaction) — scoped this pass strictly to the graph-story question per the task brief.
- The `2026-07-19-recall-trigger-architecture-study.md` cognee citations (`server.py:496-548` search-type taxonomy, judgment-pulled MCP recall) were spot-checked only via the `fix(mcp): forward recall system prompts` commit (a `system_prompt` plumbing addition, unrelated to the search-type-taxonomy claim) — the taxonomy table itself was not re-diffed line-by-line against current `server.py`.
