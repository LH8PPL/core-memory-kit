---
deleted_at: 2026-06-10T11:56:49Z
deleted_reason: duplicates CLAUDE.md's source-of-truth table — rules stay in CLAUDE.md; kit memory is the recall layer, not a duplicate rulebook (D-108 lean-seeding policy).
deleted_by: user-explicit
id: P-TDGSCYXS
type: project
title: Documentation Distribution Pattern and Source-of-Truth
created_at: 2026-06-10T11:32:02Z
write_source: auto-extract
trust: medium
source_file: auto-extract
source_line: 1
source_sha1: cb0987fafcf04406cdcde95110f7bd2702e13f8e
---

Files where changes are durably recorded:
- DECISION-LOG: decisions with full rationale
- tasks.md: task status with shipped annotation + reshape notes
- RELEASE-PLAN.md: task release milestones
- CHANGELOG: unreleased changes
- README: quickstart examples

Rule: original specifications preserved per "decision-trail rule".

Intentionally NOT stored (non-documentation):
- Stress-run progress and suite state — derived from `npm test` and documented in PR body instead.

A "source-of-truth table" defines what is/isn't documented state.

**How to apply:** When shipping, record each change type to the correct file. Suite state is re-derived at push time and included in PR body.
