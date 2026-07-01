# Earned comparative judgment — can a memory system KNOW "method A > method B" oracle-free?

**Date:** 2026-07-01 · **Method:** mine the skill/procedural-memory cohort (10 systems that store STRATEGIES not facts) for HOW they earn "A>B" + study the open question from 4 outside lenses (preference-learning/RLHF, cognitive-science-of-skill, bandits/online-experimentation, scientific-method/epistemics) → synthesize ·
**Driver:** the maintainer's question — *"even learning that one way is better than another… we don't really know, that is what learning is about."* The failure-survey answered "does the loop update on outcomes"; THIS asks the harder sibling: "can the loop form a COMPARATIVE JUDGMENT about method, oracle-free, from observation?" ·
**Feeds:** [ADR-0017](../adr/0017-memory-learn-loop-cross-session-runtime-judge-as-adapter.md) + [SYSTEM-MAP.md §5](../SYSTEM-MAP.md) · **Decision record:** D-251 (extended).

---

## The distinction that makes this hard

The kit stores **facts** ("the port is 8000") and **preferences the user TOLD us** ("I prefer uv"). A
**judgment** is different in kind: "we tried X, then Y, Y worked better, here's why" — a conclusion you
*reach* by doing, comparing, and inferring. Not told; *earned*. That's learning in the real sense:
try → compare → reflect → infer. The output is a judgment, and it has to carry how much it actually knows.

---

## The headline (honest, and it confirms the maintainer's suspicion)

**Earning a verified "method A > method B" is:**
- **SOLVED with an oracle** — re-run both, check the result. Rigorous, reproducible. Needs a re-runnable
  task + a checkable outcome.
- **PARTIALLY solved oracle-free WITH replay or scale** — self-contrast over k replays of the same query
  (ReasoningBank/MaTTS), or a consistency-graph over many overlapping pairwise verdicts (Bradley-Terry/TCR).
- **UNSOLVED oracle-free at single-user / single-arm / non-replayable / low-n scale** — *the kit's exact
  regime.* Nobody does this cleanly. "We don't really know" is the correct answer; the evidence supports it.

**Cohort verdict (10 skill-memory systems):** ZERO earn a verified A>B oracle-free from a single
non-repeatable trajectory. Six cheat with a benchmark (SkillRL, SkillRevise, SkillAdaptor, AlphaOPT, ExpeL,
Voyager); two delegate to an LLM-judge or refuse to rank (AWM, GEPA); the two genuinely oracle-free ones
either need same-task *replay* (ReasoningBank-strong) or quietly answer the easier question — "did this
attempt pass its OWN checklist" (MUSE, which explicitly defers contrastive A>B learning to future work).
The earned-comparative-judgment result in this literature is overwhelmingly **oracle-bound**, and where it
isn't, it's because the system answered an easier question.

---

## Why it's structurally unsolved (four lenses converge)

1. **The single-arm problem** (the fundamental causal obstacle). A live session runs method A; method B is
   the road not taken. You never observe both counterfactuals for the same turn → "B would have been worse"
   is unfalsifiable, and preference learning's `(prompt, chosen, rejected)` pair simply doesn't exist. The
   kit observes ONE arm per episode; earning A>B needs TWO.
2. **The scale floor.** Bandit best-arm-ID needs ~Δ⁻²·ln(1/δ) pulls *per arm* (hundreds for a modest gap);
   Bradley-Terry/TCR need n≥4–8 overlapping comparisons per item; industrial preference sets are 10⁴–10⁵
   pairs. A single user emits *dozens of durable method-verdicts per YEAR*, each near-unique in context. Any
   "A>B" from 1–3 episodes is a small-sample point estimate dressed as a judgment.
3. **The silent-success asymmetry.** A good silent recall leaves NO trace; failure leaves a
   correction/re-ask/red-test/forget. The oracle-free signal stream is almost entirely negative → the kit
   can prune far more reliably than it can promote, and "A is better" is a *promotion* claim — the direction
   it's WORST equipped to earn.
4. **The self-judge circularity ceiling.** The kit's only always-available rater is the same model that
   produced the method. Measured self-preference bias is 10–25%; self-confirmation compounds errors instead
   of cancelling them. Without a second independent rater, any model-generated A>B is the model agreeing
   with itself.

---

## What IS transferable (kernels, each honestly capped)

None "solve" oracle-free comparative judgment. Each is a bounded, honest partial:

