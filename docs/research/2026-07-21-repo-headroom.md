# Repo read: chopratejas/headroom — hierarchical + graph memory inside a token-compression proxy

**Date:** 2026-07-21 · **Source:** https://github.com/chopratejas/headroom (cloned `--depth 50` to `C:/Projects/research-clones/headroom`, HEAD `1329ed7` — "feat(proxy): make /v1/compress usable as a gateway/Kong sidecar (#2458)", 2026-07-21)

## Inventory

- **License:** Apache-2.0 (`LICENSE` present).
- **Stars/forks/issues** (via `gh api repos/chopratejas/headroom`): 60,817 stars, 4,568 forks, 483 open issues. Created 2026-01-07, last push 2026-07-21 (same day as this read) — actively maintained, popular.
- **Language mix:** Rust core (`crates/`, 190 files, 73,555 LOC — the "Kompress" compression engine; **not read this pass**) + Python package (`headroom/`, 507 files, 194,738 LOC). `gh api` reports primary language Python.
- **Memory subpackage specifically:** `headroom/memory/` — 47 files, 21,572 LOC. Not a stub.
- **CI:** yes — 21 GitHub Actions workflows (`ci.yml` with sharded pytest, `rust.yml`, `security.yml`, `docker.yml`, `eval.yml`, release-please, etc.). Real engineering process, not a solo demo repo.
- **Primary product** (per README/description): an LLM-context compression proxy/library ("Compress tool outputs, logs, files, and RAG chunks before they reach the LLM. 20% fewer tokens... Library, proxy, MCP server"). The hierarchical/graph memory system is one subsystem inside this larger tool, not the headline feature.

## What it claims

- README: "Cross-agent memory — shared store across Claude, Codex, Gemini, Grok, auto-dedup."
- Module docstrings claim a "hierarchical memory system" with a "knowledge graph memory system," temporal supersession, and (in `budget.py`) an importance-decay/staleness/merge optimizer described as "Headroom's superpower applied to itself."
- `.devcontainer/` ships a `memory-stack` variant wired to Neo4j + Qdrant, implying a graph-DB-backed deployment option exists.

## What the evidence actually shows (code-verified)

**The graph is real, not a README word.** Verified in two files:
- `headroom/memory/adapters/graph.py` — `InMemoryGraphStore`: thread-safe (`RLock`), indexed `Entity`/`Relationship` storage, BFS `query_subgraph()` (hop-limited traversal) and BFS `find_path()` (shortest path).
- `headroom/memory/adapters/sqlite_graph.py` — `SQLiteGraphStore`: same API, backed by a real `entities`/`relationships` SQLite schema with FK cascade-delete and indexes, described as "a drop-in replacement for InMemoryGraphStore... persists all data to disk."
- `headroom/memory/backends/local.py`: `LocalBackend`'s `LocalBackendConfig.graph_persist: bool = True` — **the persisted SQLite graph store is the default**, not an opt-in. `save_memory()` writes `Entity`/`Relationship` rows when entity/relationship data is present; `search_memories(include_related=True)` calls `query_subgraph()` to expand vector-search hits by 1-2 graph hops before returning results (`local.py` lines ~460-505, read directly).

**Population mechanism — "inline extraction," not a separate LLM call.** `headroom/memory/extraction.py`'s own docstring names the design intent: avoid mem0's "3-4 LLM calls per memory save" by having the *calling* agent's LLM extract `facts`/`extracted_entities`/`extracted_relationships` as part of the SAME tool call it already makes (`MEMORY_SAVE_TOOL_WITH_EXTRACTION` / `get_memory_tools_optimized()` in `memory/tools.py`). Traced end-to-end: `headroom/proxy/memory_handler.py` registers `get_memory_tools_optimized()` as the exposed tool schema (line 481), pulls `extracted_entities`/`extracted_relationships` out of the tool-call input (lines 1216-1218), and passes them straight into `backend.save_memory(...)` (line 1237-1245) — which is the method that writes to the graph store. This is genuinely wired, not dead.

