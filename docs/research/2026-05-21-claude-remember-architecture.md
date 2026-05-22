---
date: 2026-05-21
topic: claude-remember architecture survey
source: Manual fetch of github.com/Digital-Process-Tools/claude-remember
status: complete
informed_adrs: [0003, 0006]
tags:
  - claude-remember
  - competitive-analysis
  - architecture
  - rolling-window-compression
---

# Research: claude-remember architecture survey

## Why this research

`claude-remember` (Digital-Process-Tools) is the closest design sibling to `claude-memory-kit` — both choose per-project markdown over opaque global storage. Worth understanding what they did and what we can borrow.

## What it does

Persistent memory for Claude Code that:

- Hooks into Claude Code's lifecycle (SessionStart, UserPromptSubmit, PostToolUse)
- Automatically saves and compresses conversation history via Haiku
- Creates **layered memory summaries** (now → today → recent → archive)
- Loads memory automatically on session start
- Per-session save cost stated as **< $0.01** (a few thousand input tokens, a few hundred output tokens)

## File structure (per-project at `<repo>/.remember/`)

| File | Purpose |
|---|---|
| `.remember/now.md` | Current session buffer — appended live by hooks |
| `.remember/today-{YYYY-MM-DD}.md` | Daily Haiku-compressed summary |
| `.remember/recent.md` | Rolling 7-day consolidation |
| `.remember/archive.md` | Older history, append-only |
| `.claude/remember/identity.md` | User-written agent identity (≈ our SOUL.md) |

All output is markdown. Sessions are captured as JSONL internally but converted to structured markdown summaries for storage.

## Hook architecture (3 hooks)

| Hook | Purpose |
|---|---|
| SessionStart | Loads memory files into context |
| UserPromptSubmit | Injects current timestamp |
| PostToolUse | Auto-saves when tool output exceeds threshold (default: 50+ lines) |

**Notable design choices**:

- All hooks bash-only. Detached via `</dev/null >/dev/null 2>&1 & disown` to dodge a Windows libuv assertion (fix referenced in PR #39).
- Uses Haiku via `claude --print` for summarization.
- Optional manual handoff: `/remember` slash command before session end for user-added notes.

## Compression pattern (the key insight to borrow)

**Rolling-window hierarchy:**

```text
now.md  ──[SessionEnd]──►  today-{date}.md  ──[daily cron]──►  recent.md  ──[weekly cron]──►  archive.md
   ↑                              ↑                                 ↑                              ↑
   live buffer               Haiku-compressed                rolling 7-day                  append-only
   per session               daily summary                   consolidation                  long-term
```

Each layer is a smaller, more durable summary of the layer below. The compression budget is enforced by passing the file through Haiku with a prompt that constrains output structure.

This is **strictly better than v0.0.1's "auto-extract every turn"** approach because:

- Compression cost is bounded by the window size, not the number of turns.
- Drift is contained — the daily summary is a single snapshot, not an accumulation of incremental extractions.
- The hierarchy itself is queryable — "what happened today" vs "what happened this week" vs "what's the long-term context" are different reads.

## How claude-remember informed our ADRs

| Finding | Our response |
|---|---|
| Per-project markdown at `.remember/` | Confirms our ADR-0002 (markdown SoT) and validates ADR-0003 (per-project tier). |
| Rolling-window hierarchy (now → today → recent → archive) | **Adopted in requirements.md FR-19**. Our names mirror theirs: `sessions/now.md`, `sessions/today-{date}.md`, `sessions/recent.md`, `sessions/archive.md`. |
| 3-hook architecture (no Stop, no SessionEnd) | Rejected in favor of 5+1 (ADR-0006). We need Stop for rolling-window trigger and SessionEnd for final flush. claude-remember's PostToolUse-driven save is good but loses session-boundary structure. |
| Haiku via `claude --print` for compression | Adopted (per requirements.md FR-20). |
| Hook detachment to dodge Windows libuv | Already adopted in v0.0.1's auto-extract spawn. Confirmed as correct pattern. |
| `<repo>/.claude/remember/identity.md` for agent identity | Inspired our `context/SOUL.md` design (already in v0.0.1). Same concept, different name. |
| Optional `/remember` slash command | Not adopted; our `memory-write` skill auto-triggers on phrases instead. Cleaner UX for our auto-extract model. |

## What claude-remember does NOT have (vs ours)

- No three-tier scope (user/project/local). Only per-project.
- No granular per-fact archive with typed frontmatter and Why/How to apply.
- No INDEX.md for the granular archive.
- No vector search (no memsearch / Milvus equivalent).
- No companion skills.
- No web viewer.
- No MCP server.

## Maintenance status

Active but smaller than claude-mem. README confirms Haiku compression cost claim. PR #39 (Windows libuv fix) shows active maintenance.

## References

- Repo: <https://github.com/Digital-Process-Tools/claude-remember>
- README cost quote: *"A typical session save costs < $0.01 — a few thousand input tokens (the session exchanges) and a few hundred output tokens (the summary)."*
- PR #39 (Windows hook detachment): see repo
- Related ADRs: [0003-per-project-with-future-cross-project-tier.md](../adr/0003-per-project-with-future-cross-project-tier.md), [0006-lifecycle-hooks-architecture.md](../adr/0006-lifecycle-hooks-architecture.md)
- Conversation context: [../conversation-log/2026-05-21.md](../conversation-log/2026-05-21.md), thread "Comparing claude-remember to our design"
