# Requirements revisions proposed — post Option A + Option B research

**Status**: **APPROVED** 2026-05-22 by Lior (per [`design.md`](design.md) §opening note: *"locked in tenets T7/T8, US-14/15, FR-28/29/30, NFR-9, OS-9..13, OQ-8"*). **The additions in this file are AUTHORITATIVE for FR-28, FR-29, FR-30, NFR-9, and the T7/T8/US-14/US-15/OS-9..13/OQ-8 entries — design.md and the rest of the spec stack cite them as if merged.** The mechanical merge of this content into `requirements.md` is queued as v0.1.x cleanup; until it lands, this file is the canonical source for the listed additions. PR-C of the post-PR-31 audit campaign (2026-05-26) surfaced this status-vs-citation drift and updated this header so future readers see the right state. · **Original draft date**: 2026-05-22 · **Author**: Claude Opus 4.7

This document proposed specific revisions to [`requirements.md`](requirements.md) based on **combined** findings from:

- [research/2026-05-21-claude-ai-deep-research-option-b.md](../../docs/research/2026-05-21-claude-ai-deep-research-option-b.md) (targeted)
- [research/2026-05-22-chatgpt-deep-research-option-a.md](../../docs/research/2026-05-22-chatgpt-deep-research-option-a.md) (broad landscape)

The approved additions are listed below. The mechanical merge into `requirements.md` is queued as v0.1.x cleanup — until that ships, the additions in this file are the canonical source.

---

## Summary of the research as a whole

### Option B's load-bearing findings (already discussed)

These are unchanged from the diff I proposed earlier on 2026-05-22:

| FR | Change |
|---|---|
| FR-9 (hooks) | 6 → 5 + 1 Setup. Drop PreToolUse as primary write hook. Narrow PostToolUse to `Write\|Edit\|MultiEdit`. Kit-unique command paths to dodge Anthropic bug #29724. |
| FR-14 (citation IDs) | 6-char random base32 → **8-char content-addressed SHA-256** with tier prefix. Merged bullets get new hash + `merged_from:` frontmatter. |
| FR-17 (SQLite schema) | Add `source_sha1` per row. WAL mode. `journal_mode=WAL; synchronous=NORMAL;`. |
| FR-19 (compression) | Two-stage: regex filter per tool (no LLM) + Haiku rolling window every ~5 turns + Stop + SessionEnd. |
| FR-26 (MCP) | 6 tools → 5: `mk_search`, `mk_get`, `mk_timeline`, `mk_cite`, `mk_remember` (new). |
| New FR | `cmk config --show-origin` (mirror `git config --show-origin`). |
| New FR | First-match-wins at observation level; deep-merge at settings level (Git semantics). |

All captured in [ADR-0006](../../docs/adr/0006-lifecycle-hooks-architecture.md), [ADR-0007](../../docs/adr/0007-content-addressed-citation-ids.md).

### Option A's NEW findings (not captured yet)

Option A used a broader search and surfaced **8 systems neither of us had cited** plus several research papers. The most important architectural-level signals:

