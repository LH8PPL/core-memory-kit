---
date: 2026-06-15
topic: OpenHands — its context CONDENSER taxonomy as prior art for our compression layer (design §8) + ideas for Tasks 66/68/84; plus a multi-agent-harness data point for the Task-50 research-revisit gate
source: Cloned (sparse) https://github.com/All-Hands-AI/OpenHands (Python, 77k★, pushedAt 2026-06-15) + its agent runtime https://github.com/OpenHands/software-agent-sdk (the condenser impls). NOT a cross-session memory system — reviewed for the in-session context-condensation model.
tags: [openhands, condenser, compression, context-management, summarization, keep-first, observation-masking, amortized-forgetting, hard-vs-soft, pipeline, Task-66, Task-68, Task-84, Task-50, competitive-analysis, code-dive]
---

# OpenHands — context condenser as prior art for our compression layer

> **What it is.** OpenHands (formerly OpenDevin) — an autonomous AI-software-development PLATFORM (agent runtime + server + frontend), Python, 77k★, actively developed (pushed the day of this dive). Its agent runtime now lives in a separate repo, `OpenHands/software-agent-sdk`. **It is NOT a cross-session memory system** — no durable per-project memory, no recall-weeks-later, no persona; memory is *in-session conversation history*. So there's no write/dedup/recall path to compare against ours. **What IS directly comparable: its "condenser" — how it manages + compresses conversation history when context grows too large.** That's our **compression layer (design §8: now.md → today → recent → archive rolling window)** seen from a different (in-session, event-stream) angle, and theirs is a more developed menu than ours. Worth taking ideas from.

## What I read

`config.template.toml` (the condenser config taxonomy — the readable model) in the main repo; then the actual impls in software-agent-sdk: `context/condenser/{base,llm_summarizing_condenser,pipeline_condenser,no_op_condenser}.py`.

## Their condenser taxonomy (six strategies — the menu)

A **condenser** takes the event history (a `View`) and returns a smaller `View` (or a `Condensation` event). One condenser per agent; the menu:

| Type | Mechanic |
| --- | --- |
| `noop` | keep full history (default) |
| `observation_masking` | keep the full event STRUCTURE but **mask the bodies of older observations** (keep the action/tool-call skeleton, drop the verbose tool OUTPUT past an `attention_window`) |
| `recent` | keep only the last `max_events`, **always keep the first `keep_first`** (the task description) |
| `llm` (summarizing) | LLM-summarize forgotten events past `max_size`, **always keep first `keep_first`**, insert a summary event at the forget offset |
| `amortized` | "intelligently forget older events while preserving important context" (amortized forgetting — bounded work per step) |
| `llm_attention` | LLM scores relevance, keeps the most-relevant events |
| `pipeline` | **compose** condensers in order (e.g. mask → recent → llm), short-circuiting when one returns a Condensation |

## The mechanics worth stealing (from `LLMSummarizingCondenser` — our direct analogue)

1. **`keep_first` — always preserve the anchor.** The first N events (the task description / original goal) are **never** condensed or summarized. **We don't have this.** Our compression rolls the whole window; nothing guarantees the *original intent/goal* of a session survives summarization. For the kit this maps to: when compressing `now.md`/`today-*.md`, **always preserve the session's framing facts** (what the session was FOR) verbatim, condense only the middle. Cheap, high-value — a summary that loses "we were refactoring auth" is worse than no summary.
2. **`minimum_progress` (default 0.1) — condensation must shrink ≥10% or it's an ERROR.** A guard against paying an LLM call to produce a summary that barely shrinks anything (compose-cost > benefit). **We have cooldowns but no min-shrink guard** — our compress could fire on a tiny buffer and burn a Haiku call for ~nothing. A "don't compress unless it meaningfully shrinks" floor is a clean addition.
3. **HARD vs SOFT condensation requirement.** They classify the trigger: **TOKENS** (the next LLM call will literally fail) = HARD (must condense now); **EVENTS** (just over a heuristic count) = SOFT (condense when convenient); explicit **REQUEST** = HARD. **We don't distinguish** "compress-or-the-session-breaks" from "compress-as-housekeeping" — our cap-pressure trigger is one level. A hard/soft split would let the kit defer soft compression off the hot path and only force it when truly necessary.
4. **`hard_context_reset` with `context_scaling` retry (0.8× per attempt, ≤5×).** If the summarization LLM call ITSELF is too big / fails, shrink each event-string by 0.8× and retry. Graceful degradation for "the summary call overflowed" — our compress has a timeout (D-96 inner-subprocess) but no shrink-and-retry on an over-large input.
5. **Read-only View contract.** Condensers MUST treat the input view as read-only and return a NEW view — mutating it corrupts a cached projection owned by `ConversationState`. **Exactly our frozen-snapshot tenet** (design §7: the SessionStart snapshot is loaded once, never mutated mid-session, to preserve the prefix cache) — independent convergence on "don't mutate the shared projection," validating our rule.
6. **`observation_masking` — keep the action skeleton, drop the verbose output body.** For a tool-using agent, the *fact that* a command ran + its action is durable; the 2000-line stdout is not. Mask old observation bodies past an attention window. **Conceptually the same as the kit's Task-83 fix** ("stop dumping Files Touched log entries") and the TencentDB Mermaid-task-canvas idea (design §16.14) — keep the symbol, drop the bulk. Convergent.

