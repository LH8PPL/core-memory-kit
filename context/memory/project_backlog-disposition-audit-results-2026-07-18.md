---
id: P-GKLSaB6Y
type: project
shape: Event
title: Backlog Disposition Audit Results — 2026-07-18
created_at: 2026-07-18T14:05:55Z
write_source: auto-extract
trust: medium
recurrence_count: 1
source_file: auto-extract
source_line: 1
source_sha1: 6c39d17242cc97bdf6f6195360352d6c31fe6bd5ec2ab96ec215e8bd9da3348f
---

Audit of 50 open top-level tasks from specs/tasks.md completed. Summary:
- Disposition breakdown: 9 LANE-current · 12 TRIGGER-live · 11 TRIGGER-FIRED · 2 GO/NO-GO · 8 STALE · 8 DONE?-CLOSE
- Action-needed: 27 tasks (11 fired unnoticed; 8 stale to shipped versions; 8 with completion conditions met)
- Fired triggers: Tasks 47/48/71 (doctor surface, Task-210 touch), 51/149/176/178 (v0.6.0 recall minor), 68/70.5/73/174/186 (misc)
- Stale tasks: 55/98/146/166/175/70/72/80 — laned to shipped versions or invalid triggers ("when taken" without gate)
- Closeable: 130/224 (completion met), 59/97/179/188 (absorbed), 147/196 (stated goal shipped)
- Secondary: shipped parents (45/46/50) carry dead checkpoint sub-boxes; hygiene pass needed before sweep

**Why:** Audit reveals task-drift before v0.6.0 cut. Monitoring gap allowed 11 triggers to fire unnoticed; laning drift caused stale entries to survive multiple versions. Sub-task checkbox decay in shipped parents.

**How to apply:** Use audit results to apply proposed sweep (close 8, re-lane 8 stale, re-verdict 11 fired). Hygiene pass on 45/46/50 checkboxes before sweep commit. Re-audit at next major lane gate (v0.6.0 cut, v0.7.0 planning).
