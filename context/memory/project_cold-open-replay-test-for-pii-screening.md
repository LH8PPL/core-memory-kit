---
id: P-ZD27R9NE
type: project
shape: Timeless
title: Cold-Open-Replay Test for PII Screening
created_at: 2026-07-07T20:23:07Z
write_source: auto-extract
trust: medium
recurrence_count: 1
source_file: auto-extract
source_line: 1
source_sha1: 5cc09038355fc0e577da6921d446a3b3baa6dbb230192ec2a1dc00b02420e819
---

Validation must replay exact known-leak content (e.g., Session-3 leak) to verify screening catches it. Do not ship until cold-replay passes.

**Why:** Prevents regression; ensures fix works on real data. Catches edge cases (bidi, invisible-Unicode) unit tests miss.

**How to apply:** Add exact leaked content as test fixture; run through L1/L3; assert all PII caught and masked.
