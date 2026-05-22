---
date: 2026-05-21
topic: claude-mem architecture survey
source: Manual survey via `gh` CLI + `WebFetch` on github.com/thedotmack/claude-mem
status: complete
informed_adrs: [0002, 0006, 0007]
tags:
  - claude-mem
  - competitive-analysis
  - architecture
---

# Research: claude-mem architecture survey

## Why this research

User pointed out that `thedotmack/claude-mem` (77k stars) already solves the same problem `claude-memory-kit` aims at. Surfaced the need to articulate **how** our design differs and **why** that difference is worth maintaining.

## Repository metrics (verified 2026-05-21 via `gh api`)

| Metric | Value |
|---|---|
| Stars | 77,244 |
| Forks | 6,656 |
| Open issues | 193 |
| Releases | 30 (latest `v13.3.0`, published 2026-05-21 10:26 UTC) |
| Language | TypeScript |
| Default branch | `main` |
| Repo created | 2025-08-31 |
| Description | "Persistent Context Across Sessions for Every Agent – Captures everything your agent does during sessions, compresses it with AI, and injects relevant context back into future sessions. Works with Claude Code, OpenClaw, Codex, Gemini, Hermes, Copilot, OpenCode + More" |

## Storage architecture

All data global at `~/.claude-mem/`:

- **SQLite database** (`memory.db`) with FTS5 full-text search.
- **Chroma vector DB** (`chroma/`) for semantic search.
- **Configuration** at `~/.claude-mem/settings.json`.
- Plugin install path: `~/.claude/plugins/marketplaces/thedotmack/`.

**No per-project structure**. Memory is user-global. Profile separation is via environment variable `CLAUDE_MEM_DATA_DIR` (work vs personal) — segregating data at the *user-profile* level, not the project level.

## Hook architecture

Six lifecycle hooks dispatched through a single Bun worker (`scripts/worker-service.cjs`, built from `src/services/worker-service.ts`):

| Hook | Subcommand | Timeout |
|---|---|---|
| Setup | version validation, install-marker check | sub-100ms |
| SessionStart | `start` + `context` | 60s |
| UserPromptSubmit | `hook claude-code session-init` | 60s |
| PreToolUse(Read) | context for Read targets | 10s |
| PostToolUse | observation | 120s |
| Stop | summarize | 120s |

Plus a pre-hook script for cached dependency checks.

Notable design discipline: **hooks never block on errors**. They exit 0 on failure to prevent Windows Terminal tab accumulation. The Setup hook prints `run: npx claude-mem repair` to stderr on mismatch but never blocks the session.

## Skills surface

**~15 skills total**, only 2-3 strictly memory-related:

- `mem-search` — natural language queries with progressive disclosure (the canonical memory skill)
- `make-plan`, `pathfinder`, `learn-codebase`, `smart-explore`, `knowledge-agent`, `oh-my-issues`, `weekly-digests`, `timeline-report`, `version-bump`, `babysit`, `do`, `how-it-works`, `design-is`, `wowerpoint` — workflow tools that *use* memory but aren't memory primitives

This skill diversity is a major differentiator vs other memory tools and a source of daily user value.

## MCP server

`src/servers/mcp-server.ts` exposes **4 core tools + 6 corpus tools** (added in v13):

Core:

- `search(query, limit, project, type, dateStart, dateEnd, offset, orderBy)` — FTS5 index, ~50-100 tokens/result
- `timeline(anchor, query, depth_before, depth_after)` — anchor can be numeric, `S<n>`, or ISO timestamp
- `get_observations(ids)` — full details, ~500-1000 tokens/result
- `citations` — observation IDs and their source

Corpus (v13+):

- `build_corpus`, `list_corpora`, `prime_corpus`, `query_corpus`, `rebuild_corpus`, `reprime_corpus`

## Web viewer

React UI at `http://localhost:37777`. Observation IDs surface as `http://localhost:37777/api/observation/{id}`. Per-user port; isolated across profiles.

## Privacy / security

