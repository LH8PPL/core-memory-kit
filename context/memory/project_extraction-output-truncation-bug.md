---
id: P-AFLZRQJ5
type: project
title: Extraction Output Truncation Bug
created_at: 2026-06-11T13:19:36Z
write_source: auto-extract
trust: medium
source_file: auto-extract
source_line: 1
source_sha1: b1ae16129139f4588d057fff856e8de69b7e38ed
---

When a memory-extraction turn emits multiple rich facts (>2000 bytes total), the compressor pipeline hard-slices output at `maxOutputBytes`. The parser writes an incomplete trailing fact stub instead of rejecting the entire batch. This corrupts the memory file on disk (incomplete YAML/JSON closes).

**Why:** Prevents dense inference turns from poisoning the fact archive; must validate shape completeness.

**How to apply:** Task 136 raises the output cap AND adds parser validation to reject shape-incomplete trailing facts before file write.
