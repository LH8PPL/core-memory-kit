---
deleted_at: 2026-06-15T12:10:51Z
deleted_reason: 'Superseded by the expanded v0.3.2 scope (2026-06-15): 134, 154, 147 pulled in beyond the original 153+152. Re-capturing the full scope.'
deleted_by: user-explicit
id: P-DPQU3636
type: project
title: v0.3.2 Release Scope & Conditional Gates
created_at: 2026-06-15T12:04:44Z
write_source: auto-extract
trust: medium
source_file: auto-extract
source_line: 1
source_sha1: 68662c78018aac58c3383452aac632e248b006a0a3c4613fba3afe24fa064ec1
---

**Committed scope:** Task 153 (FTS5 parse error fix for version strings like `v0.3`), Task 152 (validate-index-completeness, small, no deps).

**Conditional scope:** Task 141b (node:sqlite migration + Node ≥22.5). Gate: both spikes MUST pass:
- Perf spike (scripts/bench-storage.mjs): node:sqlite p95 ≤ 1.03× better-sqlite3 on read/search paths
- Cross-platform `sqlite-vec` `loadExtension` under node:sqlite (Windows + macOS + Linux)

If either spike fails → defer 141b to next version; v0.3.2 ships as 153 + 152 only.
If both pass → proceed with 141b.

**Why:** clarifies scope boundaries and gating criteria; allows next session to understand conditional commitment and what unblocks 141b

**How to apply:** before coding 141b, run both spikes to completion. Log results in RELEASE-PLAN.md and gate the task accordingly. Keep v0.3.2 scope synced with tasks.md and real-time gate status.
