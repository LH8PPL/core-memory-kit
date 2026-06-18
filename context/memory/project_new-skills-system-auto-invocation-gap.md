---
id: P-QF6B7HQW
type: project
title: New Skills System & Auto-Invocation Gap
created_at: 2026-06-18T06:59:48Z
write_source: auto-extract
trust: medium
source_file: auto-extract
source_line: 1
source_sha1: a96a250a7656b462ff9b46ff90e26647c502128ccb06e516085443cac47132f8
---

Three new skills were wired into CLAUDE.md's skill-agency table in Task 160:
- `grilling`: interview user upfront before non-trivial tasks to surface design choices, preventing silent divergences
- `diagnosing-bugs`: structured bug-hunt discipline (tight repro → rank hypotheses → fix at seam)
- `tdd`: red→green test slices

Currently only `tdd` auto-fires; `grilling` and `diagnosing-bugs` require manual invocation. Known issue D-170: skill-agency rules in CLAUDE.md don't reliably trigger automatic skill selection.

**Why:** Skills exist to prevent silent divergences and improve discipline, but the auto-invocation layer isn't working as designed.

**How to apply:** Until fixed, manually invoke `grilling` before non-trivial tasks (make it the default) and explicitly request `diagnosing-bugs` during bug-hunts.
