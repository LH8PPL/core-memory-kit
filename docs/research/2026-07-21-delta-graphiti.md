---
date: 2026-07-21
topic: Delta re-read of getzep/graphiti — verifying the 2026-07-19 graph-memory sweep claims against current code
source: C:/Projects/research-clones/graphiti (git fetch/pull; local clone was shallow, depth 1 at last read)
tags: [recall, graph, delta, ADR-0023, D-361]
---

# Delta re-read — graphiti (2026-07-21)

## What it claims

N/A for this pass — this is a verification delta, not a new-claims read. The question was
whether anything material changed in getzep/graphiti's graph story since the 2026-07-19
sweep ([`2026-07-19-graph-memory-code-sweep.md`](2026-07-19-graph-memory-code-sweep.md))
that feeds [ADR-0023](../adr/0023-graph-recall-activate-edges-defer-derivation.md) / D-361.

## What the evidence actually shows

**Zero code changes landed on `main` since the 2026-07-19 read.** The local clone was a
shallow clone (depth effectively 1, boundary commit `0b4bcf1`, confirmed via `.git/shallow`
and `git rev-list --count HEAD` = 4). `git fetch && git pull` fast-forwarded
`0b4bcf1..ca4d5e9` and pulled exactly **3 new commits**, all three of them CLA-bot signature
commits (`@Solaris-star`, `@nandanadileep`, `@abouchard11` "has signed the CLA in
getzep/graphiti#NNNN"), touching only `signatures/version1/cla.json` (+30 lines, one file).
`git diff --stat 0b4bcf1..ca4d5e9` confirms: **one file changed, zero graph-core files
touched.**

Because there is no code delta, "re-verifying claim by claim" reduces to first-hand
confirming the 2026-07-19 sweep's citations are still accurate — which also closes a gap the
original sweep flagged itself ("graphiti/mem0/MemOS/… citations gathered via reading agents,
not independently re-verified"). Spot-checked directly against the current tree, all EXACT
matches, same line numbers as the original note:

| Claim (from the 2026-07-19 sweep) | Verified against | Result |
| --- | --- | --- |
| `EntityEdge` carries relation name + fact + `valid_at`/`invalid_at`/`expired_at` (`edges.py:263-282`) | `graphiti_core/edges.py:263-286` (class `EntityEdge`) | CONFIRMED — `name`, `fact`, `expired_at` (271), `valid_at` (274), `invalid_at` (277) present exactly as cited |
| LLM fact-triple extraction per episode (`prompts/extract_edges.py:94`) | `graphiti_core/prompts/extract_edges.py:94` | CONFIRMED — `def edge(context)` returns the "expert fact extractor that extracts fact triples from text" system prompt, exact line |
| Cypher BFS `*1..depth` (`search_utils.py:551`) | `graphiti_core/search/search_utils.py:551` | CONFIRMED — `MATCH path = (origin {uuid: origin_uuid})-[:RELATES_TO\|MENTIONS*1..{bfs_max_depth}]->(:Entity)`, exact line |
| node-distance rerank (`:1798`) | `search_utils.py:1798` | CONFIRMED — `async def node_distance_reranker(...)` at exactly line 1798 |
| RRF present | `search_utils.py:1780` | CONFIRMED — `def rrf(...)` |
| MMR present | `search_utils.py:1901` | CONFIRMED — `def maximal_marginal_relevance(...)`, `mmr_lambda` param |

The older [`2026-06-06-recall-deep-dive-graphiti-mem0-memoryos.md`](2026-06-06-recall-deep-dive-graphiti-mem0-memoryos.md)
claim about graphiti's bi-temporal edge model (two time axes: truth-time `valid_at`/
`invalid_at` and system-time `created_at`/`expired_at`) is also still accurate — the same
fields are present in the current `edges.py`.

## Mechanism detail (unchanged — restated for the record)

- `EntityEdge` (pydantic model, `graphiti_core/edges.py`) is the graph edge: `name` (relation
  label), `fact` (the extracted sentence), `fact_embedding`, `episodes` (provenance list),
  and four temporal fields — `valid_at`/`invalid_at` (truth-time, when the fact was/stopped
  being true) and `expired_at`/(`created_at` on the base `Edge`) (system-time, when Graphiti
  learned/invalidated it).
- Edge creation: `graphiti_core/prompts/extract_edges.py:94`'s `edge()` builds an LLM prompt
  that extracts fact triples per episode, with a `<FACT_TYPES>` section injected when the
  caller supplies typed edge schemas.
- Query surface, all in `graphiti_core/search/search_utils.py`: a Cypher `MATCH path =
  (origin {uuid: origin_uuid})-[:RELATES_TO|MENTIONS*1..{bfs_max_depth}]->(:Entity)` bounded
  BFS (line 551) alongside edge vector/fulltext search, `rrf()` (line 1780, reciprocal-rank
  fusion across search methods), `node_distance_reranker()` (line 1798, rerank by graph
  distance from an origin node), and `maximal_marginal_relevance()` (line 1901, diversity
  reranking with an `mmr_lambda` tunable). This is unchanged from 2026-07-19.

## Relevance to core-memory-kit

Directly feeds [ADR-0023](../adr/0023-graph-recall-activate-edges-defer-derivation.md) /
D-361 (Task 232-adjacent graph-recall decision) and the design.md §21 Task-95 dream
re-curation write-up's cross-references to the same sweep. **The load-bearing question this
delta pass answers: no, nothing changed** — graphiti remains the field's real-graph
reference (typed nodes/edges, LLM-authored relations, bi-temporal validity, Cypher BFS +
RRF + MMR + node-distance rerank), and the ADR's comparison point (graphiti = the fully-built
graph-DB option the kit explicitly rejected in favor of activating its own lightweight
`related:` edges) still holds on current evidence. Nothing here changes ADR-0023's verdict or
its measurable-trigger deferral of edge derivation.

