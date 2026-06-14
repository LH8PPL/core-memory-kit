---
date: 2026-06-14
topic: How memory systems promote facts to durable/cross-project persona memory — auto-judged vs human-gated review queue (the persona-promotion question)
source: Deep research — cloned + read 9 real repos (mem0, MemoryOS/MemOS, memory-os, Letta/MemGPT, langmem, graphiti/Zep, claude-mem, basic-memory) + ChatGPT memory docs + local articles. Driven by the v0.3.1 cold-open finding (the user's layered-architecture philosophy stranded in the medium-confidence persona-review queue).
tags: [persona, promotion, cross-project, auto-vs-gated, review-queue, confidence, frequency-recency, mem0, memoryos, memos, letta, memgpt, langmem, graphiti, zep, chatgpt-memory, Task-78, Task-151, D-154, auto-persona, wedge]
---

# Persona-promotion across real memory systems — auto-judged, not human-gated

> **The question.** claude-memory-kit captures per-project facts, then a "persona synthesis" step decides which are cross-project user traits and promotes them to a user-tier persona (HABITS/USER/LESSONS) that injects into EVERY new project. Today it uses a **confidence gate**: facts the user STATED as a universal rule ("always X", "in every project") → `high` → auto-promoted; facts merely INFERRED from behavior → `medium` → routed to a review QUEUE for human approval. **The bug (v0.3.1 cold-open):** that queue is surfaced nowhere and has no resolve command, so medium-confidence candidates STRAND — the user's "layered backend architecture" philosophy was graded medium (he *described* it, didn't *declare* it as a universal rule), queued, stranded → a new project never inherited it. This research asks how everyone else solves promotion.

## Bottom line

**Across every real system examined, persona/profile promotion is AI-judged and automatic. Not one gates promotion behind a human review queue.** The dominant model is "the LLM reconciles facts into the durable tier inline, every turn or every background pass." Where a numeric signal exists, it is **frequency × recency** (a heat/strength score) used to *trigger* an LLM promotion pass — never to park a candidate waiting for a human. **claude-memory-kit's human-gated medium-confidence review queue is the outlier, and the stranded-queue failure is the predictable consequence of being the outlier.** And our signal is backwards: we reward grammatical form ("always X" → high) and punish demonstrated-but-not-declared behavior (→ medium → stranded), while every system that scores durability uses frequency/recurrence — which the architecture philosophy actually exhibited (demonstrated across the whole session).

---

## Per-system findings

### 1. mem0 — LLM-judged ADD/UPDATE/DELETE/NONE, no tier, no gate
Source: <https://github.com/mem0ai/mem0> — `mem0/configs/prompts.py` (`DEFAULT_UPDATE_MEMORY_PROMPT`, `FACT_RETRIEVAL_PROMPT`, `ADDITIVE_EXTRACTION_PROMPT`), `mem0/memory/main.py`.

- **Ephemeral vs durable?** No tier. Scope is a flat namespace (`user_id`/`agent_id`/`run_id`) chosen at write time — a fact written under `user_id` is *already* user-tier; there's no "session fact graduates to profile" step.
- **Promotion mechanism:** Pure LLM judgment, per fact, inline. The memory manager compares each newly-extracted fact against existing memory and emits one of four ops: *"(1) add… (2) update… (3) delete… and (4) no change."* Nothing is queued.
- **Signal:** Semantic novelty/contradiction vs existing memory — *"If the retrieved facts contain new information not present in the memory… ADD"*. No frequency counter, no human gate.
- **Human queue?** None.

### 2a. MemoryOS (BAI-LAB, EMNLP 2025 Oral) — heat-scored layered promotion, auto, no gate
Source: <https://github.com/BAI-LAB/MemoryOS> · paper <https://aclanthology.org/2025.emnlp-main.1318.pdf>. **The closest precedent** to our session→distill→persona shape.

