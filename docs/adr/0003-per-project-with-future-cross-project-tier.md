---
adr: 0003
title: Per-project memory in v0.1; three-tier scope (user / project / local) lands in v0.1.0 design
status: accepted
date: 2026-05-21
deciders:
  - the maintainer
  - Claude Opus 4.7
supersedes: null
superseded_by: null
related:
  - 0001-separate-project-not-fork-youtube-to-slide.md
  - 0002-markdown-source-of-truth-over-opaque-db.md
tags:
  - scope
  - memory-tiers
  - design-tenet
---

# ADR-0003 — Per-project memory in v0.1; three-tier scope (user / project / local) lands in v0.1.0 design

## Status

**Accepted** 2026-05-21. The three-tier model is design tenet **T2 + T3** in [specs/v0.1.0/requirements.md](../../specs/v0.1.0/requirements.md).

## Context

`claude-mem` (thedotmack) stores all memory globally at `~/.claude-mem/` — one shared corpus across every project the user opens. Cross-project search "just works"; conversely, project-specific personas leak across projects, and one project's noise pollutes another's signal.

`claude-remember` (Digital-Process-Tools) stores per-project at `.remember/` — clean separation, but cross-project knowledge (your name, your role, your habits) must be duplicated into every project's files.

The user's stated needs:

- Same project across multiple machines / multiple sessions → continuity (favors per-project).
- Same person across multiple projects → don't re-explain who I am every time (favors cross-project).
- Project-specific conventions sometimes override personal preferences (e.g., a Rust shop overriding "I prefer Python") → need a precedence model.
- Some paths and overrides are per-project AND per-machine (where Tesseract is on *this* laptop) → need a local-only tier that doesn't sync to git.

Neither pure global nor pure per-project covers all four. Three-tier covers them naturally.

## Decision

**v0.1.0 will support three memory tiers:**

| Tier | Location | Scope | In git? |
|---|---|---|---|
| **User tier** | `~/.claude-memory-kit/` | Cross-project, single human | No (lives in user's home, machine-local) |
| **Project tier** | `<repo>/context/` | This one project | Yes — committed and travels with `git clone` |
| **Local tier** | `<repo>/.claude/local/` | This project AND this machine | No — automatically added to `.gitignore` |

**Precedence at session start**: `local > project > user` (highest to lowest). First-match-wins at the observation level (Git config semantics); deep-merge at the settings level.

**v0.1 implementation order**:

- The project tier is the priority. It must work end-to-end.
- The user tier is scaffolded (directory layout + bootstrap command) but optional — bootstrap can be skipped.
- The local tier is scaffolded with the `.gitignore` auto-injection but contents are user-discretion.

## Consequences

### Positive

- Cross-project facts (your name, expertise, working style) live in one place.
- Project-specific personas remain isolated — no leakage.
- Machine-specific paths don't get committed by mistake.
- Mirrors mental models users already have from Git config (`local > global > system`) and VS Code settings (workspace > user > default).

### Negative

- Three locations to keep straight when debugging "where is this fact coming from?" Mitigated by `cmk config --show-origin` (mirroring `git config --show-origin`) — see Q6 of [research/2026-05-21-claude-ai-deep-research-option-b.md](../research/2026-05-21-claude-ai-deep-research-option-b.md).
- More install surface area: `cmk install-user-tier` is a separate one-time step from project bootstrap.

### Neutral

- The precedence model is opt-in by user discipline. A user who never creates a user tier just gets per-project behavior — same as v0.0.1.

## Alternatives considered (and why rejected)

| Alternative | Why rejected |
|---|---|
| Pure per-project (v0.0.1's model, claude-remember's model) | User identity (name, role, preferences) gets duplicated across every project. Annoying. |
| Pure global (claude-mem's model) | Project personas leak across projects; "I prefer terse responses on data-science project" should not influence "wedding planning project." |
| Two tiers (user + project only, no local) | Machine-specific paths (Tesseract location, Python version) would force a choice: commit them (breaks for the other machine) or duplicate them as `local: { laptop: X, desktop: Y }` markers (ugly). Local tier solves this cleanly. |
| Four tiers (user / org / project / local) | Org-level was considered but rejected for v0.1 — solo developer, no shared infrastructure yet. Revisit if a team adopts the kit. |

## References

- Git config precedence reference (the model we mirror): <https://git-scm.com/docs/git-config>
- VS Code settings precedence: <https://code.visualstudio.com/docs/getstarted/settings>
- Direnv cautionary tale (no cascade → users surprised; informed our "first-match-wins + show-origin" choice): [direnv issue #111](https://github.com/direnv/direnv/issues/111)
- `chezmoi` machine-specific templating (informed our `local` tier rationale): <https://www.chezmoi.io/>
- Research source: [research/2026-05-21-claude-ai-deep-research-option-b.md](../research/2026-05-21-claude-ai-deep-research-option-b.md), Q6
- Conversation context: [conversation-log/2026-05-21.md](../../archive/docs/conversation-log/2026-05-21.md), thread "Per-project vs cross-project"

## Review history

| Date | Reviewer | Action |
|---|---|---|
| 2026-05-21 | the user | Initial decision: yes to three-tier model |
| 2026-05-22 | the user | Confirmed via Option-B research; first-match-wins precedence locked in |
