---
date: 2026-05-22
topic: Claude Code architecture revealed by accidentally-published v2.1.88 source map
source: Anubhav, *"Inside Claude Code's Leak: 8 Compaction Modes, 3 Memory Tiers, 44 Flags Anthropic Never Talked About"* (Medium / Data Science Collective, 2026-05-08)
status: external article verified by Claude (Opus 4.7) 2026-05-22 via Read of liorwiki/raw/. Source map itself was Anthropic's accidental packaging mistake — content quoted is from an article reporting on it.
informed_adrs: [0006-lifecycle-hooks-architecture, 0011-coexistence-with-anthropic-auto-memory]
tags:
  - claude-code-internals
  - leak
  - critical-finding
  - autodream
  - 3-tier-memory
  - 8-compaction
---

# Research: Claude Code v2.1.88 leak — internal architecture revealed

## Context

In early April 2026, Anthropic's npm package `@anthropic-ai/claude-code` v2.1.88 shipped with a 59.8 MB JavaScript source map (~512K lines, ~1,900 files) accidentally bundled. Anthropic removed the package within hours, confirmed it was a packaging mistake (not a security breach), and published an April 23 postmortem. By then, automated mirrors had cloned the artifact.

Anubhav's article (2026-05-08) is a careful technical writeup of what the source map revealed about Claude Code's actual internal architecture. **This is not speculation — it's reporting on shipped code that was briefly public.**

## Three core findings

### 1. Eight compaction mechanisms (not one)

What Anthropic publicly describes as a thin layer around models is actually an 8-mechanism cascade running in strict priority order. Cheapest-first principle: every mechanism that runs without a model call executes before any that costs tokens.

| # | Mechanism | When | Cost |
|---|---|---|---|
| 1 | **Tool Result Budget** | Caps tool outputs at 50,000 chars; persists full to disk, keeps 2KB preview | 0 tokens |
| 2 | **Snip** (HISTORY_SNIP) | Sliding-window message trimmer — cuts old messages | 0 tokens |
| 3 | **Cached Microcompact** | Surgically deletes stale tool results from server-side cache | 0 tokens, beta `cache_edits` API |
| 4 | **Time-based Microcompact** | Wipes stale tool results after 60 min idle | 0 tokens |
| 5 | **Context Collapse** (codename "Marble Origami") | Non-destructive append-only commit log; projects compacted view | 0 tokens |
| 6 | **Auto-Compact** | Full LLM summarization at ~83.5% of context window. Forks subagent to produce 9-section summary | Significant — LLM call |
| 7 | **Reactive Compact** | Emergency fallback when API throws `prompt_too_long` | LLM call |
| 8 | **Compaction Circuit Breaker** | After 3 consecutive auto-compact failures, **disables auto-compaction for rest of session** | 0 tokens — defense |

Critical constant from the leaked code:

```typescript
const MAX_CONSECUTIVE_AUTOCOMPACT_FAILURES = 3;
```

This is the silent killer — if compaction fails 3 times, the session is dead-walking. The agent doesn't crash; it just stops being able to manage context, and every subsequent reply gets a little worse.

### 2. Three-tier memory architecture

