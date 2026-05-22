---
adr: 0006
title: Lifecycle hook architecture — initial 6 hooks, revised to 5+1 after Option-B research
status: accepted (revised)
date: 2026-05-21
revision_date: 2026-05-22
deciders:
  - Lior Hollander
  - Claude Opus 4.7
supersedes: null
superseded_by: null
related:
  - 0002-markdown-source-of-truth-over-opaque-db.md
  - 0007-content-addressed-citation-ids.md
tags:
  - hooks
  - claude-code
  - architecture
---

# ADR-0006 — Lifecycle hook architecture — initial 6 hooks, revised to 5+1 after Option-B research

## Status

**Accepted, revised 2026-05-22.** Initial 6-hook design from 2026-05-21 was refined after Option-B Deep Research surfaced empirical lessons from `claude-mem` and `claude-remember` production deployments.

## Context

v0.0.1 used **2 hooks**: `PreToolUse` (frozen-snapshot injection on first tool call) and `Stop` (transcript capture + spawn auto-extract). This worked but missed capture surface.

`claude-mem` uses **6 hooks**: Setup, SessionStart, UserPromptSubmit, PreToolUse(Read), PostToolUse, Stop. `claude-remember` uses **3 hooks**: SessionStart, UserPromptSubmit, PostToolUse. We initially planned to match claude-mem's 6.

Option-B Deep Research (2026-05-21) surfaced two empirical considerations that revised the plan:

1. **PreToolUse on every tool call is noisy.** Writing memory before a tool runs racks up writes for tool calls that are then declined, fail, or duplicate. claude-mem narrows it to PreToolUse(Read) specifically.
2. **Two confirmed Anthropic bugs** affect hook deployment:
   - [#24115](https://github.com/anthropics/claude-code/issues/24115): plugin hooks fire twice because Claude Code loads from both `marketplaces/<name>/plugin/hooks/hooks.json` and `cache/<name>/<version>/hooks/hooks.json`.
   - [#29724](https://github.com/anthropics/claude-code/issues/29724): hooks registering for the same event are de-duplicated by raw command-template string before `${CLAUDE_PLUGIN_ROOT}` expansion. Two plugins running `bash ${CLAUDE_PLUGIN_ROOT}/hook.sh` collide; only one survives.

## Decision

**v0.1 ships 5 active hooks + 1 Setup hook, with kit-unique command paths to dodge issue #29724.**

| Hook | Purpose | Timeout | Matcher |
|---|---|---|---|
| **Setup** | One-time version check on plugin install. Sub-100 ms marker check; on mismatch, print `run: cmk repair` to stderr. Never blocks. | Default | None |
| **SessionStart** | Inject the three-tier frozen snapshot (SOUL.md + USER.md + MEMORY.md + INDEX.md + today's session log) as `additionalContext` | 30 s | None |
| **UserPromptSubmit** | Inject 3-5 most-relevant memory citations into the prompt context | 10 s | None |
| **PostToolUse** | If tool is Write/Edit/MultiEdit, append observation to `sessions/now.md` and enqueue to compressor. Async fire-and-forget. | 120 s, `async: true` | `Write\|Edit\|MultiEdit` only |
| **Stop** | Trigger rolling-window compression (every ~5 turns). Guard with `stop_hook_active` to avoid recursion. | 30 s | None |
| **SessionEnd** | Final rollup compression: `sessions/now.md` → `sessions/today-{date}.md` via Haiku. Flush to markdown source-of-truth. | 60 s | None |

**Command path convention**: all hook commands use a kit-unique segment: `$CLAUDE_PROJECT_DIR/.claude/memkit/bin/<verb>` (for the standalone install path) or `${CLAUDE_PLUGIN_ROOT}/bin/<verb>` (for the plugin path). This dodges issue #29724's command-template collision.

**Why PreToolUse is dropped**: It would fire on every tool invocation including Reads. Memory writes for Read operations are noise. If we ever want PreToolUse for memory injection (FR-7 fallback when SessionStart didn't fire), we add it back narrowly — but the v0.0.1 model of "PreToolUse as primary injector" is wrong.

## Consequences

### Positive

- Five capture points instead of two — we see SessionStart, every user prompt, every Write/Edit/MultiEdit, every Stop, every SessionEnd.
- PostToolUse is narrowed and async — no per-tool latency hit.
- Kit-unique command paths immune to #29724.
- All hooks exit 0 on internal error (per claude-mem's "Graceful hook failures" lesson) — they never break a user session.

### Negative

- Six hook scripts to maintain (Setup, SessionStart, UserPromptSubmit, PostToolUse, Stop, SessionEnd) versus two in v0.0.1.
- PostToolUse async means observations land *eventually*, not immediately. If the user closes the session before async work finishes, partial state is OK but visible in `extract.log`.

### Neutral

- We do not adopt PreCompact or any of the newer experimental hook events (InstructionsLoaded, UserPromptExpansion, Elicitation, PostToolBatch, WorktreeCreate, TaskCreated, TeammateIdle). Those churn frequently per Option-B research; v0.1 sticks with the 6 stable events.

## Alternatives considered (and why rejected)

| Alternative | Why rejected |
|---|---|
| Keep 2 hooks (v0.0.1 model) | Misses SessionStart (snapshot injection happens late), UserPromptSubmit (no prompt-tag intent capture), PostToolUse (no observation surface from edits). |
| All 6 hooks including broad PreToolUse | PreToolUse on every Read writes memory for declined-tool noise. Drop it; narrow PostToolUse to Write/Edit/MultiEdit instead. |
| 3 hooks like claude-remember (SessionStart + UserPromptSubmit + PostToolUse) | Loses Stop (rolling-window compression trigger) and SessionEnd (final flush). |
| Use `claude_memory` (Ruby) inversion: hooks for capture only, MCP for retrieval+writes | Genuinely interesting; deferred to v0.2 as a possible refactor. v0.1 keeps the hook-driven write path because it's the proven model in claude-mem. |

## References

- Anthropic Claude Code hooks reference: <https://docs.claude.com/en/docs/claude-code/hooks>
- Anthropic Claude Code plugins reference: <https://code.claude.com/docs/en/plugins>
- Bug #24115 (double-fire from marketplace + cache): <https://github.com/anthropics/claude-code/issues/24115>
- Bug #29724 (command-template dedup collision): <https://github.com/anthropics/claude-code/issues/29724>
- `claude-mem` hook config (snippet from their issue #810): see [research/2026-05-21-claude-mem-architecture.md](../research/2026-05-21-claude-mem-architecture.md)
- `claude-remember` hook detachment pattern (libuv Windows fix): [research/2026-05-21-claude-remember-architecture.md](../research/2026-05-21-claude-remember-architecture.md)
- `disler/claude-code-hooks-mastery`: <https://github.com/disler/claude-code-hooks-mastery>
- `codenamev/claude_memory` (Ruby — hooks-for-capture-only inversion): see Option-B research note
- Option-B research: [research/2026-05-21-claude-ai-deep-research-option-b.md](../research/2026-05-21-claude-ai-deep-research-option-b.md), Q1

## Review history

| Date | Reviewer | Action |
|---|---|---|
| 2026-05-21 | Lior | Initial 6-hook design accepted (OQ-3 in requirements.md) |
| 2026-05-22 | Lior | Revised to 5+1 after Option-B research; PreToolUse dropped, PostToolUse narrowed to Write/Edit/MultiEdit |
