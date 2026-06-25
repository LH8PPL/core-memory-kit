---
id: P-EJGWN6U5
type: project
title: 'Deep-Module Principle: Smaller Interfaces via Internal Hiding'
created_at: 2026-06-25T19:55:35Z
write_source: auto-extract
trust: medium
source_file: auto-extract
source_line: 1
source_sha1: 372615e78e2c36cd1e99b2de60731312acf72fe037ba1eb80e69c9a39a4c14aa
---

- Smaller interfaces (fewer public methods) achieve deeper abstraction by hiding more implementation details
- When an internal step is only used to compute the main verdict, absorb it into the main method rather than expose it separately
- Surface diagnostic values in return objects instead of creating separate query methods (e.g., return rich `{verdict, cronStale, heartbeatAge}` instead of adding `isCronAlive()`)
- Narrows the surface area and clarifies the module's primary responsibility

**Why:** smaller interfaces reduce cognitive load, avoid two-writer hazards, and clarify intent; richer returns provide diagnostics without method proliferation

**How to apply:** when choosing whether to expose a helper step as its own method, prefer hiding it internally and including its result in the main verdict return
