---
adr: 0009
title: Provenance frontmatter on every observation (per FR-29)
status: accepted
date: 2026-05-22
deciders:
  - the maintainer
  - Claude Opus 4.7
supersedes: null
superseded_by: null
related:
  - 0002-markdown-source-of-truth-over-opaque-db.md
  - 0007-content-addressed-citation-ids.md
tags:
  - provenance
  - observability
  - audit-trail
  - schema
written_retroactively: 2026-05-26 (post-PR-31 audit campaign PR-C)
---

# ADR-0009 — Provenance frontmatter on every observation

## Status

**Accepted** 2026-05-22 (decision date; ADR file written retroactively 2026-05-26 from preserved evidence per PR-C of the post-PR-31 audit campaign).

## Provenance of this ADR (meta-note)

This ADR was reserved during the requirements-revisions-proposed.md drafting on 2026-05-22 ("Write ADR-0009 (provenance) and ADR-0010 (raw archives)") but the file itself was never written — the decision shipped (FR-29 in `requirements-revisions-proposed.md`, design §6.6, `packages/cli/src/provenance.mjs`, full regression test coverage) without the ADR being created. The post-PR-31 cross-reference audit (PR-C, 2026-05-26) surfaced the gap. This ADR is reconstructed from the preserved evidence:

- [`specs/requirements-revisions-proposed.md`](../../archive/specs/v0.1.0/requirements-revisions-proposed.md) §"Section 2 — Promote two user stories" + "FR-29 — Observation provenance frontmatter" (the canonical schema).
- [`docs/sources/basic-memory-deep-dive.md`](../sources/basic-memory-deep-dive.md) §6 ("Provenance frontmatter per ADR-0009 proposal. Basic Memory has frontmatter but not the specific `write_source` + `trust` + `source_sha1` schema").
- [`packages/cli/src/provenance.mjs`](../../packages/cli/src/provenance.mjs) — the implementation (Task 13, T-011).
- [`specs/design.md`](../../specs/design.md) §6.6 — privacy + provenance integration.

This is the evidence-driven backfill case the user described in the campaign plan: *"decision-made-with-evidence → write ADR from real evidence."*

## Context

Memory writes come from heterogeneous sources — The user typing "remember this", the auto-extract subagent firing on Stop, the compressor's session-end rollup, manual edits to the markdown files. Without provenance metadata, a reader looking at a bullet in `MEMORY.md` cannot distinguish "user explicitly stated this fact" from "an LLM summarized it from a longer conversation" from "I hand-edited this last week."

Three concrete consequences of un-provenanced storage observed in predecessor systems:

1. **User-explicit corrections silently get overwritten by auto-extract** when both target the same canonical text. Without `write_source`, the dedup logic can't prefer the higher-authority source.
2. **Auditing what went wrong becomes guesswork** after a memory-poisoning incident. "Did this leaked phrase come from me, the user, or the model?" — the answer matters for incident response.
3. **Trust-aware retrieval is impossible**. `cmk search --min-trust medium` can't filter low-confidence model-summarized bullets if every bullet looks the same on disk.