1. **Basic Memory** is the closest open-source analogue to our design we'd missed entirely. Markdown-native, local-first, MCP-native across Claude/Codex/Cursor/ChatGPT. 3.1k stars, AGPL-3.0, latest release 2026-05-16. Validates our markdown-first thesis and worth a deep-dive notes file.
2. **Nautilus Compass** uses a **Merkle-chained audit log** for memory provenance. Novel; introduces tamper-evident memory as a design dimension.
3. **Claude Code CMV** treats memory as **versioned session state** with snapshot/branch/trim primitives. Novel; "session-state virtualization" as an alternative to fact extraction.
4. **Codebase-Memory** argues **structural code memory should be a separate subsystem** from project-fact memory — Tree-Sitter knowledge graph exposed via MCP. Tree-Sitter parsing + persistent graph + MCP read tools.
5. **True Memory** paper (and **MemMachine**) argue **extraction at write time is the wrong primitive** — retrieval-centered recall over preserved raw events is replicating well in 2025-2026.
6. **A-MemGuard, MemoryGraft, MemLineage** treat **memory as an attack surface**. Once memory is durable + auto-written, it can be poisoned. Trust levels and reversible writes are research-frontier directions.
7. **Layered memory beats single-store memory** (confirmed across Mem0, Claude Code, EverMemOS, MemOS). Validates our three-tier scope (ADR-0003).
8. **Short startup entrypoint + expandable** (Claude Code's `MEMORY.md` entrypoint + topic files on demand) is becoming standard. Validates our `MEMORY.md` + `memory/INDEX.md` granular pattern.

### Critical caveat from Option A

> *"Two user-supplied baseline names — **claude-mem** and **claude-remember** — did not resolve to stable, load-bearing public READMEs or docs through the available crawler in this pass."* — Option A

ChatGPT's crawler couldn't verify those repos. **This is a tool limitation, not a fact.** We have direct evidence: `gh api repos/thedotmack/claude-mem` returned 77,244 stars + 30 releases on 2026-05-21, and our manual fetch confirmed claude-remember's docs. Option B uses both extensively. We trust our direct verification.

The lesson: **single-source research is risky**. Running both A and B in parallel was the right call.

---

## Proposed changes to requirements.md

Organized by section. Each change has a rationale tied to a specific research citation.

### Section 1.4 — Add tenet T7 (raw evidentiary archive)

**ADD after T6**:

> | **T7**: Raw evidentiary archive is preserved indefinitely. Compressed summaries are derivative and lossy; the source transcripts are authoritative. | True Memory (arXiv) argues "extraction at ingest is the wrong primitive." Our rolling-window pattern (`now → today → recent → archive`) is the right hedge: keep raw `transcripts/` AND compressed summaries. The compressed layer is searchable cache; the raw layer is the audit trail. |

**Rationale**: Option A surfaces True Memory + MemMachine arguing for retrieval-over-preserved-events. We already implicitly do this — but making it an explicit tenet protects against future "let's just delete old transcripts to save space" pressure.

### Section 1.4 — Add tenet T8 (provenance is first-class)

**ADD**:

> | **T8**: Every observation carries provenance. Source file, source line, source SHA, write source (user-explicit / auto-extracted / compressed-from-summary), and trust level are required frontmatter, not optional. | Graphiti's episodes, Nautilus Compass's Merkle log, and MemLineage all point to provenance becoming an architectural requirement. Our citation IDs (ADR-0007) give us a unique anchor; provenance fields make each observation auditable. |

**Rationale**: Option A multiple citations (Graphiti, Nautilus Compass, MemLineage, A-MemGuard) all point to provenance as a 2026 architectural standard.

### Section 2 — Add user stories

#### US-14 — Raw evidence preservation

> As a developer who needs to verify a memory entry months later, I want the raw transcript that produced the observation to remain searchable and intact, even after it has been summarized into the rolling-window archive — so that I can audit "is this auto-extract correct?" against the original conversation.

Maps to: T7, FR-19, new FR-28.

#### US-15 — Observation provenance audit

> As a developer reviewing what Claude knows, I want every memory bullet to record (a) where it came from (file:line), (b) who wrote it (user vs auto-extract vs compressor), and (c) when — so that I can distinguish "user explicitly said this" from "model summarized this from a long conversation."

Maps to: T8, new FR-29.

### Section 3 — New functional requirements

#### FR-28 — Raw transcripts are append-only, never compressed away

The kit shall preserve `context/transcripts/{YYYY-MM-DD}.md` files **indefinitely** unless the user explicitly deletes them. Compressed summaries (today-*.md, recent.md, archive.md) are derivatives; they do not replace the source transcripts.

A future `cmk transcripts gc --before 2025-01-01` command may allow age-based deletion, but `cmk` itself shall never delete transcripts automatically.

**Acceptance**: When 6 months have passed since a transcript was created, the file shall still exist in `context/transcripts/`. Compressed summaries shall reference back to the source transcripts they were derived from via the citation IDs in their frontmatter.

#### FR-29 — Observation provenance frontmatter

Every memory bullet (in `MEMORY.md`, `USER.md`, granular `memory/<type>_*.md` files) shall carry frontmatter or inline metadata with these required fields:

```yaml
id: P-A8FN3MQ2                              # citation ID (FR-14)
source_file: context/transcripts/2026-05-22.md  # where it was captured from
source_line: 142                             # line in source file
source_sha1: <sha1 of source file at capture time>
write_source: user-explicit | auto-extract | compressor | manual-edit
trust: high | medium | low                   # heuristic confidence
created_at: 2026-05-22T14:30:00Z
```

`write_source: user-explicit` is high trust. `write_source: auto-extract` is medium. `write_source: compressor` is medium-low. `write_source: manual-edit` is high (user hand-edited the markdown directly).

**Acceptance**: When `cmk get-observation P-A8FN3MQ2` is invoked, the response shall include all six fields. When the source file is modified after capture, `source_sha1` allows detection that the original context has drifted.

#### FR-30 — Trust-aware search

Search results from `cmk search` and the MCP `mk_search` tool shall include trust level in the returned metadata. Future versions may weight scoring by trust. v0.1 reports trust but does not weight.

**Acceptance**: When the user runs `cmk search "milvus"`, each returned hit shall include `trust:` alongside the bullet text and citation ID.

### Section 4 — Add NFR

#### NFR-9 — Memory poisoning defense (baseline)

The kit shall implement v0.1 baseline defenses against memory poisoning, recognizing this is a known attack class (A-MemGuard, MemLineage research):

- `<private>` tags strip content before any write (NFR-6 already).
- Auto-extract is **conservative** — designed to produce frequent "skip: nothing durable" outcomes (FR-10 already).
- Provenance fields (FR-29) let users audit `write_source: auto-extract` entries.
- A future `cmk verify` command (v0.2+) may consensus-validate observations against multiple sessions before promoting to durable; not required for v0.1.

**Acceptance**: When an auto-extracted observation has `write_source: auto-extract` AND `trust: low`, the user shall be able to filter it out of search results with `cmk search --min-trust medium`.

### Section 5 — Add explicit out-of-scope items

**ADD** to the out-of-scope list:

- **OS-9**: Session-state virtualization (Claude Code CMV style snapshot/branch/trim primitives). The rolling-window compression covers most of the use case for v0.1. CMV-style versioning is a v0.2+ consideration if needed.
- **OS-10**: Structural code memory subsystem (Codebase-Memory style Tree-Sitter knowledge graph exposed via MCP). Project-fact memory is in scope; code-structure memory is a separate concern. Possible v0.2+ as a sister package or layer.
- **OS-11**: Tamper-evident Merkle-chained audit log of memory mutations (Nautilus Compass style). Append-only `transcripts/` + content-addressed IDs (FR-14) gives us most of the audit value for v0.1. Cryptographic chaining is v0.2+.
- **OS-12**: Cross-LLM portable memory (Supermemory MCP style). Our memory format is portable (markdown), but explicit adapters for Codex / Gemini / etc. are deferred to v0.2+ (consistent with T6, OS-1).
- **OS-13**: Memory operation policies via RL (Agentic Memory research direction). Far-frontier; not v0.1.

### Section 6 — Add a new resolved question

#### OQ-8 — How aggressive should auto-extract be?

**RESOLVED → conservative** (status quo from v0.0.1, but documented now).

Auto-extract is designed to fail-closed: most turns produce `skip: nothing durable`. Aggressive extraction (à la Mem0) risks accumulating memory that wasn't actually decided. Conservative extraction trusts the rolling-window compressor to re-surface latent decisions when they actually become load-bearing.

This is consistent with the True Memory paper's argument: prefer retrieval-over-preserved-events over write-time extraction. We extract sparingly; we preserve transcripts indefinitely; the retrieval path can always find what we didn't pre-extract.

### Section 7 — Add to review checklist

**ADD checkboxes**:

- [ ] T7 (raw evidentiary archive) is correctly stated.
- [ ] T8 (provenance is first-class) is correctly stated.
- [ ] FR-28/29/30 (raw retention, provenance frontmatter, trust-aware search) match the design intent.
- [ ] NFR-9 (memory poisoning defense baseline) is appropriate scope for v0.1.
- [ ] OS-9 through OS-13 (deferred features) are correctly deferred.

---

## Sources to add to SOURCES.md

### New systems / repos

- **Basic Memory** (the strongest find from Option A): <https://github.com/basicmachines-co/basic-memory> — markdown-native, MCP-native, AGPL-3.0, 3.1k stars. Worth a deep-dive notes file in [docs/sources/basic-memory-deep-dive.md](../../docs/sources/) (TODO if approved).
- **Claude Code CMV**: <https://github.com/anthropics/claude-code-cmv> or the corresponding research paper. Session-state virtualization.
- **Nautilus Compass**: research repo + paper (arXiv).
- **Codebase-Memory**: paper-level — arXiv search for "Codebase-Memory MCP Tree-Sitter".
- **EverMemOS / EverOS**: 5.4k stars, Apache-2.0.
- **MemOS**: 9.3k stars, latest release 2026-05-19.
- **Supermemory MCP**: 1.7k stars.
- **AnchorMem**: ACL'26 Findings repo.
- **A-MemGuard**: research repo + paper (arXiv Sep 2025).

### New papers (academic / research signal)

- **True Memory** — retrieval-centered recall over preserved events (counter-argues write-time extraction).
- **Hindsight** — retain/recall/reflect architecture.
- **Agentic Memory** — RL-trained memory-operation policy.
- **MemLineage** — provenance enforcement.
- **MemoryGraft** — memory poisoning research.
- **MemMachine** — episode preservation.
- **LightMem** (already in SOURCES.md via Option B; cross-confirmed).
- **KVzip** (already; cross-confirmed).

### Verification status

I will verify direct URLs for each before adding to SOURCES.md. Option A's citations use a `citeturn...` format that needs to be resolved to real URLs.

---

## Files I propose to create (if you approve)

1. **`docs/sources/basic-memory-deep-dive.md`** — analysis of Basic Memory as our closest design analog. Maybe 150 lines.
2. **`docs/research/2026-05-22-research-synthesis.md`** — short cross-research summary distilling Option A + Option B into the highest-value findings. ~200 lines. This is what `design.md` will reference instead of forcing readers to consume both raw research outputs.
3. **`docs/adr/0009-provenance-is-first-class.md`** — ADR for tenet T8 + FR-29 (provenance frontmatter).
4. **`docs/adr/0010-raw-transcripts-preserved-indefinitely.md`** — ADR for tenet T7 + FR-28.

---

## What I propose NOT to change

These remain as drafted:

- **ADR-0001 through ADR-0008** — all still valid; nothing in Option A contradicts them.
- **Three-tier scope model** — Option A's "layered memory beats single-store" confirms this.
- **Markdown-first source of truth** — Option A's Basic Memory and Anthropic Claude Code memory entries explicitly validate this. ADR-0002 stands.
- **Content-addressed citation IDs** — Option A doesn't address this directly; Option B's analysis stands.
- **5+1 hooks** — Option A doesn't deeply discuss hooks; Option B's analysis stands.

---

## Questions for you

If you approve in principle, I have three follow-up questions:

1. **Provenance scope**: Do you want provenance frontmatter (FR-29) on **every** observation, or only on auto-extracted ones? Cheapest is "all of them, always" — but it makes `MEMORY.md` busier to read. Cleanest UX is "only auto-extracted" — but then user-authored entries lack audit trail.

2. **Memory-poisoning defense scope**: Do you want NFR-9's "baseline defenses" framed as **discoverability** (can the user filter by trust?) or also as **automation** (does the system refuse to auto-promote `trust: low` observations from `now.md` to `today-*.md` in compression)?

3. **Basic Memory deep-dive**: Should I produce a [sources/basic-memory-deep-dive.md](../../docs/sources/) file now (before `design.md`), or defer until we've finalized everything?

---

## After your approval

When approved, I will:

1. Apply the changes above to `requirements.md` (insert T7/T8, US-14/15, FR-28/29/30, NFR-9, OS-9..13, OQ-8, review-checklist additions).
2. Write ADR-0009 (provenance) and ADR-0010 (raw archives).
3. Expand SOURCES.md with the verified new sources.
4. Optionally produce the synthesis doc and Basic Memory deep-dive.
5. Commit as `docs: revise v0.1.0 requirements per Option A + Option B research`.
6. Then start `design.md`.

Approval shape: a thumbs-up or a list of specific items to drop / change.
