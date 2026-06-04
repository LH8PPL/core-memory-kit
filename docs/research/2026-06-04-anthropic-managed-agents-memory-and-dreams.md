---
date: 2026-06-04
topic: Anthropic Managed-Agents Memory Stores + Dreams — primary-source capture + what to steal
source: Manual fetch of platform.claude.com/docs/en/managed-agents/{memory,dreams}
tags: [anthropic, memory, dreams, consolidation, versioning, architecture, D-61, D-62, competitive]
---

# Anthropic Managed Agents — Memory Stores + Dreams (primary source, 2026-06-04)

> Primary sources fetched 2026-06-04: [platform.claude.com/docs/en/managed-agents/memory](https://platform.claude.com/docs/en/managed-agents/memory) and [.../dreams](https://platform.claude.com/docs/en/managed-agents/dreams). Beta headers `managed-agents-2026-04-01` (memory) + `dreaming-2026-04-21` (dreams). This is the **API / programmatic-agent** memory surface — distinct from Claude Code Auto Memory (the [memory doc](https://code.claude.com/docs/en/memory), captured 2026-06-04 in D-60) and from the older API memory *tool* (research note 2026-05-21-anthropic-memory-tool.md). Relevance: it **validates D-61** (load-cap + graduation + recall) and surfaces concrete features worth stealing.

## Memory Stores — the mechanics

- **Storage:** a "memory store" = many small markdown files addressed by **path**, mounted at `/mnt/memory/` in the session sandbox; the agent reads/writes with normal file tools.
- **Injection:** **almost none** — only a *pointer* (mount path + access mode + store description + `instructions`) is added to the system prompt. **Content is read on-demand by the agent**, not auto-injected. (More on-demand than Claude Code Auto Memory, which loads the first 25 KB of MEMORY.md.)
- **Caps:** each file ≤ 100 KB (~25k tok); store ≤ **2,000 files**; *"structure memory as many small focused files, not a few large ones."* When a store fills, **new** writes fail; existing stay editable.
- **Versioning (strong):** every change → an **immutable memory version** (`memver_…`) → audit trail, **point-in-time recovery**, 30-day retention, and **redact** (scrub a historical version's content — leaked secrets / PII / deletion requests — while preserving the audit trail).
- **Concurrency:** `content_sha256` **precondition** on updates (optimistic concurrency — apply only if the stored hash still matches).
- **Scoping:** ≤ 8 stores/session; per-user / per-team / per-project stores; **`read_only`** shared-reference stores vs `read_write` per-session. Archive (one-way, read-only).
- **Security:** `read_write` default carries a prompt-injection warning (poisoned memory persists into later sessions) → use `read_only` for reference. (Same concern as our Poison_Guard + the Task-70 inject/output-defense gap.)

## Dreams — the mechanics

- **What it is:** an async job that reads **a memory store + 1–100 past session transcripts** and produces a **NEW, reorganized output store** — *"duplicates merged, stale or contradicted entries replaced with the latest value, and new insights surfaced."*
- **Input is never modified** → the output is **reviewable**; adopt it (attach to future sessions) or discard it. Safe by construction.
- Runs as its own session (streamable events), model-selectable (opus/sonnet), focusable via `instructions` (*"Focus on coding-style preferences; ignore one-off debugging notes"*). Billed per token, scales with session count. On failure, partial output preserved.

## How this maps to the kit (validation)

| Anthropic feature | Kit equivalent | Verdict |
| --- | --- | --- |
| Many small files, read on-demand | fact files + graduation + `cmk search` (D-61/§19) | ✅ converging — they go *further* on-demand |
| "Move detail to topic files" / archive-by-rename | graduation + tombstones (§6.5) | ✅ same shape |
| Dreams = re-curate from RAW transcripts → reviewable output | `weekly-curate`/`daily-distill` (in-place) | ⚠️ **ours is weaker** — see Task 95 |
| Immutable versions + point-in-time recovery + redact | tombstones + audit-log | ⚠️ **ours is weaker** — see Task 96 |
| `read_only` shared stores, per-scope stores | 3-tier (P/U/L) | ~ partial — see §16 candidate (team/breadth) |
| `content_sha256` precondition | sha1 content-addressing + locks | ~ candidate (concurrency primitive) |

**Net:** the kit's D-61 architecture is the same shape Anthropic itself ships. We are converging, not diverging — which is the right place to be.

## What's worth stealing (filed)

1. **Dream-style re-curation → Task 95 (v0.3).** The big one. Our `weekly-curate`/distill mutate in place over *derivatives*; the dream model is strictly better: re-curate from the **raw transcripts** (the D-44 lesson — classify over raw, not degraded), **resolve contradictions with latest-value** (F-D / Task 66 temporal), **surface new cross-session insights** (Task 55 patterns), into a **reviewable new output** (never destroy the input). One mechanism unifies F-D + 55 + 66 + curate.
2. **Memory versioning + redact → Task 96 (v0.3+).** Version history + point-in-time recovery + a `redact` path for leaked secrets/PII. Completes the D-61 "never lose memory" invariant (recover *any* prior state) AND closes a compliance gap tombstones don't.
3. **Scoped/read-only stores → §16 candidate (v0.4 breadth).** Per-user/per-team stores + `read_only` shared reference — the team-features lane (Task 50/55 neighborhood).
4. **`content_sha256` optimistic-concurrency precondition → §16 candidate (minor).** A clean concurrency primitive for the safe-write path.

## Strategic note (eyes-open)

Anthropic now ships **three** memory surfaces: Claude Code Auto Memory, the API memory *tool*, and these Managed-Agents memory stores + dreams. The field is moving fast and the kit risks obsolescence on the *generic* memory job. **The kit's defensible niche (D-27) is what none of these serve:** memory **committed to git** (portable, team-shareable, survives `git clone`), **cross-project persona cold-open** (the wedge), and **Claude Code-native** (hooks/CLAUDE.md/skills, no API plumbing). The play is to **converge with Anthropic's architecture** (load-cap, on-demand, dream-curation, versioning) and **double down on the git-committed/cross-project/portable niche** — not to out-build the generic memory primitive. _Relates D-27 (niche), D-61 (architecture), D-26 (the wows)._
