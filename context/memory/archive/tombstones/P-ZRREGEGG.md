---
deleted_at: 2026-06-10T12:53:33Z
deleted_reason: 'misstates the coverage gate: the repo''s enforced gate is the 70% vitest ratchet; 80% is SonarCloud''s non-required new-code bar — ''ensure 80%+'' would mislead (the D-112 misstatement class)'
deleted_by: user-explicit
id: P-ZRREGEGG
type: project
title: Coverage Target and CI Caching Setup
created_at: 2026-06-10T12:45:25Z
write_source: auto-extract
trust: medium
source_file: auto-extract
source_line: 1
source_sha1: bef08d2d0d2658c88919ebf22b8222b5f5f9b0ca
---

Coverage minimum is 80% or higher. CI uses `actions/cache@v5` (verified current major) on the package's verified cache dir in both jobs. This eliminates 429 rate-limit errors in cached runs.

**Why:** 80% is the stated coverage requirement. actions/cache@v5 is tested and working; caching prevents re-downloads and associated rate-limit errors.

**How to apply:** When adding or modifying CI coverage checks, ensure 80%+. Use actions/cache@v5 for all CI cache operations; rate-limit errors should be solved via caching, not handled in code.
