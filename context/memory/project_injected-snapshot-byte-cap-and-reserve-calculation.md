---
id: P-K5CRKFKH
type: project
shape: State
title: Injected Snapshot Byte-Cap and Reserve Calculation
created_at: 2026-07-20T11:30:23Z
write_source: auto-extract
trust: medium
recurrence_count: 1
source_file: auto-extract
source_line: 1
source_sha1: 88f10c83d14a27ede99dcee80fc1d68e4235b4c4a204c14a8398c9770336c500
---

- 4000-byte cap enforced on injected snapshot
- Byte reserve calculated via regex matching the annotator's actual behavior (not hardcoded count), preventing divergence
- CRLF preservation required as part of contract
- Bug caught in review: reserve assumed 2 headings; actual annotator hits every match (real case: 4021 bytes on 4000-byte cap)
- Fix syncs reserve calculation with annotator logic

**Why:** Divergence between expected and actual reserve caused buffer overruns. Regex matching ensures they cannot drift.

**How to apply:** Any future changes to injection logic must validate byte reserves against the annotator's actual regex, not a count.
