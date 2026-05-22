# Sources — deep-dive notes

Detailed notes on individual external sources we've consulted. Each source gets its own markdown file with the substance distilled — so a future reader (or future Claude session, or liorwiki ingest) gets the value of the source without re-reading the original.

## Difference from `SOURCES.md`

- [`../SOURCES.md`](../SOURCES.md) is the **master index** — every URL, paper, repo, video we've ever cited. Flat, browsable, citation-ready.
- This directory holds **deep-dive notes** for the sources we've extracted substantial value from. Most URLs in `SOURCES.md` are just one-line references; only the ones where we extracted enough material to fill a page get a notes file here.

## Index

| File | External source | Type | Date consulted |
|---|---|---|---|
| [kiro-spec-driven-deep-dive.md](kiro-spec-driven-deep-dive.md) | [kiro.dev "From Chat to Specs"](https://kiro.dev/blog/from-chat-to-specs-deep-dive/) | Blog post | 2026-05-21 |
| [simon-scrapes-master-claude-memory.md](simon-scrapes-master-claude-memory.md) | [Simon Scrapes — Master Claude Memory (YouTube)](https://www.youtube.com/watch?v=rFWxRZ5D-lM) + [companion Notion](https://scrapeshq.notion.site/claude-memory-systems) | Video + writeup | 2026-05-21 |

## When to write a notes file

Write one when:

- The source drove ≥ 1 ADR (we want to capture the substance, not just cite it).
- The source is likely to be re-referenced (don't re-read every time).
- The source is at risk of disappearing (videos get deleted, blogs get rewritten — capture the substance while it's available).

When **NOT** to write one:

- A casual one-line reference. Put it in `SOURCES.md` and move on.
- A source you found and immediately rejected. A one-line note in `SOURCES.md` saying "consulted and rejected because X" is enough.

## Format

```markdown
---
source_title: Title
source_url: https://...
source_type: blog | video | paper | repo | docs
source_date: When the source was published
consulted_date: YYYY-MM-DD
consulted_by: Name
informed_adrs: [0001, ...]
tags: [topic, topic, ...]
---

# Source: <Title>

## Provenance

URL, author, date published, date consulted, archive link (web.archive.org if available).

## Summary

The substance — what the source actually says, distilled.

## Key claims (with citation)

- Direct quotes where useful, with quote marks and timestamps/page numbers.

## What we took from it

How this informed our work. Links to ADRs.

## What we did NOT take

What we considered and rejected, and why.

## Related sources

Cross-link to other source notes if the topics overlap.
```
