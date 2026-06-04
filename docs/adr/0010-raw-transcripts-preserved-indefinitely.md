---
adr: 0010
title: Raw transcripts preserved indefinitely (per FR-28)
status: accepted
date: 2026-05-22
deciders:
  - the maintainer
  - Claude Opus 4.7
supersedes: null
superseded_by: null
related:
  - 0002-markdown-source-of-truth-over-opaque-db.md
  - 0009-provenance-frontmatter-per-observation.md
tags:
  - storage
  - retention
  - audit-trail
  - compression
written_retroactively: 2026-05-26 (post-PR-31 audit campaign PR-C)
---

# ADR-0010 — Raw transcripts preserved indefinitely

## Status

**Accepted** 2026-05-22 (decision date; ADR file written retroactively 2026-05-26 from preserved evidence per PR-C of the post-PR-31 audit campaign).

## Provenance of this ADR (meta-note)

This ADR was reserved during the requirements-revisions-proposed.md drafting on 2026-05-22 (alongside ADR-0009 for provenance) but the file itself was never written — the decision shipped (FR-28 in `requirements-revisions-proposed.md`, design §6.5 tombstone discipline, transcripts captured in `context/transcripts/{date}.md` are never auto-deleted) without the ADR being created. PR-C of the post-PR-31 audit campaign (2026-05-26) surfaced the gap. This ADR is reconstructed from the preserved evidence:

- [`specs/v0.1.0/requirements-revisions-proposed.md`](../../archive/specs/v0.1.0/requirements-revisions-proposed.md) §"Section 3 — New functional requirements" + "FR-28 — Raw transcripts are append-only, never compressed away" (the canonical statement).
- [`docs/SOURCES.md`](../SOURCES.md) — Adler + Zehavi "Storage Is Not Memory: A Retrieval-Centered Architecture for Agent Recall" (arXiv:2605.04897) explicitly validates the decision: *"Extraction at ingestion is the wrong primitive for agent memory: content discarded before the query is known cannot be recovered at retrieval time."*
- [`specs/v0.1.0/design.md`](../../specs/v0.1.0/design.md) §6.5 — tombstone discipline (the kit never silently deletes; even removals are auditable).
- [`packages/cli/src/capture-prompt.mjs`](../../packages/cli/src/capture-prompt.mjs) + [`packages/cli/src/capture-turn.mjs`](../../packages/cli/src/capture-turn.mjs) — the transcript-append implementation.

This is the evidence-driven backfill case the user described in the campaign plan.

## Context

A memory system that compresses raw input into summaries faces a recoverability problem: **the summarizer's choices are made at ingestion time, before the query is known**. Whatever the summarizer discards can never be recovered when a future query needs it.

Three failure modes the kit observed in predecessor systems + the literature:

1. **Lossy summary destroys context the query later needs.** Auto-extract sees a turn about "deciding between Python 3.13 and 3.14"; emits a high-trust bullet "we standardized on Python 3.13"; discards the Python-3.14 alternative rationale. Months later, the user asks "why didn't we go with 3.14?" — the answer was in the transcript, gone after summarization.
2. **Memory poisoning is unauditable without the source.** A bullet says "the API key is X" — but did the user actually say that, or did an injection in the transcript flip it? Without the raw transcript, the audit trail has no ground truth.
3. **Re-extraction with improved logic is impossible.** v0.2 might ship a better auto-extract prompt or a different trust-classification heuristic. Without the raw input, those improvements can't be applied to the existing memory corpus — only to NEW data.

The Storage-Is-Not-Memory paper (Adler + Zehavi, May 2026) frames this as a retrieval-centered architecture: extraction at ingestion is the wrong primitive; preservation + retrieval-time processing is the right one.

## Decision

**`context/transcripts/{YYYY-MM-DD}.md` files are preserved indefinitely. The kit shall never auto-delete them.**

Specifically:

