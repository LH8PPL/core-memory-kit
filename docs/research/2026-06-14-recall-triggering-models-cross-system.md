---
date: 2026-06-14
topic: How memory systems decide WHEN to recall — the trigger model (always-search vs judgment-pulled vs inject-everything) + skill-description triggering mechanics
source: Deep research — cloned + read 9 real repos (claude-mem, memsearch, mempalace, mem0, claude-remember, claude_memory, basic-memory, memory-os, graphiti) + Anthropic Agent-Skills docs + the official skill-creator skill + production SKILL.md description fields. Driven by the v0.3.1 cold-open/Session-2 finding (the memory-search skill crawled code on structure/roundabout questions instead of recalling).
tags: [recall, trigger, when-to-recall, always-search, judgment-pulled, inject-everything, skill-description, semantic-intent-matching, nudge, hint, memsearch, claude-mem, mem0, mempalace, memory-os, graphiti, basic-memory, Task-75, Task-149, D-153, recall-ladder]
---

# Recall triggering across real memory systems — how they decide WHEN to recall

> **The question.** claude-memory-kit uses a JUDGMENT-PULLED recall model: an auto-invoked `memory-search` Agent Skill whose `description` is supposed to make Claude fire it when the user asks something whose answer is in memory. The v0.3.1 cut-gate found it brittle — it fired on *"what did we decide about X"* but crawled the code (`Glob`/`Read`) on structure/location/roundabout questions (*"how is this built", "where does X live"*). This research asks how other systems solve the *when-to-recall* problem, and (companion finding) how the skill `description` field actually drives triggering.

## Bottom line

There is no single dominant trigger model, but **the trigger DECISION is almost universally removed from the model's free judgment**: 5/9 inject-at-session-start by default, 2/9 always-search every turn, and the rest backstop a judgment-pulled skill with a per-turn nudge or a user command. **Nobody relies on judgment-pulled-from-description ALONE for the default recall path.** Our model (judgment-pulled fork-skill) is the RIGHT architecture — it's literally memsearch's — but **we shipped only its HARD HALF**: memsearch backstops its skill with a per-turn `UserPromptSubmit` nudge AND its skill description references that nudge ("also fire when you see the hint"). We had the nudge but never linked it to the skill. Separately: **skill triggering is SEMANTIC INTENT matching, not keyword matching** — so a description must LEAD with a general intent class (examples illustrative), not a phrase-list, which is why phrasing-sensitive brittleness appeared.

---

## Part A — the trigger models (per-repo)

### 1. thedotmack/claude-mem — HYBRID (inject-at-start + judgment-pulled skill + optional always-search)
Source: <https://github.com/thedotmack/claude-mem> — `src/cli/handlers/context.ts`, `session-init.ts`.
- **SessionStart hook** injects a context pack (recent observations/timeline) — the default recall.
- **Judgment-pulled `mem-search` skill** description: *"Search claude-mem's persistent cross-session memory database. Use when user asks 'did we already solve this?', 'how did we do X last time?', or needs work from previous sessions."* Phrase-list, scoped to "PREVIOUS sessions."
- **`UserPromptSubmit` hook** CAN inject semantic-search results every prompt — but only if `CLAUDE_MEM_SEMANTIC_INJECT=true`, **default `false`** (*"experimental, disabled by default"*). So always-search exists but ships OFF; default = inject-at-start + judgment-pulled skill (our shape).

