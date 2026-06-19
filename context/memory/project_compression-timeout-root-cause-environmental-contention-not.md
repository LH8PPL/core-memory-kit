---
id: P-SFaECJRK
type: project
title: 'Compression Timeout Root Cause: Environmental Contention, Not Input Size'
created_at: 2026-06-19T05:20:12Z
write_source: auto-extract
trust: medium
source_file: auto-extract
source_line: 1
source_sha1: 4c2bdc227e790b2c309d5d0963a302a8f1da08d897e8c924241379362710b372
---

**Measured finding:** Compression timeouts are NOT size-driven.

Evidence from 12 real log entries:
- Timeouts span 8KB–334KB; successes span 229B–470KB
- Largest success (470KB, 21s) > largest timeout
- Standalone harness: 200KB consistently ~15s, no contention
- Smoking gun (14:21 pair): 470KB succeeded, then 19s later 329-byte input failed to spawn = resource contention, not slowness

**Two distinct failure modes** (not size-correlated):
1. `haiku_timeout` — `claude --print` intermittently slow (transient API latency)
2. `compress_failed` — subprocess fails to spawn under resource pressure (EBUSY/contention during hook shutdown)

**Why:** The original design premise (A+C to cap input size and prevent "compounding spiral") is falsified. Failures hit 8KB and 329-byte inputs equally. The buffer grows only because failures leave it un-drained; failures are transient/environmental, not size-induced.

**How to apply:** Redesign around D-as-core (retry transient failures) rather than A+C (size caps). When retrying, distinguish modes if possible (timeout vs spawn-failure) for targeted handling.
