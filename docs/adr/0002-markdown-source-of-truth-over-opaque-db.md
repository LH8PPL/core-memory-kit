---
adr: 0002
title: Markdown files as the source of truth; SQLite/vector DBs are regenerable caches
status: accepted
date: 2026-05-21
deciders:
  - the maintainer (project owner)
  - Claude Opus 4.7 (proposing architect)
supersedes: null
superseded_by: null
related:
  - 0001-separate-project-not-fork-youtube-to-slide.md
  - 0003-per-project-with-future-cross-project-tier.md
tags:
  - storage
  - architecture
  - design-tenet
---

# ADR-0002 — Markdown files as the source of truth; SQLite/vector DBs are regenerable caches

## Status

**Accepted** 2026-05-21. This is design tenet **T1** in [specs/requirements.md](../../specs/requirements.md). Non-negotiable: any future ADR that would violate it must supersede this one explicitly.

## Context

While designing the persistent memory layer for `claude-memory-kit`, three storage architectures were on the table:

1. **Opaque database** (claude-mem's choice): SQLite + Chroma for keyword + vector search. Fast queries, structured columns, atomic writes. Cannot be opened in a text editor, doesn't merge cleanly in git.
2. **Human-readable markdown only**: per-fact `.md` files committed to git. Hand-editable, greppable, mergeable. Slow for keyword search across large corpora (linear in file count).
3. **Hybrid**: markdown is canonical, SQLite is a regenerable read-cache built FROM the markdown by an indexer process.

The choice between (1) and (2)/(3) is structural — it constrains every later decision about hooks, search, migration, and disaster recovery. The choice between (2) and (3) is performance vs. simplicity.

External landscape (verified 2026-05-21):

- **thedotmack/claude-mem** (77,244 ⭐, 6,656 forks): chose (1). Storage is `~/.claude-mem/memory.db` (SQLite) + `~/.claude-mem/chroma/` (vector). No human-readable layer.
- **Digital-Process-Tools/claude-remember**: chose (2). Storage is `.remember/*.md` per-project, Haiku-compressed daily summaries.
- **Anthropic's official Memory tool** ([platform.claude.com/docs/en/agents-and-tools/tool-use/memory-tool](https://platform.claude.com/docs/en/agents-and-tools/tool-use/memory-tool)): chose (2). Storage is client-side `/memories/*.md` files. Even Anthropic's official answer is markdown, not a DB.
- **Fail-Safe/Noema**: chose (3). Documented quote: *"Plain markdown on disk as the source of truth; a local SQLite database with FTS5 as the index. No cloud, no API keys, no telemetry."* Closest architectural sibling to our stated goals.

## Decision

**We choose option (3) — Markdown is the source of truth; SQLite + FTS5 is a regenerable read-cache.**

Specifically:

- All durable memory content lives in `<repo>/context/*.md` (project tier) and `~/.claude-memory-kit/*.md` (user tier) as human-readable markdown.
- A SQLite index at `<repo>/context/.index/memory.db` is built FROM the markdown by an indexer process. The `.index/` directory is in `.gitignore`.
- If the SQLite index is lost or corrupt, `cmk reindex` rebuilds it from markdown in O(file count). The index is **never** the authority.
- Vector embeddings (for semantic search, optional Layer 5) follow the same rule: regenerable from markdown via `memsearch index`.
- Schema sketch lives in [specs/requirements.md FR-17](../../specs/requirements.md).

## Consequences

### Positive

- **Hand-editable**: the user can open `MEMORY.md` in VS Code, fix a typo, and the system respects the edit on next session.
- **Git-friendly**: markdown merges cleanly across branches; conflicting edits surface as normal git conflicts, not unrecoverable DB collisions.
- **`grep`/`rg` work**: existing CLI toolchain (ripgrep, fd, sed) operates on the source directly.
- **Disaster recovery is trivial**: lose the SQLite index → rebuild. Lose the markdown → restore from git. Two independent fail-safes.
- **Wiki-ingestion-friendly**: personal-wiki can ingest the markdown directly. An opaque DB would require an export step.
- **Auditable**: every captured fact is a line in a file with a stable observation ID and a SHA-256 link back to its source file (see ADR-0007).

### Negative

- **Slower keyword search than pure SQLite**: linear in file count for naive `grep`. Mitigated by the FTS5 read-cache when present.
- **Schema migrations are harder**: a v0.1 markdown file must remain parseable by v0.2's indexer. Imposes a forward-compatibility discipline on the markdown format.
- **Concurrent writes need care**: two processes editing the same `.md` file at once produce garbage. Mitigated by hooks taking advisory file locks during write.
- **More complex than pure (1) or pure (2)**: two systems to keep in sync (markdown + index). Worth it for the auditability and hand-editability.

### Neutral

- The choice does not preclude adding vector search (Layer 5, `memsearch` + Milvus). Vectors are *also* a cache built from the markdown.
- The choice mirrors what Anthropic itself recommends in their official Memory tool docs, suggesting alignment with their long-term direction.

## Alternatives considered (and why rejected)

| Alternative | Why rejected |
|---|---|
| Pure SQLite (option 1) | Opaque to text-editor workflow; loses hand-editability; doesn't merge in git; would have made the kit a competitor to claude-mem rather than a complement. The user explicitly wanted to be able to read and edit memory in plain text. |
| Pure markdown, no index (option 2) | `grep` over 10k+ bullets gets slow; semantic search impossible without an index; would prevent the MCP `mk_search` tool from delivering its < 100 ms latency target. |
| Hybrid with the markdown as cache and DB as authority | Same problems as pure SQLite plus indirection. Worst of both worlds. |

## References

- Anthropic Memory tool docs: <https://platform.claude.com/docs/en/agents-and-tools/tool-use/memory-tool> (retrieved 2026-05-21)
- thedotmack/claude-mem repo: <https://github.com/thedotmack/claude-mem> (commit verified 2026-05-21; 77,244 stars)
- Fail-Safe/Noema architecture quote: from Claude.ai Deep Research report dated 2026-05-21, see [research/2026-05-21-claude-ai-deep-research-option-b.md](../research/2026-05-21-claude-ai-deep-research-option-b.md)
- Conversation context: [conversation-log/2026-05-21.md](../../archive/docs/conversation-log/2026-05-21.md)
- Original framing of the markdown-vs-DB question: this conversation, user prompt of 2026-05-21 *"5. sqllite storage - please explain more"*.

## Review history

| Date | Reviewer | Action |
|---|---|---|
| 2026-05-21 | the user | Accepted as design tenet T1 |
