---
id: P-DA7L5A3Q
type: project
shape: Timeless
title: FTS5 Parser Crash History and Current Injection Surface
created_at: 2026-07-22T20:10:38Z
write_source: auto-extract
trust: medium
recurrence_count: 1
source_file: auto-extract
source_line: 1
source_sha1: 4997c8522df55378c9b071dce53951844ed64885038efdccf4183f163d329344
---

FTS5 parser has crashed on quoted strings (Task 30 incident). Task 233 now feeds user prompts directly to FTS5 queries on every prompt, creating an injection attack surface. Hostile input testing (quotes, special characters, injection payloads) is required.

**Why:** Prevents crashes and injection attacks via search queries

**How to apply:** Include quoted-string and special-character edge cases when testing FTS5 paths. Reference Task 30 when debugging FTS5 parsing failures.
