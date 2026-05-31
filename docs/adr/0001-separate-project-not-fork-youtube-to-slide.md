---
adr: 0001
title: Build claude-memory-kit as a separate project, not by forking youtube-to-slide
status: accepted
date: 2026-05-21
deciders:
  - Lior Hollander (project owner)
  - Claude Opus 4.7 (proposing architect)
supersedes: null
superseded_by: null
related:
  - 0002-markdown-source-of-truth-over-opaque-db.md
  - 0003-per-project-with-future-cross-project-tier.md
tags:
  - scope
  - project-structure
  - extraction
---

# ADR-0001 — Build claude-memory-kit as a separate project, not by forking youtube-to-slide

## Status

**Accepted** 2026-05-21.

## Context

The memory system (PreToolUse hook, Stop hook, auto-extract, memory-write skill, frozen-snapshot pattern, SOUL/USER/MEMORY scratchpads, granular memory archive, optional memsearch + Milvus layer, optional cron-based curation) was originally built inside the `youtube-to-slide` repository as a one-off for that project. It worked. The user wanted to apply the same pattern to other projects (liorpedia next, then potentially others).

Three structural options were on the table:

1. **Keep the system embedded in `youtube-to-slide`** and copy-paste files manually into each new project that wants it.
2. **Extract the memory system into a `memory-kit/` subfolder of `youtube-to-slide`** as a staging area.
3. **Extract into a brand-new repository** (`claude-memory-kit`), independent of `youtube-to-slide`, with its own install scripts and documentation.

The user wanted the memory system to:

- Be installable on any project (Windows, macOS, Linux).
- Be installable on a new machine via `git clone` + a single bootstrap command.
- Not drag `youtube-to-slide`'s slide-extraction pipeline along with it.
- Be publishable to GitHub as a standalone artifact (eventually).

## Decision

**We extracted the memory system into a brand-new repository at `C:/Projects/claude-memory-kit/` (option 3).**

Specifically:

- A new private GitHub repository at `https://github.com/LH8PPL/claude-memory-kit`.
- A `template/` directory containing the per-project memory files (`.claude/`, `context/`, `scripts/`, `milvus-deploy/`, `cron/jobs/`) with `{{TODAY}}` and `{{PROJECT_NAME}}` placeholders.
- A `plugin/` directory packaging the same components as a Claude Code plugin (`.claude-plugin/plugin.json`, `hooks/hooks.json`, `skills/`, `bin/`).
- Cross-OS install scripts: `install.sh` (Bash) and `install.ps1` (PowerShell).
- Tagged `v0.0.1` immediately as a recoverable baseline before any further changes.
- `youtube-to-slide`'s in-repo memory system remains untouched; the extraction copied files, did not move them.

## Consequences

### Positive

- Clean separation of concerns: `youtube-to-slide` is a slide pipeline; `claude-memory-kit` is a memory system. Each can evolve independently.
- The kit can be installed on new projects without dragging slide-pipeline code along.
- A public release path is straightforward when the user is ready (currently private, public when ready).
- Versioning is independent: kit v0.1, v0.2... do not couple to slide-pipeline releases.
- The `youtube-to-slide` baseline survives as a proven reference implementation — if the kit's extraction lost something, we can compare.

### Negative

- Two repos to maintain. If a bug fix applies to both, it needs to be applied twice (or the kit needs to be re-installed into `youtube-to-slide`).
- Until v0.1 lands, `youtube-to-slide`'s memory is "frozen" — improvements happen in the kit and don't backflow until we re-install.

### Neutral

- The decision does not preclude later promoting the kit to a public marketplace plugin (`/plugin install claude-memory-kit`).

## Alternatives considered (and why rejected)

| Alternative | Why rejected |
|---|---|
| Keep embedded in `youtube-to-slide`, copy-paste per project | Manual copy is error-prone; no versioning; no clean install path on a new machine. |
| Subfolder in `youtube-to-slide` as staging | Conflates two unrelated projects in one repo. Users `git clone`ing for the slide pipeline would pull memory code they don't need; users wanting memory get slide code they don't need. |
| Publish to npm/PyPI immediately as v1.0 | Premature. v0.0.1 baseline first, public release when stable. |

## References

- Original `youtube-to-slide` memory system: <https://github.com/LH8PPL/youtube-to-slide> (in the `context/`, `.claude/`, `scripts/` directories at commit `15dcc2e` and later)
- `claude-memory-kit` v0.0.1 baseline: <https://github.com/LH8PPL/claude-memory-kit/releases/tag/v0.0.1> (commit `5d9933e`, 56 files, 4,119 lines)
- Conversation context: [conversation-log/2026-05-21.md](../../archive/docs/conversation-log/2026-05-21.md), thread "Q2 — portable memory kit"

## Review history

| Date | Reviewer | Action |
|---|---|---|
| 2026-05-21 | Lior | Decided in conversation; kit scaffolded same day |
| 2026-05-21 | Lior | v0.0.1 tagged and pushed |
