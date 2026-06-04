---
source_title: Hermes Agent (Nous Research)
source_url: https://github.com/NousResearch/hermes-agent
source_type: open-source project + accompanying article
source_date: released February 2026; v0.9.0 reached 64,000+ ⭐ by April; verified 162,547 ⭐ on 2026-05-22
consulted_date: 2026-05-22
consulted_by: Claude Opus 4.7 + the maintainer
informed_adrs: [0002-markdown-source-of-truth-over-opaque-db, 0003-per-project-with-future-cross-project-tier, 0006-lifecycle-hooks-architecture]
tags:
  - hermes-agent
  - closest-design-analog
  - validation
  - nous-research
  - frozen-snapshot
---

# Source: Hermes Agent (Nous Research) — closest production analog to our design

## Provenance

| Field | Value |
|---|---|
| Repo | <https://github.com/NousResearch/hermes-agent> |
| Maintainer | Nous Research + 242+ contributors |
| License | MIT |
| Stars (verified 2026-05-22) | **162,547** |
| Pushed | 2026-05-22 (very active) |
| Description | "The agent that grows with you" |
| Released | February 2026 |
| Article consulted | Rost Glukhov, *"Hermes Agent Memory System: How Persistent AI Memory Actually Works"* (Level Up Coding / GitConnected, 2026-05-01) — <https://levelup.gitconnected.com/hermes-agent-memory-system-how-persistent-ai-memory-actually-works-a149bef18faa> |

## Why this source matters above all others

**Hermes Agent's design is structurally identical to ours.** Specifically:

| Aspect | Hermes Agent | claude-memory-kit |
|---|---|---|
| `MEMORY.md` character cap | **2,200 chars** (~800 tokens) | 2,500 chars |
| `USER.md` character cap | **1,375 chars** (~500 tokens) | **1,375 chars** ← identical |
| Storage paths | `~/.hermes/memories/MEMORY.md`, `~/.hermes/memories/USER.md` | `<repo>/context/MEMORY.md`, `<repo>/context/USER.md` |
| Frozen snapshot at session start | Yes | Yes |
| `memory` tool with `add`/`replace`/`remove` | Yes | Yes (our `memory-write` skill) |
| Substring matching for replace/remove | Yes | Yes |
| Bounded memory as feature (curation) | Yes | Yes |
| `§` delimiter between entries | Yes | We use bullets — minor difference |
| Internal vs external memory distinction | Explicit | Implicit (we deferred to v0.2+) |

