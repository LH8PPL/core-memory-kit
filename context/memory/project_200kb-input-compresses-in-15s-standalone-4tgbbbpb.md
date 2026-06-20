---
id: P-4TGBBBPB
type: project
title: 200KB input compresses in ~15s standalone (no contention); real-world failures o
created_at: 2026-06-20T07:19:02Z
write_source: user-explicit
trust: high
source_file: review-promote
source_line: 1
source_sha1: 7631a1ae7bb9eff9a0705f765fc7ac26103ac534a5e5eb0e76be2e76acdc3e16
---

200KB input compresses in ~15s standalone (no contention); real-world failures occur across 8B–334KB range with zero size correlation, proving timeouts are environmental not input-driven.
