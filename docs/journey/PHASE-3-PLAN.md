# Phase 3 plan — "Claude remembers its own positions and stays consistent"

> Saved 2026-05-30/31. **Status: plan APPROVED-pending — presented to Lior, awaiting "go" to start P3.0.** This is the v0.2 heart. Spec-grounded (requirements + tasks checked). The target scenario: in a new session — _"2 days ago you said doing it that way was a mistake; now you're saying the opposite"_ — Claude should know it, own it, reconcile.

## Current state (verified 2026-05-30)
- ✅ Raw material on disk: `capture-prompt` + `capture-turn` write BOTH user + assistant turns to `context/transcripts/{date}.md` with timestamps. Auto-extract tags assistant-origin + demotes its trust (design §6.4).
- ❌ Transcripts NOT injected at SessionStart, NOT in the search index (index-rebuild indexes facts + scratchpads only).
- ❌ Claude's *positions* aren't captured as first-class timestamped contradiction-checkable facts (only user prefs + project facts are).
- ✅ Contradiction machinery exists: `detectConflicts` + auto-supersede (Task 25; now used by auto-persona + auto-drain). Phase 3 reuses it.

## Spec grounding (from requirements + tasks)
- **No existing requirement covers this** — latest are FR-28/29/30, US-13. So Phase 3 STARTS by adding **US-14** ("AI-side position consistency") + **FR-31** to `requirements-revisions-proposed.md` (Kiro spec-driven step 0).
- **Task 51** (index session-rollups + transcripts; maps US-9 "search across … sessions, and transcripts") carries an "is session-rollup indexing even needed? (redundant with auto-extract)" caveat. → P3.2 uses only the **transcript half** of Task 51; session-rollup half stays deferred.
- **T7 (amended tenet) + FR-28**: raw transcripts preserved + authoritative ("retrieval-over-preserved-events"). So extracted **decision-facts = derivative cache; raw transcript = authoritative source** — the contradiction engine reasons over structured decision-facts but CITES the raw transcript line. T7's both/and hedge.
- **Don't collide with `## Pending Decisions`** (MEMORY.md section, design §231, `list-pending-decisions()`) — that's *open questions the user must decide*. P3.1's `type: decision` facts are *Claude's settled stated positions*. Distinct concept + storage; name carefully.

## Decomposition (dependency-ordered; each its own PR + full ship cycle + docs-in-PR)
- **P3.0** — add US-14 + FR-31 + a design §-section (spec-driven step 0).
- **P3.1 (new Task 57)** — capture Claude's stated positions ("I recommend X", "X is a mistake", "don't Y") as `type: decision` fact files (project tier), via extending the auto-extract subagent prompt with a `POSITION:` candidate pattern (same shape as Task 45's `PERSONA CANDIDATE`). Fields: position text, topic, timestamp, source-transcript line, `trust: medium` (assistant-derived). `<private>` already stripped at capture (FR). Reuses bi-turn temp file + `writeFact` + trust hierarchy.
- **P3.2 (Task 51, transcript scope)** — index `context/transcripts/{date}.md` (`kind: 'transcript'`) so `cmk search` returns past discussion; decision-facts auto-index as fact files. (Skip the volatile session-rollup indexing — Task 51's caveat.)
- **P3.3 (new Task 58)** — inject a "recent decisions" digest at SessionStart: new frozen-snapshot section listing recent `decision`-facts (current positions) so a fresh session has them in context. Needs its own byte budget (composes with per-tier caps, §7.1). THIS is what makes reconciliation possible — the prior position is in front of Claude.
- **P3.4 (new Task 59)** — contradiction reconciliation: when P3.1 captures a position contradicting an existing decision-fact (`detectConflicts`), apply the §16.18 minimal temporal slice (`shape: decision`, `started_at`/`ended_at` validity windows) → close old, open new, link `superseded_by` → decision-history = timeline. The P3.3 digest surfaces the CURRENT position AND flags the reversal ("you said X on the 28th; current is Y as of the 30th") + cites the transcript → Claude owns + explains the change. Reuses detectConflicts + auto-supersede.
- **adjacent — Task 55** (behavioral-pattern detection) follows P3.4; not on the critical path.

## 3 design calls (my recommendations; Lior can redirect)
1. Positions live as `type: decision` **fact files in the project tier** (searchable/indexed/travels with clone) — not a separate store.
2. **Capture by extending the existing auto-extract pass** (zero new spawn — Design-B pattern) — not a separate classifier.
3. Adopt the **minimal §16.18 temporal slice** for decision-facts only (`shape` + `started_at`/`ended_at`) — not the full 7-mode retrieval classifier (deferred).

## Sequencing
P3.0 → P3.1 (57) → P3.2 (51-transcripts) → P3.3 (58) → P3.4 (59). ~5 PRs.

## Resume
If Lior said "go": start P3.0 (write US-14 + FR-31 + design section + tasks.md 57/58/59 breakdown), then P3.1. If he redirected a mapping/design call, apply that first.
