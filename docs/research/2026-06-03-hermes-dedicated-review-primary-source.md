---
date: 2026-06-03
topic: "PRIMARY-SOURCE re-verification: how Hermes triggers its memory/persona review — the answer to the Task 86 wedge bug (multi-rule turns don't promote)"
status: complete
method: "Cloned NousResearch/hermes-agent (shallow) to C:/tmp/hermes-src and read the actual source — not the 2026-06-01 deep-dive summary. Lior 2026-06-03: 'didnt we check how other products do the same thing?' + 'if we dont have it, you can always clone the product and search how they do it.'"
informed: [Task 86 fix architecture, DECISION-LOG D-41]
sources:
  - https://github.com/NousResearch/hermes-agent  (agent/background_review.py, agent/agent_init.py, agent/conversation_loop.py, agent/curator.py)
tags: [primary-source, persona, capture-cadence, task-86, wedge]
---

# Hermes: the dedicated memory/persona review pass + its trigger cadence (primary source)

**Why this note exists.** lior-test-8 surfaced Task 86: when the user states several universal rules in ONE busy turn (e.g. "type hints AND tests first" while building the CrewAI loop), our inline auto-extract promotes ZERO of them to the cross-project persona. A prompt tweak (require per-fact emission) fixed the *clean* turn (3/3 live) but NOT the *mixed/realistic* turn (2/3 emitted zero). Root cause is structural: we ask ONE Haiku call to do TWO jobs (extract project facts + classify persona), and the persona job is crowded out under load. The 2026-06-01 deep-dive *summary* said the products use a dedicated pass; this note verifies the **exact mechanism + cadence** against Hermes's real source.

## What Hermes actually does

- **A dedicated, forked review pass — not piggybacked on anything.** `agent/background_review.py` docstring: *"After every turn, AIAgent.run_conversation MAY call spawn_background_review to fire off a daemon thread that replays the conversation snapshot in a forked AIAgent and asks itself 'should any skill/memory be saved or updated?'. Main conversation and prompt cache are never touched."* The fork inherits the parent's provider/model/cache/auth (same prefix cache) and runs with a **tool whitelist limited to memory + skill tools** (everything else runtime-denied).
- **It fires on a NUDGE INTERVAL — every ~10 turns, configurable — not every turn, not weekly.** `agent/agent_init.py:1067` `agent._memory_nudge_interval = 10` (default; `agent_init.py:1075` overrides from `mem_config.nudge_interval`). The gate is in `agent/conversation_loop.py:519`: `if agent._memory_nudge_interval > 0 and agent._turns_since_memory == 0:` (a turn counter resets and re-fires every N turns).
- **The review prompt is PERSONA-FOCUSED and single-purpose.** `_MEMORY_REVIEW_PROMPT`: *"Review the conversation above and consider saving to memory… Focus on: 1. Has the user revealed things about themselves — their persona, desires, preferences, or personal details worth remembering? 2. Has the user expressed expectations about how you should behave, their work style, or ways they want you to operate?"* — a clean, dedicated persona/preferences classification, with no competing extraction task.
- **Curation is separate again, inactivity-triggered, no cron** (`agent/curator.py`) — confirming the broader pattern: each memory job is its own focused pass on its own trigger.

memsearch corroborates (`hooks/stop.sh`): a dedicated `claude -p --model haiku` call doing ONE thing (compress the turn to bullets).

## The implication for us (the Task 86 fix)

The mature products **never overload one call with extraction + persona classification**, and they run the dedicated pass **frequently** (Hermes: every ~10 turns). Our shape is wrong twice:
1. We overload the per-turn extraction call (inline Task 61/78) → drops persona under load.
2. Our dedicated classifier (`auto-persona.mjs` `buildClassifierInstructions` — single-purpose, exactly the right shape, reads the CLEAN fact list via `listObservationSources`, not the busy turn) is only invoked **manually** (`cmk persona generate`, subcommands.mjs:687) or **weekly** (`weekly-curate.mjs:336`). Far too rare for a cold-open.

**Fix (D-41):** run the dedicated `autoPersona` classifier on a frequent, automatic trigger — a **detached run at SessionEnd** over the accumulated fact list. SessionEnd (not SessionStart) is the correct boundary: the persona must fill from project-A's facts *before* you cold-open project-B, so it has to happen at A's session end, not A's next start (which would lag a whole session). Detached (fire-and-forget) so it doesn't hit the 60s SessionEnd hook ceiling or contend with `compress-session`'s Haiku budget. Keep the inline per-fact emission as a best-effort fast-path. This matches Hermes's "dedicated pass, frequent trigger, focused prompt over a clean snapshot." Hermes's nudge-interval (every-N-turns mid-session) is a v0.x refinement if SessionEnd proves too coarse.

## CORRECTION (appended 2026-06-03, D-44) — the INPUT was wrong too, not just the trigger

The "fix (D-41)" above got the **trigger** right (dedicated pass at SessionEnd) but asserted autoPersona "reads the CLEAN fact list … exactly the right shape." **That conclusion was wrong, and re-reading the SAME Hermes prompt at the word level is what exposes it.** The 86b implementation ran the classifier over `assembleProjectCorpus` (the distilled `context/memory/*.md` fact bodies) and a live spawn-smoke showed it **emits all candidates but grades them medium → queues, promoting 0**. Root cause: the fact bodies have already lost the cross-project signal — real lior-test-8 facts read "Use uv … **pip is not used in this project**" and "**For Python projects**, always create a local .venv", and `assembleProjectCorpus` also drops the `trust:high`/`write_source:user-explicit` frontmatter. The classifier re-grades degraded input and correctly declines.

**What I should have read the first time:** Hermes's `_MEMORY_REVIEW_PROMPT` says *"Review the **conversation above**"* and the docstring says it *"replays the **conversation snapshot**"* — Hermes classifies the **RAW CONVERSATION**, never distilled memory. **claude-mem corroborates:** `cli/handlers/summarize.ts` reads from `transcriptPath` (`extractLastMessage(transcriptPath, …)`). **Both products classify over the raw transcript; neither over already-distilled facts.** This is the convergent-vs-primary lesson applied to my own reading — I'd paraphrased "dedicated pass over a clean snapshot" and silently swapped Hermes's *conversation* snapshot for our *fact* corpus.

The verbatim signal survives in our `transcripts/{date}.md` ("i want that **from now on** create .venv" — "from now on" = the high-confidence marker). **Fix → Task 86c:** point autoPersona at a bounded recent-transcript window (Hermes' conversation snapshot / claude-mem's last-message), not the fact corpus. The 86b concurrency orchestrator is unchanged. Same root as Task 87 (compression reads file-write logs, not the conversation). Full reasoning: DECISION-LOG **D-44**.

## Cross-link
- Supersedes the "prompt tweak is sufficient" assumption on Task 86. The prompt change (branch `task-86-multi-rule-promote`, commit f4f0976) stays as a helpful fast-path but is **necessary-but-insufficient** — verified: clean turn 3/3, mixed turn 2/3 FAIL.
- Builds on [`2026-06-01-deep-dive-product-memory-implementations.md`](2026-06-01-deep-dive-product-memory-implementations.md) (the summary this verifies at source).
- Clone at `C:/tmp/hermes-src` (gitignored scratch, not committed); `C:/tmp/skill-research/{hermes-agent,claude-mem,memsearch,gstack}` (D-44 corroboration reads).
