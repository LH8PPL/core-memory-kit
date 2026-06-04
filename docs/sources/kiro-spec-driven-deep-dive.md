---
source_title: From Chat to Specs Deep Dive
source_url: https://kiro.dev/blog/from-chat-to-specs-deep-dive/
source_type: blog
source_date: 2025 (specific date not stated on page)
consulted_date: 2026-05-21
consulted_by: Claude Opus 4.7 (with the maintainer)
informed_adrs: [0004-spec-driven-development-kiro-style.md]
tags:
  - methodology
  - specs
  - kiro
  - aws
---

# Source: From Chat to Specs Deep Dive (AWS Kiro blog)

## Provenance

| Field | Value |
|---|---|
| Title | From Chat to Specs Deep Dive |
| URL | <https://kiro.dev/blog/from-chat-to-specs-deep-dive/> |
| Publisher | AWS Kiro (kiro.dev) |
| Type | Engineering blog post |
| Consulted | 2026-05-21 via WebFetch |
| Archive | (capture web.archive.org if the page goes down — recommended as a future safeguard) |

## Summary

AWS Kiro is a code-generation product that **separates planning from coding**. Rather than jumping straight into implementation from a chat prompt, Kiro generates three sequential specification documents:

1. **`requirements.md`** — feature breakdown with user stories and acceptance criteria
2. **`design.md`** — architecture and technology decisions, including diagrams
3. **`tasks.md`** — sequenced, actionable work items for implementation

The user reviews and refines each document before any code is written. This creates **natural checkpoints for collaboration** between the human and the AI.

## Key claims (verbatim where useful)

- *"Kiro first performs deep analysis to understand your requirements, identifies potential challenges, and creates comprehensive planning documents."*
- The three documents are described as "natural checkpoints for collaboration."
- Kiro "references these specification files rather than cluttering your context window."

What the article explicitly **does not specify**:

- Whether iteration is per-document or holistic (i.e., does the user approve `requirements.md` before `design.md` exists, or does Kiro produce all three at once and let the user revise as a package?).
- Whether `design.md` formally cross-references `requirements.md` items by ID.
- What acceptance-criteria patterns Kiro uses (EARS? Gherkin? freeform?).

These gaps are filled by our own adaptation — see [../process/kiro-spec-driven-flow.md](../process/kiro-spec-driven-flow.md).

## What we took from it

The three-document structure is the core take. We adopted:

| Kiro | Our adaptation |
|---|---|
| `requirements.md` | [specs/v0.1.0/requirements.md](../../specs/v0.1.0/requirements.md) — added EARS-style acceptance criteria, design tenets, open questions, NFRs. |
| `design.md` | [specs/v0.1.0/design.md](../../specs/v0.1.0/design.md) — pending. Will include schemas, pluggable interfaces, FR cross-references. |
| `tasks.md` | [specs/v0.1.0/tasks.md](../../specs/v0.1.0/tasks.md) — pending. Will include task IDs referenced by commit messages. |
| Review checkpoints | Strict Kiro: one document at a time, user approves before next |
| Specs reference rather than re-explain | Yes — `design.md` will cite `requirements.md` by FR number. |

Documented as ADR-0004.

## What we did NOT take

- **Kiro's chat-prompt-as-input shape.** Kiro takes a single chat prompt and produces all three docs. We use a multi-turn conversation that produces them sequentially with research feeding in between. Our flow is closer to a meeting series than a one-shot generation.
- **The "all three at once" generation pattern.** Kiro doesn't enforce a strict sequence; we do (per OQ-2 in requirements.md). Strict sequencing is more conservative but better for governance.
- **Whatever Kiro-specific tooling does the doc generation.** We use plain markdown files and the Edit tool — no specialized doc generator.

## What we added

- **EARS-style acceptance criteria** (Easy Approach to Requirements Syntax: *When [trigger], the system shall [behavior]*). Kiro doesn't specify a syntax. EARS is the most testable. Source: <https://alistairmavin.com/ears/>.
- **Design tenets section** — non-negotiable rules at the top of `requirements.md`. These are higher-priority than any individual FR.
- **Open questions section** that gates `design.md`. Forces explicit decisions before design starts.
- **ADR ecosystem alongside the specs.** Specs are forward-looking; ADRs capture point-in-time decisions and never get deleted.

## Why we adopted this methodology

After shipping v0.0.1 as a conversational "vibe coding" effort (56 files, 4119 lines, all in one long session), the limitations were clear: prior art was missed (we built before checking that `claude-mem` exists), decisions were implicit, and the audit trail was the git log and nothing else. v0.1 has substantially more scope and we need structured planning.

The Kiro flow is the lightest-weight structure that gives us:

1. **A planning artifact** — `requirements.md` you can read in one sitting and decide whether to proceed.
2. **A design contract** — `design.md` you can verify against the requirements.
3. **An executable plan** — `tasks.md` you can grind through linearly.

Heavier alternatives (full RFC, multi-doc Anthropic engineering doc, design-doc-with-RAID-log) are overkill for a solo developer + one Claude. Lighter alternatives (write a one-page README) lose the design contract.

## Related sources

- EARS syntax: <https://alistairmavin.com/ears/>
- Anthropic engineering blog (long-running agent patterns informed our adaptation): <https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents>
- ADR conventions (Michael Nygard): <https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions>

## Updates / re-consultations

| Date | What we re-checked | Outcome |
|---|---|---|
| 2026-05-21 | Initial consultation; methodology adopted | ADR-0004 written |
