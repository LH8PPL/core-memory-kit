---
date: 2026-07-22
topic: Google's Open Knowledge Format (OKF) v0.1 — spec verification + kit isomorphism
source: Primary-source read of github.com/GoogleCloudPlatform/knowledge-catalog (okf/SPEC.md) + secondary Medium article assessment
tags: [prior-art, format, validation, interop, graph]
---

# OKF (Open Knowledge Format) v0.1 — the kit's architecture, as a Google spec

## What was verified (primary source)

- **Repo + spec are REAL** — `github.com/GoogleCloudPlatform/knowledge-catalog/okf/` exists: `SPEC.md`, `bundles/` (GA4 / Stack Overflow / Bitcoin example bundles), `samples/` (recipe pairs), `src/reference_agent/`, tests, Apache-style layout with `pyproject.toml`. Verified by direct fetch 2026-07-22.
- **The spec (v0.1):** knowledge as a directory of markdown files with YAML frontmatter. One REQUIRED frontmatter field (`type`); optional title/description/resource-URI/tags/timestamp. Reserved filenames: `index.md` (directory listing / progressive disclosure) and `log.md` (update history). Cross-links via standard markdown links (bundle-relative paths recommended). Deliberately PERMISSIVE: consumers must tolerate missing fields, unknown types, broken links, missing indexes — designed for partial generation by agents. Explicitly does NOT prescribe storage, taxonomies, or claim to replace domain schemas.

## The secondary source (assessed, not trusted)

Medium article "Beyond RAG: How Google's OKF is Replacing the Vector Database" (secret-dev.medium.com, 2026-07-03) — saved in the maintainer's personal wiki. **Hype-graded**: the headline claim ("replacing the vector database") appears nowhere in the spec, and the article itself retreats to a hybrid OKF+RAG router by its end. The Karpathy attribution is narrative garnish (unverified). This is the U-2AD4YBKD press-laundering class — cite the spec, never the article.

## Why this matters to the kit: near-isomorphism

| OKF v0.1 | core-memory-kit |
| --- | --- |
| Markdown + YAML frontmatter, `type` required | Fact files: markdown + YAML frontmatter, `type` in schema |
| `index.md` progressive disclosure | `INDEX.md` + the bounded snapshot → deeper archive model |
| `log.md` update history | `DECISIONS.md` journal + audit log |
| Explicit markdown cross-links as the graph | `related:` frontmatter + Task 232's edges-from-markdown |
| Git-native, PR-auditable | Committed `context/` tier |
| Agents as librarians (background maintenance) | Auto-extract, consolidation, distill pipeline |
| Permissive consumers (tolerate breakage) | Rebuildable indexes (ADR-0002), tolerant walkers |

**This is the strongest external validation yet of the kit's core bet** — markdown-in-git, agent-readable, agent-maintained — now a vendor-neutral spec carrying Google's name. The kit is a SUPERSET on the hard parts OKF punts on: tiering (P/L/U), trust levels, caps + graduation, capture coercion (hooks), poison screening, hybrid FTS5+vector recall, supersession/tombstones.

## What OKF does NOT solve (and the kit's evidence says is the real problem)

- **Agent traversal is hoped, not coerced.** OKF's "deterministic navigation" assumes the agent reads `index.md` and follows links. The kit's live evidence (memory-search: zero fires in a full session despite a per-prompt hint; D-40/D-153 lineage, Task 233) says exactly this hope fails. OKF has no answer; the kit's harness-over-harness direction is ahead of it.
- **Entry-point discovery.** Links relate concepts but don't answer "where do I enter the graph for this query" — which is why the kit runs search OVER the markdown. OKF's own reference agent will hit this.
- **Graph convergence with ADR-0023:** OKF's graph is markdown links — rebuildable from files, no graph DB, no typed KG store. That is precisely ADR-0023/D-361's ACTIVATE verdict shape (Task 232: edges table rebuilt from markdown) and the cognee convergence in D-380. OKF is a third independent arrival at "the graph is the links in the files, not a database."

## Actionable

1. **Task 251 filed — OKF interop (deferred, named trigger).** Fact files are ~90% OKF-shaped already; an export (`cmk export --okf`) or documented compatibility mapping is cheap and positions the kit as "your memory is a standard OKF bundle." Import (`point the kit at an OKF bundle → searchable memory`) is the same seam in reverse. Wait for the spec to prove alive (v0.1 is day-one).
2. **Frontmatter alignment is nearly free** — the kit's `type`/`title`/`tags`/timestamps map 1:1; worth a compatibility table in the interop task, not a schema change now.
3. **Watch item for prior-art sweeps** — OKF joins the corpus; any future format/interop task gets a fresh look at the repo (per the unconditional prior-art rule).
