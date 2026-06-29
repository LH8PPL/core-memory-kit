# Curation-cluster code study — 7 memory systems, the persona/trust/re-curation mechanisms

**Date:** 2026-06-29 · **Method:** deep CODE-read (not note-summaries) of 7 cloned repos ·
**Driver:** the Task 151 persona-promotion redesign (v0.4.3) + its cluster (97/95/179/180) ·
**Decision record:** D-228 · **Feeds:** [`design.md` §20](../../specs/design.md) (the canonical
design) + [ADR-0016](../adr/0016-recurrence-promotion-passive-trust-demote-not-evict.md).

> Systems read at code level: **MemoryOS** (BAI-LAB), **mem0**, **letta**, **langmem**,
> **caura-memclaw**, **graphiti**, **MemOS** (MemTensor). All cloned to
> `C:\tmp\deep-survey\`. This supersedes the README-level reads in the 2026-06-06 recall
> deep-dive + the 2026-06-14 persona-promotion note for these specific mechanisms.

---

## Headline

Every system that hit scale converged on **never-delete + status-flip**; **recurrence
(capped) earns promotion**; **trust moves on outcome events, never on a clock.** The two
systems with value-blind cap sweeps (MemoryOS LFU, MemOS top-N) demonstrate **the Task-151
bug itself** — a high-value-but-rarely-accessed fact silently dropped — so they are the
anti-pattern, not the model.

## Cross-system table

| System | Promotion signal (code) | Trust over time | Eviction / what's protected | Bg loop |
| --- | --- | --- | --- | --- |
| **MemoryOS** | Heat threshold `α·N_visit + β·L + γ·exp(-Δh/24) ≥ 5.0` (`mid_term.py::compute_segment_heat`) → `_trigger_profile_and_knowledge_update_if_needed` runs an LLM persona REWRITE (`merge=False`). Heat (not an LLM) decides promotion. | heat dynamic; `N_visit`/`L` monotonic, only recency decays; hard reset post-promote (`N_visit=0`, pages `analyzed=True`) | **value-BLIND LFU** (`evict_lfu()` by access-frequency, ignores heat) + FIFO deques (knowledge `maxlen=100`). Protection = promote-to-higher-tier-FIRST, nothing exempt. **CAUTIONARY** | inline on write path, heat-gated |
| **mem0** (OSS) | none (flat namespace = scope-at-write). *Abandoned* its per-fact ADD/UPDATE/DELETE LLM judge for `md5` hash-dedup + ADD (`ADDITIVE_EXTRACTION_PROMPT`) | static (decay platform-only, disabled OSS) | no cap (unbounded); only a 10-msg recency buffer; `_delete_memory` hard-delete + `db.add_history(...DELETE, is_deleted=1)` side-log | none (synchronous) |
| **letta** | pure LLM judgment (agent calls `core_memory_append/replace`, `rethink_memory`; docstring-steered) | static; no heat/trust field | **durable tiers have NO eviction code path** — core-memory cap → the WRITE RAISES → agent condenses; archival "persists indefinitely". Only the chat buffer ages (oldest 30%). **CLEANEST Move-2 precedent** | sleeptime agent, turn-gated `% N` (`sleeptime_v2.py`) |
| **langmem** | pure LLM judgment ("strengthen based on reliability and recency" = PROMPT TEXT, not code) | static; "recency" only biases query window | no cap/sweep; single-doc patch-in-place (`manage_user_profile`) | `ReflectionExecutor`, debounced |
| **caura-memclaw** | **trained-trust** (`evolve_service.report_outcome`) + Forge recurrence gate (`≥3 traces, ≥3 distinct agents`) | **EVOLVING** — asymmetric event-driven `+0.1`/`−0.15`, **floor `0.05`** (`_adjust_weights`); NO time-decay of the value | **never live-evicts**: weight-FLOOR + archive-not-delete + `crystallized_from` provenance; stale REPORTED, never reaped | cron-gated Forge/crystallizer, zero write-path cost |
| **graphiti** | none (one tier; temporal status only) | static value, binary live/expired set by EVENT-time | **never evicts, never caps**; supersede = non-destructive marking (`resolve_edge_contradictions`: `invalid_at`/`expired_at`, never delete); expired stays queryable, filtered from the VIEW | none (inline-on-ingest) |
| **MemOS** | capped recurrence blend (`_get_complex_importance_score`: sort 0.9 + kw 0.05 + `min(count·w, 2)` 0.05) | monotonic-up `recording_count`, NO decay, hard reset-to-1 on spared-miss | **top-N-by-importance truncation; NOTHING exempt** (even heat-wipes spared items). **CAUTIONARY** | async `MemScheduler`, 30 s `timed_trigger` |

---

## The verdicts (what to adopt)

### Promotion signal (Task 151) — capped recurrence, NOT pure LLM, NOT trained-trust

- **frequency×recency (heat):** MemoryOS + MemOS — real arithmetic, both CAP recurrence's weight.
- **pure LLM judgment:** mem0/letta/langmem — "strengthen" is *prompt text*; no portable scoring mechanism, and mem0 *abandoned* its judge for hash-dedup (evidence it's too costly/unstable).
- **trained-trust:** memclaw — needs an `outcome` event we lack single-user; Forge's `≥3 distinct agents` diversity gate collapses with one user.

**→ Copy MemOS's capped blend + MemoryOS's lazy recency.** `heat = min(count, CAP)·W + exp(-Δh/τ)`,
recency computed at read. The **cap is load-bearing**: recurrence is a tie-breaker, never the
driver. Threshold = 3 (memclaw, diversity dropped). Frontmatter int — deterministic, diffable,
zero API, no cron, no LLM on the hot path. Reference name: MemScheduler `_get_complex_importance_score`.

### Eviction / retention (Task 151 Move 2 — the fragments bug) — DEMOTE-NOT-EVICT

**Near-unanimous: exempt the durable tier; the snapshot is a VIEW over a never-deleted store.**
- **letta:** durable tiers have NO eviction path; cap → write raises → agent *condenses* (the cleanest precedent).
- **memclaw:** weight-floor + archive-not-delete + `crystallized_from`.
- **graphiti:** never evicts; supersede = non-destructive marking; expired stays queryable.
- **mem0/langmem:** no cap, so no protection problem (and no precedent).
- **MemoryOS/MemOS:** value-blind sweeps = **exactly the Task-151 bug** — don't replicate.

**→** A high-trust persona trait under cap pressure is **demoted out of the hot snapshot but
RETAINED + addressable** in `context/memory/` + DECISIONS.md — never an un-injected fragment,
never hard-evicted. At cap, **condense** the file (letta; git keeps the prior version), don't
fragment-split. The sweep drops **low-trust AND long-unaccessed** first.

### Trust dynamics (Task 97, folded → 151.T) — event-driven, floored, passive

Static in 5 of 7; only memclaw genuinely evolves, and it's the right model.
**→** asymmetric `+0.1`/`−0.15`, floor `0.05`, **event-driven not clock-driven**, from PASSIVE
signals (terminal-restatement / contradiction / supersession — memclaw's `outcome_inference` is
zero-write-path/on-demand). NO time-decay of the stored value. **Two fields, not one** (the
maintainer's call): recurrence gates *promotion*, trust gates *protection* — MemOS proves a
unified capped score still lets a noisy fact rank high. Reference: `evolve_service._adjust_weights`.

### Re-curation (Task 95) — ADD / UPDATE-in-place / SUPERSEDE-mark (never DELETE)

mem0 `md5` hash-dedup floor (free, no LLM) → graphiti `resolve_edge` contract (one LLM pass
returns duplicates + contradictions; *"NEVER duplicate across numeric/date/qualifier
differences"*; **which-wins decided by event-time, not the LLM**) → archive-with-provenance
(memclaw `crystallized_from`). Reject mem0's contradiction-as-link + DELETE-judge.

### Background loop (Task 179) + skill-synth (Task 180)

- **179 — ADAPT:** letta sleeptime (turn-gated `% N`) + MemOS `timed_trigger` for the idle gate;
  wire to the Stop-hook/idle (debounced like langmem's ReflectionExecutor), NOT cron. Zero write-path cost.
- **180 — ADAPT:** memclaw Forge is the only real memory→skill pipeline (cluster→gate→distill→
  fingerprint→earn-it). Collapse the diversity gate (single-user); keep the recurrence gate + the
  `fp:v1:sha256(...)` dedup-identity.

## Steal 3 / Don't 2

**STEAL:** (1) capped-recurrence promotion (MemOS + MemoryOS) — arithmetic, no LLM/cron;
(2) asymmetric clamped-with-floor trust from passive signals (memclaw); (3) non-destructive
supersession + archive-with-provenance (graphiti + memclaw) — fixes Move 2 AND maps onto DECISIONS.md.

**DON'T:** (1) value-blind cap sweeps (MemoryOS LFU / MemOS top-N) — *that IS the bug*;
(2) per-turn LLM-judge on the hot path (mem0 abandoned it; violates D-169) — keep the LLM for the
off-hot-path consolidation pass only.

---

_Full per-system code reads (functions, formulas, prompts quoted) are in the workflow output
archived at `C:\cut-gate-backups\task-151-design-restructure\7-system-code-study.json.bak`._
