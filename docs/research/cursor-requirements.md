---
date: 2026-05-23
topic: Cursor's claude-memory-kit v0.1.0 requirements draft
source: Cursor IDE (cursor-test-memory-kit/requirements.md)
status: complete
informed_adrs: [0011]
tags:
  - cursor
  - competitive-analysis
  - spec-generator-comparison
  - mvp-vs-architecture
---

# Research: Cursor's claude-memory-kit requirements (verbatim capture)

## Why this research

Cursor (the IDE) is the fourth spec-generator we've asked to produce a `requirements.md / design.md / tasks.md` triple for claude-memory-kit (after ChatGPT, Kiro, Google Antigravity). Cursor produced a notably **MVP-shaped** v0.1 versus our **architecture-shaped** v0.1, so it's the strongest counter-design data point we have.

Captured here verbatim for the audit trail. Comparison findings live in conversation-log/2026-05-23.md.

## Verbatim content

```markdown
# Requirements — memory-kit v0.1.0

## Problem statement

Claude Code starts every session with no memory of previous sessions. Users must re-explain project context, preferences, and architectural decisions. This is **structural amnesia**: context does not persist in a portable, team-shared form across machines or `git clone`.

Native mitigations (CLAUDE.md, auto memory) partially help but do not satisfy durable, auditable, in-repo team memory with explicit user control and bounded scratchpads.

## Goals

| ID | Goal |
|----|------|
| G-01 | Store durable project knowledge as human-readable Markdown inside the git repo |
| G-02 | Support three scopes: **user** (cross-project), **project** (in-repo), **local** (per-machine, gitignored) |
| G-03 | Load memory at session start via Claude Code lifecycle hooks |
| G-04 | Provide explicit controls: remember, forget, search, cite by stable ID |
| G-05 | Enforce bounded scratchpads with hard character caps and rolling compression |
| G-06 | Coexist with Claude Code native CLAUDE.md and auto memory (v2.1.59+) |
| G-07 | Expose programmatic access via MCP (stdio, no network) |
| G-08 | Regenerable SQLite FTS5 index; Markdown remains source of truth |

## Non-goals (v0.1.0)

- Replacing or disabling auto memory
- LLM-based automatic fact extraction from arbitrary conversation
- Vector DB / Milvus / semantic embeddings
- Cloud sync, hosted backends, or silent network calls
- Cron / nightly distill jobs (deferred to v0.2)
- Promoting facts into `~/.claude/projects/*/memory/` (deferred)

---

## Functional requirements

### Scope and storage

| ID | Requirement |
|----|-------------|
| FR-001 | **Project** facts live under `.memory/facts/archive/` with IDs prefixed `P-` |
| FR-002 | **User** facts live under `~/.memory-kit/facts/archive/` (override via `MEMORY_KIT_USER_DIR`) with IDs prefixed `U-` |
| FR-003 | **Local** facts live under `.memory.local/facts/archive/` (gitignored) with IDs prefixed `L-` |
| FR-004 | Each fact is one Markdown file with YAML frontmatter and stable `id` field |
| FR-005 | `facts/INDEX.md` lists curated fact summaries for fast digest building |
| FR-006 | Citation format `[mem:<id>]` is documented and returned by CLI/MCP |

### Scratchpad

| ID | Requirement |
|----|-------------|
| FR-010 | Three tiers: `scratch/now.md`, `scratch/today.md`, `scratch/recent.md` |
| FR-011 | Configurable `max_chars` per tier in `.memory/config.yaml` (defaults: 4000 / 8000 / 12000) |
| FR-012 | Writes enforce caps by dropping oldest bullet lines first |
| FR-013 | `memory-kit roll` merges now→today→recent→session archive on schedule / SessionEnd |
| FR-014 | Session logs stored as `sessions/YYYY-MM-DD.md`; overflow archived under `sessions/archive/YYYY-MM/` |

### User commands

| ID | Requirement |
|----|-------------|
| FR-020 | `/remember <text>` or `remember: <text>` creates/updates a project fact |
| FR-021 | `/forget <id>` or `forget: <id>` tombstones or archives a fact |
| FR-022 | CLI: `memory-kit remember`, `forget`, `get`, `search`, `roll`, `load`, `init`, `doctor` |
| FR-023 | Optional scope flags: `--scope project|user|local` |

### Lifecycle hooks

| ID | Requirement |
|----|-------------|
| FR-030 | `SessionStart`: inject digest via `hookSpecificOutput.additionalContext` (≤10,000 chars) |
| FR-031 | `UserPromptSubmit`: parse remember/forget commands; apply writes |
| FR-032 | `Stop`: append one-line turn summary to `scratch/now.md` |
| FR-033 | `SessionEnd`: fast roll + append session summary (respect ~1.5s default budget) |
| FR-034 | `PostToolUse` (matcher Edit|Write): validate `.memory/**` edits with `retain: true` only |
| FR-035 | Hooks registered via `.claude/settings.json` template from `memory-kit init` |

### MCP

| ID | Requirement |
|----|-------------|
| FR-040 | Stdio MCP server with tools: `memory_remember`, `memory_forget`, `memory_get`, `memory_search`, `memory_scratch` |
| FR-041 | Project `.mcp.json` template from `init` |
| FR-042 | `memory-kit index --rebuild` rebuilds FTS5 from Markdown |

### Coexistence

| ID | Requirement |
|----|-------------|
| FR-050 | Do not write to `~/.claude/projects/*/memory/` unless user runs explicit promote (out of scope) |
| FR-051 | CLAUDE.md holds instructions; memory-kit holds facts |
| FR-052 | `private: true` facts excluded from SessionStart digest and never auto-promoted to project |
| FR-053 | `init` adds minimal CLAUDE.md snippet pointing to memory-kit (non-destructive merge) |

### Security / poisoning

| ID | Requirement |
|----|-------------|
| FR-060 | Auto-extract (v0.1): only paths under `.memory/**` with valid frontmatter and `retain: true` |
| FR-061 | No LLM inference of facts from transcript in v0.1 |
| FR-062 | Append-only audit log at `.memory/.meta/audit.log` for remember/forget/roll |
| FR-063 | Documentation warns against storing credentials in project scope |

---

## Non-functional requirements

| ID | Requirement |
|----|-------------|
| NFR-001 | Cross-OS: Windows, macOS, Linux |
| NFR-002 | Portable via `git clone`; no machine-local paths in project facts |
| NFR-003 | Markdown is source of truth; `.memory/.cache/index.db` is regenerable |
| NFR-004 | No outbound network calls from kit binaries |
| NFR-005 | Python 3.12+; minimal deps (PyYAML only beyond stdlib) |
| NFR-006 | Hook scripts invokable via `python -m memory_kit` or installed `memory-kit` entrypoint |
| NFR-007 | SessionEnd hook completes roll in <1.5s on typical repos |

---

## Acceptance criteria (v0.1.0)

1. Fresh clone → `pip install -e .` → `memory-kit init` creates `.memory/`, `.memory.local/`, templates, gitignore entries, hook/MCP snippets.
2. `memory-kit remember "API uses OAuth2"` creates `P-*.md` and updates `INDEX.md`.
3. `memory-kit search oauth` returns the fact via FTS5.
4. Simulated `SessionStart` hook stdout contains `additionalContext` under 10,000 chars with scratch + index content.
5. `/remember` via `hook prompt` stdin creates a fact.
6. `Stop` hook appends to `now.md` without exceeding cap.
7. `SessionEnd` hook rolls scratch and writes session log.
8. MCP tools callable via stdio (smoke test).
9. Auto memory remains untouched (no writes under `~/.claude/projects/*/memory/`).
10. `pytest` passes for core modules.

---

## Out of scope (v0.1.0)

- Milvus / vector search
- Cron: daily distill, nightly index, weekly curate
- LLM auto-extract from conversation
- `memory-kit import project-notes` (optional stretch — implement if time)
- PreToolUse schema enforcement (optional)
- One-way promote to Claude auto memory
```

