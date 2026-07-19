---
adr: 0023
title: Graph recall — ACTIVATE the edges we already write; DEFER derivation behind a measurable trigger; REJECT graph-DB / typed-KG / hand-authored shapes
status: accepted
date: 2026-07-19
deciders:
  - the maintainer (research directive "do the research broadly")
  - Claude Fable 5
supersedes: null
superseded_by: null
related:
  - 0002-markdown-source-of-truth-over-opaque-db.md
  - 0015-semantic-backend-sqlite-vec-plus-local-onnx-embedder.md
tags:
  - recall
  - graph
  - search
---

# ADR-0023 — Graph recall: activate, defer, reject

## Status

**Accepted** 2026-07-19 (Task 176; D-361). Research basis: the
[graph-memory code sweep](../research/2026-07-19-graph-memory-code-sweep.md) — 9 systems
read at code level (graphiti, mem0, cognee, MemOS, MemoryOS, iwe, sift-kg, pulse8
cortex-vault, Memora), plus the same-day [Letta deep-read](../research/2026-07-19-letta-deep-read.md).

## Context

The kit answers every recall query with flat similarity (FTS5 keyword + sqlite-vec semantic,
RRF-fused). D-216 asked whether a graph/relational mode belongs beside them; D-219 narrowed
the question: the kit already WRITES two edge types it never traverses — `related:`
frontmatter (from `links`) and the `superseded_by` FK. The hard constraint (ADR-0002):
markdown stays the source of truth; any graph must be auto-derived or activated from what
users already write, and rebuildable like the FTS index.

Sweep facts that decided this: only ~5% of fact files carry `related:` (auto-extract never
sets links — the default path writes no edges); `related` is not indexed, not returned by
`mk_get`, and its targets are NOT in the FTS body (probed) — the written edges are invisible
even to a willing agent, and backlink queries are genuinely unanswerable. Meanwhile, of six
real relational query shapes over this corpus, hybrid + the agentic ladder substantially
answers four; the two genuinely-graph-only shapes (supersession-chain walking, backlinks)
are real but low-frequency. The flat baseline is measured at R@5 0.941 / paraphrase 1.000,
the Task-99 benchmark has no relational qtype (graph value is unmeasured), and the field's
own "graph memory" flagships under-deliver in shipped code (mem0 clone: score-boost only;
MemOS: relational path commented out; Letta: no graph at all).

## Decision

1. **ADOPT — the activation slice** (a new S-sized build task, v0.6.x recall surface):
   parse `related:` + `[[slug]]` into an `edges(src, dst, type)` table at reindex (rebuilt
   from markdown exactly like FTS — iwe-grade deterministic rebuild); a recursive CTE for
   supersession chains; surface `related` in `mk_get`/`cmk get`; a `cmk links <id>
   [--depth N --direction in|out]` verb + `mk_links` MCP parity; state labels upgraded to
   name the successor (`[superseded by P-XXXX]`). Zero LLM, zero drift, no third index
   class. Also the precondition for the model ever writing MORE edges — today `links` is
   write-only, so no reinforcement loop exists. Deterministic mention-anchor co-occurrence
   edges (D-nnn / Task nnn tokens) may ride as a ~30-line byproduct, not a feature.
2. **DEFER — LLM edge derivation (Memora-style `cues:` first in line), named trigger:**
   *extend the Task-99 benchmark with a relational/multi-hop question type built from the
   real corpus (the Kiro-saga cluster + supersession-chain queries in the sweep); if flat
   hybrid + the agentic ladder scores materially below the exact/paraphrase qtypes on it,
   evaluate `cues:` frontmatter (riding the existing auto-extract Haiku call) FIRST —
   numbers decide (D-109).* Ranked behind it if cues fail: sift-kg discover-then-freeze
   (reference for typed derivation; costs a second source of truth).
3. **REJECT:** hand-authored graphs (the iwe model — auto-capture users never build note
   webs; its code confirms zero derivation); graph-DB servers (the D-64 no-server class);
   LLM-extracted typed KGs as a store (drift + non-deterministic rebuild + pulse8's
   cautionary agent-edges-only-in-graph.json data loss shape); RAPTOR summary-trees (an
   abstraction hierarchy, not relational — routed to Task 95's evaluation per D-226).

## Consequences

- Relational recall becomes the FOURTH adjacency axis beside `expand` (file), `timeline`
  (time), and `--scope decisions` (evolution) — positioned as siblings, not competing modes.
- The graph question gets a measurement path instead of a vibe path: the deferral trigger
  converts the sweep's "hybrid would answer it anyway" reasoning into benchmark numbers
  before any derivation cost is paid.
- The activation slice makes the existing `links` capability visible end-to-end, which is
  the only way to learn whether agents will actually author edges when they can see them.

## Alternatives considered

| Alternative | Why rejected |
|---|---|
| Adopt a full typed temporal KG (graphiti shape) | The kit already extracted its gems (bi-temporal → Task 66, labels → Task 209) without the graph; needs a server or reification; LLM extraction per capture |
| Memora cues NOW | Unmeasured benefit against a 0.941 baseline; capture-path token cost; the deferral trigger buys the measurement first |
| Do nothing (pure flat) | Leaves written edges invisible (D-219's inconsistency), supersession chains unwalkable, backlinks unanswerable — cheap real losses |

## Review history

| Date | Reviewer | Action |
|---|---|---|
| 2026-07-19 | the user + Claude (Task 176 sweep) | Accepted per the split verdict |
