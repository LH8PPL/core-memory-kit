# Failure-learning field survey — who learns from failure, oracle-free or not (47 systems)

**Date:** 2026-07-01 · **Method:** two-wave multi-agent survey — enumerate from primary sources (2 self-evolving-agent survey ref-lists + a fresh arXiv/web sweep + our own cites) → triage → deep-read candidates → synthesize ·
**Driver:** the U-Mem triage (D-251) asked "does the kit learn from failure (Fig-1 ⚠️ box)?" — this answers "who ELSE does, and how, honestly" ·
**Feeds:** [ADR-0017](../adr/0017-memory-learn-loop-cross-session-runtime-judge-as-adapter.md) + [SYSTEM-MAP.md](../SYSTEM-MAP.md) · **Decision record:** D-251 (extended).

> **Honest provenance:** the FIRST pass was a 9-system CONVENIENCE sample (what we'd cloned + U-Mem's
> baselines) — the maintainer correctly challenged the denominator as unrepresentative. This note is the
> corrected FULL-FIELD survey: 79 systems enumerated, 18+9 deep-read, 29 triaged-passive. A session-limit
> killed ~11 wave-1 deep-reads + the wave-1 synthesis; wave-2 re-ran the confirmed-real subset. The
> reported tally is robust; the missing reads were the least likely to change it (see honesty note).

---

## The question

U-Mem's Figure 1 splits memory agents into **passive** (store successes, "no correct trajectory to learn
from" on failure) vs **autonomous** (learn from failure too; typed store + per-memory utility posteriors).
The kit is the passive side WITH the cross-session store→retrieve loop already built. The one missing organ
is **learning from failure**. So: *who ships that organ, and — the decisive question — do they need a
GROUND-TRUTH ORACLE (benchmark reward, unit-test pass, gold label) that a single-user session host lacks?*

---

## The honest denominator

Of **18 deep-read** systems (across both waves): **14 learn from failure, 2 partial, 2 no.** But the
load-bearing split is **oracle-dependence**, and it flips the story:

| | Count | Transferable to a session host? |
| --- | --- | --- |
| Learns from failure, **needs a benchmark oracle** | ~12 | ✗ NO — no oracle at conversation time |
| Learns from failure, **ORACLE-FREE** | ~4 | ✓ the kit's real precedents |
| Passive / store-and-retrieve (deep-read) | 4 | (baseline) |
| Triaged-passive (README/abstract-level) | 29 | count as passive |

**"Nobody ships an outcome/failure signal" was WRONG** (my original claim). But the refined true statement:
*many systems learn from failure — but almost all need a benchmark oracle the kit lacks; only a handful do
it oracle-free.*

### The ~12 oracle-gated (learn, but NOT transferable)
Fine-Mem, Memento, AlphaOPT, REMEMBERER/RLEM, Trainable-Graph-Memory, R²-Mem, SEAM, MCMA, JitRL, Reflexion,
ExpeL, MemRL, SkillRL, Evo-Memory/ReMem. Each rides a benchmark pass/fail, unit-test, gold label, or
web-page final-state to know "did that memory help." Remove the oracle and the loop can't fire.

### The ~4 ORACLE-FREE (the kit's real precedents)
- **memclaw** (caura-memclaw, code) — an agent self-reports `outcome_type ∈ {success,failure,partial}` +
  the recall IDs it acted on → `_adjust_weights` (asymmetric −0.15/+0.1, floor 0.05) → **the weight blends
  into retrieval ranking** (`base_score = sim_blend·similarity + (1−sim_blend)·weight`) → and on failure,
  LLM-synthesizes a corrective IF/THEN "rule" memory. The one system shipping the *full* oracle-free loop
  wired into ranking. (Caveat: 3 of its 6 "free passive signals" are Phase-1 stubs.)
- **Memoria** (matrixorigin, Rust/MCP, code) — **the cleanest, retrieval-integrated template.** A
  `memory_feedback` tool takes `{useful, irrelevant, outdated, wrong}`; at every hybrid retrieval,
  `final_score *= (1 + w·(useful − 0.5·(irrelevant+outdated+wrong))).clamp(0.5, 2.0)` — a `wrong` signal
  down-ranks *that* memory next retrieval, and aggregated feedback tunes a per-user weight. Oracle-free,
  self-reported, code-verified.