**But there are two parallel MCP surfaces, and only one populates the graph.** `headroom/memory/mcp_server.py` (a simpler stdio MCP server) exposes only bare `memory_search`/`memory_save` tools with NO entity/relationship fields (`_TOOLS` list, lines 49-90; `_handle_save` at line 310 calls `backend.save_memory(content=fact, ...)` with no entities). Using Headroom through *this* surface (e.g. a plain MCP client) never touches the graph at all — only the proxy-gateway integration path (`memory_handler.py`) does.

**Dual backend: embedded no-server default vs. server-based alternative.** `LocalBackend` is fully self-contained (SQLite + SQLiteGraphStore + sqlite-vec/HNSW vector index, local ONNX embedder recommended — `config.py`'s `EmbedderBackend.ONNX` comment: "no torch, ~86MB, recommended"). A separate `backends/mem0.py` (`Mem0Backend`) wraps the actual `mem0` library, which itself talks to **Neo4j** (graph) + **Qdrant** (vector) as external servers — this is what the `memory-stack` devcontainer provisions. So Headroom supports both a no-server embedded graph (default, matches core-memory-kit's own no-server posture) and a heavier Neo4j-backed one (opt-in).

**No offline "dream"-style consolidation pass exists.** Searched the whole `memory/` package for consolidation/merge/dedup/staleness logic; found four mechanisms, none resembling a batched LLM-judged merge/supersede pass:
1. `sync.py` — bidirectional Claude/Codex/etc. file↔DB sync; dedup is **exact SHA-256 content-hash only**, no semantic merge.
2. `bridge.py` `_check_duplicate()` — a semantic-similarity **skip-on-import gate** (boolean; if `search_memories(min_similarity=threshold)` returns anything, skip the new entry). No merge, no supersede, doesn't touch the existing entry.
3. `memory/budget.py` `MemoryBudgetManager` — the closest conceptual analog. `_apply_decay()`: deterministic exponential importance decay (`importance × e^(-rate × age_days)`), counteracted by an access-count boost (up to +0.3). `_detect_staleness()`: flags memories whose content/entity_refs reference file paths absent from `git ls-files` (or filesystem). `_merge_similar()`: groups memories above a **Jaccard word-overlap threshold** (explicitly "no embeddings required") and **keeps only the highest-importance member's content, discarding the rest** — a destructive, lossy merge. **Verified unwired: grepped every non-test `.py` file in the repo for `MemoryBudgetManager`/`budget_manager`/`from headroom.memory.budget` — zero call sites outside `budget.py` itself and `tests/test_memory/test_budget.py`.** No CLI subcommand, no MCP handler, no proxy path invokes it. The "Headroom's superpower applied to itself" docstring claim is not backed by any live invocation.
4. `headroom memory prune` (`cli/memory.py` line 788) — the actual **live** consolidation-adjacent surface: a human-run CLI command, filtered by `--older-than`/`--scope`/`--low-importance`, confirm-prompted (or `--dry-run`/`--force`), and performs a **hard `delete_batch()`**. No LLM judgment, no archive-not-delete, no review queue, no resumability contract.
- Grepped for `decay|forgetting|nightly|cron|scheduled|APScheduler` across `memory/` — no scheduler/cron wiring found anywhere in the package.

**Claude Code interop is directly relevant and code-verified.** `headroom/memory/sync_adapters/claude_code.py` reads/writes the exact location Claude Code's harness-default memory falls back to when no in-repo system exists: `~/.claude/projects/<sanitized-path>/memory/{MEMORY.md, *.md}` with YAML frontmatter (`name`/`description`/`type`/`headroom_id`/`source_agent`). Two defensive details worth noting: (a) `encode_claude_project_path()` explicitly handles Windows drive letters (`C:\Users\...` → `-C-Users-...`) rather than naively replacing `:` — a bug class this project has hit before (D-305); (b) `write_memories()`'s filename-collision guard has an explicit comment describing the failure mode it prevents ("the second would silently overwrite the first (data loss)... ping-ponging forever") when two distinct memories share a first-line-derived slug, resolved via a content-hash filename suffix.

