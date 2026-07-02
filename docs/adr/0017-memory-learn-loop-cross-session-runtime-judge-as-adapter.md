# ADR-0017 — The kit as a cross-session learn-loop: judge-as-per-host-adapter

- **Status**: **Accepted (2026-07-02)** — proposed 2026-07-01 as a WIP stub; finalized after the full research corpus landed (the 47-system failure survey + the 10-system/4-lens comparative-judgment study) and the target design was drawn ([SYSTEM-MAP §6](../SYSTEM-MAP.md), "our Figure 2"). The build is phased; Task 185 lanes the phases. D-252.
- **Resolves**: reframes the kit's architectural direction after the U-Mem triage (D-251) — recognizes the scattered backlog cluster (Tasks 55/66/95/179/180/181/188/189 + 50/127) as organs of ONE learn-loop, names the one missing organ, and **adopts the target design** that closes it.
- **Relates**: [SYSTEM-MAP §6](../SYSTEM-MAP.md) (**the adopted design — this ADR's normative referent**), [U-Mem research note](../research/2026-07-01-umem-autonomous-memory.md) (D-251), [failure-learning field survey](../research/2026-07-01-failure-learning-field-survey.md), [comparative-judgment study](../research/2026-07-01-comparative-judgment-earned-method-preference.md), [design.md §20.3](../../specs/design.md) (no-score-hot-path-ranking — revised narrowly, see Consequences), ADR-0016 (the `trust_score` field the loop ranks on), ADR-0002 (markdown is truth), D-169 (no manual ritual), Tasks 55/66/95/179/180/181/188/189 (the organs), Task 50/127 (the agent-host direction), D-251 + D-252.

## Context

The kit was designed as a per-project memory *store*: acquire (auto-extract) → retrieve (search/inject) → curate (consolidate/re-curation). Across a long research session (2026-07-01, driven by U-Mem arXiv:2602.22406), a sharper framing emerged — and it was **discovered, not imported**: the backlog had independently been reaching toward it for months (55 = learn-how-I-work, 95 = re-curate, 179/180 = "a loop that improves memory", 181 = the recurrence-signal validity, 151 Move 3 = an evolving `trust_score`). The framing:

- **A session is a bounded agent run.** Claude Code is an agent (LLM + tools + a loop, e.g. `/goal`); an IDE session is a bounded episode with a human occasionally steering. Nothing is truly "continuous" — an SRE agent (alert → act → log → next alert), a 24/7 agent, a chat session are all **bounded episodes**. The difference between hosts is *episode length + how automated the outcome verdict is*, not kind.
- **The kit is the cross-session runtime.** Memory is the only thing that spans the gaps between episodes. A single episode *cannot* learn from its own outputs — the feedback (did it work? did the user correct it? did the next task need it?) arrives in the NEXT episode. So the learning signal is **inherently cross-session**, and the kit is the only substrate long-lived enough to close the loop.
- **U-Mem's Figure 1 names the missing organ precisely.** The kit is the PASSIVE memory agent — WITH the store→retrieve loop already built (the differentiator) — and the one upgrade to the AUTONOMOUS side is **learning from FAILURE** (the ⚠️ "no correct trajectory to learn from" box). The kit stores successes and retrieves them; it does not yet ask "did this RETRIEVED memory lead to a good/bad outcome" and feed that back. Compounding it: the consistency signal it *does* compute (`trust_score` dampen on contradiction/supersession) never reaches retrieval ranking (design §20.3 keeps ranking BM25-only, on purpose).

## The corrected framing (the load-bearing reframes)

1. **The loop is universal; the JUDGE is the per-host adapter.** The real axis is *judge quality*, not IDE-vs-agent. A spectrum: ground-truth oracle (benchmark / SRE monitor) → deterministic check (tests pass, `/goal` done, tool-result — **available in Claude Code today**) → LLM-as-judge → human reaction (correction / re-ask / `cmk forget` — the IDE's human-in-loop) → nothing (terse session). Same loop everywhere; a richer judge → faster learning. This mirrors Task 50's per-agent-data-on-a-shared-seam pattern, applied to the feedback signal: **the judge is the adapter.** ("Agent-specific" was sloppy; the correct word is judge-specific.)

2. **The signal is a PORTFOLIO of weak proxies, not one oracle.** A session host has no ground-truth answer key, so no single clean reward. Instead: tool-result/exit-code, `/goal` pass-fail, user-correction, `cmk forget`, recall-miss (re-ask/re-search), used-vs-ignored, contradiction (already have), recurrence (already have — but **friction, not success**, per Task 181). Aggregate for direction; grade each; never read recurrence as reinforcement.

3. **The prune-on-failure > reinforce-on-success ASYMMETRY (honest constraint).** Without an oracle, failure leaves traces (a correction, a re-ask, a red test, a forget) but a GOOD silent recall leaves *nothing* — the model used the fact, it worked, the user moved on, no signal. So an oracle-free kit can prune-on-failure far more reliably than it can reinforce-on-success. Design around the asymmetry; do not pretend to a symmetric reward.

## Decision

**The kit's differentiator is HONEST memory — it never lies about how much it knows.** Every choice
below is decided by that criterion. (The field evidence behind it: of ~57 systems surveyed, everyone
who learns cheats with a benchmark oracle, and everyone who doesn't ships an inert utility socket;
*nobody* ships epistemic honesty — provisional status, confounds, confidence-visible judgments,
honestly-blank regions — as a feature. The kit already leans this way; this ADR makes it the rule.)

**We adopt the target design in [SYSTEM-MAP §6](../SYSTEM-MAP.md) ("our Figure 2")** — the kit with
the learn-loop closed. Its load-bearing calls, each grounded in the research corpus:

1. **Two rankable objects, never conflated.** FACT-utility (`trust_score`, the shipped 151.7 rule,
   event set extended to the full signal portfolio) vs. METHOD-JUDGMENTS (`judgment_*.md` files —
   provisional, `n_episodes`, confounds, decay, append-only evidence log). Facts may enter a ranking
   blend; **judgments never auto-rank** — they surface with their confidence visible. (The
   comparative-judgment study's core verdict: verified A>B is structurally unsolved at the kit's
   scale — single-arm, scale floor, silent-success asymmetry, self-judge circularity.)
2. **The judge is the per-host adapter; the loop is universal.** Signals are a PORTFOLIO —
   **automatic-first, human-optional** (the two-axis correction: oracle-vs-no-oracle ≠
   automatic-vs-human), **both-polarity** (prioritize symmetric signals — tool-result, expectation
   HIT/MISS — that reinforce as readily as they prune; the asymmetry is a difficulty to engineer
   around, not a goal). Recurrence is never read as reinforcement **as an OUTCOME signal** (Task 181:
   a restatement of an already-stored fact is friction — the memory existed and didn't prevent the
   repeat — closer to a recall-miss than a win). Precision matters here: recurrence still legitimately
   reinforces on the OTHER two ledgers — IMPORTANCE (the ADR-0016 promotion gate: restated ≥3× →
   persona) and VALIDITY (the capped trust seed / protection-at-cap: a re-attested fact isn't evicted).
   What it may never buy is "the memory helped." _(Open seam, resolved in 192/194's signal design: the
   shipped 151.8 restatement→reinforce mapping is fine while trust gates protection only; when 194
   wires trust into ranking, mixed evidence must not buy ranking boosts like a tool-success does.)_
3. **The blend closes the loop in SEARCH, not inject.** `BM25 ⊕ λ·trust_score`, **confidence-gated**,
   facts only — where the index is already open. Inject's hot path stays enum-ordered (§20.3's actual
   concern, preserved). This is the single edit that turns `trust_score` from decorative into
   load-bearing (the field-wide "inert socket" anti-pattern, fixed per ExpeL: the score also **gates
   survival**, feeding prune-candidacy — never silent deletion).
4. **The FEEDBACK-SCREEN is a prerequisite, not an option.** Feedback is a second unscreened input
   channel (Poison_Guard covers writes; nothing covered utility mutations). No utility-mutating signal
   ships without it: rate-limit per fact, burst-hold (a systemically-wrong judge — e.g. a broken test
   suite — must quarantine, not dampen good memories), every Δ audit-logged, floor 0.05.
5. **Failures are retained as anti-patterns, not erased** (Memento/REMEMBERER/Negative-Knowledge):
   a repeatedly-failing fact converts to a typed "avoid this" memory — demote-not-evict extended to
   the loop.
6. **The RECALL-LOG is the attribution prerequisite** (memclaw `related_ids`): the one genuinely new
   primitive — without "which memories surfaced this turn," no signal can find its target.

**Build order = the phases in SYSTEM-MAP §6** (Phase 0 shipped; Phase 1 = the oracle-free wedge on
existing hooks; Phase 2 = the blend + survival gate; Phase 3 = host-dependent). Task 185 lanes them.

## Evidence (the honest denominator)

47 systems surveyed (failure-learning) + 10 cohort + 4 outside lenses (comparative judgment). ~14 of 18
deep-read systems learn from failure but **~12 need a benchmark oracle the kit lacks; only ~4 are
oracle-free** (memclaw, Memoria — the two that close the loop into ranking — plus A-MemGuard set-level,
SkillOpt's fallback tier). Verified A>B oracle-free from a single non-repeatable trajectory: **zero of
ten**. Full evidence: the two research notes + the raw survey outputs archived under
`docs/research/raw/`.

## Consequences

- **§20.3 is revised narrowly, with new evidence — not reversed.** The "cautionary bug" (rank the hot
  path by a naive score) remains forbidden; what changes: SEARCH ranking may blend a
  **confidence-gated** trust term (facts only), and the score gates survival in curation. Inject is
  untouched. design.md §20.3 gets this amendment when Phase 2 builds.
- **The agent-host direction (Task 50/127) is the same arc** — a richer host raises both cycle-rate
  and judge quality (the two things the scale floor demands), so the loop's ambition unlocks there.
  "Earn better-than" is a *reason* for the agent-host work, not an IDE feature to force.
- **The unsolved region stays blank on purpose** (SYSTEM-MAP §5): no future session may fill it with
  a small-sample "A>B ranking" and call it earned. If it gets solved, it's because the host changed.
- **Recurrence is the system's fuel** — the one variable connecting 151 (promotion gate), 181
  (friction), U-Mem's r=0.888 (ROI), the scale floor (judgment), and 189 (measuring it). Design
  changes that raise usable recurrence (agent hosts, replay) raise everything downstream.

_This ADR is the system-level reading of the U-Mem source: the paper describes a SYSTEM (a closed feedback loop), and the kit is a system — "the system is something beside, and not the same as, its elements." Provenance: the 2026-07-01 research session; the thesis was the maintainer's, sharpened across the exchange. D-251 + a forthcoming decision-log entry when finalized._
