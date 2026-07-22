---
id: P-5XS9TMPG
type: project
shape: Timeless
title: Memory-write under-fire is lower-priority than memory-search
created_at: 2026-07-22T13:59:09Z
write_source: auto-extract
trust: medium
recurrence_count: 1
source_file: auto-extract
source_line: 1
source_sha1: 2360ebe13829092482a3a23d8ae68dae8ca317de081ed14ae44ee6127a94d1c8
---

**Memory-write gap (smaller impact):** When explicit write-fire doesn't trigger, cost is richness lost — missed high-trust/--why/--how capture. But the fact itself still banks via Stop-hook auto-extract coercive backstop, which runs regardless of model judgment.

**Memory-search gap (asymmetric, higher leverage):** If recall never fires, the entire value is lost — the answer existed and went unused. No coercive backstop.

**Auto-extracted facts** (via D-85/D-164 design): captured at medium trust, queued for review. Explicit write-fire captures at high trust with rich metadata.

**Why:** This asymmetry explains prioritization: recall work has 10x leverage. Write can afford to coast on auto-extract; search cannot.

**How to apply:** When allocating work to recall vs write improvements, weight recall higher. Write gaps cost richness; search gaps cost entire answers.