- **PROPOSE oracle-free; ADJUDICATE only if you can; else store PROVISIONAL** (the GEPA/SkillAdaptor split,
  downgraded). Reflection over a failed session can *propose* "A would have beaten B here, because X" with
  no oracle. The kit can always do this. It usually *cannot* adjudicate (re-run + score). Kernel: mint the
  proposal, tag it `provisional`, let the kit's EXISTING disinterested signals (user-correction, forget,
  tool-result, re-ask, contradiction) be the only thing that PROMOTES it or PRUNES it. Limit: promotion is
  slow and mostly one-directional; a proposal may sit provisional forever if the situation never recurs —
  that's honest, not a failure.
- **PRE-REGISTER THE EXPECTATION; store the PREDICTION-ERROR, not the verdict** (the cognitive-science
  kernel — highest leverage). Before committing to a method, record a one-line *expected* outcome ("this
  should make the test pass"). Next turn, the kit's automatic signals resolve it hit/miss; the memory
  written is the DISCREPANCY. Converts a bare fact into an earned judgment with NO oracle and NO human grade
  — the reference was self-set, the observation is automatic. Limit: no pre-registered expectation → no
  better-than claim allowed; the expectation must be specific + checkable (vague ones always look "met" —
  illusion of competence); only prediction-MISSES are trustworthy (met predictions nudge, never lock).
- **REVERSAL (A/B/A) is the single strongest oracle-free signal a lone user emits** (N-of-1 +
  delayed-dueling). User tries A, switches to B, reverts to A and stays → the effect reversed with the
  treatment, within-subject, no oracle. A genuine causal signal a single non-replayable stream CAN produce;
  maps onto the dead-end-veto / rejected-edit signals. Limit: rare; must not be confounded with
  context-drift (flag the confound, don't assume causation).
- **CYCLE = contradiction-flag, NOT a noise-delete** (the honest inversion of TCR at tiny-n). At scale,
  transitivity denoising deletes cycle edges as measurement error. At n≈2, a cycle (A>B, B>C, C>A) is more
  likely GENUINE multi-criteria intransitivity (A faster, B simpler, C portable — no total order) than
  noise. Kernel: reuse the kit's EXISTING contradiction machinery on method-preferences — a cycle → surface
  "these are context-dependent, which criterion matters?" to the user. Detecting "there is no single better"
  IS a valuable earned judgment. Limit: a detector, not a resolver; hands the fork to the human.
- **CONFIDENCE-GATE promotion; store n + `provisional` on every judgment** (bandit + N-of-1 — makes the
  scale-floor a FEATURE). Never surface "A>B" as settled from few episodes; store it with its replication
  count, promote only past a threshold with a CONSISTENT direction, tag low-confidence explicitly. Limit:
  doesn't earn confidence the data lacks — it PREVENTS the lie of unearned confidence, which is the
  realistic single-user win. Most judgments stay provisional; that's the correct state.
- **Utility GATES SURVIVAL, not just rank** (ExpeL — already in ADR-0017(c)). A judgment whose evidence log
  accumulates failures becomes a PRUNE candidate, not an inert low number. Limit: pruning is the reliable
  direction; do NOT symmetrically "promote at ceiling" on silent successes.
- **Windowed decay — a judgment EXPIRES** (non-stationary bandits). An "A>B" earned before a tooling pivot
  is stale; a user-correction that reverses a prior verdict is a change-point that resets it. Limit: for a
  single user, the window short enough to track drift is too short to be statistically powerful — decay is
  an honesty mechanism, not a precision one.

---

## The memory SHAPE for an earned judgment (markdown-native)

A plain fact is a flat assertion; a judgment must carry its comparison, baseline, evidence-count,
confounds, and confidence — so it can be REVISED and never lies about how much it knows.
`context/memory/judgment_<slug>.md`:

```markdown
---
type: judgment
id: L-XXXXXXXX
claim: "for <task-shape T>, method A preferred over method B"
baseline: B                    # the fixed reference — NEVER an absolute "A is good"
status: provisional            # provisional | corroborated | contested | retracted
n_episodes: 3                  # READ AS REPLICATION, not reinforcement
direction_consistent: true
confounds: [time-drift, different-files]   # flagged, not hidden
outcome_horizon: short
decays_after: 2026-10-01       # a judgment EXPIRES; codebase drift invalidates it
trust_score: 0.55              # gates survival at floor (ExpeL), not decorative
---

## Claim
For T (e.g. "large-file refactor"), **A > B**.

## Evidence (the earned part — append-only outcome log)
- 2026-06-02 · predicted: file <300 lines · observed: passed · method A · HIT
- 2026-06-14 · tried B · user reverted to A next turn · REVERSAL (strongest oracle-free signal)
- 2026-06-28 · A recalled, no failure fired · WEAK-POSITIVE (silent success — nudge only)

## Cycle / contradiction flag
none   # if C>A appears while A>B & B>C hold → status: contested, surface to user, do NOT auto-pick
```

This is a natural extension of the existing fact file + `trust_score` + DECISIONS.md journal — the judgment
file IS a DECISIONS.md entry given an evidence log and a confidence stamp.

---

## The scale tension — and why it IS the agent-host argument

Earning a VERIFIED A>B structurally requires more episodes + a better judge than a single-user IDE host
supplies (all four lenses agree on the floors). **This loops back exactly to ADR-0017's agent-host
reframe:** the denominator that matters is per-project-*lifetime* across all episodes, not per-session — and
a MORE AGENTIC host (an SRE agent: alert→act→log→next-alert, 24/7) supplies BOTH (a) more episodes per unit
time AND (b) a richer, more automated judge (a monitor ≈ an oracle). **The same architecture that closes the
failure-loop also raises the episode count and judge quality — the two things the scale floor demands.** So
"earn better-than" is a REASON to pursue the agent-host arc, not a feature to expect from the IDE alone. The
comparative-judgment question and the cross-session-runtime thesis are the same system seen from two ends.

---

## Next move (honest)

1. **READY NOW (one task):** "Provisional method-judgment record + expectation pre-registration" — the
   `type: judgment` file + a pre-action expectation note the EXISTING passive signals resolve hit/miss. Ships
   an earned-judgment SHAPE with no new oracle. Automatic-path criterion (D-169): the judgment + evidence-log
   entry happen with NO manual `cmk` command (Stop hook / auto-extract). This is the ONLY genuinely-ready
   move. → filed as a task in the Task 185 sweep.
2. **ADR LINE (append to ADR-0017):** earning COMPARATIVE judgment is a strictly harder,
   mostly-unsolved-oracle-free problem DISTINCT from the failure-signal portfolio; the kit stores
   method-judgments as PROVISIONAL, human-flaggable proposals; prunes on disinterested failure, promotes
   slowly, never auto-commits a model self-preference to a hard ranking. Extends §20.3: a blended rank must
   gate on CONFIDENCE (n_episodes + direction-consistency), not just similarity ⊕ trust.
3. **NOT READY (name the prerequisite):** a verified A>B ranking that changes retrieval order — blocked by
   the scale floor (IDE) + self-judge circularity (no independent rater). Prerequisite = the agent-host
   direction (Task 50/127). Do NOT build "rank by learned method-preference" for Claude Code and call it
   earned — that's the exact cheat this study warns against.
4. **DEEPER STUDY (deferred, named trigger — D-248):** "same-task replay for the kit" — the one thing that
   unlocks ReasoningBank-strong self-contrast oracle-free. Trigger: when a host can re-attempt a task (an
   agent loop with a resettable action, not a human conversation). Parked until then.

---

## Honesty note

Confident in the cohort verdict (zero of 10 earn verified A>B oracle-free from a single non-replayable
trajectory — quote-checked the load-bearing ones, e.g. AlphaOPT's "successful if the LLM-generated optimal
value closely aligns with the provided ground-truth" and MUSE's own deferral of contrastive learning). Did
NOT re-fetch the primary papers — trusting the agents' verbatim quotes + evidence tags; a misattribution
upstream would propagate. The one claim wanting a human sanity-check: mapping the RLHF/TCR
"consistency-as-truth" kernel onto the kit's existing contradiction machinery assumes contradiction
detection can point at method-preferences as cleanly as at facts — an architectural assumption inferred from
ADR-0016/0017, NOT verified in code. Not flattering: every kernel is explicitly capped (propose≠adjudicate;
prediction-error only for the prune direction; provisional-not-verified; reversal is rare); the IDE host
cannot meet the scale floor, and pursuing verified A>B there would be the exact cheat the maintainer fears.

_Relates: D-251, ADR-0017, SYSTEM-MAP §4/§5, the failure-learning survey (the easier sibling), Task 55/66/95,
Task 50/127 (the agent-host prerequisite), design §20.3 (extended: confidence-gated blend)._
