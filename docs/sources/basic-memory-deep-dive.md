---
source_title: Basic Memory
source_url: https://github.com/basicmachines-co/basic-memory
source_type: open-source project (repo + docs)
source_date: ongoing; latest release 2026-05-16, latest commit 2026-05-19
consulted_date: 2026-05-22
consulted_by: Claude Opus 4.7 + the maintainer
informed_adrs: [0002-markdown-source-of-truth-over-opaque-db.md]
tags:
  - basic-memory
  - markdown-first
  - mcp
  - closest-design-analog
  - local-first
---

# Source: Basic Memory (basicmachines-co)

## Provenance

| Field | Value |
|---|---|
| Repo | <https://github.com/basicmachines-co/basic-memory> |
| Maintainer | Basic Machines |
| License | AGPL-3.0 |
| Stars (verified 2026-05-22) | 3,064 |
| Forks | 204 |
| Language | Python |
| Created | 2024-12-02 |
| Latest commit | 2026-05-19 |
| Latest release | 2026-05-16 |
| Discord | <https://discord.gg/tyvKNccgqN> |
| Verified by | direct `gh api` call + WebFetch of README |

## Why this source matters

Basic Memory is the **closest open-source analog to `claude-memory-kit`'s design philosophy** that we've found. Independently arrived at the same conclusions: markdown as source of truth, local-first, knowledge-graph linking, MCP-native. Neither research output (claude-mem comparison nor Simon Scrapes' video) surfaced it. **Discovered via ChatGPT Deep Research (Option A)**, then verified directly.

If `claude-memory-kit` ever becomes a public project, Basic Memory is the most direct comparison reviewers will draw. Worth understanding deeply now.

## What it does

From the verified README:

> *"AI conversations that actually remember. Never re-explain your project to your AI again."*

Basic Memory provides persistent, structured knowledge for AI conversations by reading and writing **plain markdown files** that humans and LLMs collaboratively manage. The markdown forms a traversable knowledge graph with semantic search.

## Storage and structure

| Aspect | Basic Memory | claude-memory-kit |
|---|---|---|
| Storage location | `~/basic-memory/` (default) or per-project dirs | `<repo>/context/` (per-project) + `~/.claude-memory-kit/` (user tier, v0.1+) |
| Format | Plain markdown with frontmatter, observations, wiki-style relation links | Plain markdown with frontmatter, granular per-fact files + bounded scratchpads |
| Knowledge graph | Yes, via wiki-style `[[link]]` and frontmatter relations | Implicit via `INDEX.md` + cross-references; no explicit `[[link]]` semantics yet |
| Cloud sync | Optional, off by default | None planned; git is the sync mechanism |

Both store everything in human-readable markdown. The exact directory layouts and frontmatter conventions differ.

## Design philosophy (verbatim quotes from README)

> *"Local-first. Plain text on your disk. Forever."*

> *"Two-way"* — bidirectional sync between humans and AI; both can read and write the markdown.

Both quotes align directly with ADR-0002's tenet T1 (markdown as source of truth). The "two-way" framing is particularly clean — humans edit markdown directly, AI edits via MCP tools, both see the same files.

## MCP tools exposed

Basic Memory ships an MCP server with these tool categories:

- **Content ops**: write/read/edit/delete notes
- **Search**: semantic search + full-text search
- **Knowledge graph navigation**: `build_context`, canvas generation
- **Project management**: switch between knowledge-base projects
- **Schema validation/inference**: validate frontmatter, infer schemas from existing notes
- **Cloud routing tools**: optional cloud-sync orchestration

Compare to claude-memory-kit's planned MCP (FR-26): `mk_search`, `mk_get`, `mk_timeline`, `mk_cite`, `mk_remember`. The tool surfaces overlap on search and content ops but Basic Memory exposes more.

## How users capture memory

Per the README:

> *"When users discuss information, they can ask the LLM to create or update notes."*

Basic Memory's capture model is **active**: the user (via the LLM) decides what to save. No auto-extract Stop hook; no PostToolUse capture. Compared to claude-memory-kit's planned mix:

| | Basic Memory | claude-memory-kit (proposed v0.1) |
|---|---|---|
| User-explicit capture | Yes ("ask LLM to save this") | Yes (`memory-write` skill, `<retain>` tag) |
| Auto-extract on every turn | **No** | **Yes** (Stop hook + auto-extract) |
| Rolling-window compression | Not documented | **Yes** (now → today → recent → archive) |

This is a meaningful difference. Basic Memory trusts the user (or LLM) to remember to save. We assume forgetting and capture proactively.

## Multi-client compatibility

Basic Memory is MCP-native; per README and verified web search, it works with: Claude, Codex, Cursor, ChatGPT, and any other MCP-capable client. This is broader than our v0.1 scope (Claude Code only). Aligns with our v0.2+ direction (OS-12 in requirements.md).

## What we can learn from it

1. **Wiki-style `[[link]]` syntax for granular memory cross-references.** Our `INDEX.md` provides an explicit registry, but `[[other-fact]]` inline links would make individual files more navigable. Worth considering for v0.1 or v0.2.

2. **Schema validation/inference as a first-class MCP tool.** We rely on frontmatter being correct; we don't validate it. Basic Memory's `validate` tool surfaces a way to do this — could be the v0.1 `cmk validate` command.

3. **Two-way sync framing.** Our docs talk about "the user can hand-edit." Basic Memory's "two-way" phrase is sharper. Worth borrowing in marketing/docs.

## What we do that Basic Memory doesn't

1. **Three-tier scope** (user / project / local). Basic Memory has per-project knowledge bases but no explicit cross-project user tier with a precedence model.
2. **Auto-extract Stop hook** harvesting durable facts without user prompting. Basic Memory is active-only.
3. **Bounded scratchpads with caps**. Basic Memory has no per-file size cap that we can see.
4. **Content-addressed citation IDs**. Basic Memory uses wiki-style links and frontmatter relations; we have stable `P-A8FN3MQ2`-style IDs.
5. **Rolling-window compression hierarchy** (now → today → recent → archive). Basic Memory doesn't compress.
6. **Provenance frontmatter** (per ADR-0009 proposal). Basic Memory has frontmatter but not the specific `write_source` + `trust` + `source_sha1` schema.
7. **In-repo via `git clone`**. Basic Memory's default is `~/basic-memory/` (machine-global, not committed). We commit per-project.

## What Basic Memory does that we don't

1. **MCP-native across multiple LLM clients out of the box.** We're Claude Code first; multi-client is v0.2+.
2. **Knowledge-graph navigation tools** (`build_context`, canvas generation). We don't have an explicit graph layer yet.
3. **Cloud sync** (optional). We rely on git push.
4. **3 years of community maturity** + active Discord. We have ~3 days.

## License compatibility

Basic Memory is AGPL-3.0; claude-memory-kit is MIT. We can't directly copy code from Basic Memory into our MIT-licensed kit without licensing complications. But we CAN learn patterns and re-implement them — design patterns are not copyrightable.

## Future relationship possibilities

Three scenarios, ranked by likelihood:

1. **Stay distinct.** Different design choices (auto vs active, in-repo vs home-dir, MIT vs AGPL). Each serves a different user.
2. **Bridge layer.** A future `cmk` adapter that publishes our memory as a Basic Memory-format export, so multi-tool users can run both.
3. **Merge.** Basic Memory adopts our patterns, or vice versa. Unlikely given license + design differences.

We should monitor Basic Memory releases — they're shipping fast (latest release 6 days ago), and any pattern they ship that we lack is worth re-evaluating against.

## Direct references

- Repo: <https://github.com/basicmachines-co/basic-memory>
- README (consulted 2026-05-22): <https://raw.githubusercontent.com/basicmachines-co/basic-memory/main/README.md>
- Discord: <https://discord.gg/tyvKNccgqN>
- AGPL-3.0 license: <https://www.gnu.org/licenses/agpl-3.0.en.html>

## Related to

- [research/2026-05-22-chatgpt-deep-research-option-a.md](../research/2026-05-22-chatgpt-deep-research-option-a.md) — where we first heard of Basic Memory
- [adr/0002-markdown-source-of-truth-over-opaque-db.md](../adr/0002-markdown-source-of-truth-over-opaque-db.md) — the tenet Basic Memory independently arrived at
- [adr/0003-per-project-with-future-cross-project-tier.md](../adr/0003-per-project-with-future-cross-project-tier.md) — Basic Memory has per-project knowledge bases; we extend with cross-project user tier
- [SOURCES.md](../SOURCES.md) — master index entry

## Updates / re-consultations

| Date | What we checked | Outcome |
|---|---|---|
| 2026-05-22 | Repo metadata (gh api), README (WebFetch) | Verified; deep-dive notes written |
| 2026-05-22 | Compared design surface to claude-memory-kit | 5 things to learn from, 7 things we do differently |
