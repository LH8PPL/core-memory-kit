---
id: P-2aS27HaC
type: project
shape: State
title: Memory Snapshot Injection — Durable Facts vs Work-State Separation
created_at: 2026-07-20T11:30:23Z
write_source: auto-extract
trust: medium
recurrence_count: 1
source_file: auto-extract
source_line: 1
source_sha1: 702303ce94d7166666c17903548fff337e1f47c28d47f58ee8753e80400e123e
---

Previous bug: injected snapshot conflated durable knowledge with in-flight work-state (e.g., "Task 234: test written, implementation pending" displayed even during Task 234 implementation). This caused fresh sessions to re-do finished work.

**Solution:** use labeled caveats under headings (not deletions) to distinguish work-state from durable facts. Durable fact language remains authoritative.

**Why:** Under-firing on recall of durable facts is worse than over-labeling work-state; labels preserve both without re-work.

**How to apply:** When annotating snapshot `Active Threads` / `Pending Decisions`, add caveat lines. Leave durable fact sections untouched.