Task 233/161/203 (context-compaction) and Task 95 (dream re-curation): no new surface here —
this pass only touched graphiti's graph/search code, not any compaction- or
consolidation-adjacent module (graphiti has no dream/replay/consolidation mechanism in its
shipped code; this was not re-checked this pass since the original 2026-07-19 sweep didn't
claim one either — see Honest gaps).

## Borrow candidates

None new this pass — no code changed. The 2026-07-19 sweep's existing borrow ranking stands:
ACTIVATE-EXISTING-EDGES (D-219) adopted; DERIVE-MORE-EDGES ranked with graphiti's typed
temporal edges placed 4th (needs a graph DB or reification — not adopted, per ADR-0023).

## Reject candidates

None new this pass, for the same reason (no code delta to evaluate). Standing rejection from
ADR-0023 (graph-DB / typed-KG dependency) is unaffected.

## Honest gaps

- This delta pass verified graphiti's **graph/edge/search** surface only (the files the
  2026-07-19 sweep cited). It did NOT re-scan the whole repo for unrelated new modules,
  since `git diff --stat` already proved the entire commit range touched exactly one
  non-code file (`signatures/version1/cla.json`) — a full re-scan would find nothing by
  construction.
- Did not check whether graphiti has open, unmerged PRs with graph-relevant changes (out of
  scope: this is a re-read of the pulled `main` branch, not GitHub PR/issue state).
- No images in the source (code repo); nothing to report as missed on that front.
- No links were followed — the source is a local git clone, not a hosted article.
- The `attributes: dict[str, Any]` field on `EntityEdge` (line 283-285, just below the cited
  263-282 range) wasn't in the original citation and wasn't separately analyzed here beyond
  noting it exists — not claimed as new (it was very likely present on 2026-07-19 too, given
  zero commits occurred; just not called out in the original note).

## Verdict

**NOTHING-MATERIAL.** Confirmed via `git diff --stat 0b4bcf1..ca4d5e9` (one file,
`signatures/version1/cla.json`, +30/-0) and first-hand re-verification of every specific
file:line citation in the 2026-07-19 sweep's graphiti row — all exact matches, same line
numbers. ADR-0023 / D-361 stand unchanged; no update needed to the graph-recall decision.
