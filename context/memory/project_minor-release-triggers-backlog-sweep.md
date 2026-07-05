---
id: P-NZ794RQK
type: project
shape: State
title: Minor Release Triggers Backlog Sweep
created_at: 2026-07-04T07:07:20Z
write_source: auto-extract
trust: medium
recurrence_count: 1
source_file: auto-extract
source_line: 1
source_sha1: 994d37aec72e3f5ad831281014bbed730c123b3b589d00c06c30cdac3501be13
---

To cut a minor release, use `npm run release -- minor`. Per D-248/D-267, this automatically triggers the backlog sweep, with the trigger-fired walk as its first step. This is the designed workflow for minor versions.

**Why:** The release command has implicit side effects (backlog sweep automation); next session needs to know this is expected behavior, not a separate manual step.

**How to apply:** When cutting v0.4.5 or future minor versions, run `npm run release -- minor` and expect the backlog sweep to execute automatically as part of the release workflow.