## Where these map in OUR backlog (no new tasks — slot as design inputs)

- **`keep_first` (preserve the session anchor) + `minimum_progress` (min-shrink floor) + HARD/SOFT trigger → design §8 (compression) + Task 84 (the compressor already had a grounding/supersede rule added in 84a/84b; these are the next refinements).** The keep-first idea especially — a summary that drops the session's original goal is the "stale/hallucinated compression" class Task 84 fights, from the other direction.
- **`observation_masking` → already covered by Task 83 (shipped) + design §16.14 (Mermaid symbolic short-term, the TencentDB idea).** Convergent confirmation we're on the right track; nothing new to build.
- **`llm_attention` / `amortized` (relevance-scored forgetting) → Task 93 (importance-aware inject, shipped) + Task 97 (dynamic trust).** Their attention-scoring is the same instinct as our trust/importance-ordered eviction — prior art for Task 97 if it wants an LLM-scored variant.
- **`pipeline` (compose condensers) → design §8 note.** Our three compression layers (compress-session / daily-distill / weekly-curate) are already a de-facto pipeline; framing them as composable stages with a shared contract is a clean mental model, not a rebuild.

## Multi-agent-harness data point (feeds the Task-50 research-revisit gate, D-157)

OpenHands runs the SAME agent across many runtimes/harnesses (local, Docker, Kubernetes, remote) via a runtime-abstraction seam, and integrates with GitHub/GitLab/Jira/Slack/Bitbucket via per-integration "view" adapters (`enterprise/integrations/*/＊_view.py`). Same convergent shape as Taskmaster's profiles: **one core + thin per-target adapters.** This is another data point for the Task-50 research-revisit gate ("nearly every project we researched does multi-IDE/agent/harness") — but OpenHands abstracts the RUNTIME, not the IDE, so it's a weaker direct model for our `cmk install --ide` than Taskmaster's profiles. Logged so the v0.4 revisit pass includes it.

## What we would NOT take

- **The code** — Python, event-stream/`View`-based, tied to their `ConversationState` + agent loop; our compression is markdown-rolling-window over files. Take the IDEAS (keep_first, min_progress, hard/soft, shrink-retry), not the impl.
- **In-session-only scope** — their "memory" is conversation history within a run; the kit's whole thesis is CROSS-session durable memory. Their condenser is the wrong layer to copy wholesale; it informs our §8 compression only.
- **Per-agent token-budget condensation as the primary mechanism** — they condense to fit a context window mid-run; we compress to keep durable memory bounded over time. Related but not the same goal.

## Net

**Not a cross-session memory system → nothing for write/recall/dedup.** The real yield is for our **compression layer (design §8)**: OpenHands's condenser menu hands us four concrete, un-adopted ideas — **`keep_first` (never condense the session anchor), `minimum_progress` (min-shrink floor before paying for a summary), HARD-vs-SOFT trigger (will-fail-now vs housekeeping), and shrink-and-retry on an over-large summary call** — plus convergent validation of our frozen-snapshot read-only rule and our Task-83/Mermaid "keep-the-symbol-drop-the-bulk" instinct. Slotted as design inputs to design §8 + Tasks 84/93/97 (all existing); no new task. Also a (weaker) multi-harness data point for the D-157 Task-50 research-revisit gate.

## Reference

- Platform: <https://github.com/All-Hands-AI/OpenHands> (Python, 77k★, pushedAt 2026-06-15)
- Agent runtime / condensers: <https://github.com/OpenHands/software-agent-sdk> (`openhands-sdk/openhands/sdk/context/condenser/`)
- Docs: <https://docs.openhands.dev/sdk>
- Relates: design §8 (compression / rolling window), design §16.14 (Mermaid symbolic short-term — TencentDB), Task 83 (Files-Touched log removal — shipped), Task 84 (compressor grounding/supersede), Task 93 (importance-aware inject — shipped), Task 97 (dynamic trust), Task 50 + D-157 (the cross-agent research-revisit gate), design §7 (frozen-snapshot read-only — convergent).
