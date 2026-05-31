---
date: 2026-05-24
topic: TencentDB Agent Memory — 4-tier local memory pipeline for AI agents
source: https://github.com/Tencent/TencentDB-Agent-Memory + marktechpost article
status: complete
informed_sections: [design.md §16.14, §16.15, §16.16, §16.17 (added 2026-05-24, post-Checkpoint-11)]
tags:
  - tencent
  - competitive-analysis
  - layered-memory
  - empirical-benchmarks
  - auto-persona
---

# TencentDB Agent Memory (research note)

## Why this research

Lior surfaced [Tencent's TencentDB Agent Memory](https://github.com/Tencent/TencentDB-Agent-Memory) on 2026-05-24, an MIT-licensed open-source memory system that integrates with OpenClaw and Hermes. Worth a deep look because:

1. It's **the most recent comparable project** (released 2026-05-23 — one day before this note).
2. It has **published empirical benchmarks** (SWE-bench, WideSearch, AA-LCR, PersonaMem) on long-horizon agent tasks — something we lack entirely.
3. It surfaces architecture concepts that **don't appear in any prior comparable** we've examined (the 4-tier semantic pyramid + the Mermaid task canvas for symbolic short-term memory).

Captured here for the audit trail and to track which patterns we considered, absorbed, or rejected.

## What it does

> A symbolic short-term memory system + 4-tier local long-term memory pipeline. Local SQLite + sqlite-vec by default; no external API required. Ships as an OpenClaw plugin + a Hermes Docker image. MIT-licensed.

Storage path: `~/.openclaw/memory-tdai/` (single workspace, agent-scoped, **not per-project**).

## The 4-tier semantic pyramid (the key architectural idea)

Long-term memory is layered by **abstraction level**, not flat:

| Layer | Content | Format |
| --- | --- | --- |
| **L3 — Persona** | User profile / preferences (auto-generated) | `persona.md` |
| **L2 — Scenario** | Scene blocks (mid-level summaries) | Markdown |
| **L1 — Atom** | Atomic facts (extracted from turns) | JSONL |
| **L0 — Conversation** | Raw dialogue | Markdown |

**Query model**: top-first, drill down only when needed. The persona answers most queries at minimum cost; the system descends to atoms or raw conversation only for fine detail.

> *"Lower layers preserve evidence; upper layers preserve structure."*

Retrieval uses **deterministic drill-down** via `node_id` + `result_ref` references — not blind vector similarity across a flat fragment store. This is their critique of "most current memory stacks shred data into fragments and dump them into a flat vector store. Recall then becomes a blind similarity search across disconnected fragments, with no macro-level guidance."

## Symbolic short-term memory via Mermaid

Distinct concept from long-term storage. For **long-running agent tasks** (50+ tool calls, verbose tool outputs), context bloat is the killer:

- Full tool logs are **offloaded to disk** at `refs/*.md` under the data directory
- State transitions are encoded as **Mermaid syntax** inside a lightweight "task canvas"
- The agent reasons over the **symbol graph** in context, then `greps` a `node_id` to pull raw text on demand

This is a different solution from compression. We compress historical sessions (rolling window: `now.md → today-*.md → recent.md → archive.md`). They **avoid bloat at the source** by symbolizing live tool sequences into Mermaid diagrams.

## Retrieval defaults

| Setting | Default |
| --- | --- |
| Strategy | Hybrid (BM25 + vector via RRF) |
| Tokenizer | jieba (Chinese) + English |
| Max results | 5 |
| Timeout | 5000 ms |
| Timeout behavior | Skip injection (do not block conversation) |
| L1 extraction cadence | Every 5 conversation turns |
| Persona regeneration | Every 50 new memories |

The **skip-on-timeout** behavior is worth noting: rather than failing or stalling, they degrade gracefully. Our NFR-1 specifies < 500 ms for snapshot injection but doesn't yet specify timeout behavior. This is a small spec gap we can close.

## Agent-facing tools (their MCP-equivalent)

Two tools exposed during a session:

- `tdai_memory_search` — searches L1 atoms + L2 scenarios + L3 persona
- `tdai_conversation_search` — searches raw L0 conversation history

Both return references with `node_id` and `result_ref` for deterministic traceback.

This is **simpler** than our 6-tool MCP surface (`mk_search`, `mk_get`, `mk_timeline`, `mk_cite`, `mk_remember`, `mk_recent_activity`). They split by abstraction layer (memory vs raw conversation); we split by operation. Both are defensible; ours has finer granularity but more surface area to maintain.

## Reported benchmarks (their numbers, on their integrations)

Measured over **continuous long-horizon sessions** (e.g. SWE-bench runs 50 consecutive tasks per session) — not isolated turns. This is the right kind of measurement for memory systems; per-turn benchmarks don't stress accumulation pressure.

| Benchmark | Baseline | With plugin | Pass-rate Δ | Token Δ |
| --- | --- | --- | --- | --- |
| WideSearch | 33% | 50% | +51.52% | −61.38% |
| SWE-bench | 58.4% | 64.2% | +9.93% | −33.09% |
| AA-LCR | 44.0% | 47.5% | +7.95% | −30.98% |
| PersonaMem | 48% | 76% | +59% | (not reported) |

**Caveat**: numbers are self-reported by Tencent on their own evaluations. No third-party replication yet. But the methodology (50-task sessions, hybrid retrieval, persona accuracy) is the right shape for the claims they make.

## Comparison matrix vs claude-memory-kit

| Dimension | TencentDB Agent Memory | claude-memory-kit |
| --- | --- | --- |
| Scope | Single workspace (agent-scoped) | 3-tier per-project (user / project / local) |
| Storage | SQLite + sqlite-vec + Markdown | Markdown source-of-truth + SQLite/FTS5 + optional memsearch/Milvus |
| Long-term structure | **4 layers by abstraction** (L0-L3) | Granular archive (typed) + scratchpads (SOUL/MEMORY/USER/HABITS/LESSONS) |
| Short-term mechanism | **Mermaid task canvas + offloaded refs** | Rolling-window compression (now → today → recent → archive) |
| Distill cadence | Every 5 turns (L1); every 50 memories (persona) | Per assistant turn (auto-extract subagent — design §6.1); daily (Task 28); weekly (Task 29) |
| Persona generation | **Auto every 50 memories** | Hand-curated USER.md / HABITS.md / LESSONS.md |
| Retrieval | BM25 + vector + RRF (hybrid default) | Same (design §9.3 hybrid mode) — independent convergence |
| Timeout behavior | **Skip injection on 5s timeout** | Not explicitly specified in design (gap) |
| Agent tools | 2 (search + conversation_search) | 6 (mk_search, mk_get, mk_timeline, mk_cite, mk_remember, mk_recent_activity) |
| Empirical benchmarks | **Yes — SWE-bench / WideSearch / AA-LCR / PersonaMem** | None |
| Integrations | OpenClaw plugin + Hermes Docker | Claude Code plugin + standalone `cmk` CLI |
| License | MIT | (kit's license; MIT-aligned) |
| Vector backend coupling | TCVDB (Tencent Cloud) as cloud option | memsearch + Milvus (open-source, design §9.3) |

## What's worth absorbing (and why)

### 1. Auto-persona generation — v0.1.x candidate ← **Lior's explicit request**

User-tier files (`USER.md`, `HABITS.md`, `LESSONS.md`) in the kit are currently **hand-curated**. Lior's feedback on 2026-05-24, captured verbatim because it's a real design insight:

> *"i dont like the hand-curated user-tier files, i know that i myself will not fill them up if i have to do it manually as a user/developer using our kit, it's too much of a hassle."*

This is the same principle as the memory-write trigger-phrase critique (journey log §"Two-part critique that reshaped how we frame memory + skill invocation"): **don't make the user do work the system should do automatically**. If users won't hand-curate persona files, those files stay empty, which means the user tier provides no value, which means the 3-tier scope's benefit collapses.

Tencent's auto-persona-every-50-memories pattern solves this. A `cmk persona generate` command (or automatic invocation from the auto-extract subagent every N facts) would:

- Read the granular archive (project + user tier facts)
- Synthesize current user-profile state via the same Haiku-backed compressor
- Propose updates to USER.md / HABITS.md (and LESSONS.md for cross-project patterns)
- Either auto-apply (with audit log) or stage in `queues/persona-review.md` for user confirmation

**Verdict**: high-priority v0.1.x candidate. Will become §16.16. The hand-curated user tier is a real product failure mode; auto-persona is the fix.

### 2. Mermaid task canvas (symbolic short-term memory) — v0.2 research

Genuinely interesting for the use case: long-running multi-step tool-using sessions (which is exactly Claude Code's bread and butter). Their reported impact: 61% token reduction on WideSearch, 33% on SWE-bench.

The technique:

- During long sessions, tool outputs accumulate and bloat context
- Offload verbose outputs to disk (`refs/*.md`)
- Maintain a compact symbol graph (Mermaid state diagram) representing what happened
- Agent reasons over symbols, retrieves raw text only when needed via `node_id` → file lookup

This is **orthogonal to our rolling-window compression**. Compression operates on closed sessions; this operates on open ones. We could add it without removing anything we have.

**Verdict**: v0.2 research. Becomes §16.14. Specifically worth investigating whether Claude Code's hook architecture (PostToolUse) can capture tool outputs and offload them in real time. If yes, this is a meaningful token-cost win for long agent tasks.

### 3. L2 "scenario" layer — v0.2 candidate (lower priority)

Their 4-layer pyramid has a middle layer (L2 — scenarios) between atomic facts (L1) and persona (L3). Our design jumps directly from granular archive (≈ L1) to scratchpads (≈ L3) with nothing in between.

Whether we need an explicit L2 depends on use case. Our `MEMORY.md` "Active Threads" section already groups related facts into mid-level summaries, which is close to "scene blocks." But it's not a separate retrieval tier; it's just a scratchpad section.

**Verdict**: v0.2 candidate. Becomes §16.15. Lower priority — our scratchpad structure covers most of what L2 would do. Worth revisiting after auto-persona ships and we see whether mid-level groupings emerge naturally.

### 4. Empirical benchmarks — v0.2 (mandatory before public claims)

This is the most uncomfortable finding. Tencent has numbers; we have none. If we want to ship v0.1.0 and claim the kit improves Claude Code's behavior across sessions, we need similar evidence. Their methodology is the right shape:

- Long-horizon sessions (e.g. 50 consecutive SWE-bench tasks)
- Baseline vs with-kit comparison
- Measure both task success (pass rate) and resource cost (tokens)

For our kit, candidate measurements:

- **Long-horizon coding tasks**: pick 5 multi-session refactors. Run with and without kit installed. Measure session-start time-to-orientation, total tokens, task completion rate.
- **Cross-session recall**: pick 10 facts established in session 1. Test whether session 2 correctly retrieves them with and without kit.
- **Decision consistency**: pick 5 design decisions made in session 1. Test whether session 2 makes consistent follow-up choices.

**Verdict**: v0.2 priority. Becomes §16.17. Required before any public claim about effectiveness. The kit could ship v0.1.0 without benchmarks (it's "infrastructure ready, not yet measured"), but v0.2's narrative needs them.

### 5. Skip-on-timeout for snapshot injection — close gap in design.md

Smaller item. Our NFR-1 says SessionStart injection completes within 500 ms. Doesn't specify what happens if it doesn't. Tencent specifies: skip injection, don't block.

**Verdict**: design.md §1.4 + NFR-1 should be updated with explicit timeout behavior. Tiny. Folds in opportunistically.

## What we wouldn't absorb (deliberate divergence)

1. **Single workspace** (`~/.openclaw/memory-tdai/`) — same divergence we have from OpenClaw and Hermes. Per-project + 3-tier is the kit's distinguishing decision; documented in design.md §1.1.
2. **Mermaid-specific representation** — if we adopt the symbolic short-term memory pattern (§16.14), we shouldn't tie it to Mermaid specifically. A more general "compact symbolic representation" mechanism could use DOT, bullet lists, or any structured format.
3. **TCVDB cloud option** — closed-source backend coupling. Not for us.
4. **Tencent Cloud DeepSeek-V3.2 as default model** — vendor coupling. Our compressor backend (design §8.3) is pluggable and defaults to Anthropic Haiku for v0.1; v0.2 candidates include Bedrock + local LLM.

## What we already have that they don't

For the record:

- 3-tier scope (user / project / local) — they're single-workspace
- Content-addressed citation IDs with cross-machine determinism
- Provenance frontmatter with trust levels (`high` / `medium` / `low`)
- Tombstone discipline with audit trail (per design §6.5)
- Conflict + review queues (per design §6.2, §6.8)
- Poison_Guard regex (per design §6.7)
- MCP server (stdio transport per the MCP spec) — they expose their own tools but not via MCP
- CompressorBackend pluggability (per design §8.3) — they're DeepSeek-V3.2-coupled
- Versioned CLAUDE.md block injection with downgrade-guard

These are kit-distinguishing features. Not gaps; deliberate design choices.

## Specific design.md §16 entries added (post-Checkpoint-11, 2026-05-24)

Numbering shifted by one from this note's original draft because cold Claude's PR-2 work landed §16.13 (audit-log rotation) before this docs commit. Final assignments below; bodies live in [`specs/v0.1.0/design.md`](../../specs/v0.1.0/design.md).

### §16.14 Mermaid-style symbolic short-term memory (v0.2 candidate)

Inspired by TencentDB Agent Memory. For long-running agent sessions with high tool-output volume, offload verbose outputs to disk + maintain a compact symbolic representation in context. Token reduction reported up to 61% on web-search benchmarks. Investigation needed: can Claude Code's PostToolUse hook capture + offload outputs in real time?

### §16.15 L2 "scenario" layer between granular facts and persona (v0.2 candidate)

Tencent's 4-tier pyramid has a middle layer for mid-level summaries. Our scratchpads' "Active Threads" sections cover some of this informally; an explicit retrieval tier could improve drill-down ergonomics. Lower priority — revisit after auto-persona ships.

### §16.16 Auto-persona generation (v0.1.x candidate — **Lior-prioritized 2026-05-24**)

Replace hand-curated user-tier files (`USER.md`, `HABITS.md`, `LESSONS.md`) with auto-generated content driven by the auto-extract subagent. Triggered every N captured facts (Tencent uses 50; we'd default to similar). Output staged in `queues/persona-review.md` for user confirmation OR auto-applied with full audit trail. **Rationale**: hand-curation is a failure mode — users won't do it; the user tier ends up empty; the 3-tier scope's value collapses. Same principle as the memory-write trigger-phrase critique.

### §16.17 Empirical benchmarks methodology (v0.2 — required before public claims)

Long-horizon task suite + baseline-vs-with-kit measurement. Candidate benchmarks: 5 multi-session refactors (SWE-bench-style), 10-fact cross-session recall test, 5-decision consistency test. Measure pass rate + total tokens + session-start time-to-orientation. Required before any public claim about kit effectiveness. v0.1.0 can ship as "infrastructure ready, not yet measured"; v0.2's narrative needs the numbers.

### Smaller item (not §16, fold into existing sections):

`design.md` §1.4 + NFR-1 should specify **skip-injection-on-timeout** behavior: if SessionStart snapshot assembly doesn't complete within the NFR-1 budget (500 ms), skip the injection rather than blocking. The kit should fail open (no memory injected) rather than fail closed (session blocked). Folds into PR-2's other design.md edits if cold Claude can pick it up cleanly; otherwise it's a one-line follow-up.

## Reference URLs

- Repo: <https://github.com/Tencent/TencentDB-Agent-Memory>
- Article: <https://www.marktechpost.com/2026/05/23/tencent-open-sources-tencentdb-agent-memory-a-4-tier-local-memory-pipeline-for-ai-agents/>
- npm package: `@tencentdb-agent-memory/memory-tencentdb`

## Related research notes

- [`2026-05-24-openclaw-templates.md`](2026-05-24-openclaw-templates.md) — sibling project's template design
- [`2026-05-21-claude-remember-architecture.md`](2026-05-21-claude-remember-architecture.md) — rolling-window pattern source
- [`2026-05-22-primary-source-examination.md`](2026-05-22-primary-source-examination.md) — verification discipline
- [`2026-05-23-bootstrap-test.md`](2026-05-23-bootstrap-test.md) — doc-based context transfer experiment

## Key takeaway

Tencent has independently converged on several decisions we made (markdown source-of-truth, hybrid BM25+vector retrieval, local-first storage, plugin-integration model) — validating our direction. Their two genuinely novel contributions (the 4-tier abstraction pyramid + the Mermaid task canvas) are worth examining as v0.2 enhancements. The benchmarks gap is real and needs closing before v0.2.

**Highest-priority absorb**: auto-persona generation, on Lior's explicit ask. The hand-curated user tier is a real product failure mode and Tencent's pattern is the right structural fix.