- `<private>` tags strip content from storage.
- Worker service binds to per-user port via `CLAUDE_MEM_WORKER_PORT`.
- CORS restricted to localhost (learned in v10.x).
- DOMPurify XSS hardening on the viewer.

## Schema (from `src/services/sqlite/migrations.ts`)

The observations table includes:

```sql
id INTEGER PRIMARY KEY AUTOINCREMENT
session_anchor TEXT  -- 'S<n>' or ISO
title, subtitle, narrative
facts, concepts        -- AI-extracted
files_read, files_modified  -- arrays
created_at INTEGER
```

Plus an FTS5 virtual table mirroring the searchable columns. Auto-increment integer IDs render as `#42` in citations.

## Confirmed bugs (worth designing around)

- **anthropics/claude-code [#24115](https://github.com/anthropics/claude-code/issues/24115)**: plugin hooks fire **twice** because Claude Code loads from both `marketplaces/<name>/plugin/hooks/hooks.json` AND `cache/<name>/<version>/hooks/hooks.json`.
- **anthropics/claude-code [#29724](https://github.com/anthropics/claude-code/issues/29724)**: hooks registering for the same event are de-duplicated by raw command-template string **before `${CLAUDE_PLUGIN_ROOT}` expansion**. Two plugins running `bash ${CLAUDE_PLUGIN_ROOT}/hook.sh` collide; only one survives.

## How claude-mem informed our ADRs

| Finding | Our response |
|---|---|
| Global opaque storage (SQLite + Chroma at `~/.claude-mem/`) | Rejected — we chose markdown source-of-truth (ADR-0002). Reason: hand-editability, git mergeability, wiki ingestion. |
| 6 lifecycle hooks | Borrowed but revised — 5 + 1 Setup, with PreToolUse dropped and PostToolUse narrowed (ADR-0006). |
| Auto-increment integer IDs | Rejected — not portable across machines. We use content-addressed 8-char base32 hashes (ADR-0007). |
| 4-tool MCP surface | Borrowed and adapted — our 5-tool surface adds `mk_remember` for explicit user-driven saves. |
| Worker service + per-user port | Considered for v0.2; v0.1 uses simpler background `bash` spawns (the proven v0.0.1 path). |
| ~15 companion skills (make-plan, weekly-digests, etc.) | Out of scope for v0.1 (per requirements.md OS-2). Possible v0.2+ direction. |
| Web viewer | Lightweight version planned for v0.1 (markdown renderer, port 37778 to avoid collision with claude-mem's 37777). |
| Hooks never block on errors (exit 0) | Adopted. (Already the pattern in v0.0.1.) |
| Profile separation via env var | Deferred. Our three-tier scope (ADR-0003) covers most of this use case. |

## Caveat on star count

claude-mem's 77,244 stars is unusually high for a year-old, single-maintainer plugin. Some GitHub UI pages may show inflated counts during indexing. Treat with mild skepticism — but the project's commit cadence (1,906 commits, latest commit within hours of survey) confirms it IS actively maintained at high velocity, even if the star count is partially platform artifact.

## References

- Repo: <https://github.com/thedotmack/claude-mem>
- Latest release: <https://github.com/thedotmack/claude-mem/releases/tag/v13.3.0>
- Issue #24115 (hook double-fire): <https://github.com/anthropics/claude-code/issues/24115>
- Issue #29724 (command-template dedup): <https://github.com/anthropics/claude-code/issues/29724>
- Claude Code plugins docs (verified 2026-05-21): <https://code.claude.com/docs/en/plugins>
- Related ADRs: [0002-markdown-source-of-truth-over-opaque-db.md](../adr/0002-markdown-source-of-truth-over-opaque-db.md), [0006-lifecycle-hooks-architecture.md](../adr/0006-lifecycle-hooks-architecture.md), [0007-content-addressed-citation-ids.md](../adr/0007-content-addressed-citation-ids.md)
- Conversation context: [../conversation-log/2026-05-21.md](../conversation-log/2026-05-21.md), thread "Discovery that claude-mem exists"
