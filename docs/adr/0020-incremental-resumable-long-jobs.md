# ADR-0020 — Long jobs are incremental + resumable-from-artifacts, never all-or-nothing

- **Status:** Accepted (2026-07-11)
- **Task:** 204 (v0.5.1, committed with Task 203 — its first concrete beneficiary)
- **Relates:** ADR-0002 (markdown-source-of-truth / derive-from-artifacts — the binding constraint on HOW resume state is stored), D-173 (bound-the-input — the sibling strategy), D-298/Task 203 (the daily-distill starvation bug that surfaced this), D-299 (the principle), the Task-148 transcript-promote watermark (the reference implementation), `P-6M26BR9S`/`P-aRHH7Va5`

## Context

A long-running kit job — `daily-distill`, `weekly-curate`, `compress-session`,
`temporal-sweep`, a reindex, a cron bin, a detached child — that reads its whole input into
one `backend.compress()` (or one batch) and writes its whole output at the end is
**all-or-nothing**: if it is killed or times out at 80% it persists NOTHING and re-does the
entire (now larger) corpus next run. On a busy repo this is not hypothetical — Task 203 (D-298)
diagnosed `recent.md` **5 days stale** because the 23:00 `daily-distill` cron was killed
(machine asleep) before its ~3.4-minute whole-corpus compress could finish, five nights
running, making zero forward progress each time.

The kit already has two strategies against long-job failure:

1. **Bound the input** (D-173) — make each run *smaller* (per-file caps, `MAX_FILES_PER_RUN`).
2. **Derive state from artifacts** (ADR-0002) — never keep authoritative state in a sidecar;
   the markdown files ARE the truth, so a rebuild reconstructs it.

Neither makes a *killed* run move forward. A bounded run that's killed still loses its work; an
artifact-derived rebuild still redoes everything. The missing third strategy: **make each run
resumable — a killed run persists what it finished and the next run continues from there.**

## Decision

**Every long job is designed so that if it is killed at 80%, it has persisted the 80% and the
next run resumes from that point — it never loses completed work and never re-does it.**

The resume point is **derived from the persisted ARTIFACTS**, never from a new persistent
watermark/sentinel file. This is the ADR-0002 constraint applied to resumability: a sidecar
resume-marker is a second writer with a two-writer race (`P-aRHH7Va5`); instead, ask the output
"which units are already done?" (which dates already have a section in `recent.md`; an mtime; a
content sha), the way `isJournalStale` reads `INDEX.md` mtime. The one sanctioned sidecar shape
is the Task-148 byte-offset `.state` marker — single-writer, written AFTER the unit it records
(crash-safe: a crash leaves the marker BEHIND the work, so the unit re-runs, never skips) — and
only where an artifact-derived point genuinely isn't available.

**Why re-runs are always safe (the enabling invariant, `P-6M26BR9S`):** `now.md` / `today-*.md`
are DERIVED buffers over the durable, never-pruned transcript tier (ADR-0010). A partial or
re-run distill can never corrupt the source of truth, so per-unit and resumed runs are
idempotent by construction.

### The review checklist (the deliverable)

For ANY long job, ask: **"if killed at 80%, does it persist the 80% and resume, or lose it?"**
If all-or-nothing, make it resumable:

1. **Iterate the smallest durable unit** — one `today-*.md` day, one fact, one N-item batch —
   not the whole corpus in one call.
2. **Persist each unit's result as you go** — append per unit, not a single write at the end.
3. **Derive the resume point from the persisted artifacts** — not a new sentinel (which day
   already has a summary section; mtime; sha). The Task-148 byte-offset `.state` is the ONLY
   sanctioned sidecar exception (single-writer, marker-after-work).
4. **Bound units-per-run** to a realistic window (the `MAX_FILES_PER_RUN` shape) so one run
   can't itself become the unbounded job.
5. **Keep the durable source tier the truth** so a re-run is safe (idempotent).

This is a **judgment rule**, not a validator target — a script can't check "is this resumable"
— so it lives in CLAUDE.md's "Engineering discipline" section and in this ADR, enforced by
review.

## Consequences

- **`daily-distill` is refactored as the reference implementation** (Task 203): it distills one
  `today-*.md` at a time, appends each day's summary as a `## <date>` section to `recent.md`,
  and resumes at the first day-file whose date is not yet a section in `recent.md`. A run killed
  after 3 of 7 days keeps those 3; the next run does the remaining 4. `recent.md`'s format
  becomes an append-accumulated set of dated sections (a superset of the old whole-week blob —
  weekly-curate's `## Week of` archival still reads it).
- **The reference implementations to copy:** the Task-148 transcript-promote (byte-offset
  watermark + `PROMOTE_MAX_FILES_PER_RUN=2`) and lazy re-embedding (mark-stale, re-embed on next
  retrieval).
- **The holdouts** (`weekly-curate`, `compress-session`, `temporal-sweep`) are NOT refactored in
  this ADR's task — the checklist generalizes to them over time; each is its own follow-on when
  next touched. `temporal-sweep` already bounds units (`MAX 20 pairs/sweep`, re-derived next
  pass) — it is closest to compliant already.
- **What this ADR does NOT permit:** a new persistent resume-marker file as the default
  mechanism. Derive from artifacts first; the byte-offset `.state` is the narrow exception.