### 2. zilliztech/memsearch — HYBRID, OUR DIRECT TWIN + the nudge we're missing
Source: <https://github.com/zilliztech/memsearch> — `user-prompt-submit.sh`, the `memory-recall` skill.
- **`memory-recall` skill** is `context: fork`, judgment-pulled. Description (the single most relevant artifact): *"Search and recall relevant memories from past sessions via memsearch. Use when the user's question could benefit from historical context, past decisions, debugging notes… especially questions like 'what did I decide about X', 'why did we do Y', or 'have I seen this before'. **Also use when you see `[memsearch] Memory available` hints injected via SessionStart or UserPromptSubmit.** Skip when the question is purely about current code state (use Read/Grep)…"*
- **`UserPromptSubmit` hook** does NOT search — it emits a one-line nudge every prompt ≥10 chars: `{"systemMessage": "[memsearch] Memory available"}`. Comment: *"lightweight hint reminding Claude about the memory-recall skill. The actual search + expand is handled by the memory-recall skill (pull-based)."*
- **SessionStart** injects high-signal headings from the 2 most recent daily logs: *"gives Claude enough awareness of recent sessions to decide when to invoke the skill for deeper recall."*
- **Same architecture as ours, plus the nudge + the description clause referencing it.** They explicitly KEPT pull-based and bolted on a per-turn reminder rather than switching to always-search.

### 3. mempalace/mempalace — JUDGMENT-PULLED (even its "always-apply" variant defers to the model)
Source: <https://github.com/mempalace/mempalace>.
- hooks.json has only Stop + PreCompact (save side) — no recall hook. Recall is 100% the skill description.
- `mempalace-recall` skill: *"search the palace before answering about past work, prior decisions, people, or projects… Use when the user asks what was decided, what happened before, who someone is…"* + *"Recall is question-driven, not reflexive."*
- The Cursor `-always.mdc` variant is `alwaysApply: true` (loaded every turn) — **but the body still says** *"Even with this rule always loaded, only actually call the tools when the question touches memory."* **Even their aggressive variant doesn't escape the judgment decision — it just makes the instruction omnipresent.**

### 4. mem0ai/mem0 — ALWAYS-SEARCH (library) / brute-force "call me every time" (MCP)
Source: <https://github.com/mem0ai/mem0>.
- Canonical loop: `relevant_memories = memory.search(query=message, ...)` runs **unconditionally every turn** before the LLM call; results injected. The model never decides.
- Its openmemory MCP path faces the judgment problem and answers brute-force — `search_memory` tool description: *"Search through stored memories. This method is called EVERYTIME the user asks anything."* Not a phrase-list — an unconditional "always call me."

### 5. Digital-Process-Tools/claude-remember — INJECT-EVERYTHING at session start
Source: <https://github.com/Digital-Process-Tools/claude-remember>.
- SessionStart hook dumps all memory files (identity, core-memories, today, now, recent, archive). Recall hint is one line: *"Search on user request."* The `remember` skill is for SAVING, not recall. Deliberately sidesteps the trigger problem by front-loading everything.

### 6. codenamev/claude_memory — INJECT + user command; deliberately DISABLES model auto-invoke
Source: <https://github.com/codenamev/claude_memory>.
- SessionStart `context` hook injects memory. Recall is a `/recall` command + a `check-memory` skill — **both carry `disable-model-invocation: true`**. The model is explicitly NOT allowed to auto-trigger recall; the user types the command. (A real Claude Code plugin chose to turn OFF model-judgment triggering rather than make it reliable.)

### 7. basicmachines-co/basic-memory — JUDGMENT-PULLED MCP; robustness on INVOCATION not triggering
Source: <https://github.com/basicmachines-co/basic-memory>.
- `search_notes` tool description is generic; trigger guidance lives in `docs/ai-assistant-guide-extended.md`, not the tool. **Copyable technique:** heavy `AliasChoices` so the model can call with whatever param name it reaches for (`query`/`q`/`search`/`text`; `limit`/`page_size`). Hardens *invocation* once the model decides — not the decision.

### 8. ClaudioDrews/memory-os — ALWAYS-INJECT middleware + documents OUR problem
Source: <https://github.com/ClaudioDrews/memory-os> — `icarus/hooks.py`, `layers/07-ground-truth.md`.
- A `pre_llm_call` hook does "surgical recall from all four sources" injected **every single turn**, gated by a `_is_social_close` filter (skip "ok/thanks/👍", <6-char trivia) + similarity threshold (0.72).
- **Headline finding (`07-ground-truth.md`):** always-injecting is NOT enough — the agent re-discovered info already in its prompt (ran `read_file`/`session_search` to re-find injected facts, "treats every question as novel"). Their fix: a **Ground Truth hierarchy** instruction — *"When injected memory contradicts your assumptions, injected memory wins. Never treat a question as novel when the answer is already in your prompt."* (This is the source of our own SOUL.md authority preamble — Task 75.)

