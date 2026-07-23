---
id: P-QRXGWG44
type: project
shape: State
title: Plural Citation Extraction Gap in Corpus
created_at: 2026-07-23T20:26:02Z
write_source: auto-extract
trust: medium
recurrence_count: 1
source_file: auto-extract
source_line: 1
source_sha1: f30fc55c919684fbe3cabb64c1cccf128f3f1de42df79522b82aadd063c73871
---

- Current corpus extraction: ~1,152 edges
- Gap: 82 occurrences of plural citation patterns ("Tasks 28-35"-style, slash-joined, ranges) extract zero edges
- Root: Recall gap in anchor-extraction feature (extraction quality is the core metric)
- Fix scope: Adds plural/range/slash forms; range endpoints only (interior tasks not cited)
- Expected outcome: Edge count should rise visibly above 1,152 when merged

**Why:** Gap found by reviewer running against live corpus (not test fixtures), catching a pattern tests missed. Anchor extraction quality is the whole point of the feature.

**How to apply:** When validating future extraction improvements, test live corpus and monitor edge-count changes as a recall metric; citation-form gaps will be visible as stalled edge counts.