**The 1,375-char USER.md cap is identical to ours.** That's not coincidence. It's either parallel evolution from a shared ancestor (probably Simon Scrapes' video or Hermes documentation we both saw) or one of us read the other. Either way, **we are aligned with a 162K-star production system.** This is the strongest external validation our design has.

## Hermes architecture (verbatim from article)

### Two layers

1. **Built-in**: `MEMORY.md` + `USER.md`, file-backed, always active. Hard caps enforced.
2. **One external provider** (optional): Honcho, OpenViking, Mem0, Hindsight, Holographic, RetainDB, ByteRover, Supermemory. **Only one** runs at a time.

Mental model is additive — frozen core files plus at most one plugin.

### Three paths into long-term memory

1. **Built-in `memory` tool** — explicit `add`/`replace`/`remove` on `target='memory'` or `target='user'`.
2. **Passive retention on external providers** — providers see every turn and extract/summarize without explicit naming.
3. **Provider-specific tools** — `honcho_conclude`, `hindsight_retain`, etc., for explicit writes.

### Runtime flow (prefetch + sync)

```text
User message
    |
    v
MemoryManager.prefetch_all(query)        <-- recall phase
    |
    +-- provider.prefetch(query)         <-- each external provider searches its store
    |
    v
Context injected into LLM turn
    |
    v
LLM responds (assistant message)
    |
    v
MemoryManager.sync_all(user, assistant)  <-- store phase
    |
    +-- provider.sync_turn(user, assistant)
    +-- provider.queue_prefetch(user)    <-- background search toward the next turn
```

Built-in MEMORY.md and USER.md are NOT fetched through `prefetch_all` — they're already in the frozen system prompt. External backends plug into `prefetch_all` / `sync_all`.

### Frozen snapshot format (Hermes)

```text
══════════════════════════════════════════════
MEMORY (your personal notes) [7% — 166/2,200 chars]
══════════════════════════════════════════════
User's project is a Go microservice at ~/code/gateway using gRPC + PostgreSQL
§
This machine runs Ubuntu 22.04, has Docker and kubectl installed
§
User prefers snake_case for variable names and avoids camelCase
§
```

The format uses headers, usage percentages, character counts, and `§` (section sign) delimiters. Designed to be parseable by the model while remaining human-readable.

### Why frozen?

Per Hermes article (quoted verbatim):

> *"The system prompt is the same across every turn in a session. By keeping memory static after session start, the model can cache the prefix computation and only process the variable parts — the conversation. This is a significant performance optimization. You're not re-computing attention over the same memory tokens on every turn."*

This is exactly our **prefix-cache argument** from ADR-0002 design tenet T1.

### Writing triggers (article verbatim)

The agent saves memory proactively on:

1. **User corrections** — "Don't do that again." "Use this instead."
2. **Discovered preferences** — pattern recognition across multiple sessions.
3. **Environment facts** — Ubuntu 22.04, Docker installed, etc.
4. **Project conventions** — discovered through code inspection.
5. **Completed complex workflows** — 5+ tool calls; consider saving the approach.
6. **Tool quirks and workarounds** — non-obvious findings about tools/APIs/systems.

Skipped:

- Trivial or obvious information
- Things easily re-discovered
- Raw data dumps
- Session-specific ephemera
- Information already in context files (SOUL.md, AGENTS.md)

**This is the same conservative bias our auto-extract uses (FR-10 in requirements.md).**

### Memory capacity workflow (verbatim)

When memory is full:

1. Read current entries from error response
2. Identify removable or consolidatable entries
3. Use `replace` to merge related entries into shorter versions
4. Add the new entry

**Same workflow as our memory-write skill's consolidation pattern.**

### Internal vs external knowledge bases

Hermes draws an explicit distinction we should adopt verbatim:

| Internal Memory (the brain) | External Knowledge Bases (the library) |
|---|---|
| Small, persistent, injected into system prompt | Vast, reference-only, accessed on-demand |
| Contains: user preferences, agent conventions, lessons | Contains: documents, papers, code, notes, databases |
| Always "in mind" during conversation | Accessed via tools when needed |
| Curated, bounded, actively managed | Not "remembered" — looked up |
| Examples: MEMORY.md, USER.md, Honcho, Hindsight, Mem0 | Examples: LLM Wiki, Obsidian, Notion, ArXiv, filesystem, GitHub |

**The agent doesn't remember external bases — it looks them up.** Critical insights from external bases are *distilled* into internal memory. The external resource is vast; the internal memory is the distillation.

**This validates our `liorwiki` separation**: liorwiki is the library (external knowledge); `context/` is the brain (internal memory).

## What Hermes does that we don't (yet)

1. **External memory provider plugin slot** — Honcho, Mem0, Hindsight, etc. We left this as v0.2+ scope (OS-12 in requirements.md). Could revisit.
2. **`session_search` tool** — SQLite + FTS5 over session history. We have this planned in FR-16 (two-mode search interface).
3. **Background `queue_prefetch`** — warms retrieval for the next turn while the current reply is generating. Worth considering for v0.2.
4. **Security: prompt injection scanning + deduplication** at write time. Worth borrowing for our `memory-write` skill (currently we only dedup).
5. **Usage percentage display** in the frozen-snapshot header (`[7% — 166/2,200 chars]`). Useful UX — the agent sees how full memory is. We should add this to our snapshot format.
6. **`recall_mode` config** — trade tokens for control over what providers inject. We'll likely add equivalent in v0.2 when external providers come in.

## What we do that Hermes doesn't

1. **In-repo storage, committed to git.** Hermes is machine-global (`~/.hermes/`). Our `<repo>/context/` travels with `git clone`. This remains our key differentiator.
2. **Three-tier scope** (user/project/local). Hermes is single-tier.
3. **Content-addressed citation IDs** (ADR-0007). Hermes doesn't expose stable IDs.
4. **Provenance frontmatter** (proposed FR-29). Hermes' entries are plain bullets.
5. **Rolling-window compression hierarchy** (now → today → recent → archive). Hermes has session-end summarization but not a multi-layer rolling window.
6. **Raw transcript preservation** (T7). Hermes captures session history in SQLite (`state.db`), so similar in spirit; we make ours explicit markdown.
7. **6 lifecycle hooks**. Hermes uses prefetch/sync rather than Claude Code's hook events because it's its own runtime, not a Claude Code plugin.

## Implication for design.md

We should explicitly cite Hermes as the reference architecture and adopt its terminology where it improves clarity:

- "Internal memory" vs "external knowledge bases" — adopt as section headings.
- Usage percentage in snapshot header — adopt as design detail.
- Three writing triggers (corrections, preferences, environment facts, conventions, workflows, quirks) — adopt verbatim in the auto-extract prompt.

## Hermes' philosophy quote (worth keeping)

From the article, closing paragraph:

> *"It works because it treats memory the way a brain works rather than the way a database does — small, curated, and always active. The agent doesn't retrieve memory when it needs it; the memory is simply always there, woven into the system prompt from the first token of every session."*

This **is** our design philosophy. Hermes articulates it precisely.

## Updates / re-consultations

| Date | What checked | Outcome |
|---|---|---|
| 2026-05-22 | Article + repo metadata via `gh api` | 162,547 ⭐ verified. Char caps match ours exactly. Architecture is parallel. |

## Related sources

- [research/2026-05-22-claude-code-leak-architecture.md](../research/2026-05-22-claude-code-leak-architecture.md) — Anthropic's internal architecture
- [sources/simon-scrapes-master-claude-memory.md](simon-scrapes-master-claude-memory.md) — likely common ancestor for both Hermes and us
- [sources/basic-memory-deep-dive.md](basic-memory-deep-dive.md) — another markdown-first close analog
- [adr/0002-markdown-source-of-truth-over-opaque-db.md](../adr/0002-markdown-source-of-truth-over-opaque-db.md)
