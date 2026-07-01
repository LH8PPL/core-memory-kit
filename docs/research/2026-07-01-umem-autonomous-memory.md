# U-Mem — "Towards Autonomous Memory Agents" (arXiv 2602.22406): 10 general ideas + our harvest

**Date:** 2026-07-01 · **Method:** primary-source read (PDF `pdftotext` full extract incl. appendix prompts) + arXiv abstract cross-verify ·
**Source:** Xinle Wu, Rui Zhang, Mustafa Anis Hussain, Yao Lu — **National University of Singapore** · arXiv:2602.22406v1 [cs.AI], 25 Feb 2026 · code: `anonymous.4open.science/r/code-release-456D` ·
**Driver:** the user brought this as an external source to mine for kit improvements (the D-248 external-source-ingestion workflow) ·
**Decision record:** D-251 · **Feeds:** Tasks 55, 66, 127, the G5 semantic-dedup line, + two NEW ideas (recurrence-ROI, escalate-to-user-capture).

> **Provenance correction (the "did you check?" rule):** a Facebook post the user saw
> attributed this to **Oxford** and framed it as "self-debate / ask other models / research /
> verify." The primary source is **NUS**, the framework is named **U-Mem**, and the FB summary
> omitted the paper's more novel half entirely (Thompson-sampling retrieval). Read the source,
> not the post.

---

## What the paper actually is

**U-Mem** = a training-free ("non-parametric") framework that evolves an agent's external memory
store instead of updating model weights. Two independent mechanisms:

1. **Cost-Aware Extraction Cascade** — how memory gets ACQUIRED (learn from failures via an
   escalating teacher→tools→human hierarchy).
2. **Semantic-Aware Thompson Sampling (SA-CTS)** — how memory gets RETRIEVED (utility as a
   distribution, not a scalar, to fix cold-start).

**Reported results:** HotpotQA (Qwen2.5-7B) +14.6 pts; AIME25 (Gemini-2.5-flash) +7.33 pts over
prior memory baselines (ReasoningBank / ReMe / MemRL); matches or beats RL fine-tuning (GRPO) at
~2× lower wall-clock, with no gradient access.

---

## The 10 general ideas (the article distilled, kit-agnostic)

These are the portable design *stances*, stripped of the math — the "out of the box" layer.