## Key divergences from our spec (at a glance)

| Topic | Cursor | Ours |
| --- | --- | --- |
| Implementation language | Python 3.12+ | Node (`@claude-memory-kit/cli`) |
| Project dir | `.memory/` (hidden) | `context/` (visible) |
| Local tier | `.memory.local/` (top-level) | `context.local/` (post-Cursor rename) |
| IDs | Sequential numeric (`P-000042`) | Content-addressed base32 SHA-256 (`P-A8FN3MQ2`) |
| LLM auto-extract | Deferred to v0.2 | Layer 4 core (T-020) |
| Vector search | Deferred to v0.2 | Optional Layer 5 |
| Cron | Deferred entirely | Optional Layer 6 + lazy fallback (§8.2.1) |
| MCP transport | stdio (per MCP spec) | stdio (post-Cursor correction) |
| Privacy | `private: true` frontmatter | `<private>` inline tags + `private: true` (post-Cursor borrow) |
| Hooks | 5 (no Setup) | 6 (incl. Setup) |
| Conflict/review queues | None | Yes (§6.8, §6.2) |
| Poison_Guard secret regex | No | Yes (§6.7) |
| Tombstone discipline | `status: archived` flag | Move to `archive/tombstones/` + frontmatter |
| Total effort estimate | ~22 hours | ~50 dev-days |

## What we absorbed from Cursor's spec

1. **`MEMORY_KIT_USER_DIR` env var override** for user-tier path (testing + multi-account).
2. **Configurable `max_chars` per tier in config.yaml** (replaces our hardcoded caps).
3. **`cmk roll` user-callable command** (manual force-roll without ending session).
4. **`private: true` per-fact frontmatter flag** (complement to `<private>` inline tags).
5. **MCP stdio transport** (replaces our incorrect 127.0.0.1 HTTP spec).
6. **`context.local/` (sister-dir naming)** to replace `.claude/local/` for the local tier (avoids Claude Code namespace pollution).

## What we explicitly rejected

1. **Sequential numeric IDs** — keeps Cursor simple but loses content-addressed dedup + cross-machine determinism.
2. **Deferring all LLM auto-extract** — the auto-extract subagent IS the killer feature; Layer 4 architecture exists to enable it.
3. **Deferring all cron** — covered by lazy compression fallback (design §8.2.1) for no-cron environments; cron remains the production answer.
4. **Renaming `context/` → `.memory/`** — `context/` wins on visibility, git-tree discoverability, survives cleanup scripts. See conversation-log entry for full rationale.

## Reference

- Source files captured at `C:\Projects\cursor-test-memory-kit\{requirements,design,tasks}.md` (machine-local; Cursor IDE output 2026-05-23).
- Related ADR: [0011-coexist-with-anthropic-auto-memory.md](../adr/0011-coexist-with-anthropic-auto-memory.md).
- Conversation context: [../conversation-log/2026-05-23.md](../conversation-log/2026-05-23.md).