| Tier | What | Storage location | Lifetime | Eviction |
|---|---|---|---|---|
| **Tier 1**: In-context | Active conversation, system prompt, tool definitions, first 200 lines of Tier 2 index, unevicted tool results | Process memory | Session-only (or via `--continue` / `--resume`) | 8 compaction mechanisms (above) |
| **Tier 2**: Persistent files | `MEMORY.md` (pointer index, ~150 chars/line), topic files, sessions/*.jsonl, tool result spillover | `~/.claude/projects/<project>/memory/MEMORY.md` + `<topic>.md` + `sessions/*.jsonl` | Survives restarts, machine reboots, explicit clear | **`autoDream` self-healing subagent** |
| **Tier 3**: Instructions | CLAUDE.md hierarchy (6 layers, most-specific wins) | Multiple paths — see below | Permanent until human edits | Never auto-evicted; preserved across compaction |

**Tier 3 resolution chain** (6 layers, leaf-most wins):

1. `/etc/claude-code/CLAUDE.md` — global org rules
2. `~/.claude/CLAUDE.md` — user (all projects)
3. `<project-root>/CLAUDE.md` — project-wide
4. `<project-root>/.claude/rules/*.md` — modular path-scoped rules
5. `<project-root>/<subdirectory>/CLAUDE.md` — directory-specific
6. `<project-root>/CLAUDE.local.md` — personal, gitignored

**This survives auto-compact completely unchanged.** Tier 3 sits above the dynamic boundary in the system prompt.

### 3. `autoDream` — Tier 2 self-healing subagent

`autoDream` is the most architecturally significant finding for our project. It's the **Tier 2 consolidation background subagent** that runs after a triple-gate:

1. ≥ 24 hours since last consolidation
2. ≥ 5 sessions since last cycle
3. File-based advisory lock acquired (no concurrent runs)

Three gates because consolidating memory mid-active-session is worse than not consolidating at all.

It reads recent signals, consolidates them into MEMORY.md + topic files, and prunes the index. **This is literally what our rolling-window compression cron does.** Anthropic ships this natively, gated under the unreleased KAIROS daemon's idle mode.

## The 9-section auto-compact summary structure

When Auto-Compact (mechanism #6) fires, the forked subagent emits a summary in exactly 9 fixed sections — the parser fails closed if any section is missing:

1. Primary Request and Intent
2. Key Technical Concepts
3. Files and Code Sections
4. Errors and Fixes
5. Problem Solving
6. All User Messages
7. Pending Tasks
8. Current Work
9. Optional Next Step

The subagent passes through the parent conversation's cache key, so the summarizer's prefix-shared context costs near-zero tokens on the second pass.

**This 9-section structure is identical to the summary structure Claude Code shows when a conversation gets too long.** We've seen this in this very project — when context fills, summaries match this shape.

## 44 internal feature flags revealed

Searching the leaked code for `Tengu` (Claude Code's internal codename) returns 1,000+ hits. Stripped of the prefix: 44 feature flags. They split into:

**Shipped but undocumented**:

- `ANTI_DISTILLATION_CC` — injects decoy tool definitions to poison training data captured by API traffic recorders
- Frustration regex (`userPromptKeywords.ts`) — matches "wtf"/"this sucks"; downstream behavior gets noticeably more careful and apologetic (single-turn effect)
- `CLAUDE_CODE_UNDERCOVER=1` — strips Anthropic identifiers from output; asymmetric (env var can force on, not off). Used by Anthropic engineers contributing to OSS without revealing AI authorship
- Silent model downgrade — Opus → Sonnet on certain server errors, no error shown
- Employee-only verification gate — re-runs generated diffs to verify compilation. Anthropic employees got this; customers didn't.

**Not yet shipped (in source, not wired)**:

- **KAIROS** — always-on background daemon, periodic tick prompts, GitHub webhook monitoring, can independently take actions. 150+ references in source
- **autoDream** (covered above) — gated under KAIROS idle mode
- **ULTRAPLAN** — offloads deep planning to remote Opus instance for up to 30 minutes
- **COORDINATOR_MODE** — multi-agent swarm with structured research / synthesis / implementation phases

**Internal model codenames** also leaked:

- Tengu = Claude Code itself
- Capybara = Mythos variant
- Fennec = Opus 4.6
- Numbat = unreleased model in testing

## Implications for claude-memory-kit

### Direct impact on ADR-0011 (coexistence)

We previously knew Anthropic's auto-memory exists. Now we know it has:

- A specific background consolidation subagent (`autoDream`) gated by 24h + 5-session + file-lock
- A 3-tier model (Tier 2 = its memory layer; Tier 3 = CLAUDE.md hierarchy)
- An explicit `MEMORY.md` as a **pointer index** (~150 chars/line, NOT content-direct) with first 25KB loaded into Tier 1 at session start

Our `MEMORY.md` design is **content-direct** (we put facts directly in MEMORY.md). Anthropic uses MEMORY.md as a **pointer index** to topic files. This is a meaningful design choice difference we should be explicit about in design.md.

### Direct impact on FR-9 (hooks)

Our auto-extract Stop hook is conceptually parallel to `autoDream`. If we go with **Option A** in ADR-0011 (disable Anthropic's auto-memory), we're effectively replacing autoDream with our own version. The leak gives us the triple-gate pattern (24h + 5-session + file-lock) as a guide — could refine FR-19 (rolling-window compression schedule) to match.

### Direct impact on FR-29 (provenance)

The leak's `tool_result_budget` spilling content to disk while keeping a 2KB preview in context is the same pattern we'd use for our raw transcript archive (T7: preserved indefinitely; compressed summaries are derivative). Validates the approach.

### Things to NOT copy

- `ANTI_DISTILLATION_CC` — sketchy from an ethics standpoint. Skip.
- Frustration regex — we don't need this; we're not running a customer-facing chatbot.
- Silent model downgrade — defensible for Anthropic's scale but inappropriate for our scope.

## Quotes worth keeping

> *"The leak does not reveal a malicious conspiracy. It reveals how much work is required to keep a language model on track."* — Anubhav

> *"Compaction has to layer. Memory has to tier. The flags will keep multiplying. The leak isn't a window into Anthropic. It is a preview of what your stack becomes by 2027."* — Anubhav (closing)

## References

- Source article: <https://medium.com/data-science-collective/inside-claude-codes-leak-8-compaction-modes-3-memory-tiers-44-flags-anthropic-never-talked-c9740c501e63> (Anubhav, 2026-05-08)
- Anthropic's postmortem on the leak: published April 23, 2026 (linked from article)
- The npm package version that shipped the source map: `@anthropic-ai/claude-code` v2.1.88
- Related ADRs: [0006-lifecycle-hooks-architecture.md](../adr/0006-lifecycle-hooks-architecture.md), [0011-coexistence-with-anthropic-auto-memory.md](../adr/0011-coexistence-with-anthropic-auto-memory.md)
- Related research: [2026-05-22-anthropic-claude-code-auto-memory.md](2026-05-22-anthropic-claude-code-auto-memory.md)
