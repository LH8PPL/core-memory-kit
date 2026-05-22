# Conversation log

Session-by-session narrative of the development of `claude-memory-kit`. Where ADRs capture *what was decided*, the conversation log captures *what was discussed* — in what order, with what tangents, with what corrections, with what realizations.

## Why keep this

Three reasons:

1. **Auditing the thinking, not just the outcome.** ADRs are clean summaries; the conversation log preserves the messy real path. If a decision later proves wrong, the log shows which alternatives were considered and which weren't.
2. **Recovering thread state across long gaps.** A Claude session resuming after a 3-month break can read the latest log entry and pick up exactly where the prior session left off — what was open, what was blocked, what was waiting on whom.
3. **Wiki ingestion.** liorwiki indexes these for free-text search, so a question like *"why did we end up with 5 hooks instead of 6?"* hits the log entry that contains the full back-and-forth.

## Conventions

- Filename: `{YYYY-MM-DD}.md` — one file per calendar day.
- Frontmatter required:
  ```yaml
  ---
  date: YYYY-MM-DD
  session_count: N
  participants:
    - Name (role)
  related_adrs: [0001, 0002, ...]
  related_research: [topic-slug, ...]
  related_specs: [v0.1.0/requirements.md, ...]
  ---
  ```
- Body is organized into **threads** — each thread is one coherent topic, possibly with multiple back-and-forth exchanges.
- Each thread includes timestamps (approximate) so the sequence is recoverable.
- Decisions reached during a thread link to their ADR file.
- Lessons-learned moments (e.g., a process miss, a recurring user correction) link to the relevant feedback memory file.

## Index

| Date | Sessions | Major outcomes |
|---|---|---|
| [2026-05-21](2026-05-21.md) | 1 (long, ~7 h) | claude-memory-kit v0.0.1 shipped; claude-mem discovered & evaluated; Kiro spec workflow adopted; requirements.md drafted; 7 open questions resolved |
| [2026-05-22](2026-05-22.md) | 1 (ongoing) | Option-B research returned & analyzed; documentation discipline established; ADR backfill underway |

## What to capture

- Every significant user prompt verbatim (or paraphrased with `**User**:` prefix) — these are the trigger points.
- Every significant decision — link to the ADR.
- Every "missed something" moment — link to the feedback memory or ADR.
- Tangents that were considered and discarded — they often contain the seed of a future decision.

## What NOT to capture

- Every single tool call. The git log and the ADRs capture the *outcomes* of tool calls. The conversation log captures the *reasoning* between them.
- Pure mechanics (e.g., "ran git status"). Skip unless it taught us something.
