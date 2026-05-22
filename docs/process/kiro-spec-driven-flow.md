---
process: kiro-spec-driven-flow
status: active
since: 2026-05-21
related_adrs: [0004-spec-driven-development-kiro-style.md]
tags:
  - process
  - methodology
  - specs
---

# Process: Kiro-style spec-driven development

For every meaningful release (v0.X) of `claude-memory-kit`, we write **three sequential specification documents** before touching code. The user reviews and approves each before the next is written. This is adapted from [AWS Kiro's *From Chat to Specs* methodology](https://kiro.dev/blog/from-chat-to-specs-deep-dive/).

## The three documents

```text
specs/v0.X/
├── requirements.md   ← What we're building and why (FRs, NFRs, user stories, open questions)
├── design.md         ← How we'll build it (architecture, schemas, code skeletons, diagrams)
└── tasks.md          ← In what order (sequenced executable tasks, each referencing the FRs it satisfies)
```

Each document **references** the previous one but does **not duplicate** it. `design.md` cites `requirements.md` by FR number. `tasks.md` cites both `design.md` (for component boundaries) and `requirements.md` (for acceptance criteria).

## requirements.md — structure

| Section | Purpose |
|---|---|
| 1. Introduction | The problem, the baseline (what already exists), the gap this release closes |
| 1.4 Design tenets | Non-negotiable rules (e.g., T1: markdown is source of truth). If a requirement violates a tenet, the tenet wins |
| 2. User stories | `As a <role>, I want <capability>, so that <value>`. Each maps to one or more FRs |
| 3. Functional requirements | FR-N entries with **EARS-style acceptance criteria**: *When [trigger], the system shall [behavior]* |
| 4. Non-functional requirements | NFRs for perf, security, OS support, etc. |
| 5. Out of scope | Explicit non-goals — what we're deliberately deferring to a later version |
| 6. Open questions (or "Resolved questions") | Decisions that need the user before `design.md` starts. Each has a recommendation and alternatives |
| 7. Review checklist | A self-check before approval |
| 8. Approval | Signed line for user approval |

The example for v0.1.0 lives at [specs/v0.1.0/requirements.md](../../specs/v0.1.0/requirements.md).

## design.md — structure (template, not yet authored for v0.1)

| Section | Purpose |
|---|---|
| 1. Architecture overview | A diagram, the component map, the data flow |
| 2. Per-component design | One subsection per major component: responsibilities, public API, dependencies, error model |
| 3. Schemas | Data structures, file layouts, message formats. SQL DDL where applicable |
| 4. Interfaces and seams | The pluggable boundaries (e.g., the `CompressorBackend` interface from ADR-0008) |
| 5. Failure modes and recovery | What fails, how it's detected, how it's repaired. Maps to NFRs |
| 6. Trade-offs explicitly accepted | Decisions where we chose A knowing B would also have worked — context for future revisits |
| 7. Cross-references | Each subsection links back to the FR(s) it implements |

## tasks.md — structure (template, not yet authored for v0.1)

| Section | Purpose |
|---|---|
| 1. Sequencing rationale | Why this order — what depends on what |
| 2. Tasks | Numbered tasks. Each: title, FR refs, design refs, estimated effort, dependencies, acceptance test |
| 3. Milestones | Optional groupings: "M1 = hooks ready", "M2 = MCP ready", etc. |
| 4. Risks | Known unknowns that might force a re-plan |

Task IDs are referenced from commit messages: a commit implementing `T-12` should say `T-12: <verb> <noun>` in the subject.

## The review loop

Per the user's preference (decided 2026-05-21, OQ in requirements.md):

1. Claude writes `requirements.md`.
2. User reviews, edits, refines. May ask for revisions.
3. User explicitly approves.
4. (Research, if any, happens here or in parallel — outputs feed back into requirements revisions.)
5. Claude writes `design.md`. Refers to the approved `requirements.md`.
6. User reviews/approves.
7. Claude writes `tasks.md`. Refers to approved `design.md`.
8. User reviews/approves.
9. Implementation begins.

Open questions in `requirements.md` MUST be resolved before `design.md` starts. They become "Resolved questions" once answered.

## When to skip the spec flow

This process is mandatory for new features and meaningful refactors. It is NOT needed for:

- Typo fixes, lint cleanup.
- Documentation-only changes (this file, for example, was written conversationally — no spec needed).
- Single-file refactors with no behavior change.
- Hotfixes for confirmed bugs with a known fix.

Heuristic: if you're touching more than 3 files OR the change crosses a component boundary, write a spec.

## Specs and ADRs — how they coexist

| Specs | ADRs |
|---|---|
| Forward-looking. Describe what we're building next | Backward-looking. Capture decisions already made |
| Versioned per release (`v0.1.0/requirements.md`) | Globally numbered (`0001`, `0002`, ...) |
| Reviewed and approved in sequence | Each ADR stands alone |
| Get superseded when the release ships | Get superseded only when the decision changes |

A spec **references** the ADRs that constrain it. An ADR may **emerge from** a spec (a particularly contentious design choice during `design.md` gets its own ADR).

## Specs and the conversation log

- The conversation log captures the **discussion** that produced the specs.
- The specs capture the **resulting plan**.
- The ADRs capture the **decisions** baked into the plan.

A reader debugging "why is this requirement worded this way?" can: read the spec → read the linked ADR → read the linked conversation-log entry for the discussion that produced both.

## References

- AWS Kiro's *From Chat to Specs Deep Dive*: <https://kiro.dev/blog/from-chat-to-specs-deep-dive/>
- Detailed notes on the Kiro article: [../sources/kiro-spec-driven-deep-dive.md](../sources/kiro-spec-driven-deep-dive.md)
- ADR-0004 (adoption of this process): [../adr/0004-spec-driven-development-kiro-style.md](../adr/0004-spec-driven-development-kiro-style.md)
- EARS (Easy Approach to Requirements Syntax): <https://alistairmavin.com/ears/>

## When to update this process doc

If the process changes — new section in requirements.md, different review cadence, a new spec document type — update this file AND open a new ADR (e.g., "ADR-NNNN: Spec process revision"). The ADR documents *why* the change, this doc documents *the current state*.
