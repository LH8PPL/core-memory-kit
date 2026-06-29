# ADR-0016 — Persona promotion: capped-recurrence gate + passive-outcome trust + demote-not-evict

- **Status**: Accepted (2026-06-29)
- **Resolves**: the Task 151 persona-promotion redesign (the D-177 cold-open holes) + folds Task 97 (dynamic trust)
- **Relates**: ADR-0002 (markdown is truth), D-154 (the v0.3.1 down-payment + direction), D-169 (no manual ritual), D-177 (the holes), D-178 (full-redesign-once), D-218 (trust-float-in-index-not-frontmatter), D-228 (this decision's log entry), the [7-system code study](../research/2026-06-29-curation-cluster-code-study.md), [design.md §20](../../specs/design.md), Task 151/97/95/66

## Context

The persona-promotion path strands durable traits before they reach the cold-open snapshot
(D-177): a form-based confidence gate (`PERSONA_CONFIDENCE_RULE`) second-classes
demonstrated-but-not-declared philosophy → review-queue → stranded; and cap-relief graduation
evicts high-trust traits to un-injected `context/memory/fragments/`. A 7-system CODE-read
(D-228 — MemoryOS/mem0/letta/langmem/memclaw/graphiti/MemOS) settled how the field actually
solves promotion + retention. This ADR records the three architectural choices that follow.

## Decision

1. **Promotion is gated by CAPPED RECURRENCE, not phrasing.** Replace
   `PERSONA_CONFIDENCE_RULE`'s stated-vs-inferred grading with `heat = min(recurrence_count,
   CAP)·W + exp(-Δh/τ)` (recency computed lazily at read; no cron, no LLM on the hot path);
   PROMOTE at `recurrence_count ≥ 3`. **The cap is load-bearing** (MemOS `min(count·w, 2)`):
   recurrence is a tie-breaker, never the driver — a noisy-trivial fact must not outrank a
   once-stated durable decision. `recurrence_count` is a frontmatter int (diffable, git-tracked);
   re-surface is detected via the existing canonical-ID (same content-hash = same fact restated).
   Explicit-imperative stays a fast-path-to-promote. _Reference: MemScheduler
   `_get_complex_importance_score` + MemoryOS `compute_segment_heat`._

2. **Trust is a SEPARATE, evolving, passive-outcome field (folds Task 97).** A `trust_score`
   float — **two fields, not one** (recurrence gates *promotion*; trust gates *protection-at-cap*;
   MemOS proves a unified capped score lets a noisy fact rank high). Event-driven: `+0.1`
   reinforce / `−0.15` dampen / **floor `0.05`** (never zero, never auto-deleted), from PASSIVE
   signals only (contradiction-queue / `superseded_by` / session-end restatement — zero `cmk`
   command, D-169). NO time-decay of the stored value. The float lives in the **rebuildable
   index, NOT committed frontmatter** (D-218 — a moving value = git-diff noise; markdown-as-truth
   keeps committed files clean). _Reference: memclaw `evolve_service._adjust_weights` +
   zero-write-path `outcome_inference`._

3. **DEMOTE-NOT-EVICT: the injected snapshot is a validity-filtered VIEW over a never-deleted
   store.** At cap pressure a high-trust persona trait is demoted out of the hot snapshot but
   RETAINED + fully addressable in `context/memory/` + DECISIONS.md — never reduced to an
   un-injected fragment, never hard-evicted. Cap-relief CONDENSES the file (git keeps the prior
   version — letta condense-not-delete), not a fragment-split; the sweep drops **low-trust AND
   long-unaccessed** first. _Reference: letta (durable tiers have no eviction path) + graphiti
   (supersede = non-destructive marking) + memclaw (archive-not-delete + weight-floor)._

## Rejected

- **Per-turn LLM-judge on the promotion hot path** (mem0's own ADD/UPDATE/DELETE judge,
  langmem/letta all-LLM-no-score). mem0 *abandoned* its judge for hash-dedup — evidence it's too
  costly/unstable; it gives no portable scoring mechanism and violates D-169. The LLM stays in the
  off-hot-path consolidation pass only (Task 95).
- **Value-blind cap sweeps** (MemoryOS LFU by access-frequency, MemOS top-N truncation). These ARE
  the Task-151 bug — they silently drop a high-trust-but-rarely-accessed fact (MemOS even
  heat-wipes spared items). Any cap-relief that isn't trust-aware re-creates the fragments bug.
- **A unified recurrence+trust score** (one field). MemOS demonstrates a unified capped score
  still lets a noisy fact rank high; keeping protection on a separate passive-outcome field
  prevents that (the maintainer's two-fields call, 2026-06-29).
- **Form-based confidence (stated-vs-inferred phrasing)** — the original gate; it's the documented
  outlier (no surveyed system grades on phrasing) and the direct cause of the D-177 stranding.

## Consequences

- **Positive:** fixes the three D-177 holes (form-gate / fragments-eviction / routing asymmetry);
  no LLM/cron on the hot path (arithmetic gate); committed files stay clean (trust in the index);
  the never-delete store + DECISIONS.md keep-superseded model compose; recurrence + supersede reuse
  existing infra (canonical-ID, contradiction-queue, `superseded_by`).
- **Negative:** two new fields touch the schema (`recurrence_count` frontmatter + index
  `trust_score`) → a migration/repair path for existing installs (defaults + reindex backfill).
- **Neutral:** Task 97 ceases to be a standalone task (ships as Task 151.6–151.8); Task 66 builds
  the full validity engine — 151 consumes only the supersede signal, not the engine.
