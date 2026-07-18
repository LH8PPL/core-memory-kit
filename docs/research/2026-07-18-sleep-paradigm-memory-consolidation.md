# "Language Models Need Sleep" — the Sleep paradigm, and what it lends Task 95's re-curation design

**Date:** 2026-07-18 · **Source:** arXiv 2606.03979v2 (Behrouz, Hashemi, Javanmard, Mirrokni — Google Research + Cornell; v2 2026-07-10; same first author as the Nested-Learning/Hope line it builds on). **Provenance:** the FIRST paper of the Task-95 research review — supplied by the user as an annotated PDF (from their personal knowledge-base raw folder), read in full (26 pp). _Point-in-time record._

## What the paper claims

A continual learner has no train/test split — it has **Wake** (receiving external input) and **Sleep** (no external input; internal processing only). Sleep is *not passive*: it is where fragile short-term memory becomes stable long-term knowledge. Two stages:

1. **Memory Consolidation** — the model's modules form a **frequency spectrum** (attention ≈ infinite update frequency ↔ pre-trained MLPs ≈ zero; the Continuum Memory System chains MLP blocks at intermediate frequencies, e.g. 1k → 5k → 10k steps). Fragility is **relative**: each tier is "short-term" from the next-slower tier's viewpoint. Consolidation is an **upward distillation** ("Knowledge Seeding"): the smaller/faster state (teacher) distills into newly-unlocked low-rank capacity in the slower tier (student), via on-policy distillation + an RL "Learning to Imitate" objective. Three protocol steps, in order: **compute** the prospective update → **consolidate** (validate the transfer against the pre-update teacher) → **update** (apply the new weights, reset/prune the fast tier's scratch capacity).
2. **Dreaming** — a SEAL-style self-improvement pass: generate synthetic rehearsal data ("dreams"), mix in *random* experts to explore novel knowledge combinations, select dreams by gradient-based importance, and **keep a dream only if it measurably improves the model** (reward 1/0 → ReSTEM). A regression gate on self-modification.

**Results that matter here:** class-incremental learning beats EWC/InCA/plain-Hope; **more consolidation stages monotonically improves** long-context/ICL performance (Fig 4); **making the most-stable tier update faster *hurts* retention**; continual language-learning where plain ICL collapses, Sleep-3 nearly retains single-task performance; knowledge incorporation beats SEAL; ablations show every piece (imitation, semantic reward, expansion) contributes.

## Why this paper reads like a theory paper for the kit

The kit **already ships a file-based Continuum Memory System** — it just never had this name for it:

| Paper concept | Kit organ (already built) |
| --- | --- |
| Frequency spectrum of memory modules | `now.md` (per-turn) → `today-*.md` (daily) → `recent.md` (weekly) → `archive.md` (long-term) → persona (slowest) — the [lifecycle map](../../specs/memory-lifecycle-map.md)'s tier cascade |
| Wake vs Sleep phases | Live session capture vs the cron/SessionStart-lazy distill passes (idle-time compute) |
| Online consolidation (retrieval-dependent, in-context) | The learn-loop's per-turn signals (ADR-0017 Phase 1–2): recall-log attribution, trust deltas, expectation resolution |
| Offline consolidation (re-process, abstract, integrate) | **Task 95's dream re-curation — the missing organ.** Today's `daily-distill`/`weekly-curate` are *in-place over derivatives* — the paper's explicit critique of online-only consolidation ("keeps knowledge at the same level of abstraction, no additional lossy compression; selective and retrieval-dependent; misses higher-level integration") |
| Dreaming's regression gate (keep only what improves) | The AutoMem-style regression-gated self-audit already stashed in Task 95's scope; ADR-0017's evidence-gated trust |
| Sleep-time compute on context, not weights (their Lin et al. 2025 citation) | Exactly the kit's position — the kit spends idle compute on *files*, not parameters |

## The transferable design principles (Task 95 inputs)

1. **Consolidate BEFORE the faster tier is overwritten.** The paper's scheduling invariant: a tier's knowledge must be distilled upward *before* its own update erases it. Kit mapping: the today→archive roll (lifecycle G8's lossy 7-day window) is the exact spot where the kit violates this — content not yet extracted upward is lost when the fast tier rolls. Task 95's pass should be *scheduled against the roll*, not merely periodic.
2. **Compute → consolidate → update — the transfer is validated before it is applied.** The teacher stays the authoritative pre-update state until consolidation completes; only then does the update land and the fast tier get pruned. **This is a structural argument for F1's review-gate shape**: produce the re-curated output as a *prospective* state, validate/adopt it, and only then (optionally) prune the source — the input is never destroyed before the transfer is confirmed. The Dreams "input never modified, output reviewable" model and this protocol are the same invariant at two scales.
3. **Write new knowledge into NEW capacity; never overwrite the stable store in place.** Their low-rank expert expansion (+ freeze old params) is the parameter-space version of the kit's D-61 no-loss invariant: a re-curation writes a *new* artifact; the old tiers stay put until adoption.
4. **More consolidation stages help; a fast "most-stable" tier hurts.** (Fig 4 both directions.) Validates the kit's multi-tier cascade as load-bearing (not bureaucracy), and argues Task 95's merge aggressiveness must stay conservative — the archive/persona should churn RARELY. Composes with the Memora App. F finding already in Task 95's entry (looser merge threshold → 3.4× merges, *no* quality gain): two independent sources now say **over-eager consolidation is a measured failure mode**.
5. **Self-modification needs a regression gate.** Dreams are kept only if they measurably improve performance. Task 95's re-curation should carry an analogous check — at minimum the reviewable-diff human gate (F1), optionally a deterministic before/after probe (the Task-212 stats as the cheap metric set).
6. **Synaptic pruning happens only AFTER successful transfer.** The fast tier's scratch capacity is reset *after* consolidation lands, freeing space — kit analog: post-adoption cleanup of the source tier is legitimate, but sequenced strictly after the adopt step.

## What does NOT transfer

Everything parameter-level: LoRA expert expansion, logits-level distillation, RL rewards, MoE routing. The kit is file-based by design (no fine-tuning surface, model-agnostic across four agents). The value here is **architectural grounding + scheduling/ordering invariants + empirical warnings**, not mechanism. Also note the incentive context: the paper is the Hope/Nested-Learning group extending its own line — benchmarks favor their architecture family; the kit takeaways above deliberately lean on the *ablation-supported ordering principles*, not the headline numbers.

## Fork inputs (for the F1/F2 grill)

- **F1 (review-gate vs auto-apply):** this paper is evidence FOR the gate — its own consolidation is compute→**validate**→apply, teacher-preserved-until-confirmed. Auto-apply-with-revert has no analog here; unvalidated in this source.
- **F2 (raw-transcript privacy):** neutral — their replay is internal (the model's own high-frequency memory); no external privacy dimension exists at the weight level. F2 remains governed by the kit's own screen posture (Task 216's side-door precedent).

_Relates: Task 95 (the consumer), D-62/D-44 (Dreams + classify-over-raw), the lifecycle map's tier cascade + G8, ADR-0017 (the learn-loop this composes with), Memora App. F (the sibling over-consolidation warning), Task 212 (the cheap metric set for a regression probe), D-349 (the research-review trigger this fulfills — paper 1)._
