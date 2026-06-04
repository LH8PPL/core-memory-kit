---
date: 2026-05-26
topic: snapshot cap coordinated with per-file caps + per-tier budgets — structural fix
status: complete
related_research: [2026-05-26-user-tier-cap-fix]
informed_sections: [design.md §7.1 coordination rule]
tags:
  - cap-coordination
  - structural-fix
  - separately-correct-jointly-broken
---

# Snapshot cap coordination — completing the user-tier-cap structural fix

## TL;DR

PR-25 (the user-tier cap fix) tightened user-tier seed templates and introduced per-tier byte budgets. The user's review afterward called the seed-tightening a "bandaid" and the per-tier budgets only half the structural fix: **the snapshot cap and per-file caps were still specified independently, so the composition still didn't hold under realistic user growth.** PR-B (this PR) is the rest of the structural fix.

## Math

Per-file caps (Task 12/14):

| File | Tier | Cap (bytes) |
| --- | --- | --- |
| SOUL.md | P | 1,800 |
| MEMORY.md | P | 2,500 |
| USER.md | U | 1,375 |
| HABITS.md | U | 1,800 |
| LESSONS.md | U | 1,800 |
| machine-paths.md | L | 1,500 |
| overrides.md | L | 1,500 |
| **Σ** | | **12,275** |

Snapshot cap (pre-PR-B): **10,240 bytes**.

Mismatch: **Σ per-file caps (12,275) > snapshot cap (10,240) by 2,035 bytes.** Files at their LEGAL caps blow the snapshot. The lowest-priority tier (user) loses on every cap event. The PR-25 per-tier budgets (L=1500, P=4500, U=4000, Σ=10,000) preserved this mismatch with the snapshot cap — they were a band-aid: a coordinate that lets the kit truncate gracefully, but doesn't fix the structural impossibility.

## The fix

**1. Raise snapshot cap 10,240 → 13,000 bytes.** Σ per-file caps + ~725 bytes headroom for inter-tier markers + future modest growth. Updated `DEFAULT_CAP_BYTES` in `packages/cli/src/inject-context.mjs`.

**2. Per-tier budgets = exact sum of per-file caps in that tier.** No independent numbers; everything derived from Task 12/14's per-file caps:

| Tier | Budget | = Σ per-file caps |
| --- | --- | --- |
| **L** | 3,000 | machine-paths.md 1,500 + overrides.md 1,500 |
| **P** | 4,300 | SOUL.md 1,800 + MEMORY.md 2,500 |
| **U** | 4,975 | USER.md 1,375 + HABITS.md 1,800 + LESSONS.md 1,800 |
| **Σ** | **12,275** | fits 13,000 cap (725-byte headroom) |

Updated `TIER_BUDGETS` constant in `inject-context.mjs`.

**3. Coordination rule in design.md §7.1.** Binding text:

> The snapshot cap MUST be ≥ sum of all per-file caps across all tiers. Per-tier budget MUST equal the sum of per-file caps in that tier. These are not three independent numbers — they are derived from one source-of-truth (the per-file caps in Task 12/14). Changing any per-file cap requires updating both the per-tier budget and (if total exceeds snapshot cap) the snapshot cap itself.

**4. Build-time check in `scripts/validate-template.mjs`.** New `checkCapCoordination()` function asserts:

- `Σ per-file caps across all tiers ≤ DEFAULT_CAP_BYTES`
- `TIER_BUDGETS[tier] === Σ per-file caps in that tier` for each tier

Wired into `npm test` as a pre-vitest step (joins `validate-test-ids.mjs` already there). Lint runs on every test invocation; future per-file-cap drift surfaces immediately rather than at integration time.

Skips gracefully when running against a template-only sandbox (test harness copies `template/` + `scripts/` + `package.json` but not `packages/`) — the cap-coordination invariant is a kit-dev check, not an end-user template invariant.

## Tests

Existing `tests/cli-inject-context.test.js` cases updated for new budget values:

