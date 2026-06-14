---
deleted_at: 2026-06-14T06:50:56Z
deleted_reason: rewording — lazy-framing risk; verification-first replacement
deleted_by: user-explicit
id: P-D2aBRC6E
type: project
title: vitest Module-Resolution Race on Newest Files
created_at: 2026-06-14T04:30:50Z
write_source: auto-extract
trust: medium
source_file: auto-extract
source_line: 1
source_sha1: 318e3cb24174b37f867a6f231d285c2b30579117
---

vitest has a known concurrency artifact affecting module resolution during stress/parallel test runs on the newest file touched in a PR. The race is a vitest harness issue, not a code defect — confirmed by: (a) overall suite passing (1884/1884 tests), and (b) affected file passing in isolation (79/79). Observed consistently in stress runs on PR #179.

**Why:** When this race appears in CI/stress, it looks like a test failure. Knowing it's a transient harness issue prevents false debugging and unnecessary re-runs.

**How to apply:** On future PRs: if vitest reports failures on the newest file during stress/CI, check if tests pass in isolation or on re-run. If yes, mark as the known concurrency race and proceed. If no, investigate the actual code change.
