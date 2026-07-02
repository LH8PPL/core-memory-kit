---
date: 2026-07-02
topic: Self-declared memory expiry (expires_at/TTL) — how the field does it; the reference set for Task 66.3's who-sets / what-fires / where-enforced decisions
source: Primary-source checks 2026-07-02 — docs.mem0.ai API reference + expiration cookbook, langchain-ai.github.io LangGraph TTL how-to; plus the in-base graphiti/letta deep-reads (2026-06-06 / 2026-06-29 notes)
tags: [Task-66, expires_at, ttl, temporal-validity, mem0, langgraph, graphiti, letta, expiry-sweep, D-163, v0.4.4]
---

# Expiry/TTL precedents — the Task 66.3 reference set

> Trigger: the user's "did you check how other projects do it so we have a reference?" (2026-07-02),
> after the assistant stated "mem0 ships TTL" from training memory. This note is the verified answer.
> **One correction the check surfaced:** the assistant's in-chat claim that mem0 "automatically
> removes" expired memories was WRONG — mem0's API reference says expired memories are **hidden
> from retrieval, not deleted** (see below). The "did you check?" rule earning its keep again.

## The three questions 66.3 must answer, and what the field does

| System | WHO sets expiry | WHAT happens at expiry | WHERE enforced |
| --- | --- | --- | --- |
| **mem0 Platform API** (verified: [add-memories API reference](https://docs.mem0.ai/api-reference/memory/add-memories)) | Caller, at `add()` time — top-level `expiration_date` (YYYY-MM-DD). No automatic/LLM-set policy. | **Hidden, never deleted**: "After this date, memories are hidden from search and get-all unless `show_expired` is true." | Read time (retrieval filters). |
| **mem0 OSS cookbook** (verified: [memory-expiration cookbook](https://docs.mem0.ai/cookbooks/essentials/memory-expiration-short-and-long-term)) | Caller — `expires_on` in `metadata` (a convention, not enforced schema). Example: an injury that "will heal in two weeks — the memory should expire too." | Nothing automatic: "Store expires_on in metadata and periodically clean up expired memories" — the DEVELOPER prunes. | Manual periodic cleanup (developer's job). |
| **LangGraph store TTL** (verified: [configure_ttl how-to](https://langchain-ai.github.io/langgraph/how-tos/ttl/configure_ttl/)) | Deployment config (`default_ttl`, minutes) + per-call override on `put`/`get`/`search`. | Deleted by a background sweeper (`sweep_interval_minutes`; no sweep configured = nothing expires). **`refresh_on_read` (default true): access RESETS the timer** — TTL-as-staleness, not declared validity. | Background sweep + read-time refresh. |
| **graphiti/Zep** (in-base: [2026-06-06 recall dive](2026-06-06-recall-deep-dive-graphiti-mem0-memoryos.md), [2026-06-29 curation study](2026-06-29-curation-cluster-code-study.md)) | Nobody declares expiry — invalidation is EVENT-driven: a contradicting fact sets the old edge's `invalid_at`/`expired_at`. | **Never deleted** — "expired stays queryable, filtered from the VIEW." | Read time (view filter), set at ingest. |
| **letta** (in-base: 2026-06-29 study) | No per-fact TTL at all. | Outdated info dropped during background `rethink_memory` whole-block LLM rewrite (sleeptime). | Background LLM pass. |
| **Our kit today** | Nobody — `expires_at` is design-defined (design §4), written by ZERO code paths (verified 2026-06-01, re-verified 2026-07-02). | The only aging is the 14-day stale-drop for `trust: medium` scratchpad bullets (age-based, not validity-based). | Consolidator (scratchpad only; fact files never age). |

## Two DISTINCT semantics in the field — don't conflate them

1. **Declared validity end** (mem0 `expiration_date`; our `expires_at`; Chandra's `Plan`-shaped facts):
   the WRITER knows at write time the fact has a shelf life ("demo scheduled Friday", "ankle heals
   in two weeks"). Enforcement = hide from retrieval after the date.
2. **Staleness TTL** (LangGraph `refresh_on_read`; our 14-day drop): nothing is declared; the system
   ages facts out by DISUSE, and access renews the lease. A cache-eviction model.

They are complementary, not competing. The kit already has #2 (scratchpad stale-drop).
**Task 66.3 builds #1** — and must not accidentally re-implement #2 under a new name.

## What this settles for 66.3 (the convergent design)

- **WHO sets: the caller/writer at write time** — the ONLY precedented path (mem0 both flavors,
  LangGraph per-call). NO surveyed system has the LLM set expiry automatically. So: an explicit
  capture-surface option is the precedented core; **auto-extract SUGGESTING an expiry for
  obviously-ephemeral facts (Plan/Event shapes) is UNprecedented** — build it as the flagged
  experimental increment, gated on live validation, not as the silent default. (The populated-path
  criterion still binds per D-169: a field nobody sets is dead weight — the explicit option must be
  wired into real writers, and the cut-gate must show it populating.)
- **WHAT at expiry: hide/filter, never hard-delete** — mem0 hides (`show_expired` recovers),
  graphiti filters-from-view-never-deletes. Matches the kit's settled tombstone/annotate-never-remove
  posture (D-163, `cmk get --include-tombstoned`). So: expired facts are excluded from
  inject + search, and the sweep TOMBSTONES (audited, recoverable) — never unlink.
- **WHERE: both read-time AND sweep** — read-time exclusion is the immediate guarantee (mem0's
  model; a sweep-only design leaves expired facts injecting until the next cron), the curate-time
  sweep is the cleanup that makes state durable (LangGraph's sweeper model). LangGraph's
  no-sweep-configured = nothing-expires failure mode is the exact trap 66.3's read-time half avoids.
- **What we do NOT take:** LangGraph's `refresh_on_read` lease-renewal — that is semantics #2
  (staleness), already covered by the scratchpad stale-drop; conflating it into `expires_at` would
  make a declared validity end silently extend on every recall (wrong for "demo is Friday").

_Relates Task 66.3 (the build this grounds), Task 66.1 (shape field — `Plan`/`Event` are the natural
expiry carriers), design §16.18 + §4 (the field's definition), D-163 (tombstone posture), D-169
(populated-path criterion), the 2026-06-06 + 2026-06-29 in-base deep-reads._
