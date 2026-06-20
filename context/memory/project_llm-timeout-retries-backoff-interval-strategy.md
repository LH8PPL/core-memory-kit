---
id: P-ABWV2PS7
type: project
title: 'LLM Timeout Retries: Backoff Interval Strategy'
created_at: 2026-06-20T10:48:24Z
write_source: auto-extract
trust: medium
source_file: auto-extract
source_line: 1
source_sha1: a56fca8958848765da5ecf8b030ce7c81481873b18f626bae973721983b2d3cc
---

When implementing retries for LLM operations, both timeout duration AND backoff interval between attempts are critical. Field consensus (19+ systems: graphiti 5s, Letta 10s, mempalace 2–8s) is 5–10s backoff between retries. The kit was falling back to 600ms for ceiling-free operations, insufficient to wait out bursty slowness windows. Solution: set explicit baseBackoffMs (e.g., 5_000) instead of relying on built-in defaults. With maxAttempts: 2, a 5s backoff gives one 5s wait between attempt 1 and attempt 2, allowing transient slowness to resolve.

**Why:** Short backoff intervals (< 1s) don't give slow LLM windows time to pass; they just hammer with back-to-back requests. Long waits (5–10s) align with field practice and let transient slowness resolve naturally.

**How to apply:** When tuning timeout/retry logic for LLM calls, check BOTH timeout duration (does a single slow call fit?) AND backoff interval (does retry wait long enough for slowness to pass?). Always set explicit backoff; never rely on defaults.
