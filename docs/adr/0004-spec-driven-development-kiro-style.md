---
adr: 0004
title: Spec-driven development using a Kiro-adapted workflow (requirements → design → tasks)
status: accepted
date: 2026-05-21
deciders:
  - Lior Hollander
  - Claude Opus 4.7
supersedes: null
superseded_by: null
related:
  - 0001-separate-project-not-fork-youtube-to-slide.md
tags:
  - process
  - methodology
  - governance
---

# ADR-0004 — Spec-driven development using a Kiro-adapted workflow (requirements → design → tasks)

## Status

**Accepted** 2026-05-21. Mandatory for all v0.1+ feature development. Conversational "vibe coding" is allowed only for trivial fixes (typo, lint, single-file refactor).

## Context

After v0.0.1 shipped (a 56-file, 4,119-line scaffold built conversationally in one session), the user observed that the approach was too unstructured for what comes next. v0.1 would absorb research from Claude.ai and ChatGPT Deep Research modes, fold in patterns from `claude-mem` and `claude-remember`, and ship across three install paths simultaneously — too large to plan in a chat.

The user pointed to AWS Kiro's "From Chat to Specs" methodology (<https://kiro.dev/blog/from-chat-to-specs-deep-dive/>), which produces three documents sequentially before any code change:

1. **`requirements.md`** — user stories, functional requirements with acceptance criteria, open questions.
2. **`design.md`** — architecture and technology choices, schemas, diagrams.
3. **`tasks.md`** — sequenced, executable implementation tasks.

Each document is reviewed and refined before the next one starts.

## Decision

**We adopt a Kiro-adapted spec-driven workflow** with these specifics:

### Phasing

For every v0.X release:

1. Write `specs/v0.X/requirements.md` first. Includes design tenets, user stories, functional requirements with EARS-style acceptance criteria (`When [trigger], the system shall [behavior]`), non-functional requirements, out-of-scope list, and open questions needing user decisions.
2. Conduct research (Deep Research mode, manual surveys) that informs decisions. Outputs go to [docs/research/](../research/).
3. Revise `requirements.md` based on research findings. User approves.
4. Write `specs/v0.X/design.md`. Includes schemas, code skeletons, diagrams, file-by-file architecture. User approves.
5. Write `specs/v0.X/tasks.md`. Each task references the FRs it implements; tasks are sequenced for buildability. User approves.
6. Implement in task order. Each task commit links to its task ID.

### Review checkpoints

- Strict Kiro: one document at a time. The user reviews and approves each before the next is written.
- Open questions in `requirements.md` MUST be resolved before `design.md` starts.
- Research findings can revise earlier documents — that's expected and OK.

### When NOT to use the spec flow

Skip the spec flow for:

- Typo fixes, lint cleanup, single-file refactors that don't change behavior.
- Doc-only changes (this file is an example — written conversationally, not from a spec).
- Hotfixes for confirmed bugs with a known fix.

For everything else, the spec flow is mandatory.

### Where specs live

- `specs/v0.X/{requirements,design,tasks}.md` — versioned with the release.
- Specs are committed to git. They are part of the deliverable.
- Old specs are NEVER deleted. v0.1's specs remain even after v0.2 ships; they document the project's history.

## Consequences

### Positive

- Forces explicit decisions before code, reducing rework.
- Creates an audit trail: every implementation can be traced to a FR, every FR to a user story, every user story to a tenet.
- Lets research inform requirements before requirements lock — avoids designing off stale assumptions.
- Specs are wiki-ingestion-ready: liorwiki indexes them naturally.
- Pairs cleanly with the ADR discipline ([adr/](../adr/)): ADRs capture *why*; specs capture *what*; the conversation log captures *how we got there*.

### Negative

- Slower than vibe coding for small changes (mitigated by the "skip for trivial" carve-out).
- Requires the user to actively review at each checkpoint. If the user is unavailable, work stalls — but that's the right tradeoff for governance.
- Three documents per release is overhead. Each release should be substantive enough to justify the overhead.

### Neutral

- The flow works equally well solo (one developer + one Claude) and in a team (the documents are the team's shared artifact).

## Alternatives considered (and why rejected)

| Alternative | Why rejected |
|---|---|
| Pure vibe coding (v0.0.1's approach) | Worked for the scaffold but missed prior art (claude-mem). Not robust enough for v0.1's scope. |
| One big design doc, no requirements/tasks split | Loses the review checkpoint between *what* and *how*. Users approve the design without separately validating that the requirements were right. |
| ADRs without specs (decisions but no end-to-end design) | ADRs capture decisions individually but not the system view. A reader can know every decision was made but not how the parts fit. |
| Full RFC / Anthropic Engineering doc format | Heavier than needed for a solo-developer kit. Kiro's three-doc structure is the right weight class. |

## References

- AWS Kiro "From Chat to Specs": <https://kiro.dev/blog/from-chat-to-specs-deep-dive/>
- Detailed notes on Kiro: [sources/kiro-spec-driven-deep-dive.md](../sources/kiro-spec-driven-deep-dive.md)
- v0.1.0 spec set: [specs/v0.1.0/](../../specs/v0.1.0/) — requirements.md is in progress, design.md and tasks.md pending research
- Conversation context: [conversation-log/2026-05-21.md](../conversation-log/2026-05-21.md), thread "Adopting Kiro-style flow"

## Review history

| Date | Reviewer | Action |
|---|---|---|
| 2026-05-21 | Lior | Adopted; first spec (`v0.1.0/requirements.md`) started immediately |
| 2026-05-21 | Lior | Chose strict Kiro: one doc at a time |
