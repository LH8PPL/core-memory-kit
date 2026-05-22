---
process: research-prompt-design
status: active
since: 2026-05-21
related_adrs: []
tags:
  - research
  - prompts
  - methodology
---

# Process: Research prompt design

When we need a landscape survey or a targeted comparison, we use **Deep Research mode** in Claude.ai (Option B style) or ChatGPT (Option A style). The prompts we send to those tools are themselves engineered — they can be biased, anchored, or scoped-narrow without us noticing. This document captures the patterns we use to write **good** research prompts.

## The two prompt styles

| Style | Purpose | Where to run |
|---|---|---|
| **Option A — Broad landscape** | "What's out there?" Build a capability matrix; surface novel finds; identify winning patterns and controversial choices | ChatGPT Deep Research (broader web access) |
| **Option B — Targeted design** | "For these 6 specific design questions, what works?" Used to inform a specific upcoming `design.md` | Claude.ai Deep Research (good at structured technical synthesis) |

Use both in parallel for major releases. They produce **different products**, not duplicates.

## The three rules

### Rule 1 — Don't anchor on systems you already know

A weak prompt looks like: *"Compare mem0, Letta, Cognee, claude-mem."* The researcher will focus on those four and skim past newer or smaller work.

A strong prompt looks like: *"Compare mem0, Letta, Cognee, claude-mem **as starting points**. Then **actively search for OTHER systems I haven't named** using these vectors: GitHub recently-updated (last 60 days), npm/PyPI last 90 days, Hacker News and r/LocalLLaMA last 90 days, arxiv cs.AI/cs.CL 2025–2026, engineering blogs. **Aim for at least 8 NEW systems** beyond what I named."*

The quota ("at least 8 NEW") converts a soft suggestion into a measurable goal.

### Rule 2 — Demand citations to specific artifacts

A weak prompt: *"With citations."*

A strong prompt: *"Citations required for every claim. **URLs that link to actual repo files, papers, blog posts, or commits — not generic homepage links.** If a system's `README.md` claims X, link to the README, not the org page."*

This catches the difference between a researcher who *read the source* and one who *summarized the marketing*.

### Rule 3 — Override Claude.ai's memory bias

Claude.ai's memory feature stores user context across conversations. When the stored memory holds a regulated-deployment assumption, the research mode often injects "regulated environment" framing into every research output — even when the current task is personal. See [scope-override-claude-memory.md](scope-override-claude-memory.md) for the full workaround.

Short version: include a **scope-override sentence** at the top of every Claude.ai research prompt:

```text
SCOPE OVERRIDE: This is a PERSONAL open-source project. Ignore any
memory or prior context about my workplace, employer, regulatory
constraints, air-gapped environments, or banking. Treat me as a
solo developer with no organizational constraints. If you find
yourself assuming "air-gapped" or "regulated" deployment, stop
and re-read this paragraph.
```

The final "stop and re-read" sentence is the part most people miss — it interrupts the model's pattern-completion loop.

## Prompt templates

The current canonical prompts for `claude-memory-kit` live in [../conversation-log/2026-05-21.md](../conversation-log/2026-05-21.md), thread "Research prompts designed for Option A and Option B." Copy from there for future research runs.

When you copy them, update:

- The "Known systems (starting points)" list — add any new entrants discovered since the last research.
- The 6 targeted questions in Option B — replace with the current design's open questions.
- The date filter ("last 60 days", "last 90 days") — keep current.
- The scope-override paragraph — always include.

## What to do with research output

1. Save the verbatim output to [../research/](../research/) with frontmatter (date, source, topic, related ADRs).
2. Read it. Flag any claims that contradict your existing requirements/ADRs.
3. Identify the 3-7 highest-leverage findings — the ones that would actually change requirements or design.
4. Propose those changes as a diff against the current spec. User reviews.
5. Apply approved changes. Note in the relevant ADR: *"Revised on YYYY-MM-DD per research finding [link]."*

Research that doesn't surface anything actionable is still valuable — it provides confidence that the current design isn't missing something. Save the output regardless.

## How research influences ADRs

| Research finding | Action |
|---|---|
| Surfaces a novel approach no system on our list uses | Open a discussion in conversation log; may produce a new ADR |
| Confirms a design choice we'd made for the wrong reason | Update the existing ADR's "Context" section with the new reason; mark as `revised: <date>` |
| Contradicts a current ADR with strong evidence | Supersede the ADR. Old ADR gets `superseded_by:`, new ADR gets `supersedes:` |
| Surfaces nothing actionable | Save the research note anyway; absence-of-finding is itself a data point |

## When NOT to run Deep Research

- Bug fixes with a known root cause.
- Documentation-only changes.
- Quick decisions where the cost of being wrong is low.
- Anything where you already have strong evidence.

Deep Research costs 15-30 minutes per run plus the user's time to read the output. Use it when the cost-of-being-wrong justifies it.

## References

- AWS Kiro's *From Chat to Specs* (the parent methodology that recommends research as a gate before design): <https://kiro.dev/blog/from-chat-to-specs-deep-dive/>
- ChatGPT Deep Research mode: <https://help.openai.com/en/articles/8554407-deep-research-faqs>
- Claude.ai Deep Research mode docs: <https://support.claude.com/en/articles/12198133-using-research-and-extended-research-on-claude-ai>
- Our Option-B research output: [../research/2026-05-21-claude-ai-deep-research-option-b.md](../research/2026-05-21-claude-ai-deep-research-option-b.md)
- Conversation context: [../conversation-log/2026-05-21.md](../conversation-log/2026-05-21.md), threads on research prompt design
