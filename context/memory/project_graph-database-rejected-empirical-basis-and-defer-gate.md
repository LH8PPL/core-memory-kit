---
id: P-J2DHFQSR
type: project
shape: State
title: Graph Database Rejected — Empirical Basis and DEFER Gate
created_at: 2026-07-22T16:45:47Z
write_source: auto-extract
trust: medium
recurrence_count: 1
source_file: auto-extract
source_line: 1
source_sha1: 151c163c4f998271564bd231be20769fd68dd341a812a74a787a8b292c6dd2f6
---

Adding a graph database was rejected (ADR-0023). **Reasons:** server dependency, second source of truth (drift risk), empirical evidence from field.

**Peer reference:** mem0 has no graph store, MemOS's relational path commented out, Letta has none, cognee retreated to plain relational tables. Graph-first projects don't ship what they pitch.

**Known DEFER:** Multi-hop inference queries ("what decisions were influenced by X's dependencies?") may exceed flat search + explicit edges. Gated on benchmark showing actual failure — not a feeling either way.

**Why:** Verdict tested twice. Real practice in the field validates the rejection. Honest caveat: Task 232's scope unknown to cover all inference; requires benchmark if multi-hop need emerges in production.

**How to apply:** Use Task 232 (activate existing edges) as settled answer. If multi-hop inference later proves necessary, benchmark *first* before reconsidering graph infrastructure.
