# Stellman's ERR pattern — detect + recover from context collapse (2026-06-12)

**Source:** Andrew Stellman, "When Context Collapses: Teaching Agents to Detect and Recover from Lost Memory", O'Reilly Radar, 2026-06-11 (8th in his agentic-engineering series; the user surfaced it same-week). Companion code: Quality Playbook + Octobatch (Apache-2.0).
**Verification status:** ~ (article read in full from the user's wiki capture; companion repos not code-dived yet — dive before adopting any mechanism detail, per the primary-source rule).
**IP note:** the article discloses US Provisional Patent App No. 64/044,178 (2026-04-20) on "aspects of the approach"; the Apache-2.0 patent grant covers users of HIS project. The constituent techniques are, by the author's own framing, standard prior art (Memento pattern, two-phase commit, double-entry reconciliation, checkpointing). The kit adopts the long-public principles, never his implementation; record kept for awareness.

## The pattern (his framing)

**ERR = Externalize → Recognize → Rehydrate.**

1. **Externalize** — two state layers on disk: *execution continuity* (cursor/progress, changes per unit of work; checkpoint after EVERY unit, never batched) and *task continuity* (purpose/constraints, written once, read at every resumption).
2. **Recognize** — the agent CANNOT feel compaction ("can't tell 'I never knew' from 'I knew and lost it'"). Detection is a DETERMINISTIC invariant check between two independent disk records (progress cursor vs output-file tail) — divergence IS the signal, no model judgment involved. Crucially: the check INSTRUCTION lives in the system prompt / preamble — a layer that survives the compaction it detects.
3. **Rehydrate** — deliberate re-read (task brief → progress → artifact tail → recompute next unit) + a WRITTEN rehydration summary ("explicit processing beats silent loading — the agent commits to an interpretation you can audit").

## Kit mapping (where this lands)

| ERR phase | Kit state | Gap / action |
| --- | --- | --- |
| Externalize | STRONG — the kit's whole thesis (context/, now.md per-turn buffer, audit trail, frozen snapshot) | none new |
| Rehydrate (session start) | STRONG — SessionStart snapshot + 75.0 authority preamble | none new |
| Recognize + mid-session rehydrate | **THE NAMED GAP — Task 74** (long runs post-compaction; D-131's "known gap") | this article is Task 74's design dossier source #1 |

**Three adoptable principles for Task 74:**

1. **Placement is everything**: our SessionStart snapshot is conversation-prefix — compaction EATS it. Our 75.2 per-prompt hint already survives compaction by construction (fires fresh per user prompt) — the kit independently built the survivable-instruction half of his Recognize. Task 74 should extend the HINT (and/or the CLAUDE.md managed block, which the harness re-reads), never the snapshot.
2. **Re-inject on compaction-resume**: Claude Code's SessionStart hook may support a compaction/resume source matcher — if the hooks doc confirms, re-firing the snapshot injection post-compaction is most of Task 74 nearly free. **Verify against the hooks doc at Task 74 start (primary source), not from memory.**
3. **Deterministic divergence over model self-report**: any "did I lose memory?" mechanism must be a disk-vs-belief check or a re-read instruction, never "does the model think it forgot" (his amnesiac-clerk / Memento framing; same philosophy as the kit's doctor HCs and the D-122 lesson that per-turn judgment masks systemic state).

**Convergence note:** Quality Playbook = yet another all-state-as-committed-files agent system (the squad / PAI / ruflo / memclaw family — convergence #7 for the kit's thesis). His "phase reads inputs from files, writes outputs to files, stops" is the kit's hook pipeline shape.

_Cross-links: Task 74 (the consumer), Task 55 (trajectory memory), D-131 (the autonomy position naming the gap), 75.2 (the surviving hint), D-104 (layered capture — raw transcripts as the lossless externalization floor)._
