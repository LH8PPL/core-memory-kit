---
date: 2026-07-02
topic: Contradiction-detection bake-off on the kit's OWN 1,246-fact corpus — lexical pairing dead, subject-keying trivial, live-Haiku one-pass judge 10/10 — the measured design for Task 66.2/66.4
source: Three read-only experiments on this repo's real context/memory corpus (scratchpad scripts) + one live-Haiku judge run (twice) via the kit's HaikuViaAnthropicApi backend + a live cmk search retrieval probe
tags: [Task-66, contradiction-detection, state-key, validity-windows, bake-off, D-109, D-221, D-258, haiku-judge, v0.4.4]
---

# Contradiction detection — the bake-off (real corpus, live model)

> Trigger: the user's 2026-07-02 question — *"why do you need to grill me? can't you do some
> research and test and then see what works?"* — redirecting the 66.2/66.4 design forks from
> interview to MEASUREMENT (the D-109 bake-off discipline + "the research so the decisions
> write themselves"). This note records the experiments and the design they settle.

## The three experiments

**Corpus:** this repo's own dogfooded `context/memory/` — 1,246 live fact files (real usage,
2026-06 → 07). All read-only; nothing written to the repo.

### 1. Whole-text lexical pairing (the detectConflicts approach) — DEAD END

All-pairs token-Jaccard over canonicalized title+body (~776k pairs):

| similarity | pairs |
| --- | --- |
| ≥ 0.9 | 0 |
| 0.7–0.9 | 0 |
| 0.5–0.7 | 0 |
| 0.4–0.5 | **2 — both RESTATEMENTS** (the `.venv` preference said twice; a same-day roadmap description) |
| 0.3–0.4 | 3 |

**Zero true contradictions found at any usable threshold.** The kit's existing
`detectConflicts` (scratchpad-scoped, Jaccard, default threshold ≥0.5) would find NOTHING in
this corpus. The two 0.4+ hits are the *recurrence* signal (Task 151), not conflict.

### 2. Subject-keyed grouping — the real class, at scale

Grouping by a version token in the TITLE (`v0.3.2`, `v0.4.1`, …) surfaces the actual
"contradiction" class instantly: **state-progression chains**. `v0.3.2` alone: 18 facts
marching *"scope locked" → "cut-gate in progress" → "ready to tag" → "published to npm"* —
none marked superseded, every earlier "current state" stale-but-live (the D-166 Bug-2 class,
live in our own corpus at scale). **Within-chain Jaccard: 0.00–0.21** — which is WHY
experiment 1 is structurally blind: contradicting facts share a SUBJECT, not their words.

### 3. Live-Haiku one-pass judge — 10/10, twice, $0.004

Ten real pairs (4 expected-SUPERSEDES from the chains, 2 restatement controls, 4 COEXIST
controls incl. unrelated), ONE batched `claude --print` Haiku call through the kit's own
`HaikuViaAnthropicApi`, 6-line instruction (SUPERSEDES / DUPLICATE / COEXIST with the
"is the old state still current?" framing):

- **Run 1: 10/10. Run 2: 10/10.** ~28s, ~$0.004 per 10-pair batch.
- Perfect separation of supersession from coexistence AND from duplication — the exact
  distinction no cheap heuristic in experiments 1–2 can make (same-subject facts usually
  COEXIST; only the judge tells the state-thread apart from the aspect).

### Retrieval probe (the candidate stage)

`cmk search "v0.3.2 cut-gate status"` on the repo's real FTS5 index returned 2 hits and
missed the v0.3.2 chain: the porter/unicode61 tokenizer SHREDS `v0.3.2` → `[v0, 3, 2]`, and
FTS5's implicit-AND over all query tokens over-constrains. Candidate retrieval by BM25 is
viable (high-IDF subject tokens exist) but the QUERY CONSTRUCTION is a real build-time detail:
OR-semantics over the new fact's title tokens (via the existing `prepareFtsQuery` machinery),
not a naive AND of the whole title.

## The design that falls out (66.2 + 66.4, measured not opined)

1. **Detection = candidates + judge, split by cost.** At write time: retrieve same-subject
   candidates with the kit's OWN search (BM25 OR-query over title tokens; semantic overlay
   when available) — no LLM, no new similarity infra. QUEUE candidate pairs (the existing
   conflicts-queue file, a new `temporal` kind).
2. **Judgment = ONE batched Haiku pass at the existing weekly-curate Haiku site** —
   SUPERSEDES / DUPLICATE / COEXIST (10 pairs ≈ $0.004). No new spawn on the hot path — the
   auto-extract detached child keeps its single Haiku call (the 60s-ceiling composition
   class stays untouched).
3. **Resolution = code, event-time** (unchanged from §16.18/graphiti): a SUPERSEDES verdict
   closes the OLD fact's window (`ended_at = newer.created_at`, `status: completed`,
   `superseded_by` link) — the LLM never decides which wins; `created_at` does. Never delete.
   A DUPLICATE verdict routes to the RECURRENCE bump (the 151 signal — experiment 1's two
   hits prove the classes share a pipeline). COEXIST drops the queue entry.
4. **The demo surface (66.4)** = the next SessionStart mention ("2 state updates resolved:
   v0.3.2 deferred → shipped"), consistent with the D-215 heads-up-not-gate posture — not a
   mid-turn interruption.
5. **`state_key` pivot: DERIVED, not declared.** The corpus shows subjects are recoverable
   from title tokens; a declared `state_key` frontmatter field would be another
   nobody-populates-it dead-weight field (the D-169 class, same reasoning as D-258's
   caller-set-expiry finding). §16.18's window ARITHMETIC is unchanged; only the detection
   input changes (search+judge instead of a literal key match).
6. **Tension-holding (captain-claw, D-221): CLOSED with a negative result.** 1,246 real
   facts contain ZERO genuine simultaneous-disagreement pairs (the only high-similarity pairs
   are restatements; the chains are progressions where latest-wins is simply correct).
   Latest-wins stands for State facts. Re-open only if the judged queue ever produces a
   real "COEXIST but conflicting" class in live use.

## Honesty notes

- The 10/10 judge sample is small (n=10, one corpus, one project type); the batched-judge
  build must keep the verdicts observable (queue entries + audit) so live use extends the
  sample. A wrong SUPERSEDES closes a window (recoverable, annotated) — it never deletes.
- The ground-truth labels are the assistant's own reading of the pairs (careful, but
  single-grader); the pairs are listed in the scratchpad script for re-grading.
- This corpus is a DEV-project corpus (state-heavy, release-driven); a prose-heavy personal
  corpus may have different contradiction shapes.

_Relates Task 66.2/66.4 (the build this settles), D-109 (bake-off discipline), D-221 (closed),
D-258 (sibling verified-reference method), D-166 (Bug 2 — the acceptance case), design §16.18,
the 2026-06-29 curation-cluster verdicts (graphiti one-pass + event-time-wins, now
corpus-confirmed)._
