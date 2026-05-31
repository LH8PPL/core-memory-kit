---
adr: 0007
title: Content-addressed citation IDs — 8-char base32 SHA-256 with tier prefix
status: accepted
date: 2026-05-22
deciders:
  - Lior Hollander
  - Claude Opus 4.7
supersedes: null
superseded_by: null
related:
  - 0002-markdown-source-of-truth-over-opaque-db.md
  - 0003-per-project-with-future-cross-project-tier.md
  - 0006-lifecycle-hooks-architecture.md
tags:
  - identifiers
  - citations
  - schema
---

# ADR-0007 — Content-addressed citation IDs — 8-char base32 SHA-256 with tier prefix

## Status

**Accepted** 2026-05-22. Revises the initial "6-char random base32" placeholder in [requirements.md OQ-4 / FR-14](../../specs/v0.1.0/requirements.md) after Option-B research showed content-addressing offers natural dedup and consolidation survival.

## Context

Every captured memory fact needs a stable, citable ID. Claude (or any reader) should be able to write *"per M-7K2X9Q, we're on v2.6.16"* and have the reference resolve deterministically — across machines, across consolidation passes, across merges from multiple sessions.

Three schemes were on the table from the start:

1. **Auto-increment integers** (claude-mem's choice). Renders as `#42`. Fast, simple. Not portable across machines — same SQLite file, same ID; different machines collide.
2. **Random base32** (initial v0.0.1 placeholder, OQ-4 first-draft answer). Renders as `M-7K2X9Q`. Portable. 6 chars ≈ 30 bits has ≈ 0.4% collision risk at 10⁶ items.
3. **Content-addressed hash** (novel pattern surfaced by Option-B research). Renders as `P-A8FN3MQ2`. ID is derived from `SHA-256(canonical_text)` truncated to 8 chars in base32. 8 chars ≈ 40 bits gives ≈ 10⁻⁶ collision probability per pair at 10⁶.

Option-B research surfaced a fourth dimension: **what happens at consolidation?** When the weekly curator merges bullets A and B into C, do both IDs survive? With random IDs we'd have to preserve both manually (`(M-A, M-B)` in the merged bullet). With content-addressed IDs, two bullets with the same text hash to the same ID — natural dedup. Different text → different ID. The merged bullet (which has new text) gets a new hash; the originals get archived in frontmatter as `merged_from: [P-A, P-B]`. This is how DOIs handle deprecation: the old DOI never dies, it just points to the new one.

## Decision

**Citation IDs are content-addressed: `<tier_prefix>-<base32(SHA-256(canonical_text))[:8]>`.**

### Format

| Component | Value | Example |
|---|---|---|
| Tier prefix | `U` (user), `P` (project), `L` (local) | `P` |
| Separator | `-` | `-` |
| Hash | First 8 chars of base32(SHA-256(canonical_text)) | `A8FN3MQ2` |
| Full ID | concatenated | `P-A8FN3MQ2` |

**Session anchors are different**: they use BibTeX-style human-mnemonic IDs, e.g., `S-2026Q2-001`. Sessions aren't content; they're temporal anchors. Mnemonic IDs are more useful for humans browsing.

### Canonical text

The input to SHA-256 is the bullet's **canonical text**: trimmed, whitespace-collapsed, lowercased, with citation backrefs and frontmatter stripped. This makes two bullets that differ only in whitespace or case hash to the same ID — they ARE the same fact.

### Consolidation rule

When the compressor or weekly curator merges bullets A (`#P-AAAAAAAA`) and B (`#P-BBBBBBBB`) into C:

1. Compute C's canonical text.
2. Compute C's ID via `P-<hash(C)>`.
3. In C's frontmatter, record `merged_from: [P-AAAAAAAA, P-BBBBBBBB]`.
4. The originals A and B remain in archive but reference C as `superseded_by: P-CCCCCCCC`.
5. Search results favor C (the live version) but can surface A/B with a "merged into C" annotation.

### Why 8 characters (not 6 or 10)

| Length | Bits | Collisions @ 10⁶ items | Verdict |
|---|---|---|---|
| 6 chars | ~30 bits | ~40% | Too risky |
| 8 chars | ~40 bits | ~10⁻⁶ per pair | **Sweet spot** |
| 10 chars | ~50 bits | ~10⁻⁹ per pair | Overkill, less readable |

Citation: Nima Karimian Kakolaki, *A Comparative Analysis of Identifier Schemes: UUIDv4, UUIDv7, and ULID for Distributed Systems* (arXiv:2509.08969, Sep 2025) — ULID's 98.42% lower collision risk vs UUIDv7 informs the choice of base32 with explicit entropy budget over UUID-like schemes that waste bits on structure.

## Consequences

### Positive

- **Natural dedup**: same fact captured twice → same ID. No bookkeeping required.
- **Consolidation-stable**: merged bullets get new IDs but reference originals deterministically. Future searches resolve old IDs to current ones via `merged_from`.
- **Cross-machine portable**: no clock, no counter, no central authority. Any machine can mint IDs for the same content and they match.
- **Tier-namespaced**: `P-X` and `U-X` can never collide even if hashes coincide.
- **Readable**: base32 (no ambiguous 0/O or 1/l) survives copy-paste, voice dictation, and URL embedding.

### Negative

- **Slightly longer than auto-increment**: `P-A8FN3MQ2` is 10 chars vs `#42`'s 3. Citation density in prose increases. Mitigated by the readable base32 alphabet and the meaningful tier prefix.
- **Canonical-text discipline required**: the hash is only stable if every writer canonicalizes the same way. Implementation must use a single shared canonicalize() function — drift would break the dedup property.
- **No insertion ordering**: 8-char hash IDs are unsortable temporally. Mitigated by always storing `created_at: <epoch>` in frontmatter, separate from the ID.

### Neutral

- Session anchors stay BibTeX-mnemonic (`S-2026Q2-001`) — they're temporal markers, not content. Different identifier class, different scheme.

## Alternatives considered (and why rejected)

| Alternative | Why rejected |
|---|---|
| Auto-increment integer (`#42`) | Not portable. Two machines mint conflicting IDs. Can't survive multi-machine sync. |
| UUIDv4 (random 36-char) | Too long for casual citation. `#a3f9d2b7-...-` in prose is unreadable. |
| ULID (26-char timestamp-prefix + random) | Better than UUIDv4 (sortable) but still verbose. Loses content-addressing benefit. |
| Random 6-char base32 | 0.4% collision at 10⁶ items is too risky; no natural dedup. |
| BibTeX-style mnemonic everywhere (`milvus2026`) | Human-pickable but doesn't survive auto-extract — sub-Claude can't reliably mint mnemonic IDs. Kept for session anchors only. |
| Hash-of-rowid (no content) | Same problem as auto-increment — depends on insertion order. |

## References

- Option-B research: [research/2026-05-21-claude-ai-deep-research-option-b.md](../research/2026-05-21-claude-ai-deep-research-option-b.md), Q3
- ID scheme comparison paper: Karimian Kakolaki, *A Comparative Analysis of Identifier Schemes* (arXiv:2509.08969) — <https://arxiv.org/abs/2509.08969>
- Base32 alphabet (RFC 4648): <https://datatracker.ietf.org/doc/html/rfc4648>
- DOI deprecation model (the inspiration for the `merged_from` / `superseded_by` pattern): <https://www.doi.org/the-identifier/resources/factsheets/key-facts-on-digital-object-identifier-system/>
- Conversation context: [conversation-log/2026-05-22.md](../../archive/docs/conversation-log/2026-05-22.md), thread "Option-B research applied — citation IDs"

## Review history

| Date | Reviewer | Action |
|---|---|---|
| 2026-05-21 | Lior | OQ-4 first-draft answer: namespaced random base32 (placeholder) |
| 2026-05-22 | Lior | Revised to content-addressed 8-char base32 after Option-B research |
