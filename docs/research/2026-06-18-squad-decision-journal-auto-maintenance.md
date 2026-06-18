---
date: 2026-06-18
topic: How bradygaster/squad keeps its committed `decisions.md` CURRENT (the auto-maintenance mechanism) — the source project for the kit's DECISIONS.md, re-dived to answer "how does the journal stay up to date without a manual command?" (Task 159 / D-169)
source: Cloned + read https://github.com/bradygaster/squad (kept at /c/tmp/squad-dive) — the `.copilot/skills/` skill files + `.github/agents/squad.agent.md`. The kit's DECISIONS.md (Task 147) was taken from squad's `.squad/decisions.md`; this dive answers the maintenance-trigger question the original dive didn't.
tags: [squad, bradygaster, decisions-journal, auto-maintenance, scribe, inbox-dropbox, session-end-ceremony, Task-147, Task-159, D-169, deterministic-vs-llm, borrowed-idea]
---

# squad — how `decisions.md` stays current (the maintenance trigger)

> **Why this dive.** The kit took its `context/DECISIONS.md` from squad's `.squad/decisions.md` (D-161). The v0.3.3 cut-gate found the kit's journal only populates on a manual `cmk digest` — Task 147 SCOPED it automatic but never wired the trigger (D-169). So the load-bearing question is: **how does squad keep ITS journal current automatically?** That's the design precedent for where/how the kit should auto-sync.

## squad's mechanism (read from the actual skill files)

squad keeps `.squad/decisions.md` current with **two roles + a session-end ceremony**, NOT a hook or a deterministic regenerator:

1. **The inbox drop-box (the WRITE pattern).** Any agent, "after making a decision that affects other team members," writes it to `.squad/decisions/inbox/{name}-{slug}.md` — NOT directly to `decisions.md` (`.copilot/skills/agent-collaboration/SKILL.md`: *"Don't write directly to `.squad/decisions.md` — always use the inbox drop-box"*). This is an **instruction in the agent's skill/prompt**, executed by the LLM when it judges a decision was made.
2. **The Scribe (the MERGE role).** A dedicated agent — **"📋 Scribe (claude-haiku-4.5 · fast)"** — whose charter is "maintaining `decisions.md`" merges the inbox files into the main journal. It's modelled explicitly as a **session-end ceremony**: the Scribe's spawn description is *"Log session & merge decisions"* and the model-selection skill lists the task as *"log session to decisions.md"* (`.copilot/skills/model-selection/SKILL.md`, `init-mode/SKILL.md`).
3. **`merge=union` on `.gitattributes`** for the append-only files (`history.md`, `decisions.md`, logs) so concurrent branch appends combine without conflict (`git-workflow/SKILL.md`). (The kit already stole this — Task 154.)

So squad's answer: **an LLM agent (a fast Haiku "Scribe") merges decisions into the journal at session-end**, driven by prompt instructions — because squad's decisions are **unstructured prose** scattered across inbox files, so it takes a model to read + merge them coherently.

## Why the kit should diverge: deterministic-on-hook, not an LLM Scribe (D-169)

The kit has a **structural advantage squad lacks**: its journal is **deterministically derivable from already-captured, typed `type:project` facts**. `syncDecisionsJournal` (decisions-journal.mjs) reads those fact files and renders the journal — append-only, idempotent, with retract-in-place. **No LLM judgment is needed to "merge" anything** — the facts are already structured (id / title / When / Why), and auto-extract already captured them per-turn.

| | squad | claude-memory-kit |
| --- | --- | --- |
| Decisions stored as | unstructured prose in inbox files | typed `type:project` facts (id/title/Why) |
| Merge into journal needs | an LLM (Scribe) to read + synthesize | a deterministic render (`syncDecisionsJournal`) |
| Trigger | Scribe agent, session-end ceremony | **a hook running the deterministic sync** |
| Cost | a Haiku call | **~175ms pure file I/O, no LLM/network** (measured) |

So the kit takes squad's **timing insight** (session-end is the right boundary — "this session's decisions landed → render them") but NOT its **mechanism** (an LLM Scribe). The kit runs the deterministic `syncDecisionsJournal` on the detached session-end path — cheaper, faster, no model variance. **Better than the source, because the kit's typed-fact substrate makes the LLM unnecessary.** (This mirrors the kit's broader pattern vs squad — D-161: "squad appends because it has no DB; the kit appends WITH structure because it has the typed-fact DB underneath.")

## Placement (the seams, traced — for Task 159)

- **Primary — detached session-end:** `runSessionEndTasks` (session-end-tasks.mjs) already runs a **graduation sweep** as a sequential local-I/O step (pure file I/O, `<<1s`, wrapped so a throw can't reject into the hook — lines 61-76). `syncDecisionsJournal` is the same shape → slot it in beside graduation. Disjoint inputs/outputs from compress + persona (no lock contention).
- **Fallback — SessionStart lazy:** `detectStaleness` (lazy-compress.mjs) returns verdicts (`stale-now`/`stale-daily`/…) that trigger detached work. Add a `journal-stale` verdict (DECISIONS.md missing OR older than the newest `type:project` fact) → detached sync at SessionStart, for sessions that never cleanly closed (the Task-105/D-75 no-SessionEnd class). Never blocks the 500ms budget.

## Net

squad keeps `decisions.md` current with an **LLM "Scribe" agent at a session-end ceremony**, merging an inbox drop-box. The kit should adopt squad's **session-end timing** but reject its **LLM mechanism** — because the kit's journal is deterministically derivable from typed facts, it runs the cheap (~175ms, no-LLM) `syncDecisionsJournal` on the detached session-end hook (+ a SessionStart lazy-fallback), which is strictly better than the source. This completes Task 147's scoped-but-never-wired "made automatic" intent (D-169 / Task 159) and is required for v0.3.3's DECISIONS.md feature to be "it just works" (D-164).

## Reference

- Repo: <https://github.com/bradygaster/squad> (kept at `/c/tmp/squad-dive`).
- Mechanism files: `.copilot/skills/agent-collaboration/SKILL.md` (inbox drop-box write pattern), `.copilot/skills/model-selection/SKILL.md` + `.copilot/skills/init-mode/SKILL.md` + `.github/agents/squad.agent.md` (Scribe role + "log session to decisions.md" session-end ceremony), `.copilot/skills/git-workflow/SKILL.md` (`merge=union`).
- Relates: Task 147 (the journal, taken from squad), Task 156 (recall — the half finished), Task 159 (auto-sync — this dive's target), D-161 (append-only, structured-vs-prose), D-164 (automatic-or-not-shipped), D-169 (the auto-sync decision), §8.2.1/8.2.2 (lazy-compress precedent), Task 154 (`merge=union`, already stolen).
