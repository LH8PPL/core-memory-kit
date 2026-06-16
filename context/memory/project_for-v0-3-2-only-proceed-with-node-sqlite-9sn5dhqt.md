---
id: P-9SN5DHQT
type: project
title: For v0.3.2, only proceed with node:sqlite migration (141b) if perf tests show p9
created_at: 2026-06-15T12:04:44Z
write_source: auto-extract
trust: high
source_file: auto-extract-session
source_line: 1
source_sha1: 8541aa90f7697dfa38216db5e6717a6dd09f03c6a7336968c16f0056f3e61ad6
---

For v0.3.2, only proceed with node:sqlite migration (141b) if perf tests show p95 ≤ 1.03× vs better-sqlite3 AND cross-platform sqlite-vec extension loading works — otherwise defer 141b
