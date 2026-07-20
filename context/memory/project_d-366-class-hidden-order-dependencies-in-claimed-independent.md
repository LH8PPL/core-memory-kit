---
id: P-Y6HVD6U5
type: project
shape: Timeless
title: 'D-366 Class: Hidden Order Dependencies in Claimed-Independent Mechanisms'
created_at: 2026-07-20T18:12:58Z
write_source: auto-extract
trust: medium
recurrence_count: 1
source_file: auto-extract
source_line: 1
source_sha1: dbba2fb120e743e76bd779a47ab2cc501ca2fcd341cb2079c0546aa7817483be
---

Safety-critical code may assert two mechanisms as independent (e.g., "either alone sufficient") yet actually have hidden order dependency — only one fires under concurrent load.
- Example: double-fire guard's `touchCooldownMarker` claimed independent, but only fires on `compressSession` success. Under concurrent load both rollers read "not in cooldown" → cooldown contributes zero; only atomic claim-rename provides boundary.
- Standard sequential tests won't catch this (await drains buffer, forces sequential path).
- Fix: genuinely concurrent test (un-awaited calls force race). Update docstring & design § to reflect actual boundary.

**Why:** Recurring fault in this codebase: reasoning about independent components without tracing when each executes.

**How to apply:** On safety mechanisms: trace actual execution, not just capability. Concurrent tests must use un-awaited calls.
