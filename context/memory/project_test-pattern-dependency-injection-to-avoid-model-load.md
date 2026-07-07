---
id: P-SWHMFa4R
type: project
shape: Timeless
title: 'Test Pattern: Dependency Injection to Avoid Model Load'
created_at: 2026-07-07T15:37:45Z
write_source: auto-extract
trust: medium
recurrence_count: 1
source_file: auto-extract
source_line: 1
source_sha1: 42a454344d1eb0d5b6ed707d04851a40fbfe0209313d4c15f9541c544e97fd29
---

Tests use extractorImpl DI parameter to inject a mock/spy embedder, avoiding the 110MB transformers.js model. Production defaults to real model. Assertions target call count (sync-once contract), batch structure/order, cache-hit behavior — not vector content.

**Why:** Model loading is slow; DI seam makes tests fast and deterministic. Call-count assertions pin leak-prevention invariant precisely (e.g., exactly 1 sync, not N).

**How to apply:** When testing embedding, inject extractorImpl spy. Assert on call counts and batch structure. Preserve DI seam when modifying embedding logic.