The competitive landscape ([Basic Memory](https://github.com/basicmachines-co/basic-memory) and others) demonstrates the pattern at varying fidelity. Basic Memory ships frontmatter on per-fact files but doesn't carry the specific `write_source` / `trust` / `source_sha1` schema that distinguishes user-explicit from model-generated.

## Decision

**Every memory bullet (in `MEMORY.md`, `USER.md`, granular `memory/<type>_*.md` files, and scratchpad files generally) carries provenance metadata with these required fields:**

```yaml
id: P-A8FN3MQ2                              # citation ID per ADR-0007 / FR-14
source_file: context/transcripts/2026-05-22.md  # where it was captured from
source_line: 142                             # line in source file
source_sha1: <sha1 of source file at capture time>
write_source: user-explicit | auto-extract | compressor | manual-edit
trust: high | medium | low                   # heuristic confidence
created_at: 2026-05-22T14:30:00Z
```

For scratchpad bullets (MEMORY.md / USER.md / SOUL.md) the metadata lives in an HTML-comment provenance line beneath the bullet:

```markdown
- (P-A8FN3MQ2) we standardized on Python 3.13
  <!-- source:auto-extract-sess-123, source_line:1, sha1:..., write:auto-extract, trust:high, at:2026-05-22T14:30:00Z -->
```

For granular per-fact files in `context/memory/<type>_<slug>.md`, the metadata lives in YAML frontmatter at the top of the file.

`write_source` semantics:

- `user-explicit` — user typed "remember this" / "from now on" / etc. **High trust.**
- `auto-extract` — sub-Claude identified a durable fact during the Stop-hook auto-extract pass. **Medium trust** (user-origin candidates promoted; assistant-origin demoted per the bi-turn amendment in design §6.4).
- `compressor` — SessionEnd compressor produced a rollup bullet. **Medium-low trust** (LLM summary of LLM-summarized content).
- `manual-edit` — user edited the markdown file directly. **High trust** (the user owns the file).

`trust` field is a heuristic confidence level the kit uses for filtering + dedup tiebreaking. It is intentionally orthogonal to `write_source` (a user can edit a low-confidence bullet to bump trust; auto-extract can emit a high-trust bullet if Haiku is highly confident).

## Consequences

### Positive

- **Auditable.** Any bullet can be traced back to its source file + line + SHA-1 fingerprint. `cmk get-observation P-A8FN3MQ2` returns the full provenance.
- **Drift-detectable.** `source_sha1` lets the kit detect when the original context file has been modified since capture (the bullet may have stale grounding).
- **Trust-aware retrieval** becomes possible. `cmk search --min-trust medium` filters out low-confidence model-summarized bullets.
- **Dedup tiebreaking is principled.** When the user states a fact and the auto-extract pass also captures it, the user-explicit version wins.
- **Validates the kit's "audit trail over cleanliness" stance** (per ADR-0002 markdown-as-source-of-truth + the tombstone-not-silent-delete pattern that ships as ADR-0010).

### Negative

- **~150 bytes per bullet of overhead** for the provenance line. Per design.md §15 "Trade-offs explicitly accepted" — accepted in exchange for the full audit trail.
- **Provenance schema drift risk.** Writers in different modules (auto-extract, memory-write, compressor) must all emit the same shape. PR-26's audit named "provenance frontmatter" as one of the things `validate-template.mjs` would need to enforce; until then it's prose-only.
- **Hand-editing the markdown** without updating provenance produces stale `source_sha1` / `created_at` fields. Documented limitation; the `manual-edit` write_source value at least flags that this happened.

### Neutral

- The schema is YAML-shaped but lives in HTML comments for scratchpad bullets (to keep the bullet line readable). Both forms parse correctly via `provenance.mjs` `parseBulletProvenance()`.

## Alternatives considered (and why rejected)

| Alternative | Why rejected |
|---|---|
| No provenance, just bullet text | Can't audit memory-poisoning incidents; can't distinguish user-explicit from model-summarized; can't tiebreak on dedup. |
| Provenance in a sidecar SQLite (the Basic Memory approach) | Violates ADR-0002 (markdown-as-source-of-truth). Sidecar requires regeneration on schema changes + is opaque to `git diff`. |
| YAML frontmatter for scratchpad bullets too | Would push every scratchpad write to a multi-line YAML block per bullet — roughly 2× the per-bullet overhead of the HTML-comment line — meaning MEMORY.md's 2,500-char cap (design.md §scratchpad caps) holds noticeably fewer bullets before consolidation triggers. The HTML-comment shape keeps the bullet line itself readable + halves the per-bullet metadata cost. |
| Only auto-extract gets provenance; user-explicit doesn't need it | "Then why does this bullet exist?" is the same question regardless of who wrote it. Asymmetric provenance is debt that surfaces during audit. |
| Defer to v0.2 | The dedup tiebreaking + trust-aware retrieval are real v0.1 needs (auto-extract ships in Task 23). Adding provenance later would mean migrating existing bullets — strictly more work. |

## References

- [`specs/requirements-revisions-proposed.md`](../../archive/specs/v0.1.0/requirements-revisions-proposed.md) §FR-29 — the canonical schema.
- [`packages/cli/src/provenance.mjs`](../../packages/cli/src/provenance.mjs) — the writer + parser implementation.
- [`packages/cli/src/scratchpad.mjs`](../../packages/cli/src/scratchpad.mjs) — caller (every bullet write goes through `writeBullet`).
- [`tests/cli-provenance.test.js`](../../tests/cli-provenance.test.js) — boundary tests pinning the schema.
- [`docs/sources/basic-memory-deep-dive.md`](../sources/basic-memory-deep-dive.md) — the predecessor system comparison.
- [`specs/design.md`](../../specs/design.md) §6.6 — privacy + provenance integration.

## Review history

| Date | Reviewer | Action |
|---|---|---|
| 2026-05-22 | the user | Decided per requirements-revisions-proposed.md approval (FR-29) |
| 2026-05-23 | (implementation) | Task 13 shipped `provenance.mjs` |
| 2026-05-26 | the user + Claude (PR-C audit) | ADR file backfilled retroactively from preserved evidence after the post-PR-31 cross-reference audit surfaced the gap |
