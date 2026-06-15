---
id: P-HTZHX3F7
type: project
title: OpenHands Context Condenser — Applicable Compression Ideas
created_at: 2026-06-15T08:20:51Z
write_source: auto-extract
trust: medium
source_file: auto-extract
source_line: 1
source_sha1: 365f08d68496bbdc0126b4133ccfeb20164a294b0b035d5c7ea7c8b3be7e3110
---

OpenHands (77k★ agent platform) context condenser yields four concrete ideas for Task 84 / §8:
- **keep_first**: preserve session anchor (original goal/framing) to prevent staleness
- **minimum_progress**: skip summarization if shrink < ~10%
- **HARD-vs-SOFT trigger**: distinguish token-fail from heuristic-count; defer soft compression off hot path
- **shrink-and-retry**: if summary call overflows, shrink event-strings 0.8× and retry

Plus convergent validations: read-only-view (frozen-snapshot tenet) and observation_masking (Task-83 + §16.14)

**Why:** Production patterns from mature agent runtime; worth evaluating for compression design

**How to apply:** Use as concrete inputs for Task 84 iteration; verify feasibility against current design