1. **Memory should be ACTIVE, not passive.** Don't only store what happens to appear; *seek* what's
   missing when uncertain. (The paper's whole frame — passive-vs-autonomous, Fig 1.)
2. **Learn from FAILURES, not just successes.** The biggest capability jumps come from "what I got
   wrong + the fix," not "what worked."
3. **You can't self-diagnose a failure without a correct reference.** Naïve self-reflection on a wrong
   answer *hallucinates* the cause — the agent lacks the knowledge to identify its own error. You
   need a known-correct trajectory to contrast against. ⭐ (deep constraint — see harvest #8)
4. **Escalate cost only when needed** (the cascade): self → stronger model → tools → human, and
   *measure* what fraction needs the expensive tier. They retain **99.2%** of always-use-expert
   quality invoking the human on only **23.17%** of cases (Pareto-efficient).
5. **Two memory shapes: "the recipe" vs "the gotcha."** *Global Procedural* ("here's the workflow for
   this class of problem") and *Local Corrective* ("in context X, don't assume Y, do Z"). Stored
   separately; different retrieval value.
6. **Memory value is a DISTRIBUTION, not a number.** Usefulness has a mean *and an uncertainty*. New
   facts get high variance → occasionally surfaced to *learn* their value, instead of being buried
   forever by greedy ranking (the "cold-start inequity" they name). ⭐ (see harvest #1)
7. **Measure a memory's worth by its MARGINAL contribution:** `score(with) − score(without)`, NOT
   raw task success. An easy task succeeds with junk memory; a hard task fails with good memory.
   Isolate the memory's actual effect from task difficulty ("advantage-based update").
8. **Memory follows scaling laws — IF you manage noise.** More stored experience → monotonically
   better, *no plateau* (37.8% → 52.4% as the pool grows, Fig 3) — but ONLY because the selection
   mechanism filters noise. Volume helps only if retrieval is good.
9. **Benefit is proportional to RECURRENCE of the domain** (Pearson **r = 0.888** between task
   similarity and gain, Fig 4). Memory helps most where future tasks *resemble* past ones; diverse
   one-off tasks get little benefit. **Memory is a bet on repetition.** ⭐ (strongest empirical
   result; see harvest #7)
10. **Curate, don't just append.** A periodic LLM maintenance pass over the memory pool:
    **Eliminate** (redundant) / **Consolidate** (merge specific+general) / **Refine** (generalize
    phrasing) / **Retain** (keep valuable). Treats stored memory as something to *tend*.

---

## The mechanisms in detail (the stealable specifics)

### Cost-Aware Extraction Cascade (idea #2/#4)

On a **failure** trajectory, the agent needs a *correct reference* (`τ*`) to contrast against.
It escalates only as far as needed:

- **Level 1 — Teacher LLM** (a stronger model). If it solves it, its trace is `τ*`.
- **Level 2 — Tool-Augmented Teacher** (e.g. code interpreter) if L1 fails.
- **Level 3 — Human Expert** (last resort; they proxy with Gemini-3-pro-preview for reproducibility).

Then **Contrastive Reflection** diffs the failed vs correct trace → distills into a
`⟨Title, Description, Content⟩` schema, typed as **Global Procedural** or **Local Corrective**
(idea #5). On initial *success*, it bypasses the cascade and extracts a Global Procedural memory to
reinforce. Cap: **max 3 insights per trajectory** (`max_items = 3`).

### Semantic-Aware Thompson Sampling / SA-CTS (idea #6/#7)

- Utility of memory `m` = a **Gaussian N(μ, σ²)**, not a scalar.
- **Cold-start fix:** new memories get **high variance** (a hyperparameter `η` is a "hard exploration
  switch" guaranteeing non-zero variance), so Thompson sampling occasionally surfaces them to earn
  feedback — breaking the "old memories dominate forever" self-reinforcing loop.
- **Retrieval score** fuses semantic + sampled utility: `Score(m) = (1−λ)·sim(q,m) + λ·ũ` where
  `ũ ~ N(μ, σ²)`.
- **Advantage-based Bayesian update** (idea #7): `Δ = S(with mem) − S(without mem)` cancels task
  difficulty; posterior updated via Bayesian approximation.
- Config in the paper: `λ` fusion weight, `η = 0.1` exploration constant, likelihood noise `σ² = 1.0`,
  top-k = 3.

### Published prompts (Appendix C — verified primary-source prompt engineering)

Figs 7–12 give literal prompt text. The transferable rules:
- **"Each memory must state WHEN it applies (trigger condition)."** (every extraction prompt)
- **"Prefer actionable rules over narration."**
- Failure-extraction frames it as a **decision tree**: find the "First Bifurcation Point" where the
  student diverged from the teacher; classify Type A (Global Strategy Failure) vs Type B (Local Node
  Failure) → the two memory types.
- The **maintenance prompt** (Fig 12) is the literal Eliminate/Consolidate/Refine/Retain pass (idea
  #10), incl. "a retrieved historical memory that was irrelevant this time is not necessarily
  useless — evaluate by generalizability."

---

## Our harvest — 9 landing spots

| # | Idea | Verdict | Home / trigger |
|---|---|---|---|
| 1 | Cold-start / Thompson (#6) | **VALIDATES SETTLED design §20.3** — we already chose NOT to rank retrieval by the evolving `trust_score` (BM25 + coarse enum instead), for the EXACT reason U-Mem exists to fix. §20.3 already names MemOS/MemoryOS score-ranking as the "cautionary bug." U-Mem is confirming external evidence. | Trigger-gated note: the Thompson/variance-boost mitigation matters ONLY *if* §20.3 is ever reversed (i.e. if a future task wires `trust_score` into hot-path ranking). Attach there. |
| 2 | Advantage-update (#7) | **ENRICH** — our update rule is ABSOLUTE (`+0.1`/`−0.15`); the paper names absolute rewards as noisy (confounds difficulty w/ efficacy). The `Δ = with − without` alternative is a citable refinement. | Task 66 (temporal/trust engine, v0.4.4 lane) |
| 3 | Failure→fix contrastive (#5) | **ENRICH** — 3rd independent source (after AWS AgentCore + the `bugs.md` predecessor) for a first-class error→fix memory TYPE; adds the Global-Procedural vs Local-Corrective distinction + the good/bad-contrast mechanism. | Task 55 |
| 4 | Cascade — full L1→L2→L3 (#4) | **FUTURE-DIRECTION SEED** — N/A for a single-user IDE kit today (we record what the session already produced; we don't acquire external knowledge). ON-THEME for the agent-facing line. | Task 127 (team-layer/agent-facing companion, D-119, v0.5+). Trigger: *"when the kit gains a non-interactive / autonomous-agent consumer."* |
| 5 | Cascade — user-escalation *skill* cut (#4 cut) | **NEW near-term idea** — usable in the CURRENT single-user kit: when Claude is uncertain → ask the user → **auto-capture the resolution** so it's never re-asked. The user IS the "teacher trajectory." No agent-facing dependency. | New idea near Task 55; competes for a normal lane in the 185 sweep. |
| 6 | Consolidation prompt (#10) | **TEMPLATE** — Fig 12 is a ready-made Eliminate/Consolidate/Refine/Retain prompt for the reworded-restatement dedup we deferred (our gap G5). | The G5 / semantic-dedup line (F-D). |
| **7** | **⭐ Recurrence = memory ROI (#9, r=0.888)** | **NEW — potential differentiator.** Quantifies our ENTIRE thesis *and* warns: kit value is highest for RECURRING work (same codebase/domain), near-zero for wildly-different one-off sessions. The kit could MEASURE its own recurrence and (a) tell the user how much memory is helping, (b) route capture budget toward high-recurrence domains. No surveyed product ships this. | NEW idea — needs its own research/design before a lane; parked pending the 185 sweep. |
| **8** | **⭐ Can't self-diagnose w/o a correct reference (#3)** | **NEW — reframes our capture QUALITY.** Our auto-extract reflects on a session ALONE — exactly the naïve move the paper shows hallucinates causes. Failure-lessons are structurally weak without a correct-reference contrast; in our kit that reference is usually **the user's correction**. Reframes the user-correction moment as the highest-value capture signal in the whole kit. | Enrich Task 55 + reinforces harvest #5 (escalate-to-user-capture). |
| 9 | Marginal-contribution self-pruning (#7 general) | **NEW — far-future.** The kit has no way to know if a stored memory ever actually helped (we store→inject→hope). U-Mem measures with-vs-without. A future "self-cleaning memory" could A/B its own injection to prune facts that never change outcomes. | Park with trigger: *"when the kit has a measurable per-session outcome signal to A/B against."* |

**Net:** no shipped bug; **1 validation** of a settled decision, **3 enrichments** (66, 55, G5),
**1 future seed** (127), **2 new ideas** (recurrence-ROI, escalate-to-user-capture), **1 far-future
park**, **1 reference artifact** (the appendix prompts).

---

## Why idea #1 is a VALIDATION, not a bug (the investigation)

The user asked to investigate severity before filing. Traced the v0.4.3 `trust_score` consumers:

- **`cmk search` / `mk_search`** — `ORDER BY observations_fts.rank` (BM25 keyword relevance).
  `minTrust` filters on the `trust` **enum** (`CASE o.trust WHEN 'high'…`), NOT the evolving float.
  A fresh fact surfaces on keyword match regardless of its `trust_score`. **No cold-start exposure.**
- **`inject-context` (SessionStart)** — ranks by the coarse `trust` enum, NOT `trust_score`. And it's
  a *deliberate documented* choice: `inject-context.mjs` L507-510 keeps the enum and warns that an
  index-db `trust_score` lookup + rank "= the cautionary bug." **No cold-start exposure.**
- **design §20.3** (written for Task 151, BEFORE we saw this paper) already states: *"systems that DO
  rank-and-sweep by a score (MemoryOS-LFU, MemOS-top-N) are the CAUTIONARY ones — exactly the
  Task-151 bug… wiring `trust_score` into an active hot-path sweep would drift TOWARD the documented
  bug."*

So the kit **independently reached U-Mem's cautionary conclusion and picked the OPPOSITE side of the
trade-off**: U-Mem says "rank by utility, then fix cold-start with Thompson sampling"; we say "don't
rank by utility in the hot path, so cold-start never arises." Both defensible; ours is simpler and
fits single-user-local scale. U-Mem *validates* §20.3; it does not reverse it (the "revisit SETTLED
only with new evidence" rule — this is confirming evidence).

---

## What's explicitly N/A for us (documented negative results)

- **The full teacher→tools→human cascade** as an ACQUISITION mechanism — we're not an
  external-knowledge-acquiring agent at single-user-IDE scope. Recorded as a future seed (harvest #4),
  not adopted now.
- **RL / GRPO baselines** — the paper's whole point is to AVOID parameter updates; we never had them.
  Their RL-comparison is context for "non-parametric memory can match RL," which merely reinforces the
  kit's markdown-as-truth stance.
- **The embedding model / vector store specifics** (qwen3-4B-embedding, top-k=3) — we have our own
  Layer-5b backend (sqlite-vec + local ONNX); no change indicated.

---

_Verification status: primary source read (full PDF incl. appendix) 2026-07-01. Relates: design §20
(persona/trust redesign) + §20.3 (no-score-hot-path-ranking), ADR-0016, Tasks 55/66/127, gap G5
(memory-lifecycle-map), D-251._
