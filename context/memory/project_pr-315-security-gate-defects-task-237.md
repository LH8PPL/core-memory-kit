---
id: P-ZQ93PM26
type: project
shape: Event
title: 'PR #315 Security Gate Defects (Task 237)'
created_at: 2026-07-21T13:06:00Z
write_source: auto-extract
trust: medium
recurrence_count: 1
source_file: auto-extract
source_line: 1
source_sha1: 67543c50b04df7d9e6b18ec5bd10ea8bd71d48c22ecebdc52c2abbcdde8cf810
---

Code review of the OSV severity gate found three defects, all verified by running the real script against fixtures:
- **Hardcoded HIGH severity:** Every OSV finding forced to `severity: 'high'`; justification "osv-scanner filters" was false per OSV schema. LOW-severity issues triggered HIGH alerts, breaking suppression. Now reads real severity and routes through shared filter.
- **Failed scans hide as clean:** Scan failures read as findings==0 and auto-closed as all-clear. Live security issues could close while reporting success. Now requires both findings==0 AND evidence scan actually ran.
- **Unscoped issue dedup:** Dedup searched unscoped body substring; marker is a source-code literal. User quoting source would have their issue overwritten by bot, then auto-closed. Now scoped by label + author.
- Also: `!cancelled()` over `always()`; title via `env` not inline; seven regression tests added.

**Why:** Real security workflow failures. Empirical review (running actual code against fixtures) caught defects reasoning alone would miss. All merged in v0.6.2.

**How to apply:** Audit similar patterns in other CI/security gates. Future gate PRs should include empirical verification, not just schema reasoning.
