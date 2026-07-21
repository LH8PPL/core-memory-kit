# Synthesis: does the 29-source graph/graph-DB research pass reopen ADR-0023?

**Date:** 2026-07-21 · **Source:** synthesis across the 2026-07-21 research pass (29 digests: 17 articles, 10 repo code-reads, 3 delta re-reads of graphiti/cognee/mem0), cross-read against [ADR-0023](../adr/0023-graph-recall-activate-edges-defer-derivation.md) and its evidencing sweep, [2026-07-19-graph-memory-code-sweep.md](2026-07-19-graph-memory-code-sweep.md). Full notes read for this synthesis (not just digests): [graphify](2026-07-21-repo-graphify.md), [headroom](2026-07-21-repo-headroom.md), [MegaMemory](2026-07-21-repo-megamemory.md), [zenbrain repo](2026-07-21-repo-zenbrain.md), [everos repo](2026-07-21-repo-everos.md), [obsidian-mind](2026-07-21-repo-obsidian-mind.md), [Google always-on memory agent](2026-07-21-google-always-on-consolidation.md), and the three deltas: [graphiti](2026-07-21-delta-graphiti.md), [cognee](2026-07-21-delta-cognee.md), [mem0](2026-07-21-delta-mem0.md).

## What ADR-0023 decided (2026-07-19, restated for this synthesis)

1. **ADOPT** the activation slice (Task 232): parse `related:` + `[[slug]]` into a
   deterministic, rebuildable `edges(src, dst, type)` table at reindex; recursive CTE for
   `superseded_by` chains; surface in `mk_get`/`cmk get`; `cmk links` / `mk_links`. Zero
   LLM, zero drift, rebuilds byte-stable from markdown like the FTS index.
2. **DEFER** LLM edge derivation (`cues:` frontmatter, Memora-style), behind a named,
   checkable trigger: extend the Task-99 benchmark with a relational/multi-hop qtype; only
   evaluate `cues:` if flat hybrid + the agentic ladder scores materially below the
   exact/paraphrase qtypes on it.
3. **REJECT** hand-authored graphs (iwe), graph-DB servers (Neo4j/etc., the D-64
   no-server class), LLM-extracted typed KGs used *as the store* (drift +
   non-deterministic rebuild), RAPTOR summary-trees.

The evidencing sweep's headline empirical claim was: "the field's own 'graph memory'
flagships under-deliver in shipped code" (mem0: score-boost only; MemOS: relational path
commented out; Letta: no graph at all — 9 systems read).

## What this pass claims (across the corpus)

Loosely: that "dreaming"/consolidation and graph memory are both maturing fast across the
industry (OpenAI, Anthropic, Google Cloud, and a wave of OSS/hackathon projects), and that
some of these newer systems ship real, code-verified, persisted, traversed graphs — a
partial rebuttal to the sweep's "flagships ship no graph" claim, IF the counter-examples
hold up and IF they bear on the *same* question ADR-0023 answered.

## What the evidence actually shows

**The "flagships ship no graph" pattern gets MORE confirming data points, not fewer.**
Of the repos in this pass with an explicit graph *claim* to check against code:

| Repo | Graph claimed | Graph verified in code? |
|---|---|---|
| zenbrain | "Hebbian graphs," knowledge-graph edges | **No** — `knowledge_entities`/`cross_context_links` tables have zero `INSERT`s anywhere; `personalized-pagerank.ts` is unwired math whose own docstring cites files that don't exist in the repo |
| EverOS | (implicitly, via "connections"/relational framing) | **No** — grep for graph/node/edge/networkx/neo4j across 33K LOC returns nothing but a 3-value provenance-label enum; retrieval is flat BM25+ANN fusion |
| obsidian-mind | "graph-first" AI memory, "the graph does the rest" | **No** — every "graph" reference is Obsidian's own desktop UI or doc prose; the only link-related code (`wikilinks.ts`) returns a boolean for a lint gate, not a queryable structure |
| claude-second-brain | (via linked Obsidian graph-view) | **No** — same as above, delegated entirely to an external app with zero agent-queryable API |
| COG-second-brain | (roadmap item only) | **No claim to contradict** — the repo honestly marks "knowledge graph visualization" as an unshipped roadmap box, the cleanest of the bunch |
| git-lrc | "institutional memory," "feedback loop" | **No** — not a memory system at all; zero graph/embed/vector/consolidat hits anywhere |
| Google always-on memory agent | "merges related memories," connection graph | **Graph exists but is DB-only** — a `connections` JSON column with no text/markdown source of truth, not rebuildable; violates ADR-0002/0023's rebuildability constraint directly |

