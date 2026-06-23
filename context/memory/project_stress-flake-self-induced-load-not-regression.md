---
id: P-4WTWMTaK
type: project
title: stress-flake-self-induced-load-not-regression
created_at: 2026-06-23T13:17:51Z
write_source: user-explicit
trust: high
source_file: user-explicit
source_line: 1
source_sha1: 8a03061ad5102631515e8292c48fa91b66c2253221bddf3baa87526ceb62bc02
related: [lint-clean-memory-output-plan-and-progress]
---

STRESS GATE NOTE (Task 164, 2026-06-23): the stress gate flaked 4/5 twice with DIFFERENT unrelated tests each run — run-1 spawn-smoke-auto-extract-rich (live claude --print jitter, the documented set), run-2 cli-observe-edit (an in-process NFR-1 500ms WALL-CLOCK perf budget). Neither test is touched by the Task-164 diff; observe-edit passes 16/16 in isolation. Root cause: SELF-INDUCED machine load — running stress while other background work (agents, prior stress, npm) ran in parallel overloaded the box, tripping wall-clock-budget + live-spawn-timeout tests. Lesson: when the stress gate flakes on timing/perf tests unrelated to the diff, check machine load FIRST (don't run stress concurrent with other heavy work); re-run on an idle machine for a clean signal. The jitter exception is narrow (live-Haiku only); a perf-budget flake is a different class but same root (load) — the fix is an idle re-run, not the two-consecutive-clears clause.

**Why:** During Task 164's pre-PR stress gate, two 4/5 runs with different unrelated timing tests looked alarming but were machine-load artifacts from running stress alongside other background work — not a code regression. Worth recording so a future session doesn't misread a load-flake as a real concurrency bug (or waste the two-consecutive-clears clause on the wrong failure class).

**How to apply:** Before reading a stress flake as a code problem: (1) check git diff — does it touch the failing test's path? (2) run the failing test in isolation — does it pass? (3) check for concurrent heavy work (other stress/agents/npm) loading the machine. If all point to load + the test is wall-clock/live-timing, re-run stress on an IDLE machine. Only treat as a real flake if it reproduces idle + reproducibly fails the same test.