- **Tiers:** STM (short-term QA pairs) → MTM (mid-term session segments with *heat tracking*) → LPM (long-term personal memory: user profile + knowledge).
- **Promotion:** FIFO for STM→MTM, then **heat-scored** MTM→LPM. Heat = `f(N_visit, L_interaction, R_recency)` — visit frequency, interaction length, recency/time-decay. *"If heat exceeds a threshold, unanalyzed content is extracted for LLM-based user profiling and knowledge updates, which are stored in the long-term memory."*
- **Gated?** No. Heat-over-threshold triggers an automatic LLM profiling pass. **The durability signal is frequency + recency — NOT imperative phrasing.** A topic that keeps recurring promotes itself. This is exactly the signal our confidence gate is missing.

### 2b. MemOS (MemTensor) — scheduler by call-frequency + content-stability, auto
Source: <https://github.com/MemTensor/MemOS>.

- **Tiers:** Parametric / Activation / Plaintext memory under a `MemCube`.
- **Promotion:** `MemScheduler` migrates memory *"based on task semantics, call frequency, and content stability."* *"Plain memories frequently recalled across sessions may be promoted to Activation Memory… stable templates used repeatedly can be distilled into parameter Memory."*
- **Gated?** No — a scheduler, not a queue. Signal again = **frequency + stability**, automatic.

### 2c. ClaudioDrews/memory-os (7-layer Hermes agent) — trust-scored auto-feedback, no gate
Source: <https://github.com/ClaudioDrews/memory-os>. Architecturally closest to our kit (SQLite + FTS5 + trust scoring + curated wiki).

- **Promotion:** *"Durable facts with entity resolution and an automatic feedback loop that **trains trust scores over time**"*; the wiki is *"auto-curated"*, *"continuously ingested"*, with a *"weekly decay scanner + semantic dedup (cosine >0.92 → merge)."*
- **Gated?** No human gate anywhere — trust is trained automatically; the wiki self-organizes; decay+dedup run on a timer. (Single-scope, not cross-project — so not a *cross-project* precedent, but a precedent that a kit with our exact architecture chose full automation over a queue.)

### 3. Letta / MemGPT — self-editing core memory; AI-judged in-flow, no gate
Source: <https://github.com/letta-ai/letta> — `letta/prompts/system_prompts/sleeptime_v2.py`, `letta/functions/function_sets/base.py`. **The "AI judges in-flow" model in its purest form.**

- **Tiers:** Core memory (always-in-context, persona/human blocks) vs archival/recall (searchable). The persona-like tier is **core memory**.
- **Promotion:** the agent edits its *own* core memory via tools (`memory` with `str_replace`/`insert`/`create`/`rethink`). A background **"sleeptime" agent** does consolidation: *"You run in the background, organizing and maintaining the memories… You have the ability to make edits to the memory blocks."*
- **Selection rule (quote):** *"Not every observation warrants a memory edit, be selective in your memory editing, but also aim to have high recall."* If no meaningful update, it calls finish directly.
- **Gated?** No. The agent (or its sleeptime twin) is the judge. Cross-agent sharing exists via **shared memory blocks** (explicit attach, not gated promotion).

### 4. langmem (LangChain) — LLM-judged profile/collection updates, no gate; scope by namespace
Source: <https://github.com/langchain-ai/langmem> — `docs/concepts/conceptual_guide.md`, `docs/guides/manage_user_profile.md`, `src/langmem/knowledge/extraction.py`.

- **Tiers:** Semantic (Profile or Collection), Episodic, Procedural. The persona analog is the **Profile**: *"a single document that represents the current state… When new information arrives, it updates the existing document rather than creating a new one."*
- **Promotion:** LLM-judged Extract → Compare & Update → Synthesize loop. *"Consolidate and compress redundant memories… strengthen based on reliability and recency."* Scope chosen by **namespace** (`("users", "{user_id}", "profile")`), static routing — not gated promotion.
- **Durability signal (quote):** *"Prioritize retention of surprising (pattern deviation) and persistent (frequently reinforced) information."* **persistent = frequently reinforced** — same frequency signal.
- **Gated?** No human review queue. Active ("hot path") or background ("subconscious"), both AI-judged.

