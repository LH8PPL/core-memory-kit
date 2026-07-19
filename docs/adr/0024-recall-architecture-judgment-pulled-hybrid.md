---
adr: 0024
title: Recall architecture — keep judgment-pulled as the deep spine; close the under-fire risk with a gated cheap-index pointer hint + existence advertisement (the composed hybrid)
status: accepted
date: 2026-07-19
deciders:
  - the maintainer (research directive "do the research broadly")
  - Claude Fable 5
supersedes: null
superseded_by: null
related:
  - 0023-graph-recall-activate-edges-defer-derivation.md
tags:
  - recall
  - trigger
  - architecture
---

# ADR-0024 — Recall architecture: the judgment-pulled hybrid, composed

## Status

**Accepted** 2026-07-19 (Task 149; D-362). Research basis: the
[recall-trigger architecture study](../research/2026-07-19-recall-trigger-architecture-study.md)
— 15 systems code-verified + 4 closed products docs-level + the same-day
[Letta deep-read](../research/2026-07-19-letta-deep-read.md).

## Context

The kit's recall is judgment-pulled: a frozen SessionStart snapshot, a STATIC per-prompt
hint line, and a `memory-search` skill the model must decide to fire. The v0.3.1 cut-gate
showed the skill under-firing (D-153 fixed the trigger description); the architecture
question remained: is judgment-pulled right, or should recall move toward always-search or
wider injection?

What the study established:

- **The recall model follows loop ownership.** Systems owning their chat loop pipeline
  retrieval (MemoryOS, MemOS, mem0-proxy, Memora, captain-claw); MCP-server systems are
  structurally judgment-pulled (a tool description is their only trigger surface); and every
  system in the kit's exact position — a Claude Code plugin with hooks AND tools (memsearch,
  claude-mem, pro-workflow) — converges on the kit's hybrid shape.
- **The one true per-prompt semantic injection in the kit's position ships default-off** —
  claude-mem built it and labeled it "experimental, disabled by default"
  (`SettingsDefaultsManager.ts:142`).
- **Memora validates the LADDER, not the trigger:** its policy retriever (EXPAND/RE_QUERY/
  STOP) beats one-shot top-k (0.863 > 0.825 at ~98% fewer tokens) — but its retrieval START
  is unconditional. The kit's skill ladder IS a prompted policy retriever.
- **"The model decides" is a documented failure mode** in the kit's own history (D-40,
  D-153) — and nobody in the field benchmarks the trigger, only the retrieval.
- **Letta's trajectory** (the canonical tool-driven system): archival tools deprecated, the
  pushed/in-context surface growing, with recall scaffolded by doctrine + tool-strategy +
  an existence-advertisement metadata block. Pure agent discretion was insufficient even there.

## Decision

Keep **judgment-pulled as the deep-recall spine** and close the trigger's under-fire risk
with three composed additions (each proven separately by a surveyed system; no one has
composed them):

1. **Gated cheap-index pointer hint (the pro-workflow half):** upgrade `buildMemoryHint`
   from a static line to a real FTS5 query over the prompt's terms (≥ ~20-char gate) —
   inject up to 3 INDEX LINES (id · title · date, never bodies) when the top hit clears a
   bm25 score floor (the graphiti `reranker_min_score` pattern), plus the skill pointer;
   fall back to the static hint below the gate. Zero LLM/embedding on the hot path;
   composition-gated on the hook latency budget and the D-122 skill-fire-rate trend.
2. **Existence advertisement (the Letta borrow):** the SessionStart snapshot gains a live
   metadata line — fact count, available scopes, last-write recency — so the model knows
   what there is to search before deciding.
3. **In-skill refinements (the Memora borrows):** relevance-scoring survivors 1–3 and
   fetching bodies only ≥2; hits sharing a `source_file` → one `expand`, not N bodies
   (episodic grouping); the RE_QUERY relative-answer rule ("same college as Sarah" →
   re-query the referent).

Optional fourth surface, deferred until the above are measured: claude-mem's
PreToolUse:Read file-context trigger (facts whose `source_file` is being read, mtime-gated).

**Explicitly rejected:** per-prompt SEMANTIC injection (the position-peer that built it
ships it off; embedding latency on every turn incl. "ok" turns; the filtering tax every
always-search system pays) and inject-everything (claude-remember's cap-bound dead end).

## Consequences

- The hint upgrade + advertisement become a build task on the recall surface (v0.6.x
  rider), with the D-122 trend gate as its measurement.
- The skill ladder's SKILL.md absorbs the three in-skill refinements (a docs-only change
  riding the same task).
- The trigger finally gets an instrument: hint-with-evidence vs static-hint fire rates in
  the recall log.

## Alternatives considered

| Alternative | Why rejected |
|---|---|
| Always-search (pipeline retrieval per turn) | The kit doesn't own the loop; peers that do own it pay a filter tax + latency; the position-peer implementation ships default-off |
| Inject-everything | Recall quality capped by the snapshot budget (claude-remember's shape); the kit's snapshot is deliberately bounded |
| Pure status quo | Leaves the documented under-fire risk (D-40/D-153 class) uninstrumented and unmitigated |

## Review history

| Date | Reviewer | Action |
|---|---|---|
| 2026-07-19 | the user + Claude (Task 149 study) | Accepted |
