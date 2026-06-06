---
adr: 0011
title: Coexistence strategy with Anthropic's built-in Auto Memory (Claude Code v2.1.59+)
status: accepted
date: 2026-05-22
decision_date: 2026-05-31
deciders:
  - the maintainer
  - Claude Opus 4.7 (proposing) / Claude Opus 4.8 (resolving)
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
  - accepted
---

# ADR-0011 — Coexistence strategy with Anthropic's built-in Auto Memory (Claude Code v2.1.59+)

## Status

**Accepted 2026-05-31.** **Option C (coexist) is the default; Option A (disable native) is a one-command, committable, user-invoked opt-in.** Originally proposed 2026-05-22 with a default of Option A; revised to non-enforcement after the user's 2026-05-31 review. See "Decision" below.

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

## Decision (accepted 2026-05-31)

**Option C is the default — the kit coexists and does NOT touch the user's native Auto Memory. Option A is offered as a one-command, committable, user-invoked opt-in.**

**Rationale** (the user, 2026-05-31): the kit must be **additive, not enforcing**. Silently reaching into a user's Claude Code to disable a native feature is the wrong posture (the original default-A). Default to non-interference; inform; let the user choose.

Concretely:

1. **Default = coexist (C).** `cmk install` does NOT change `autoMemoryEnabled`. The kit adds its in-repo `context/` layer; Anthropic's machine-local auto-memory keeps running untouched.
2. **Transparency.** `cmk install` prints a heads-up: two memory layers are now active; as both accumulate they inflate the session-start context (≈25 KB native `MEMORY.md` + ≈13 KB kit snapshot); to run a single lean layer, disable the native one with `cmk disable-native-memory`.
3. **`cmk disable-native-memory` (the opt-in to A).** Writes `autoMemoryEnabled: false` into the project's `.claude/settings.json` — which IS committable, so the choice **travels with `git clone`** (unlike Option B's user-only `autoMemoryDirectory`). Reversible via `cmk enable-native-memory` (or editing the file).
4. **Discoverability via `cmk doctor`.** A health-check detects "native auto-memory ON + kit installed" and surfaces the bloat + the disable command — so the choice is discoverable later, not just a skimmed install line (the install-message-gets-ignored UX lesson from the v0.1.1 self-test).

**Why not A as the default:** silent enforcement of the kit's memory over the user's native one — The user rejected this 2026-05-31. **Why not B:** `autoMemoryDirectory` is user-level-only (not committable → breaks git-clone portability) AND Anthropic writes its own `<type>_<slug>.md` format, not the kit's citation-ID / provenance / trust schema (so redirected files wouldn't index with `cmk`). Both are detailed under Options above.

**Investigation status:** Q1 (does native fire with our hooks installed?) — confirmed **YES**; native auto-memory is ON by default (verified 2026-05-31: no `autoMemoryEnabled` in user settings + env unset → Anthropic default = enabled; it had been writing to ClawdBot/liorpedia/liorwiki). Q2/Q3 are folded into the non-enforcement principle above.

Implementation: [`tasks.md`](../../specs/v0.1.0/tasks.md) Task 60.

### Reaffirmed 2026-06-06 (new evidence — coexist-default HELD; D-74)

The v0.2.0 cut-gate produced the first manual run (`cut-gate3`, Claude Code v2.1.167) where the agent captured to **native** Auto Memory and never called `cmk remember`, leaving the kit's `context/memory/` empty. This looked like a reason to flip the default to disable-by-default (Option A). Investigation (full write-up: [`2026-06-06-native-auto-memory-coexistence-investigation.md`](../research/2026-06-06-native-auto-memory-coexistence-investigation.md)) **reaffirmed Option C**:

- **It's variance, not a deterministic break:** a same-version re-run (`mem-test3`, also v2.1.167) used the kit correctly (`cmk remember --why/--how`). Same version → both outcomes; the host-version-causation theory is disproved (no documented Auto Memory change in 2.1.160–2.1.167).
- **The blast radius is bounded:** the kit's Stop-hook `cmk-auto-extract` is **immune** (it reads the conversation, not the agent's tool choice) and still filled the cross-project persona + terse bullets in `cut-gate3`. Only the **rich project fact files** are lost when native wins a turn.
- **The whole field coexists:** 10 competitor READMEs — none disable native; all capture via the Stop hook (no agent-invoked "remember" command for native to compete with).

So forcing disable-by-default would be a heavy, field-divergent change for an *intermittent* loss of the *least-critical* tier. **Proportionate response:** keep coexist-default; make `cmk disable-native-memory` prominent/recommended; and fix the *real* gap by enriching `cmk-auto-extract` to write rich fact files (the immune path) — **[Task 103](../../specs/v0.1.0/tasks.md)**. A PreToolUse hard-block (the only *forced* redirect) was considered and **REJECTED by the user (2026-06-06)** — intercepting Claude Code's own tool calls is too invasive/fragile for an intermittent issue.

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

## Original default (superseded 2026-05-31)

_Originally: if shipping without a decision, default to **Option A** (the installer sets `autoMemoryEnabled: false`). **Superseded by the Decision above** — the default is now Option C (coexist), with A as a one-command opt-in. The original A-default is preserved here per the decision-trail rule: it was set aside because silently disabling a user's native feature is enforcement — NOT because A's mechanics were wrong (those mechanics now power `cmk disable-native-memory`)._

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
- Conversation context: [conversation-log/2026-05-22.md](../../archive/docs/conversation-log/2026-05-22.md) (will be updated to reflect this thread)

## Review history

| Date | Reviewer | Action |
|---|---|---|
| 2026-05-22 | Claude (proposing) | Drafted; status proposed (default-A if undecided) |
| 2026-05-31 | the user | **Accepted** — Option C default (coexist, non-enforcement) + `cmk disable-native-memory` as a committable, user-invoked opt-in to A. Implementation tracked as Task 60. |