### 9. getzep/graphiti — retrieval ENGINE, trigger punted to host
Source: <https://github.com/getzep/graphiti>. Judgment-pulled MCP tools (`search_nodes`, `search_memory_facts`), generic descriptions; server instructions cover HOW to search, not WHEN. A backend; doesn't solve when-to-recall.

### Trigger-model tally
- **Inject-at-session-start** (default, no decision): claude-mem, memsearch, claude-remember, claude_memory, basic-memory(`recent_activity`) — **5/9**, the most common baseline.
- **Always-search every turn:** mem0 (library), memory-os (`pre_llm_call`) — **2/9** (+ claude-mem's opt-in path).
- **Pure judgment-pulled, no safety net:** mempalace, graphiti, basic-memory — the ones most like our brittle case; notably all MCP/host-agnostic (can't wire a hook).

---

## Part B — how the skill `description` actually triggers (Anthropic ground-truth)

Sources: Anthropic Agent-Skills docs (<https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview> + `/best-practices`); the OFFICIAL `skill-creator` skill (local plugin cache); real production description fields (frontend-design, claude-md-improver, build-mcp-server).

- **Mechanism: SEMANTIC INTENT matching, not keyword matching.** *"Claude uses [the description] to choose the right Skill… when it should be used."* Proof: Anthropic's PDF skill fires on *"Extract the text from this PDF and summarize it"* — a phrasing NOT in its description; the model generalized from intent. **Listed phrases are intent EXEMPLARS, not a lookup table.**
- **Anthropic's own descriptions lead with an intent CLASS + key terms, never a closed phrase-list:** PDF — *"Use when working with PDF files or when the user mentions PDFs, forms, or document extraction."* The `skill-creator`'s own description names the task *"optimize a skill's **description for better triggering accuracy**"* — Anthropic treats this as a real discipline.
- **Hard constraints (silent-failure if violated):** `description` **MAX 1024 chars** (over it → skill SILENTLY fails to load, no error); **third-person only** (injected into the system prompt); no XML angle brackets.
- **Specificity vs generality:** the troubleshooting table prescribes "never triggers → add trigger phrases" AND "triggers constantly → add Do-NOT-use conditions". The named regression: *"the most common regression is a description edit that narrows triggers too aggressively."* (Exactly our bug — the original *"skip when about current code state"* over-narrowed and bounced structure questions to code-crawl.)

---

## Synthesis + recommendation

- **Our judgment-pulled fork-skill architecture is sound** (it's memsearch's) — but **we shipped only its hard half.** Every peer that depends on judgment-pulled backstops it (session-start inject / per-turn nudge / always-search / a user command). We had the nudge but **the skill description never referenced it.**
- **Don't switch to always-search:** mem0/memory-os show it works but costs a retrieval+injection every turn AND (memory-os Layer 7) still doesn't guarantee the model USES the result — you trade a trigger problem for a cost + usage problem.
- **The fix (shipped as D-153 v2):** (1) description LEADS with a general intent principle ("Fire whenever the answer might be something the project already established, however the question is phrased"), examples illustrative + one oblique example — semantic-intent generalizes from intent, not a phrase-list; (2) the description REFERENCES the per-prompt hint ("also fire when you see `[claude-memory-kit] Memory available`") — memsearch's key move, linking our existing nudge to the skill; (3) ≤1024 chars, third-person, structurally guarded.

## What this drove in the build

- **D-153 / recall fix (v0.3.1):** the v2 description rewrite (general intent + hint-reference + oblique example). Verified live: oblique/vague recall questions now fire the skill + lead with memory; live-code + this-conversation questions correctly don't.
- **Task 149 (v0.4):** the recall-architecture ADR (judgment-pulled vs always-search vs inject-everything) — this study is its design input. The likely direction: keep judgment-pulled, strengthen the nudge backstop (the cheap, field-proven lever).