- **A-MemGuard** (code) — **oracle-free SET-LEVEL anomaly**: a memory whose reasoning-chain is an outlier
  vs its co-retrieved peers (LLM mutual-consistency + DBSCAN) is flagged. Maps to the kit's Poison_Guard
  lane, not ranking. (Caveat: it injects a warning, doesn't update a utility.)
- **SkillOpt-Sleep** (microsoft/SkillOpt, code) — has an oracle-free LLM-judge/rubric *fallback* tier for
  real-data (no gold label); the strong quantitative results still ride the gold/rule tiers.

### The field-wide "inert socket" anti-pattern
**letta** (`Step.feedback` thumbs-up/down), **MemOS** (`usefulness_score`, explicitly "unimplemented —
contribution entry point"), **A-Mem** (`retrieval_count`, set once, never incremented) — all ship the
utility field and **never read it back**. The kit's own `trust_score` is currently in the same state
(computed, not ranked). **ExpeL is the counter-example**: its insight count gates SURVIVAL (auto-prune at
0), not just rank — the fix for the inert-socket pattern.

---

## New signal TYPES the wider net caught (the portfolio was NOT saturated)

The 8-signal starting portfolio (tool-result, user-correction, cmk-forget, recall-miss, used-vs-ignored,
contradiction, recurrence, /goal) was expanded by:

1. **Peer-disagreement / group-consensus** (A-MemGuard) — set-level outlier vs co-retrieved neighbors;
   oracle-free, automatic. (We only had *pairwise* contradiction.)
2. **`outdated` as a distinct first-class signal** (Memoria) — staleness ≠ wrong ≠ irrelevant.
3. **Weighted blame-attribution across the recalled set** (SkillAdaptor) — split responsibility over *all*
   recalled memories for one failure (graded, not binary). Oracle-free, single-trajectory.
4. **Explicit dead-end / route-closure veto** (Negative Knowledge) — a memory whose *job* is "do NOT retry
   this route," a first-class negative constraint (not a fact that happens to be wrong).
5. **Negative-case-as-retained-exemplar** (Memento + REMEMBERER, two independent systems) — don't prune a
   failure; KEEP it and inject it as a labeled "avoid this" anti-pattern. Inverts the prune instinct.
6. **Held-out replay gate** (SkillOpt) — validate a memory edit against replayed tasks *before* committing.
7. **Rejected-edit buffer** (SkillOpt) — remember your own *rejected* edits so you don't re-propose them.
8. **Counterfactual reward gap** ΔR = with − without (Trainable-Graph-Memory) — marginal-contribution
   credit assignment (oracle-gated, but a distinct signal *shape*).

---

## The two axes (a correction the maintainer forced)

"Oracle-free" is NOT the same as "no human." Two independent axes:

- **Oracle vs no-oracle** — is there a ground-truth right/wrong verdict? (benchmark = yes; kit = no)
- **Automatic vs human** — does the signal need a *human* to produce it, or is it self-generated?

The target quadrant is **no-oracle AND automatic** (bottom-right): tool-result, peer-disagreement,
contradiction, recall-miss — the loop learns in the background, **human feedback is one optional input, not
the engine.** And the loop should be **both-polarity** (reinforce success, not just prune failure) —
though the **silent-success asymmetry** makes automatic success genuinely harder to detect than automatic
failure, so prioritize *symmetric* signals (tool-result: success↑/error↓) that fire in both directions.

---

## Honesty note

- **Evidence grading:** most deep-reads are CODE-level (grep-verified schemas/prompts); the arXiv-only ones
  (MemRL, Fine-Mem, several skill-memory papers) are PAPER-level — equations quoted, wiring unverified.
- **The lost ~11 wave-1 deep-reads** (killed on a session-limit) were mostly the skill-memory / RL cohort,
  which the read sample shows is overwhelmingly oracle-gated — so they'd deepen the "needs-oracle" pile, not
  flip the ~4-oracle-free finding. Wave-2 re-ran the confirmed-real, on-topic subset. Not silently dropped;
  named here.
- The 29 triaged-passive are README/abstract-level classifications, not code-verified — counted as "no" in
  the denominator but with lower confidence than the deep-reads.
- **The load-bearing finding is robust:** even at the most generous count, oracle-free failure-learning is
  the rare minority, and only memclaw + Memoria close the loop into *ranking* oracle-free.

_Relates: D-251, ADR-0017, SYSTEM-MAP §3/§5, design §20.3 (VALIDATED), the comparative-judgment study
(the harder sibling question), Task 55/66/95 (the organs)._