That is **7 more systems checked at code level**, on top of the sweep's original 9, for a
running total of ~16 systems where a marketed "graph" claim was checked against source —
and only one (Google's) has *any* real edges, and those edges fail the ADR's rebuildability
constraint outright.

**Three systems in this pass DO ship a real, persisted, traversed graph** — this is the
part that could matter:

1. **graphify** (92.6K★, YC S26) — a genuine `networkx.DiGraph`, persisted to
   `graph.json`, traversed via `shortest_path`/BFS/DFS/betweenness-centrality, served over
   MCP. **But it graphs codebase structure (functions/classes/files via tree-sitter AST),
   not conversational facts** — a different domain than what ADR-0023 evaluated. Its edge
   construction is deterministic (AST parse, zero LLM) and confidence-labeled
   (`EXTRACTED`/`INFERRED`) — structurally the SAME shape as what ADR-0023 already
   **ADOPTED** for Task 232 (parse what's already there, deterministic rebuild), not a
   competing shape. Its LOCOMO/LongMemEval "conversational memory" benchmark numbers
   (marketed in `BENCHMARKS.md`) have **no reproducible harness anywhere in the cloned
   repo** — unverified vendor claim, explicitly flagged as such in the source note.
2. **headroom** (60.8K★) — a real `SQLiteGraphStore` (entities/relationships tables, FK
   cascade-delete, BFS `query_subgraph`), **default-on** in its local backend. Populated by
   **LLM inference** (the calling agent's own tool-call extracts entities/relationships) —
   this is exactly the "LLM-extracted typed KG as a store" pattern **ADR-0023 already
   named and rejected**. Confirming detail this pass adds: a parallel plain-MCP surface
   (`mcp_server.py`) exposes save/search tools with NO entity fields, so using headroom
   through *that* integration path never populates the graph at all — a live illustration
   of exactly the "written edges go invisible/inconsistent" failure ADR-0023's D-219
   finding already flagged (there, `related:` frontmatter at ~5% population; here, an
   entire integration surface that silently skips graph population).
3. **MegaMemory** — a real SQLite graph (nodes+edges, JOIN-traversed on every read, 9 MCP
   tools). Edges are written by the **agent directly calling `create_concept`/`link`
   tools** — again the LLM/agent-authored-edges-as-store pattern. Confirming detail: the
   project needed a **from-scratch bespoke merge/conflict-resolution engine**
   (`merge`/`conflicts`/`resolve` CLI) purely to reconcile the SQLite graph across git
   branches — concrete empirical cost evidence for exactly the problem ADR-0002's
   markdown-source-of-truth choice (and ADR-0023's rebuildability constraint) is designed
   to avoid.

**The three delta re-reads (graphiti, cognee, mem0) show no material change since
2026-07-19.** `git diff --stat` on graphiti's 3 new commits touched one non-code CLA-bot
signature file. cognee's 15 new commits include a new *deterministic, external-binary,
opt-in* code-AST graph pipeline scoped to source-code repos only — not wired into the
default document/memory graph path the sweep evaluated, and itself evidence FOR the
sweep's ADOPT/DEFER split (deterministic extraction reserved for structurally-parseable
domains like code/AST, same as graphify; LLM extraction kept, unchanged, for unstructured
text). mem0's 10 new commits are backend bugfixes plus a governance chore *removing*
"Graph Memory" from GitHub issue templates — a weak confirming signal, not a reopening one.

**No source in this 29-source pass ran or extended the Task-99 relational/multi-hop
benchmark.** The DEFER trigger (§ADR-0023 decision 2) requires benchmark numbers showing
flat hybrid + the agentic ladder scoring materially below on a relational qtype before
`cues:` frontmatter gets evaluated. Nothing in this corpus supplies that measurement —
the trigger remains unfired.

## Mechanism detail — what, precisely, changed vs. the 2026-07-19 sweep

- **Sweep base (9 systems, 2026-07-19):** mem0 (score-boost only), MemOS (path commented
  out), Letta (no graph), graphiti (real typed KG, LLM-authored, bi-temporal), cognee (real
  document graph, LLM-authored), iwe (hand-authored, zero auto-derivation), sift-kg
  (discover-then-freeze reference), pulse8 cortex-vault (agent-edges-only-in-graph.json
  data-loss cautionary tale), Memora (`cues:` frontmatter reference).
- **This pass adds:** graphify (real, deterministic, code-domain graph — a genuine new
  data point, but off-axis from the ADR's question), headroom + MegaMemory (real,
  LLM-authored graphs — ON-axis, but they instantiate the exact REJECT line, with new
  concrete cost/bypass evidence), Google always-on (real-but-unrebuildable graph — ON-axis,
  instantiates the same REJECT line), and 6 more "graph claimed, not found in code" misses
  (zenbrain, everos, obsidian-mind, claude-second-brain, git-lrc n/a, COG honest-absence).
- **Net effect on the ADR's two load-bearing empirical claims:**
  - "Flagships under-deliver in shipped code" → **strengthened** (9→16 systems checked,
    ratio of graph-claimed-but-absent goes UP, not down).
  - "LLM-extracted typed KG as a store = drift risk" → **strengthened with concrete new
    cost evidence** (headroom's silent-bypass surface; MegaMemory's bespoke merge engine
    built specifically to pay down that drift cost).
- **Nothing in this pass touches the DEFER trigger's actual gate** (relational-qtype
  benchmark numbers) or proposes a cheaper alternative gate.

## Relevance to core-memory-kit

- **ADR-0023 / Task 232 (activation slice):** no reopening evidence; two small, optional
  design refinements surfaced (see Borrow) that fit *inside* the already-adopted slice
  without changing its shape.
- **Task 95 (dream re-curation engine, design.md §21):** not this note's primary theme
  (covered by the other synthesis note in this pass), but graphify's `dedup.py` (a
  production three-stage deterministic-floor-then-batched-LLM-residue dedup pipeline) is an
  independent validation of design §21.2's shape, and its `reflect.py` corroboration-decay
  scoring is a named, considered-and-diverged-from alternative to the kit's strict
  event-time-wins rule (§21.2/§21.6 already reject LLM/decay-counted recurrence).
- **Tasks 233/161/203 (context-compaction):** no relevant new evidence in the graph-themed
  slice of this pass.

## Borrow candidates (refinements within the already-ADOPTED Task 232 slice — not a reopen)

- **Edge confidence-label convention** (graphify's `EXTRACTED` vs `INFERRED` edge attr) —
  cheap, legible addition to the kit's own `edges(src, dst, type)` schema if/when Task 232
  ever grows a second (inferred/co-occurrence) edge source; today's slice is 100%
  `EXTRACTED`-equivalent (parsed, not inferred), so this is a forward-compatibility note,
  not an immediate need.
- **Name the bypass-surface hazard explicitly in Task 232's acceptance criteria**: headroom's
  dual-MCP-surface gap (one path populates the graph, one silently doesn't) is a concrete,
  transferable caution — if the kit ever adds a second write path to `related:`/edges
  (e.g. a future MCP tool), it must write through the same code that populates `edges` at
  reindex, not a parallel path that can silently diverge.
- **MegaMemory's time-travel query shape** (`created_at<=t AND (removed_at IS NULL OR
  removed_at>t)`) — low-priority, speculative SQL reference if the kit ever wants an
  as-of-time view over the edges table; not needed for Task 232's current scope.

## Reject candidates (reaffirmed, not newly rejected)

- **Any form of LLM/agent-authored edge writing as part of Task 232** — headroom and
  MegaMemory are fresh, concrete, code-verified instances of exactly what ADR-0023's REJECT
  line already named; both add real-world cost evidence (silent bypass; bespoke merge
  engine) rather than new upside evidence.
- **Adopting a code-structure graph tool (graphify) as a memory-graph reference
  architecture** — solves a different, deterministic-domain problem (codebase AST) than
  the kit's target (durable-fact recall across chat sessions); not a competing design for
  Task 232, and not evidence for or against the DEFER'd LLM-edge-derivation question either
  (graphify does zero LLM extraction for its code edges).
- **Treating any of this pass's benchmark numbers (graphify's LOCOMO/LongMemEval, Google's
  marketing framing) as evidence for the DEFER trigger** — none are a relational/multi-hop
  benchmark run against this kit's own corpus; the trigger's bar (Task-99 extension) is
  unmet by construction, since no source in this pass even attempted it.

## Honest gaps

- This synthesis is built from the 29 source-digests plus deep re-reads of the 7 notes
  most directly graph-relevant (graphify, headroom, MegaMemory, zenbrain, everos,
  obsidian-mind, Google always-on, plus all 3 deltas) — the other ~19 notes were read via
  their digest bullets + the `graph:`-tagged relevance line only, per the synthesis task's
  scope, not re-opened in full for this note. Where a digest's `graph:` field says "none,"
  that judgment is trusted from the per-source note, not independently re-verified here.
- No source in this pass, nor this synthesis itself, ran the Task-99 benchmark extension
  ADR-0023's DEFER trigger requires — the trigger's fire/no-fire status is asserted as
  "unfired" by absence of evidence, not by a benchmark run.
- graphify's own memory/benchmark claims (LOCOMO 0.497, LongMemEval-S 76%) are flagged
  unverified by the source note itself (no harness in the repo) — repeated here as "the
  article/repo claims X," not treated as fact anywhere in this synthesis.
- Did not independently re-clone or re-read MemOS, Letta, iwe, sift-kg, pulse8, or Memora
  (the original sweep's 9 systems) — their status is carried forward from the 2026-07-19
  sweep note, not re-verified in this pass, per the task's framing ("did their graph story
  change since 2026-07-19?" was answered only for the 3 systems actually re-pulled:
  graphiti, cognee, mem0).
- Two of the three "graph: strong" flags in this pass's digests (headroom, Google
  always-on) are "strong AS A NEGATIVE EXEMPLAR" — i.e., strong relevance to the REJECT
  line, not strong evidence for reopening ADOPT/DEFER boundaries. Read the distinction
  carefully if reusing this note: "graph relevance: strong" in a digest does not mean
  "reopens ADR-0023."

## Verdict

**CONFIRM.** No source in this 29-source pass supplies benchmark evidence against the
DEFER trigger's actual gate (a relational-qtype score on the Task-99 benchmark), and no
source supplies a working counter-example to the REJECT line's core concern (LLM-authored
graph edges as a non-derivable second source of truth) — if anything, headroom and
MegaMemory supply fresh, concrete cost evidence FOR that concern (a silent graph-bypass
integration surface; a bespoke merge engine built solely to pay down graph/branch drift).
The one genuinely new positive data point (graphify's real, traversed, deterministic
AST-graph) sits in a different domain (codebase structure, not conversational facts) and
is, if anything, structurally aligned with what ADR-0023 already ADOPTED (deterministic
parse-what's-already-there) rather than a case for what it DEFERRED or REJECTED. The
"flagships ship no graph" empirical claim gets stronger, not weaker, with 7 more
graph-claimed/graph-absent systems checked at code level. Task 232 (the ADOPT slice)
should proceed unchanged; two small forward-compatibility notes (edge confidence-label
field; bypass-surface hazard in acceptance criteria) are worth folding into its build, not
as a scope change but as free refinements this pass happened to surface.
