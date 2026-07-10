---
id: P-K9C9UPVQ
type: project
shape: Event
title: Three Security Bugs Fixed with Tests
created_at: 2026-07-10T20:54:14Z
write_source: auto-extract
trust: medium
recurrence_count: 1
source_file: auto-extract
source_line: 1
source_sha1: 322a45f2280fa18be6a7aa50a41592be3c4a1b35944133a3e16f28f36116fe80
---

- Poison_Guard title side-door (secret-in-`--title` leak, OWASP A01)
- Name-guard untracked-files skip (Task 214; process gap in .gitignore drift detection)
- CI-watch workflow latch (CLAUDE.md rule (c) required)

**Why:** Real vulnerabilities in public repo; audit found both bugs and process gaps; root cause (security-through-line) mirrors Task 216 priority

**How to apply:** Maintain test coverage for all three; implement CLAUDE.md rule (c) amendment for CI-workflow verification; extend name-guard to .gitignore-drift cases
