# ADR-0017 — The kit as a cross-session learn-loop: judge-as-per-host-adapter

- **Status**: Proposed (2026-07-01) — **WIP: the field-survey denominator is still resolving; the Decision section is provisional until it lands.**
- **Resolves**: reframes the kit's architectural direction after the U-Mem triage (D-251) — recognizes the scattered backlog cluster (Tasks 55/66/95/179/180/181/188/189 + 50/127) as organs of ONE learn-loop, and names the one missing organ.
- **Relates**: [U-Mem research note](../research/2026-07-01-umem-autonomous-memory.md) (D-251), [design.md §20.3](../../specs/design.md) (no-score-hot-path-ranking — VALIDATED, the deliberate reason cold-start never arises), ADR-0016 (the `trust_score` field this loop would rank on), ADR-0002 (markdown is truth), D-169 (no manual ritual), Tasks 55/66/95/179/180/181/188/189 (the organs), Task 50/127 (the agent-host direction), the field survey (in progress).

## Context

The kit was designed as a per-project memory *store*: acquire (auto-extract) → retrieve (search/inject) → curate (consolidate/re-curation). Across a long research session (2026-07-01, driven by U-Mem arXiv:2602.22406), a sharper framing emerged — and it was **discovered, not imported**: the backlog had independently been reaching toward it for months (55 = learn-how-I-work, 95 = re-curate, 179/180 = "a loop that improves memory", 181 = the recurrence-signal validity, 151 Move 3 = an evolving `trust_score`). The framing:

- **A session is a bounded agent run.** Claude Code is an agent (LLM + tools + a loop, e.g. `/goal`); an IDE session is a bounded episode with a human occasionally steering. Nothing is truly "continuous" — an SRE agent (alert → act → log → next alert), a 24/7 agent, a chat session are all **bounded episodes**. The difference between hosts is *episode length + how automated the outcome verdict is*, not kind.
- **The kit is the cross-session runtime.** Memory is the only thing that spans the gaps between episodes. A single episode *cannot* learn from its own outputs — the feedback (did it work? did the user correct it? did the next task need it?) arrives in the NEXT episode. So the learning signal is **inherently cross-session**, and the kit is the only substrate long-lived enough to close the loop.
- **U-Mem's Figure 1 names the missing organ precisely.** The kit is the PASSIVE memory agent — WITH the store→retrieve loop already built (the differentiator) — and the one upgrade to the AUTONOMOUS side is **learning from FAILURE** (the ⚠️ "no correct trajectory to learn from" box). The kit stores successes and retrieves them; it does not yet ask "did this RETRIEVED memory lead to a good/bad outcome" and feed that back. Compounding it: the consistency signal it *does* compute (`trust_score` dampen on contradiction/supersession) never reaches retrieval ranking (design §20.3 keeps ranking BM25-only, on purpose).

## The corrected framing (the load-bearing reframes)

1. **The loop is universal; the JUDGE is the per-host adapter.** The real axis is *judge quality*, not IDE-vs-agent. A spectrum: ground-truth oracle (benchmark / SRE monitor) → deterministic check (tests pass, `/goal` done, tool-result — **available in Claude Code today**) → LLM-as-judge → human reaction (correction / re-ask / `cmk forget` — the IDE's human-in-loop) → nothing (terse session). Same loop everywhere; a richer judge → faster learning. This mirrors Task 50's per-agent-data-on-a-shared-seam pattern, applied to the feedback signal: **the judge is the adapter.** ("Agent-specific" was sloppy; the correct word is judge-specific.)

2. **The signal is a PORTFOLIO of weak proxies, not one oracle.** A session host has no ground-truth answer key, so no single clean reward. Instead: tool-result/exit-code, `/goal` pass-fail, user-correction, `cmk forget`, recall-miss (re-ask/re-search), used-vs-ignored, contradiction (already have), recurrence (already have — but **friction, not success**, per Task 181). Aggregate for direction; grade each; never read recurrence as reinforcement.

3. **The prune-on-failure > reinforce-on-success ASYMMETRY (honest constraint).** Without an oracle, failure leaves traces (a correction, a re-ask, a red test, a forget) but a GOOD silent recall leaves *nothing* — the model used the fact, it worked, the user moved on, no signal. So an oracle-free kit can prune-on-failure far more reliably than it can reinforce-on-success. Design around the asymmetry; do not pretend to a symmetric reward.

## Decision (PROVISIONAL — pending the field-survey denominator)

_Recorded provisionally so the direction survives the session; finalized when the field survey lands._

- **The kit is a partial learn-loop missing the learn-from-failure organ**, and the fix is oracle-free: (a) let the session model self-report an outcome on the fact it acted on (memclaw's pattern) → dampen `trust_score` on failure + LLM-synthesize a corrective "rule" fact; (b) **rank retrieval by a similarity+trust blend** so the learned signal finally changes what surfaces — the single edit that turns `trust_score` from decorative into load-bearing (and the thing §20.3 currently forbids, so a real architectural decision, not a tweak).
- **Precedent, oracle-free, in CODE**: memclaw (caura-memclaw) is (as of the 9-system convenience survey) the one system that ships this loop without a benchmark oracle. The full-field survey is resolving whether it stays ~unique and what the honest X-of-N denominator is; several systems (letta, MemOS, A-Mem) ship the *socket* (a utility/feedback field) and leave it **inert**.

## Consequences / open questions

- **Does not reverse §20.3** — it revisits it *with new evidence* (the learn-loop needs the score in ranking). The §20.3 "cautionary bug" (rank by a naive score → noisy fact ranks high) is real; the resolution is a *blended* rank (similarity ⊕ trust), not a pure-score rank, plus the prune-asymmetry.
- **The agent-host direction (Task 50/127) is the same arc, not a separate one** — a more agentic host supplies a richer judge, so the loop learns faster there; the kit is the same glue for Claude Code, Hermes, OpenClaw, an SRE agent.
- **Finalize when the field survey lands**: the honest denominator, whether the signal portfolio is saturated or an outlier signal exists, and the exact first build step (self-report edge + blended ranking, or a smaller wedge).

_This ADR is the system-level reading of the U-Mem source: the paper describes a SYSTEM (a closed feedback loop), and the kit is a system — "the system is something beside, and not the same as, its elements." Provenance: the 2026-07-01 research session; the thesis was the maintainer's, sharpened across the exchange. D-251 + a forthcoming decision-log entry when finalized._
