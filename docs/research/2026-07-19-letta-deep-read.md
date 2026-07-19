---
date: 2026-07-19
topic: Letta (MemGPT lineage) deep-read — "isn't this what we're trying to do also?" (the user's question); architecture comparison + Task-149 inputs
source: Cloned letta-ai/letta @ b76da90 (2026-07-03), actual code read; kit comparison first-hand
tags: [prior-art, recall, letta, memgpt, task-149, task-95, D-362]
---

# Letta deep-read — same thesis, different layer

The user's question: *"isn't this what we are trying to do also?"* Answer, evidenced below:
**yes — same problem, rhyming architecture, opposite load-bearing bets.** Letta IS the agent
runtime (a server you build agents inside; memory in a server-owned DB); the kit plugs
memory INTO agents you already use (Claude Code/Kiro/Cursor/Codex) and puts it in your repo.
Letta lets the LLM self-edit always-in-context memory mid-session with zero screening; the
kit freezes the snapshot per session and screens every write. Neither competitor nor
complement — the same thesis at a different layer, and the best-instrumented reference
implementation to borrow mechanisms from. If a Claude Code user wanted Letta's memory they'd
have to abandon their harness — exactly the gap the kit occupies.

## Architecture (code-read, paths relative to the clone)

1. **Core memory = self-editing in-context blocks** (`schemas/block.py:67` — "a reserved
   section of the LLM's context window"; label/description/limit/`read_only`). Rendered as
   `<memory_blocks>` XML with per-block char budgets shown to the model (`schemas/memory.py:143`).
   Edit tools: `core_memory_append/replace`, `memory_replace` (modeled on Anthropic's
   computer-use str_replace — comment at `function_sets/base.py:310`), line-addressed
   `memory_insert`, unified-diff `memory_apply_patch`, wholesale `memory_rethink`, terminal
   `memory_finish_edits` (`services/tool_executor/core_tool_executor.py:41-56` dispatch).
   Edits persist to DB and **recompile the system prompt mid-session**. Blocks are DB rows
   shared across agents via a many-to-many table (`orm/blocks_agents.py`).
   **Screening: null-byte stripping ONLY** (`block.py:51-57`) — no secret/injection screen anywhere.
2. **Recall tiers:** conversation history → `conversation_search` = **RRF-fused FTS+vector
   hybrid** with `rrf_score`/`fts_rank`/`vector_rank` returned to the model + `time_ago`
   annotations (`services/message_manager.py:1142-1344`). Agent-written archival = embedded
   passages in sharable Archives; search vector-only + tag/time filters. Notably
   `DEPRECATED_LETTA_TOOLS = [archival_memory_insert, archival_memory_search]`
   (`constants.py:116`) — the lineage is SHRINKING the judgment-pulled surface, growing the
   in-context/pushed surface.
3. **Context pressure:** the MemGPT paging loop lives in `services/summarizer/` — evict the
   oldest ~70% of in-context messages, splice a recursive LLM summary at index 1; evicted
   messages stay DB-searchable (paging, not deletion). Mid-session + message-granular, vs the
   kit's session-boundary rolling window.
4. **Sleep-time agents (the Task-95 sibling):** after every foreground step, a background
   agent processes the transcript slice since a **last-processed-message watermark**
   (`groups/sleeptime_multi_agent_v4.py:152-154` — the same resume-from-artifact shape as the
   kit's transcript-promote). **Division of labor** (`constants.py:132-143`): the chat agent
   keeps ONLY search tools; the sleep-time agent holds ALL memory-edit tools — curation fully
   delegated to a separate persona with a separate tool budget. Its prompt bans relative
   dates ("do not write 'today'… memory is persisted indefinitely" — `sleeptime_v2.py`).
   BUT: it curates the hot tier per-turn — there is NO periodic whole-corpus re-dream; the
   kit's Task-95 design goes further.
5. **Storage:** SQLite/Postgres + pgvector/sqlite-vec/Turbopuffer; server-owned, not
   human-readable, not git-committable. **The convergence twist:** the newest subsystem
   (`services/memory_repo/` + `block_manager_git.py`) projects blocks into a per-agent **git
   repo of markdown files with YAML frontmatter** — commit history, rollback, two-way DB
   sync — but the repo lives in server-side GCS/S3, authored as "Letta System". Letta is
   converging on the kit's substrate while keeping server ownership.
6. **Graph recall: none.** No KG anywhere (verified — only file-type/pickle-safety "graph"
   hits). Tags + time + hybrid similarity is its entire relational surface (Task-176 input).

## What each has that the other lacks

**Kit-only:** screened writes (Poison_Guard/PII/home-path), per-fact trust + conflict queue +
tombstones + decision journal, memory that survives without the product (plain files),
git-clone team sharing with human-reviewable memory diffs, zero-infra install into an
existing agent, cross-project user tier. **Letta-only:** mid-session memory mutation with
live prompt recompile, str_replace/line/diff-granular memory edit tools, the
existence-advertisement metadata block, mid-session compaction, live block sharing across
agents, per-block char budgets with in-prompt feedback, `time_ago` result annotations, exact
per-section token accounting.

## The 3 most borrowable mechanisms

1. **`<memory_metadata>` existence advertisement** (`prompts/prompt_generator.py:26-89`):
   live counts + tag/type inventory injected into context ("156 memories in archival — use
   tools to access"). The model can't decide to search what it doesn't know exists — the
   cheapest under-recall fix; slots directly into the kit's SessionStart inject.
2. **`read_only` as first-class schema** (`block.py:36` + the executor guard): per-file
   agent-writability, cleanly separating kit-curated read-only tiers from agent-editable ones.
3. **Sleep-time division-of-labor + watermark + edit vocabulary** for Task 95: curator as a
   separate persona with a separate tool budget; `memory_rethink`/`memory_finish_edits` as
   the dream-loop's edit verbs; the anti-relative-date rule adopted into our auto-extract
   prompt verbatim.

## Task-149 inputs (when-to-recall classification)

**Letta = judgment-pulled with engineered scaffolding — no harness-forced recall** (every
retrieval is an LLM tool call; nothing pre-searches). The pull is steered by three explicit
layers the ADR should treat as the design space: (i) **doctrine** — an explicit decision rule
in the system prompt ("answer from context if sufficient; never re-search what's in context;
search when context does not contain enough" — `memgpt_v2_chat.py:33-35`); (ii)
**tool-description strategy** ("query by concept, start broad, narrow with tags"); (iii)
**existence advertisement** (the metadata block). The kit's skill ladder has (i)+(ii) but NOT
(iii) — the concrete gap. **Cautionary trajectory:** even the canonical tool-driven system
deprecated its archival tools and is growing the pushed/in-context surface — pure agent
discretion was insufficient; the argument lands on HYBRID (a generous, advertised snapshot
floor + judgment-pulled deep recall scaffolded by doctrine + metadata).
