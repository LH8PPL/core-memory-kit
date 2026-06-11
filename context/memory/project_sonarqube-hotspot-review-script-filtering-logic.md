---
id: P-MWJCVZBH
type: project
title: SonarQube Hotspot Review Script Filtering Logic
created_at: 2026-06-11T21:43:02Z
write_source: auto-extract
trust: medium
source_file: auto-extract
source_line: 1
source_sha1: b6471413e4e1eefde579677524cf90f5b30c9c80
---

The sonar-review.mjs script at C:\tmp\ filters 31 To-Review hotspots from the SonarQube API with two-tier logic:

**Auto-approved ("Safe with justification"):**
- Bounded per-line regexes (safe microseconds at memory-bullet sizes)
- Constant `shell:true` commands
- SHA1 checksums

**Held for manual code review:**
- Any slow-regex hits in files whose regexes can process whole files or multi-KB inputs: `turn-tools`, `privacy`, `sanitize`, `transcript-index`, `inject-context`, `capture-*` (and variants)

Output is returned for disposition: either approve-all or move items to v0.3.x fix queue.

**Why:** Slow-regex performance is critical in files with large input scope; these require human judgment rather than automated wave-through to avoid missing real issues.

**How to apply:** After running the script, review held items and decide on approval or backlog placement. This two-tier workflow prevents both false positives and missed security concerns.
