---
adr: 0011
title: Coexistence strategy with Anthropic's built-in Auto Memory (Claude Code v2.1.59+)
status: proposed
date: 2026-05-22
deciders:
  - Lior Hollander (decision pending)
  - Claude Opus 4.7 (proposing)
supersedes: null
superseded_by: null
related:
  - 0002-markdown-source-of-truth-over-opaque-db.md
  - 0003-per-project-with-future-cross-project-tier.md
  - 0006-lifecycle-hooks-architecture.md
tags:
  - coexistence
  - anthropic-native
  - critical-decision
  - open
---

# ADR-0011 — Coexistence strategy with Anthropic's built-in Auto Memory (Claude Code v2.1.59+)

## Status

**Proposed.** Awaiting user decision. Three options on the table; user requested investigation before deciding.

## Context

On 2026-05-22, while reviewing Faisal Haque's article *"Give Claude Permanent Memory"* (Plain English, 2026-05-04), we discovered that **Anthropic ships an Auto Memory feature in Claude Code v2.1.59+** that uses **the same architectural pattern** we designed independently:

- `MEMORY.md` as the entrypoint, with first 200 lines / 25KB loaded at session start.
- `<type>_<slug>.md` granular topic files (e.g., `feedback_autonomy.md`, `project_bob_setup.md`).
- Auto-written by Claude during sessions based on its judgment of what's worth remembering.
- Topic files read on demand during sessions.

The user's machine (Claude Code v2.1.140) has been silently writing auto-memory to four projects for weeks. Inspection confirmed the file structure is literally `MEMORY.md + <type>_<slug>.md`, matching our design exactly.

**Key difference**: storage location.

| | Anthropic Auto Memory | claude-memory-kit |
|---|---|---|
| Location | `~/.claude/projects/<project>/memory/` (machine-local, slug-derived) | `<repo>/context/` (in-repo, committed) |
| Travels with `git clone` | **No** | **Yes** |

Full research: [research/2026-05-22-anthropic-claude-code-auto-memory.md](../research/2026-05-22-anthropic-claude-code-auto-memory.md).

## The decision required

How should claude-memory-kit relate to Anthropic's built-in Auto Memory when installed in a project?

## Options

### Option A — Disable Anthropic's; ours is the only writer

`autoMemoryEnabled: false` set in the project's `.claude/settings.json` (which IS commitable, unlike `autoMemoryDirectory`).

**Pros:**

- Single source of truth for memory in the project.
- Commitable — `git clone` of a kit-using project gets the right setting automatically.
- No risk of two MEMORY.md files diverging.
- All our differentiators (3-tier scope, citation IDs, provenance, rolling-window compression, raw transcript archive) remain meaningful.

**Cons:**

- Lose Anthropic's well-tuned model judgment on what's worth remembering.
- Users coming from existing Anthropic auto-memory need a migration path (their existing `~/.claude/projects/<slug>/memory/` content is orphaned).

### Option B — Redirect Anthropic's to write into our `context/`

Set `autoMemoryDirectory: <absolute path>/context/memory` in user-level settings.

**Pros:**

- We get Anthropic's writer for free.
- Drop our auto-extract Stop hook + `scripts/auto-extract-memory.sh` — significant scope reduction.

**Cons:**

- **`autoMemoryDirectory` is per-user, not commitable** (security feature in Anthropic: project/local settings cannot redirect auto-memory). Each user on each machine must configure manually.
- Defeats the "git clone and go" promise of the kit.
- We don't control schema/format — Anthropic's writer doesn't know about our citation IDs, provenance frontmatter, etc.
- Our advanced features (3-tier scope precedence, rolling-window compression) would need to wrap around Anthropic's writes, adding complexity.

### Option C — Layer them; both write to different locations

Anthropic writes to `~/.claude/projects/<slug>/memory/` as designed. Our hooks write to `<repo>/context/` as designed. Two memories coexist.

**Pros:**

- Zero lost work; nothing to disable or reconfigure.
- Anthropic's machine-local memory captures session-by-session learnings; our in-repo memory captures committable project state.
- Both can be loaded into context (Anthropic auto-loads first 200 lines of its MEMORY.md; our PreToolUse hook loads our `context/` snapshot).

**Cons:**

- **Two MEMORY.md files in two locations.** "Where does this fact live?" becomes a confusing question.
- Token budget at session start grows — two snapshots loaded at session open.
- Potential redundant captures: both writers may save the same fact in different places.

## Decision criteria (what would tip the choice)

Before resolving, we need to know:

1. **Does Anthropic's auto-memory fire when our hooks are installed?**
   - Empty `~/.claude/projects/C--Projects-youtube-to-slide/memory/` (where our hooks are installed) is suggestive but not conclusive.
   - Test: a controlled session with both hooks active and a clear "remember this" prompt. Does Anthropic also write?

2. **What does Anthropic capture that we miss, or vice versa?**
   - Open `/memory` in a session and inspect Anthropic's writes in ClawdBot/liorpedia/liorwiki.
   - Compare against what our auto-extract would have captured for the same content.

3. **What does the user want philosophically?**
   - "Belt and suspenders" → Option C.
   - "Single source of truth" → Option A.
   - "Minimize our maintenance burden" → Option B (if the per-user-setup cost is acceptable).

## Default if no decision is made

If we have to ship v0.1 without a decision, **the default is Option A**: our installer sets `autoMemoryEnabled: false` in the project's `.claude/settings.json`. This is reversible (user can re-enable) and avoids the two-MEMORY.md-files confusion.

A future ADR may revise based on real-world usage.

## What's NOT being decided here

- Whether to keep our 3-tier scope (yes, kept per ADR-0003).
- Whether markdown is source of truth (yes, kept per ADR-0002).
- Whether citation IDs are content-addressed (yes, kept per ADR-0007).
- Whether to ship the 5+1 hooks (yes, kept per ADR-0006).

This ADR is narrowly about Anthropic-coexistence, not about our core architecture.

## References

- Research: [research/2026-05-22-anthropic-claude-code-auto-memory.md](../research/2026-05-22-anthropic-claude-code-auto-memory.md)
- Anthropic docs: <https://code.claude.com/docs/en/memory>
- Article that triggered this: <https://ai.plainenglish.io/give-claude-permanentmemory-7b4343de2d7e>
- Conversation context: [conversation-log/2026-05-22.md](../conversation-log/2026-05-22.md) (will be updated to reflect this thread)

## Review history

| Date | Reviewer | Action |
|---|---|---|
| 2026-05-22 | Claude (proposing) | Drafted; status proposed |
| YYYY-MM-DD | Lior | (pending) |
