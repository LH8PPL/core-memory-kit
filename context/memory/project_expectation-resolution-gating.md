---
id: P-39aTUWZA
type: project
shape: State
title: Expectation Resolution Gating
created_at: 2026-07-10T20:50:55Z
write_source: auto-extract
trust: medium
recurrence_count: 1
source_file: auto-extract
source_line: 1
source_sha1: 70e5db2ebcbf2760dcc13e0e8ac0be2c78f76638ab1375087cf2d07e353c62ef
---

`judgeUserPrompt` gates on `TURN_WINDOW_MS` when resolving pending expectations, not all time. Prevents stale expectations (e.g., 2-day-old deploy) from being locked by unrelated corrections.

**Why:** Real incident: login-fix correction resolved an unrelated 2-day-old deploy expectation, incorrectly locking its prediction to MISS.

**How to apply:** When implementing async state mutation gates (learn-loop updates, expectation resolution), scope to current turn window only.