- "snapshot is ≤ 13 KB on the small fixture" (was 10 KB)
- "user tier > U-budget" — bulk-bytes increased from 2000 to 2500 so 3×2500=7500 > 4975 budget triggers truncation; assertion updated to `budget: 4975`
- "local tier > L-budget" — bulk-bytes increased from 700 to 1500 so 3×1500=4500 > 3000 budget triggers truncation; assertion updated to `budget: 3000`
- "tier_truncated_to_budget events land in truncation.log" — fixture updated for new budgets
- "default install seed-content fixture → ALL 3 tiers reach the snapshot, no whole-tier drops" — relaxed to allow per-tier `tier_truncated_to_budget` events on the P tier specifically (INDEX.md content is NOT in the per-file-cap accounting; it's a reference pointer index that gets section-truncated gracefully). The load-bearing assertion remains: zero `dropped_tiers` events + user-tier seed bullets reach Claude.

24 cases in `cli-inject-context.test.js`; full suite 672/672 green.

## Live re-verification

Fresh sandbox + default install. Snapshot via `claude --print --plugin-dir <repo>/plugin`:

- **Snapshot bytes**: 10,340 (well under 13,000 cap)
- **All 3 tier markers** present (`<!-- cmk: local tier (L) -->`, `<!-- cmk: project tier (P) -->`, `<!-- cmk: user tier (U) -->`)
- **All 3 user-tier frozen seed IDs** present (`U-PRNQKRaC`, `U-CEKUY3H4`, `U-RDBNQSL7`)
- **Local seed present** (`L-aVFaHNDV`)
- **Zero whole-tier drops** (no `dropped_tiers` events)
- **One per-tier truncation**: P tier (budget 4300, pre 5334, post 3960, 4 sections dropped from `memory/INDEX.md`'s reference documentation — expected behavior; SOUL.md + MEMORY.md content intact)

The structural fix is complete. Per-file caps + per-tier budgets + snapshot cap are now mathematically consistent.

## What didn't ship — local-tier seed shrink

The user's original PR-B spec was a corollary: "Local-tier seed shrink: NOT NEEDED with the new L=3000 budget. The ~2917-byte seeds fit cleanly." Verified live — the local-tier seed (machine-paths.md.template + overrides.md.template ≈ 2917 bytes) fits cleanly under L=3000 with no truncation. The PR-25 follow-up filed as "local-tier seed shrink needed" can be closed.

## Meta-lesson — composition verification

This bug + PR-14's seed-trust × consolidator bug + PR-22's auto-extract-reads-assistant-only bug are three instances of the same failure class:

> **Separately-correct-jointly-broken.** Each spec is right within its own surface; nobody owns the cross-surface invariant; the bug surfaces only at integration time.

Three artifacts now prevent the next instance:

1. **CLAUDE.md "Composition verification" rule** (PR-A) — when writing a spec that adds a budget/contract/invariant, look for OTHER specs that compose with it and verify the composition.
2. **design.md §7.1 coordination rule** (this PR) — names the specific invariant: snapshot cap and per-file caps must be derived from one source-of-truth.
3. **Build-time check in `validate-template.mjs`** (this PR) — runs on every `npm test`. Future per-file-cap drift fails the lint immediately.

The third one is the load-bearing addition. Documentation discipline is fragile; build-time enforcement isn't. The Engineering-discipline-vs-tooling lesson from `validate-test-ids.mjs` (Task 15) applies again here: when a class of bug recurs, the answer is a check, not a guideline.

## Stats

- **PR-B**: 1 design.md amendment, 1 build-time validator addition, 2 cap constants updated, 4 test cases updated, 1 new journey log
- **Suite**: 672/672 green
- **Live re-verify**: ✓ snapshot ≤ 13,000, ✓ all 3 tiers, ✓ user-tier seeds, ✓ zero whole-tier drops
- **Closed follow-ups**: local-tier seed shrink (no longer needed)
