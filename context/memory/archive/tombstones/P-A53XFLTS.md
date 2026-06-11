---
deleted_at: 2026-06-11T04:49:28Z
deleted_reason: 'misstates D3 (''re-deriving code is now required'' — backwards: re-deriving is the BLOCKER); the accurate cut-gate-guide fact covers this (the misstated-gate class, 3rd instance)'
deleted_by: user-explicit
id: P-A53XFLTS
type: project
title: Release Validation Gate Structure for v0.3.0
created_at: 2026-06-10T20:08:52Z
write_source: auto-extract
trust: medium
source_file: auto-extract
source_line: 1
source_sha1: c8458ee3fbabc0629ae1ca22153d01847b86adc5
---

The release process uses numbered gates (G0, G2b, G7, D3, etc.) and verdict checkpoints marked with ★. Guide: `docs/process/cut-gate.md`, walked top-to-bottom. Key gates:
- **G0**: Guard flipped — 0.2.5 now signals mistake (was 0.3.0)
- **G2b**: Recall skill scaffolded, read-only, forked
- **G7**: Hybrid-by-default, no-half-state
- **D3**: Changed from soft decision to hard blocker — re-deriving code is now required
- **W1–W4**: Recall ladder (auto-fire on "what did we decide", paraphrase probes, tools in transcripts, `--scope transcripts`)

**Why:** Formal gate structure ensures release quality and traceability. Each gate has explicit approval criteria.

**How to apply:** Walk cut-gate.md top-to-bottom, verify each ★ mark. If all pass, push v0.3.0 tag. Use this gate pattern in future releases.
