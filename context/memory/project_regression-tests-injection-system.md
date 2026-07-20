---
id: P-H2DaM6S3
type: project
shape: State
title: Regression Tests — Injection System
created_at: 2026-07-20T11:30:23Z
write_source: auto-extract
trust: medium
recurrence_count: 1
source_file: auto-extract
source_line: 1
source_sha1: c3752509a44b6b9882687b590c1804f6fa1ca376bca8b05621458b25c80c1543
---

Three tests added and live-verified:
- 3-heading cap boundary (byte-cap edge case)
- CRLF idempotency (preservation under re-run)
- Prefix collision (annotation placement)
All validated on real repo with 3 annotations in correct positions.

**Why:** Prevent re-occurrence of byte-reserve divergence and CRLF handling regressions.

**How to apply:** Run regression suite on changes to injection and annotation logic.
