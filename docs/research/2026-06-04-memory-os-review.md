---
date: 2026-06-04
topic: memory-os (ClaudioDrews) review — the "authoritative memory" idea + dynamic trust
source: WebFetch of github.com/ClaudioDrews/memory-os README
tags: [memory-os, hermes, recall, authoritative-memory, ground-truth, trust, D-64, Task-75, Task-97, competitive]
---

# memory-os (ClaudioDrews) — review + what to steal

> Reviewed 2026-06-04 (surfaced by the user). [github.com/ClaudioDrews/memory-os](https://github.com/ClaudioDrews/memory-os). A 7-layer "Memory OS" for the **Hermes** agent (Python 3.11+, Docker, Qdrant + Redis + ARQ, SQLite, an Icarus plugin fork, a "Vault Curator"). Hermes-specific + heavy infra — but one idea is genuinely worth stealing, and it hits the kit's weakest spot.

## The 7 layers (≈ the kit's 6, 1:1)

| memory-os layer | kit equivalent |
| --- | --- |
| 1 — markdown (MEMORY/USER/CREATIVE.md), injected every turn | L3 scratchpads + L4 inject |
| 2 — SQLite + FTS5 over conversation history | L5 FTS5 search / `cmk search` |
| 3 — SQLite structured facts + trust scoring | L2 fact files + trust + audit |
| 4 — Icarus plugin: LLM session extraction + multi-source injection | auto-extract + inject-context |
| 5 — Qdrant vector (4096d cosine + BM25), 4-level fallback | Task 65 (Layer-5b semantic recall, planned) |
| 6 — auto-curated wiki vault → Qdrant | the fact archive / dream-style curation (Task 95) |
| **7 — SOUL.md + rulebook.md = "Ground Truth hierarchy"** | **← the steal (see below)** |

So the architecture **validates the kit** (same as the Anthropic docs, D-62) — it's not new ground.

## The steal (→ Task 75): "injected memory is AUTHORITATIVE"

memory-os's central insight, verbatim: *"injecting memory is insufficient — the agent must be explicitly told injected context is authoritative, otherwise it rediscovers information already provided… Without this, layers 2-6 deliver context the agent ignores."* Their Layer 7 (`SOUL.md` + `rulebook.md`) ranks injected memory as ground truth so the agent **leads with memory instead of re-deriving.**

**This is exactly the kit's recall failure** — the cut-gate cold-open asked "which framework?" with the persona injected; D-40's "agent globs `**/*.py` instead of leading with memory." The reframe for **Task 75**: active recall is **instruction-FIRST, mechanism-second** — the lightweight high-leverage fix is an instruction (carried in `SOUL.md` / the injected snapshot / the recall skill) telling the agent the injected + searchable memory is the source of truth, lead with it, don't re-derive. We already have `SOUL.md` to carry it. **Folded into Task 75.0 as the primary lever (D-64).**

## Second steal (→ Task 97, the user wants it): dynamic trust

memory-os trust **accumulates over time** (a feedback loop — re-confirmed facts gain confidence). The kit's trust is **static at capture**. Make it a living score: bump on re-confirmation (dedup hit), downgrade on contradiction/supersede; composes with F-D + Task 66 (temporal) + §19.3 (importance-aware inject ranks by trust). **Filed as Task 97 (D-64).**

## Don't adopt — the infra

Qdrant + Redis + Docker + ARQ workers + an Icarus fork is **heavy and the opposite of the kit's stance** (lightweight, cross-platform, no-API, git-committed). Same weight class we rejected with Milvus (Windows-hostile). The kit's FTS5-default + optional `sqlite-vec` is the right call.

## Strategic

memory-os is Hermes-bound + infra-heavy, so it's not a competitor on the kit's surface. But it confirms (again) that the kit's architecture is sound, and it crystallized the **one behavioral lever** we'd been treating as a pure retrieval problem. _Relates D-62 (Anthropic — same "converge + niche" conclusion), D-40/D-35 (recall), Task 75/97, D-27 (niche)._
