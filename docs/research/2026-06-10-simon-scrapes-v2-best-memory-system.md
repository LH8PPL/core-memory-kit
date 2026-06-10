# Simon Scrapes v2 — "I Built The Best Claude Memory System (Beats Hermes)" (2026-06-10)

**Source:** <https://youtu.be/H9BUkgDf5Y4> (Simon Scrapes, uploaded 2026-06-10, 13:26).
The same creator whose earlier video ([simon-scrapes-master-claude-memory](../sources/simon-scrapes-master-claude-memory.md)) set this kit's video-parity bar (D-24/D-25).
Reviewed from the user's transcript + slide captures the day of upload — the same day the kit's v0.3.0 recall build completed (#152–#158).

## His architecture (as described)

Three-jobs framing (storage / injection / recall), cherry-picked from the same three systems the kit code-dove in D-70/D-72:

- **Storage (memsearch pattern):** Stop hook per turn → Haiku summarizes to bullets → `memory/YYYY-MM-DD.md` daily logs; SHA-256 per chunk + skip-unchanged; embeds via ONNX **bge-m3**; stored in **Milvus**; BM25 sparse vectors.
- **Injection (Hermes pattern):** frozen snapshot at SessionStart — MEMORY.md (~800 tok) + USER.md (~500 tok) + SOUL.md, **~1,300 tokens capped, prefix-cache preserved** (he rejected memsearch here: "no injection layer at all").
- **Recall (memsearch + GBrain):** tiered waterfall — Tier 0 check injected → Tier 1 **grep** `context/memory/` + `context/transcripts/` (zero LLM cost) → Tier 2 hybrid (dense + BM25 + **RRF**), `memsearch expand`; topped with GBrain's **reranker** + **written answer with citations** + "says so when missing".
- **Team roadmap (June):** one shared brain — Postgres + pgvector with **row-level security**, every row tagged by client/project, queries filtered per person's token (the GBrain "company brain").

## Convergence — strong validation

His stack and the kit's v0.3.0 are the **same architecture from the same sources**: hook+Haiku storage, the frozen capped cached snapshot, the tiered last-resort waterfall, hybrid local search, citation-backed honest answers. Independent convergence on the design the kit bet on.

## Where the kit is ahead (verified, not vibes)

1. **Backend:** he runs Milvus (a DB server) + bge-m3. The kit deliberately removed Milvus-class scaffolding (Task 120) for in-process sqlite-vec (ADR-0015), and **bge-m3 LOST the kit's bake-off on short memory facts** (R@5 0.765 vs bge-base 0.941 — D-109). He chose the bigger model on intuition; the kit measured.
2. **Trigger:** his recall trigger story is thin (the waterfall exists; what makes the agent walk it?). The kit shipped the full trigger (Task 75): authority preamble + auto-invoked read-only forked skill + per-prompt hint — the memory-os Layer-07 insight he doesn't mention.
3. **Raw tier depth:** his transcripts are **grep-only** (Tier 1). The kit's transcripts carry per-turn tool activity (104.1) and are **semantically searched** (104.2).
4. **Safety/lifecycle:** no Poison_Guard equivalent, no provenance/trust, no tombstones/audit, no caps/graduation, no doctor — and his daily logs have no retention story.
5. **The honesty layer is equivalent** — his GBrain "cited answer + admits missing" = the memory-search skill's curated-summary + citation-ids + "no recorded memory on this" contract.

## What the comparison surfaced (the kit's action items)

1. **The middle tier is a search blind spot (→ Task 126, fixed).** His PRIMARY searchable store is the Haiku daily summaries. The kit's searchable surface (verified in `listObservationSources` + the 104.2 scope) was facts + bullets (L1) and raw transcripts (L3) — `sessions/today-*.md` / `recent.md` / `archive.md` (the compressed conversation history) were **not searchable at all**. Discussed-but-never-graduated content was findable only in raw transcripts.
2. **Reranker revisit (already slotted, reinforced).** He defaults GBrain's rerank pass; the kit built one and honestly didn't wire it (no gain on the 40-entry corpus — D-109). Revisit with the grown dogfood corpus stands.
3. **Team layer (→ v0.4 candidate, the user's direction 2026-06-10):** NOT a copy of his Postgres+RLS central brain. The kit's philosophy is git-native (the repo IS the shared project brain — versioned, PR-reviewable, no server). The user's shape: **a complementary companion project** (separate repo) providing the team/ACL layer, connected to the kit through a seam — kit stays local-first and dependency-light; teams that need per-person scoping across projects/clients add the companion. Design open: what the seam is (an MCP peer? a sync target like the persona-sync git pattern? a remote scope for `cmk search`?).

## Verification status

Claims about HIS system are from his own description (transcript + slide OCR) — not a code dive; he ships it via his academy ("oneline install"), no public repo named in the video. If a repo surfaces, the D-71-style code dive applies before adopting any further detail.
