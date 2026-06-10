---
deleted_at: 2026-06-10T11:56:48Z
deleted_reason: auto-extract misstated the stress gate (recorded two-consecutive-5/5 as the general rule; that is only the live-Haiku jitter EXCEPTION — the gate is 5/5 first invocation, per CLAUDE.md). Rules live in CLAUDE.md, not kit memory (D-108).
deleted_by: user-explicit
id: P-HNX5P9UA
type: project
title: Release Gate and Autopilot Workflow
created_at: 2026-06-10T11:32:02Z
write_source: auto-extract
trust: medium
source_file: auto-extract
source_line: 1
source_sha1: 62a137ce44863daad090756da9c79c6237615d70
---

Release requirement: two consecutive stress-run passes (5/5 each).
After gates pass:
1. Push to branch
2. Open PR with full jitter-exception trail (e.g., 4/5 → 5/5 → 5/5)
3. Merge via autopilot (automatic)

**How to apply:** After stress runs confirm 5/5 twice consecutively, push, open PR with full trail, and autopilot merges.
