# Architectural Decision Records (ADRs)

Each ADR captures one meaningful design decision: the context, what was decided, why, what alternatives were rejected, and what the consequences are. The format is adapted from [Michael Nygard's classic ADR template](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions) with extra fields for personal-wiki ingestion (deciders, dates, supersedes/superseded_by chains, tags).

## Index

| # | Title | Status | Date |
|---|---|---|---|
| [0001](0001-separate-project-not-fork-youtube-to-slide.md) | Build claude-memory-kit as a separate project, not by forking youtube-to-slide | accepted | 2026-05-21 |
| [0002](0002-markdown-source-of-truth-over-opaque-db.md) | Markdown files as the source of truth; SQLite/vector DBs are regenerable caches | accepted | 2026-05-21 |
| [0003](0003-per-project-with-future-cross-project-tier.md) | Per-project memory in v0.1, three-tier scope (user/project/local) in v0.1.1+ | accepted | 2026-05-21 |
| [0004](0004-spec-driven-development-kiro-style.md) | Spec-driven development using a Kiro-adapted workflow (requirements → design → tasks) | accepted | 2026-05-21 |
| [0005](0005-three-install-paths.md) | Ship three install paths: bash script + PowerShell script + Claude Code plugin | accepted | 2026-05-21 |
| [0006](0006-lifecycle-hooks-architecture.md) | Lifecycle hook architecture — initial 6 hooks, revised to 5+1 after Option-B research | accepted (revised 2026-05-22) | 2026-05-21 |
| [0007](0007-content-addressed-citation-ids.md) | Content-addressed citation IDs — 8-char base32 SHA-256 with tier prefix | accepted | 2026-05-22 |
| [0008](0008-bank-airgap-deferred-to-future-version.md) | Bank / air-gap deployment deferred to v0.2+ but compressor designed pluggably | accepted | 2026-05-22 |
| [0009](0009-provenance-frontmatter-per-observation.md) | Provenance frontmatter on every observation (per FR-29) | accepted (file written retroactively 2026-05-26) | 2026-05-22 |
| [0010](0010-raw-transcripts-preserved-indefinitely.md) | Raw transcripts preserved indefinitely (per FR-28) | accepted (file written retroactively 2026-05-26) | 2026-05-22 |
| [0011](0011-coexistence-with-anthropic-auto-memory.md) | Coexistence with Anthropic's native Auto Memory — coexist by default + `cmk disable-native-memory` opt-in | accepted | 2026-05-22 (decided 2026-05-31) |
| [0012](0012-npm-publish-name-and-cross-agent-future.md) | Publish v0.1.0 under `@lh8ppl` scope; defer the cross-agent product name to v0.2 | accepted | 2026-05-29 |
| [0013](0013-package-security-posture-and-ci-provenance-publish.md) | Package security posture + CI provenance publish (osv/gitleaks/CodeQL/Dependabot + signed npm publish) | accepted | 2026-05-29 |
| [0014](0014-unify-cli-mcp-shared-core.md) | Unify CLI + MCP over one in-process memory-op core (executes ADR-0006's deferred "MCP for retrieval+writes" line) | accepted | 2026-06-07 |
| [0015](0015-semantic-backend-sqlite-vec-plus-local-onnx-embedder.md) | Layer-5b semantic backend — sqlite-vec inside the existing index + an optional local ONNX embedder (bge-base-en-v1.5) | accepted | 2026-06-10 |
| [0016](0016-recurrence-promotion-passive-trust-demote-not-evict.md) | Persona promotion — capped-recurrence gate + passive-outcome trust (folds Task 97) + demote-not-evict (Task 151, from the 7-system code-read) | accepted | 2026-06-29 |
| [0017](0017-memory-learn-loop-cross-session-runtime-judge-as-adapter.md) | The kit as a cross-session learn-loop — session=bounded episode, kit=cross-session runtime, judge-as-per-host-adapter; ADOPTS the SYSTEM-MAP §6 target design (two rankable objects, confidence-gated blend in search, feedback-screen prerequisite, anti-pattern retention, recall-log); honest-memory as the deciding criterion | accepted | 2026-07-02 |

> **0009 and 0010 were "reserved + shipped" cases**: the decisions were made and implemented on 2026-05-22 (FR-29 + FR-28 in `requirements-revisions-proposed.md`; provenance and transcripts code in subsequent task PRs), but the ADR files themselves weren't written until the post-PR-31 audit campaign (PR-C, 2026-05-26) surfaced the gap. Both ADRs are backfilled from preserved evidence in the research base (`docs/sources/`, `docs/SOURCES.md`, `requirements-revisions-proposed.md`) — not reconstructed by inference. See each ADR's "Provenance of this ADR" meta-note for the specific evidence trail.

## ADR lifecycle

- **proposed** — under discussion, may not be merged.
- **accepted** — agreed and load-bearing.
- **superseded** — replaced by a newer ADR. Old ADR remains for audit trail; `superseded_by:` points to the new one.
- **deprecated** — no longer applies but not formally replaced.

When an ADR is superseded, **never delete it**. The audit trail is the value.

## Template

When writing a new ADR, copy this:

```markdown
---
adr: XXXX
title: Short imperative title
status: proposed | accepted | superseded | deprecated
date: YYYY-MM-DD
deciders:
  - Name (role)
supersedes: NNNN-* (or null)
superseded_by: null
related:
  - NNNN-*.md
tags:
  - one-word-tags
---

# ADR-XXXX — Short imperative title

## Status

Current status, date, who decided. If superseded, link to the replacement.

## Context

What's the situation that forces a decision? What was already in place?
What were the external signals (research, conversation, bug, request)?

## Decision

What we chose. Be specific. Cite paths, schemas, commands.

## Consequences

### Positive
- ...
### Negative
- ...
### Neutral
- ...

## Alternatives considered (and why rejected)

| Alternative | Why rejected |
|---|---|
| ... | ... |

## References

- URLs, repos, papers, conversation log entries, related ADRs.

## Review history

| Date | Reviewer | Action |
|---|---|---|
| YYYY-MM-DD | Name | Proposed/Accepted/Revised |
```

## Why this discipline

Three reasons. **First**, a Claude session resuming after a long gap needs to be able to re-derive *why* a decision was made — not just *what* was decided. Code shows what; ADRs show why. **Second**, when we go to revise (e.g., when v0.2 changes the hook architecture), the ADR being superseded carries the full context for the new ADR's author. **Third**, personal-wiki ingests these directly — every decision becomes a wiki entry, every entry retains its provenance.