**Adjacent, not memory:** `headroom/learn/` is a *separate* feature — one LLM call over conversation logs that generates/updates `CLAUDE.md`/`AGENTS.md`/`GEMINI.md` files per-agent via a plugin registry. It produces agent-instruction files, not a searchable fact store; **not read at code depth this pass**, only its module docstring.

## Mechanism detail — the graph write/read path (pseudocode, from actual code read)

```
# Write (proxy path, memory_handler.py -> backends/local.py):
tool_call.arguments = {content, facts[], extracted_entities[{entity, entity_type}],
                        extracted_relationships[{source, relationship, destination}]}
  -> LocalBackend.save_memory(...)
       -> HierarchicalMemory.add(content, ...) for each fact  # vector + FTS index
       -> for each extracted_entity:
            existing = graph.get_entity_by_name(user_id, name)  # case-insensitive exact match
            entity = existing or Entity(id=uuid4(), user_id, name, entity_type)
            graph.add_entity(entity)          # INSERT OR REPLACE into SQLite `entities`
       -> for each extracted_relationship:
            graph.add_relationship(Relationship(source_id, target_id, relation_type))

# Read (search path):
LocalBackend.search_memories(query, include_related=True)
  -> HierarchicalMemory.search(query)         # sqlite-vec / HNSW cosine top-k
  -> for entity name found in query text:
       entity = graph.get_entity_by_name(user_id, name)
       subgraph = graph.query_subgraph([entity.id], max_hops=2)   # BFS
  -> merge subgraph.entities into results (score=0.5, i.e. lower-confidence than vector hits)
```

## Relevance to core-memory-kit

**Graph relevance: strong.** Headroom is a large, popular, actively-maintained, code-verified counter-example to the D-153-sweep pattern ("three graph-memory flagships shipped no graph") — its graph is genuinely persisted (SQLite by default) and traversed (BFS subgraph expansion feeds live search results), not just a README word. But it is exactly the pattern **ADR-0023 evaluated and explicitly rejected**: "LLM-extracted typed KGs as a store (drift + non-deterministic rebuild... pulse8's cautionary agent-edges-only-in-graph.json data loss shape)." Headroom's graph is populated by LLM inference (the calling agent's own extraction) and is **not derivable from the markdown/text it was extracted from** — there is no rebuild-from-source guarantee, which is precisely ADR-0002's "opaque DB" concern that ADR-0023 leans on. Headroom is evidence the pattern ships and is used at scale; it is not evidence against the drift/non-determinism argument ADR-0023 makes, since Headroom accepts that drift risk as a tradeoff (and, notably, ships it through only one of its two MCP-ish integration surfaces — the plain stdio server bypasses the graph entirely, illustrating how easy it is for such a system to silently under-populate). Useful as a concrete comparison point if ADR-0023 is ever revisited with new evidence, and as a source of smaller techniques (see below) independent of the overall strategy question.

**Task 95 (dream re-curation, design.md §21) relevance: weak.** Headroom ships nothing resembling the three-stage LLM-judged dedup/merge/supersede pass design.md §21.2 specifies. The nearest-shaped code (`MemoryBudgetManager` in `budget.py`) is verified **dead/unwired** — a real claims-vs-code gap between its docstring and actual usage. Its merge logic (`_merge_similar`) is also a direct instance of the **exact anti-pattern §21.6 rules out** ("no in-entry trail-lossy merges") — it keeps one survivor's content and silently drops the rest. The one *live* consolidation-adjacent surface (`memory prune`) is manual, deterministic-filter-only, and destructive (hard delete, no archive) — confirming rather than informing core-memory-kit's more elaborate AUTO/QUEUE-class design, not offering new mechanism ideas for the LLM-judged half of it. The dead code's two *sub-formulas* (exponential decay with access-count counteraction; git-tracked-file staleness) are mildly interesting as deterministic-floor techniques (see borrow candidates) but were never proven in production since nothing calls them.