1. **Append-only.** Transcripts grow with each captured prompt + turn. Existing content is never rewritten.
2. **Compressed summaries are derivatives, not replacements.** `sessions/today-{date}.md`, `sessions/recent.md`, `sessions/archive.md`, and the scratchpad bullets in `MEMORY.md` are all derived from transcripts. They reference back via provenance frontmatter (ADR-0009 `source_file` + `source_line` + `source_sha1`).
3. **No automatic age-based deletion.** A future `cmk transcripts gc --before 2025-01-01` command may allow user-invoked age-based deletion, but `cmk` itself shall never delete transcripts automatically.
4. **Tombstone discipline applies to derivatives, not transcripts** (this ADR's own extension of the §6.5 pattern — §6.5 covers bullet/fact-file deletions; the derivative-vs-source distinction extends that pattern to the new surface). When a user `cmk forget`s a memory bullet, the tombstone replaces the bullet in `MEMORY.md` — the underlying transcript line stays. The audit trail is "bullet was derived from transcript line N; user later asked to forget the bullet; the source line is still on disk if needed."

The 6-month acceptance criterion (per FR-28): when 6 months have passed since a transcript was created, the file shall still exist in `context/transcripts/`.

## Consequences

### Positive

- **Re-extractability.** v0.2's improved auto-extract can re-process the full transcript corpus, not just new sessions.
- **Audit ground truth.** Memory-poisoning incident response can compare the bullet against the raw transcript line that produced it.
- **Source-of-truth coherence with ADR-0002 (markdown-as-source-of-truth).** Transcripts ARE the source of truth; everything derivative is regeneratable from them.
- **Validates the broader retrieval-over-summarization architectural direction** the Adler + Zehavi paper articulates.
- **Pairs with ADR-0009 (provenance).** Without raw transcripts, the `source_file` + `source_line` provenance fields point at content that no longer exists. The two ADRs compose: provenance fields are only useful when the source they reference is preserved.

### Negative

- **Disk space grows linearly over time.** A heavy Claude Code user with 50 prompts/day × 365 days = ~18k prompts/year × ~2KB/prompt ≈ 36 MB/year per project. Acceptable for v0.1; v0.1.x may add user-invoked `cmk transcripts gc` for users with disk pressure.
- **`<private>` tag content discipline is critical.** Private content stripped at hook level (NFR-6 + capture-prompt sanitization) never enters the transcript. If a future hook bug let private content through, it would persist indefinitely.
- **Sensitive committed-tier transcripts** (the project tier is git-committed) accumulate in repo history. Mitigated by `<private>` stripping + Poison_Guard at write time, but users on shared-repo workflows should be aware.

### Neutral

- The size estimate (36 MB/year/project) is the worst case. Most projects see 5-15 prompts/day amortized; a more realistic number is 4-10 MB/year/project.

## Alternatives considered (and why rejected)

| Alternative | Why rejected |
|---|---|
| Delete transcripts after compression into `today-{date}.md` | Loses re-extractability. The whole point of the preserve-raw stance per Storage-Is-Not-Memory. |
| Default age-based deletion (e.g. after 90 days) | The user has the best context for when to gc transcripts (project handoff, switching to a different stage, GDPR). Surface the verb (`cmk transcripts gc`) and let them decide. |
| Compress transcripts into a binary format (gzip / zstd) | Violates ADR-0002 (markdown-as-source-of-truth — disk format must be human-readable + git-diffable). Gzip would save ~70% disk but breaks every reader. |
| Move transcripts to user tier (`~/.claude-memory-kit/`) instead of project tier | Loses portability — `git clone` of a project no longer carries the transcript history. The user-explicit choice was project-tier-by-default for full reproducibility. |
| Skip the decision; let users figure out retention themselves | Memory systems without an explicit retention policy default to either "delete eventually because disk" or "keep forever by accident." Make it explicit so users can rely on it. |

## References

- [`specs/v0.1.0/requirements-revisions-proposed.md`](../../archive/specs/v0.1.0/requirements-revisions-proposed.md) §FR-28 — canonical statement.
- [`specs/v0.1.0/design.md`](../../specs/v0.1.0/design.md) §6.5 — tombstone discipline (the companion decision: removals are reversible, not silent).
- [`packages/cli/src/capture-prompt.mjs`](../../packages/cli/src/capture-prompt.mjs) — UserPromptSubmit hook handler that appends to transcripts.
- [`packages/cli/src/capture-turn.mjs`](../../packages/cli/src/capture-turn.mjs) — Stop hook handler that appends to transcripts.
- [`docs/SOURCES.md`](../SOURCES.md) — Adler + Zehavi paper (`arxiv.org/abs/2605.04897`).
- [`docs/sources/basic-memory-deep-dive.md`](../sources/basic-memory-deep-dive.md) — predecessor system comparison.

## Review history

| Date | Reviewer | Action |
|---|---|---|
| 2026-05-22 | the user | Decided per requirements-revisions-proposed.md approval (FR-28) |
| 2026-05-25 | (implementation) | Tasks 19, 21 shipped `capture-prompt.mjs` + `capture-turn.mjs` (transcripts captured to `context/transcripts/{date}.md`) |
| 2026-05-26 | the user + Claude (PR-C audit) | ADR file backfilled retroactively from preserved evidence after the post-PR-31 cross-reference audit surfaced the gap |
