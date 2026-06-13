---
id: P-EBGGNUQ4
type: project
title: async-ifying a CLI action races its synchronous in-process test callers
created_at: 2026-06-13T07:56:43Z
write_source: user-explicit
trust: high
source_file: user-explicit
source_line: 1
source_sha1: e7c2ed5daf1b6ead1a4ffd2ced34b92a1ec2cbdc
related: [autopilot-grant-v0-3-x-queue-2026-06-12]
---

When a CLI action handler is made async (e.g. runRemember gained an await for the Task-143 near-dup embed), EVERY in-process test that calls `cmd('x').action(...)` synchronously and then asserts on disk/log state races the now-deferred write. The full non-stress suite can pass (the microtask usually resolves before the assertion); the stress gate's concurrency is what exposes it (5/5 → 4/5). Fix = await + async it(), never a weakened assertion.

**Why:** Second instance this session of an async change creating a stress-only race (the spawn-smoke empty-output oracle was the first). The caller-map-both-ways rule (CLAUDE.md) applies to TEST callers, not just src callers — and the stress gate is the thing that catches the timing, which is exactly why it runs on memory-write-surface PRs.

**How to apply:** When changing a sync function to async: grep every caller including tests; in in-process dispatch tests, await the .action() and make the it() async. If the full suite is green but stress flakes on 'expected X to contain Y' for freshly-written state, suspect an un-awaited async write before reaching for 'flaky'.