## Borrow candidates

1. **`encode_claude_project_path()`'s Windows drive-letter handling** (`sync_adapters/claude_code.py`) — worth a diff-check against core-memory-kit's own path-sanitization logic for the harness-default `~/.claude/projects/<slug>/` location, given this project's own D-305 history with `/c:/`-style path bugs.
2. **Filename-collision-by-content-hash-suffix** pattern in `write_memories()` — a defensive technique for any writer (ours included) that derives a file/slug name from a content prefix: detect same-slug-different-identity and disambiguate with a hash suffix rather than silently overwriting.
3. **Exponential decay + access-count counteraction formula** (`budget.py::_apply_decay`, unwired but well-formed: `importance × e^(-rate × age_days)`, capped boost from access_count) — a candidate deterministic-floor signal if Task 95's stage-1 floor (currently canonical-ID/hash dedup only, per design §21.2) is ever extended with a staleness heuristic.
4. **`git ls-files`-based staleness detection** (flag facts whose cited file paths no longer exist in the tracked tree) — a cheap deterministic check that could feed a review-queue flag (not auto-prune) for fact files that reference renamed/deleted paths.

## Reject candidates

1. **LLM-extracted typed graph as the memory's own store** — reject, per ADR-0023's existing reasoning (drift, no rebuild-from-markdown guarantee); Headroom's popularity doesn't address the specific concern ADR-0023 raised.
2. **`MemoryBudgetManager._merge_similar`'s single-survivor lossy merge** — reject outright; directly the pattern design §21.6 forbids.
3. **`memory prune`-style manual filtered hard-delete as "consolidation"** — reject as a model for Task 95; it has no LLM judgment, no archive-not-delete, no resumability, no review queue — a floor utility, not an engine.
4. **Server-based `Mem0Backend` (Neo4j + Qdrant)** — reject per the kit's standing no-server posture (ADR-0023 cites "the D-64 no-server class").

## Honest gaps

- **Not read at all:** the Rust core (`crates/`, 73,555 LOC — the actual "Kompress" compression engine driving the headline token-savings claim). Entirely out of scope for a memory-focused pass; no claim made about it.
- **Not read at code depth:** `headroom/learn/` (only its module docstring), `headroom/memory/traffic_learner.py` (1,791 lines — grepped for consolidation/decay/dedup keywords, zero hits, but its actual logic was not read; name suggests compression-traffic-pattern learning, unverified), `headroom/memory/wrapper.py`/`wrapper_tools.py`/`easy.py` (a third integration surface, grepped only), `headroom/memory/backends/mem0.py` beyond its Neo4j/Qdrant config fields (did not verify line-by-line that it calls real Neo4j graph APIs vs. delegating entirely to the `mem0` library).
- **Not executed:** no test run, no live invocation. All claims (including "`graph_persist=True` is the default" and "`MemoryBudgetManager` is unwired") are from static code reading + exhaustive grep, not from running the code and observing actual SQLite file writes.
- **Not followed:** the hosted docs site (`headroom-docs.vercel.app`) referenced in the README — deliberately not used as a source per this project's code-over-docs discipline (D-153); only the cloned repo was treated as primary source.
- **Images:** none viewed — the repo root ships several large demo GIFs/PNGs (`headroom_learn.gif`, `Headroom-2.gif`, `headroom-savings.png`) that were not opened; any claims they illustrate are unverified by this pass.
- **Stars/popularity figure** (60,817 stars) is from a single `gh api` call at read time, not cross-checked against another source.
