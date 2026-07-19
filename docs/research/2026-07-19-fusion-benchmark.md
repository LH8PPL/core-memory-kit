---
date: 2026-07-19
topic: Task 178 — hybrid-fusion benchmark (RRF vs weighted-sum vs temporal decay vs title-only embedding) on the Task-99 harness
source: Cloned code (pro-workflow, captain-claw) + a scratch experiment harness over the kit's REAL search machinery + the Task-99 corpus (40 entries / 17 queries)
tags: [recall, fusion, benchmark, D-360]
---

# Fusion benchmark (Task 178) — verdict: KEEP-CURRENT, with numbers

## The characterization that settled the headline question without a benchmark

The task's premise was "pro-workflow uses RRF, which MAY rank better than our current merge."
Reading both implementations side by side:

- **pro-workflow** (`src/search/embeddings.ts:128`): plain RRF —
  `scores.set(key, (scores.get(key) || 0) + 1 / (k + i + 1))`, `k = 60`.
- **The kit** (`search.mjs::reciprocalRankFusion`, design §9.3): the SAME formula with
  weights — `weight_b / (k + rank_b)`, `k = RRF_K = 60`, weights 0.5/0.5.

With equal weights, scaling both lists by 0.5 preserves the ranking exactly — **the kit's
hybrid IS textbook RRF k=60**. "Adopt RRF" is a no-op; the real question was whether any
ALTERNATIVE beats it.

## The measured alternatives (same corpus, same real `search()` + embedder, brute-comparable)

Baselines from `npm run bench:recall` (2026-07-19): keyword 0.176 R@5 · **hybrid 0.941 R@5 /
1.000 R@10 / 0.860 NDCG@10** · hybrid-rerank 0.941/1.000/0.816.

| Variant | R@5 | R@10 | NDCG@10 | Verdict |
| --- | --- | --- | --- | --- |
| **current (RRF k=60, .5/.5)** | 0.941 | 1.000 | 0.860 | the bar |
| RRF k=20 | 0.941 | 1.000 | 0.860 | tie |
| RRF k=10 | 0.941 | 1.000 | 0.860 | tie |
| weighted-sum RAW (captain-claw 0.65/0.35, unnormalized) | 0.941 | 1.000 | 0.860 | tie (the Elastic scale-mismatch warning didn't bite at this corpus scale — semantic scores dominate consistently, so the bias is stable) |
| weighted-sum min-max-normalized | 0.941 | 1.000 | 0.860 | tie |
| **RRF × 21-day-half-life decay** (captain-claw) | **0.294** | 0.647 | 0.318 | **actively harmful** |
| weighted-norm × decay (rank-approximated) | 0.941 | 1.000 | 0.758 | NDCG loss |

Per-qtype on the decay run: paraphrase R@5 collapses 0.900 → **0.000** — the decay buries
old-but-still-true facts (a 2-month-old "we standardized on pnpm" is exactly what recall
must return). **Age is the wrong penalty signal; SUPERSESSION is the right one** — which is
what Task 66's validity windows + the Task-209 state labels already implement. Decay-on-score
is REJECTED with the mechanism named, not just the number.

## The Memora experiment: title-only vs content embedding (semantic-only, brute cosine, same model)

| Embedding input | R@5 | R@10 | NDCG@10 |
| --- | --- | --- | --- |
| content (current) | 0.941 | 1.000 | 0.848 |
| title only | 0.882 | 0.941 | 0.750 |

Title-only **loses on every metric** — the calibrated expectation from the Memora note held:
their 0.653→0.795 abstraction-layer jump exists because Mem0-style fragmented facts embed
noisily; the kit's rich facts don't fragment, so throwing away body signal only loses. REJECTED.

## Honest bounds

- The corpus is small (40 entries / 17 queries) — the across-the-board tie among RRF-k
  variants and weighted-sum says the fusion stage is NOT the recall bottleneck at kit scale;
  it does not prove the variants are equivalent on a 10k-fact corpus. Re-open only with a
  bigger corpus AND an observed ranking failure attributable to fusion.
- The cross-encoder rerank stage was not re-benchmarked (the shipped `hybrid-rerank`
  pipeline's D-72 deterministic rerank scores 0.860→0.816 NDCG — already reported separately
  by the bench; a learned cross-encoder remains unexplored, deliberately: no failure signal
  points at ranking).

## Verdict (D-360)

**KEEP-CURRENT.** The kit already ships the method the task proposed adopting; every
measured alternative ties or loses; the one philosophically-tempting addition (temporal
decay) is demonstrably the wrong mechanism where the kit's validity windows are the right
one. No production change. The experiment harness lives in the session scratchpad (research
artifact, not shipped); the numbers + method are recorded here for the next re-open.