### 5. claude-mem / basic-memory — no cross-project tier at all
- **claude-mem** (<https://github.com/thedotmack/claude-mem>, `docs/server-storage-boundary.md`): strictly project-scoped and actively FORBIDS cross-project mixing — *"SQLite triggers reject cross-project … links so project-scoped reads cannot accidentally mix memories from another project."* No persona tier. Opposite design choice; not a promotion precedent.
- **basic-memory** (<https://github.com/basicmachines-co/basic-memory>): human-authored Markdown notes via MCP; projects are routing scopes; **no automatic extraction, no promotion** — the human writing the note IS the gate. Not an auto-promotion precedent.

### 6. graphiti / Zep — unified user graph, temporal-validity auto, no gate
Source: <https://github.com/getzep/graphiti> — `graphiti_core/prompts/dedupe_nodes.py` · Zep <https://blog.getzep.com/state-of-the-art-agent-memory/>.

- **Tiers:** last few messages = short-term; the temporal knowledge graph = long-term. *"All sessions/threads for a given user feed into a single unified user-level knowledge graph"* — cross-conversation by construction.
- **Promotion:** fully automatic LLM graph-building — entity dedup (`NodeDuplicate`), edge extraction, **temporal fact invalidation** (*"facts have validity windows… when information changes, old facts are invalidated — not deleted"*). The "user profile" is *queried from* the graph, not gated into it.
- **Gated?** No. Durable-vs-noise decided by the extraction/dedup LLM at ingest; staleness handled by temporal windows, not a human queue.

### 7. ChatGPT Memory (the consumer analog) — model-judged, auto, notify-not-gate
Source: <https://openai.com/index/memory-and-new-controls-for-chatgpt/> · deep-dive <https://embracethered.com/blog/posts/2025/chatgpt-how-does-chat-history-memory-preferences-work/>.

- **Layers:** saved memories (explicit, user-editable *after the fact*) + reference chat history (implicit cross-chat recall, no list).
- **Decision:** *"ChatGPT decides what to keep based on **how often things come up**, how relevant they seem, or whether you've asked it to remember something on purpose."* Confidence scores attached — *"a probabilistic assessment rather than rule-based logic."*
- **Gated?** **No pre-save gate.** Auto-saves and *notifies* (*"it will notify you that a memory has been created"*). Human control is **post-hoc edit/delete**, never a pre-promotion approval queue. Frequency is again first-class.

### Local article corroboration
- **"Beyond the Log: Time-Aware Blueprint for AI Agent Memory"** (the maintainer's personal article archive) — durability is a **schema shape**, not a gate. Every fact normalizes to one of seven temporal shapes (State, Event, Plan, Relationship, **Preference**, Absence, **Timeless**); "Preference"/"Timeless" are the durable-trait shapes; ingest matches a `state_key`, closes/opens validity windows automatically. No approval.
- **"Engineering Memory for AI Agents: A Practical Beginner's Guide"** — save *"user preferences, important decisions, **repeated behavior patterns**, long-term goals, recurring task details"*; skip one-time comments. **Repetition is the signal**, applied by the model, not queued.

---

## Synthesis

**Dominant model:** LLM-judged, automatic, in-flow or background pass. Two gate-free flavors:
1. **Pure LLM-reconcile** (mem0, langmem, Letta, graphiti, ChatGPT) — model decides add/update/delete/promote against current state every turn / sweep.
2. **Frequency-thresholded trigger → LLM promotion** (MemoryOS heat, MemOS scheduler, memory-os trust-score) — a cheap numeric signal (visits×recency, call-frequency, trained trust) decides *when* to fire an LLM pass that writes the durable tier. The threshold gates *compute*, not a human.

**Human-gated review queue:** absent from every system surveyed. The only human involvement is **post-hoc** (ChatGPT delete-after-create; Letta/langmem profiles are human-editable docs). Nobody makes a candidate WAIT for human approval before it can influence behavior. **Our medium-confidence review queue is the odd one out — and a queue surfaced nowhere with no resolve command is the worst version: the cost of gating (facts stranded, persona starved) with none of the benefit (no human ever reviews).**

**The single most important finding:** every system with a quantitative durability signal uses **frequency + recency** ("persistent = frequently reinforced", "how often things come up", heat = N_visit·recency) — NOT whether the user phrased it as an imperative. Our confidence gate rewards **grammatical form** ("always X" → high) and punishes **inferred-from-behavior** (→ medium → stranded). That's backwards: the layered-architecture philosophy was demonstrated across the whole session (high reinforcement) but graded medium because it wasn't *spoken* as an imperative. Every surveyed system would have promoted it.

---

## Recommendation for claude-memory-kit

**Drop the human-review-queue for persona promotion. Replace the confidence gate with an LLM-judged promotion pass, triggered automatically, scored by cross-project recurrence rather than imperative phrasing.** Satisfies the user's directive (no new manual command; fix the automatic process / AI-judge in-flow) and aligns with the dominant model.

- **(a) AI-judge promotion like mem0/Letta (primary).** Make persona synthesis a single LLM pass over (i) candidate cross-project facts + (ii) the current persona, emitting promote / merge-into-existing / skip per fact (mem0's four-op pattern applied to the persona tier). No queue, no `medium` purgatory. Matches Letta's sleeptime model and our existing Haiku backend + Stop-hook/cron consolidation lane — the kit is one prompt away from the field-standard design.
- **(b) If a queue is kept, auto-resolve it — don't strand it.** A safety valve must **auto-promote on the next persona-synthesis pass** (timer/next-session), as MemoryOS fires on heat-over-threshold and ChatGPT auto-creates-then-notifies. A candidate that survives N sessions without contradiction promotes itself; human *edit/delete after* is fine, human *approval before* is not. (This is the v0.3.1 **down-payment** — see D-154.)
- **(c) The signal:** **cross-project recurrence + non-contradiction, LLM-confirmed.** Promote when a trait is observed in ≥2 distinct projects (or ≥N sessions) and not contradicted — the heat/frequency signal MemoryOS, MemOS, langmem, ChatGPT and the articles all converge on. Layer LLM judgment on top (langmem's *"surprising or persistent"*; Letta's *"selective but high recall"*) so a single strong cross-cutting statement still promotes on first sight. Keep explicit-imperative as a **fast-path to high**, but stop treating inferred-from-repeated-behavior as second-class needing a human.

**Honest caveat:** pure-auto loses the explicit human checkpoint on a *committed, shared* tier (the persona injects into every future project; on a public repo a wrong promotion is more visible than a wrong ChatGPT memory). The field's answer is **post-hoc reversibility, not pre-gating**: auto-promote, make the persona trivially inspectable and one-command-revertible (the ChatGPT model — the kit already has `cmk forget` / tombstones). Preserves control without a stranding queue.

---

## What this drove in the build

- **D-154 / down-payment (v0.3.1):** `resolvePersonaReviewQueue` + wire into `autoDrainQueues` — the medium-confidence candidates now auto-promote on the daily/weekly drain (the promise the auto-persona comment already made but never implemented). Stops the stranding; no manual command. Re-tested via the cold-open.
- **Task 151 (v0.4):** the full recurrence-scored, AI-judged persona-promotion redesign (drop the gate; promote by cross-project recurrence + LLM judgment; post-hoc revert). This research is its design input.
- **Meta:** coheres with **Task 149** (recall-trigger: judgment-pulled vs always-search), **Task 150** (AI-judged commit), **Task 148** (AI-judged privacy) — all instances of the same question: *where the kit relies on a human-gated queue / manual command, should it be AI-judged automation instead?*
