# ruflo (ruvnet) — counter-positioning reference + one transferable idea

**Date**: 2026-06-12 · **Source**: <https://github.com/ruvnet/ruflo> (README-level review; NOT code-dived) · **Trigger**: the user's post-v0.3.0 review sweep.

## What it is

Multi-agent orchestration framework for Claude Code (the claude-flow lineage): swarm coordination, "100+ specialized agents," AgentDB vector memory (HNSW), "SONA neural self-learning," "ReasoningBank," federation. 59k stars, ~22M npm downloads, v3.10.42 across 1,529 releases, 444 open issues.

## Assessment (README-level; apply the primary-source rule before citing ANY claim as fact)

1. **Claims-vs-substance caution.** This lineage is known for marketing-grade naming around orchestration scaffolding. 1,529 releases + 444 open issues reads as velocity theater, not maturity. Nothing here was code-verified — treat the README as unverified claims.
2. **Their benchmark validates OUR scale analysis.** "HNSW ~1.9x faster than brute force at N=20k" is a weak HNSW result — overhead dominates at that corpus size, which is exactly the reasoning behind the kit's sqlite-vec brute-force choice (ADR-0015): at memory-kit scale, simple beats clever. Their number argues for our design from the opposite direction.
3. **Opposite philosophy = counter-positioning, not competition.** Binary vector DB + worker fleet + agent swarms vs. the kit's plain markdown in git, provenance on every fact, trust levels, Poison_Guard, read-only recall. No visible git-portability or trust/audit story on their memory. The kit's "auditable memory you can read in a text editor" pitch gets STRONGER as neighbors get more opaque (same conclusion as the Simon-v2 comparison, D-119).
4. **The one transferable idea: trajectory memory** ("ReasoningBank") — capturing *successful task trajectories* as reusable memory: how something was done well, not just what was decided. Kit-shaped homes already exist: **Task 55** (behavioral pattern detection + promotion) and **Task 95** (dream-style re-curation). When those slots come, ruflo's framing is ONE input for the research pass — code-dive it then, with the verification rules applied hard.

## Verdict

No task, no design change. Counter-positioning reference + the trajectory-learning cross-link to Tasks 55/95.
