# claude-memory-kit — documentation system

This `docs/` tree captures the **full provenance** of the kit: every decision, every research input, every external source, every conversation thread. Designed for direct ingestion into [liorwiki](https://github.com/LH8PPL/liorwiki) `raw/` so the reasoning behind the code is searchable forever.

## Structure

| Directory | Contains | When to read |
|---|---|---|
| [adr/](adr/) | Architectural Decision Records — one self-contained ADR per significant decision, with context, alternatives, consequences, references | Before you change a design tenet, or to understand *why* something works the way it does |
| [process/](process/) | How we work — the Kiro-style spec workflow, research prompt design, conventions | Before you start a new spec cycle, propose a change to the methodology, or onboard someone |
| [research/](research/) | Outputs from research sessions — own Claude/ChatGPT Deep Research runs, manual architecture surveys, paper notes | Before you make a design decision that the research already covered |
| [sources/](sources/) | Deep-dive notes on individual external sources (articles, videos, papers) — distilled for liorwiki ingest | When you need the substance of a source without re-reading the original |
| [conversation-log/](conversation-log/) | Session-by-session narrative — what we discussed, what we decided, with cross-links to ADRs and research | To recover the *thread* of how we got to a decision, not just the decision |
| [SOURCES.md](SOURCES.md) | Master index of every URL, paper, repo, video, blog post we've cited | When you need a citation or want to verify a claim |

## Reading order for a new contributor

1. [README.md](../README.md) at repo root — what the kit does, how to install.
2. [ARCHITECTURE.md](../ARCHITECTURE.md) — the six-layer design.
3. [adr/README.md](adr/README.md) — list of decisions; skim titles to map the design surface.
4. [process/kiro-spec-driven-flow.md](process/kiro-spec-driven-flow.md) — how new specs get written.
5. [conversation-log/](conversation-log/) — latest entry first, for current thread context.

## Discipline going forward

Every meaningful decision becomes an ADR. Every external input (article, video, paper, repo, deep-research output) gets a notes file. Every working session gets a conversation-log entry. The goal is that a Claude session resuming after a 3-month gap can re-derive the full project state from `docs/` + `specs/` alone, with zero out-of-band context.

See [process/git-and-versioning.md](process/git-and-versioning.md) for the commit conventions and ADR lifecycle.

## Wiki ingestion

All files in `docs/` are written to be self-contained markdown — links are full URLs where possible, citations are inline, no editor-specific syntax. They can be copied into `/c/Projects/liorwiki/raw/claude-memory-kit/` without modification and processed through the wiki's ingest pipeline.
