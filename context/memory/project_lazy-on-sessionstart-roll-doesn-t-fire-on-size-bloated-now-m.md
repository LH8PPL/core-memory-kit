---
id: P-T4X5L2LP
type: project
title: Lazy-on-SessionStart Roll Doesn't Fire on Size-Bloated now.md
created_at: 2026-06-25T13:39:44Z
write_source: auto-extract
trust: medium
source_file: auto-extract
source_line: 1
source_sha1: 199b24a187c9834617d75a24a585ce2650630ad0446bd9e23ffa50ac325779b5
---

When now.md becomes bloated (410KB+ observed), the automatic roll that should fire on SessionStart (e.g., VS Code restart) does not trigger. Hypothesis: detectStaleness checks *date* staleness but not *size* staleness, so a bloated snapshot can persist across sessions unless manually compressed. Manual workaround: run `cmk-compress-session` to drain the snapshot.

**Why:** The kit's core promise is self-refreshing snapshots. This is a gap — bloated snapshots can break the durability contract across session boundaries.

**How to apply:** If next session encounters a bloated now.md persisting after restart, run cmk-compress-session manually. Root cause fix: add size-staleness detection to the roll trigger (detectStaleness or SessionStart handler). File as a TDD task.
