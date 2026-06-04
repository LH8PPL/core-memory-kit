---
date: 2026-05-26
topic: per-tier byte budgets + tighter user-tier seeds — user tier reaches Claude in default install
status: complete
related_research: [2026-05-26-live-test-findings-scenarios-3-7]
informed_sections: [design.md §7.1.1 (new subsection)]
tags:
  - cap-enforcement
  - per-tier-budgets
  - user-tier
  - meta-coordination
  - structural-fix
---

# User-tier cap-truncation fix — per-tier byte budgets

## TL;DR

Live-test scenario 4 (see [2026-05-26-live-test-findings-scenarios-3-7.md](2026-05-26-live-test-findings-scenarios-3-7.md)) found that the kit's default install + a single auto-extract bullet already exceeded the 10 KB snapshot cap, and the user tier (USER.md + HABITS.md + LESSONS.md) was being dropped on every session — even before any user customization. The user tier's value prop was undercut by cap pressure from day 1.

**Two coordinated fixes in this PR**:

- **(A)** Tighten user-tier seed templates by ~45% (USER.md 1227→812, HABITS.md 1779→934, LESSONS.md 1701→851). Bullet text preserved verbatim so Task 14's frozen IDs remain valid.
- **(C)** Per-tier byte budgets in `enforceCap()`, with section-granular truncation per tier BEFORE the legacy whole-tier-drop fallback fires. Budgets: L=1500, P=4500, U=4000 (Σ=10000 ≈ 10240 default cap).

**(A) alone postpones the inevitable** (user grows their notes over time → eventually hits cap again → tier dropped). **(C) is the structural fix** — The user tier can never be dropped to zero regardless of how project-tier facts accumulate. Both together ship a kit that works correctly at install AND after months of accumulated use.

## The finding (math + log evidence)

Per-file caps from Task 12 (design §2.1):

| File | Tier | Cap (chars) |
| --- | --- | --- |
| SOUL.md | P | 1800 |
| MEMORY.md | P | 2500 |
| USER.md | U | 1375 |
| HABITS.md | U | 1800 |
| LESSONS.md | U | 1800 |
| machine-paths.md | L | 1500 |
| overrides.md | L | 1500 |
| **Total** | | **12,275** |

Snapshot cap (§7.1): **10,240 bytes**.

**Δ = 2,035 bytes overflow** when files are at their caps. The lowest-priority tier (U) is dropped on every cap event by the legacy whole-tier-drop algorithm.

Empirically, the seed templates alone (before any user customization) totaled:

| Tier | Seed bytes (pre-fix) |
| --- | --- |
| L (machine-paths + overrides) | ~2,917 |
| P (SOUL + MEMORY + INDEX) | ~5,334 |
| U (USER + HABITS + LESSONS) | ~4,707 |
| **Total** | **~12,958** |

> Already exceeds the 10 KB cap by ~2.7 KB before the user adds a single fact.

`truncation.log` from scenario 4 showed `dropped_tiers: ["U"]` on every default-install `claude --print` invocation. Pre-fix:

```ndjson
{"ts":"2026-05-25T11:42:10Z","capBytes":10240,"dropped_tiers":["U"]}
{"ts":"2026-05-25T11:44:44Z","capBytes":10240,"dropped_tiers":["U"]}
{"ts":"2026-05-25T11:48:42Z","capBytes":10240,"dropped_tiers":["U"]}
{"ts":"2026-05-25T11:50:38Z","capBytes":10240,"dropped_tiers":["U"]}
```

The user-tier seed bullets (U-PRNQKRaC, U-CEKUY3H4, U-GXB2C4JZ, U-aUMQHVCV, U-RDBNQSL7, U-APHTKHMQ, U-U5RM2FXH, U-PUYHL2BL, U-K3Z73EAQ) shipped in the kit but NEVER reached Claude's context window.

## The fix — both parts

### (A) Tightened user-tier seed templates

| Template | Before | After | Reduction |
| --- | --- | --- | --- |
| `template/user/USER.md.template` | 1,227 | 812 | 34% |
| `template/user/HABITS.md.template` | 1,779 | 934 | 47% |
| `template/user/LESSONS.md.template` | 1,701 | 851 | 50% |
| **Total** | **4,707** | **2,597** | **45%** |

Cuts targeted:

- File-level multi-line block comments → 1-line tagline (or removed for USER.md)
- Per-section guidance comments → tightened to one line each (or removed for USER.md)
- Bullet text kept VERBATIM so Task 14's frozen IDs remain valid (no `compute-seed-bullet-ids.mjs` re-run needed)

All 127 template-related tests (cli-seed-templates + template-scaffolding + cli-install) pass against the tightened templates.

### (C) Per-tier byte budgets in `enforceCap()`

New `TIER_BUDGETS` constant in `packages/cli/src/inject-context.mjs`:

```js
const TIER_BUDGETS = Object.freeze({
  L: 1500,   // local: 2 small scratchpads
  P: 4500,   // project: bulk of snapshot, grows with auto-extract
  U: 4000,   // user: slow-growing persona; protected from cap pressure
});
// Σ = 10,000 ≈ default cap 10,240 (240-byte slack)
```

New `truncateTierToBudget()` helper: when a tier's block exceeds its budget, drop whole `## ` sections from the END until it fits. Section-granular (not bullet- or byte-granular) preserves the structural shape Claude's session-start prompt expects.

New NDJSON event type written to `truncation.log`:

```ndjson
{"ts":"<iso>","event":"tier_truncated_to_budget","tier":"U","budget":4000,"pre_bytes":5200,"post_bytes":3900,"sections_dropped":1}
```

The legacy `dropped_tiers` whole-tier-drop event still exists as a configuration-error safety net — fires only if `Σ budgets > snapshot_cap` (which shouldn't happen under the documented budget table, but the fallback is cheap).

## Live re-verification

Scenarios 1 + 2 re-run on the fix branch against real Haiku (no restatement engineering).

**Scenario 1** (realistic dictation prompt):

```text
"Some context for working on this project — I prefer terse responses with
no preamble, we use pnpm not npm, and Python 3.13 across all environments.
Also for git: Conventional Commits format."
```

SessionStart snapshot: **9,036 bytes** (was failing at >10,240 bytes pre-fix). All 3 tier markers (`<!-- cmk: local tier (L) -->`, `<!-- cmk: project tier (P) -->`, `<!-- cmk: user tier (U) -->`) present. All 3 user-tier frozen seed IDs (U-PRNQKRaC, U-CEKUY3H4, U-RDBNQSL7) present.

Auto-extract: 4 facts captured → MEMORY.md.

`truncation.log` (post-fix):

```ndjson
{"ts":"2026-05-25T13:13:28Z","event":"tier_truncated_to_budget","tier":"L","budget":1500,"pre_bytes":2917,"post_bytes":1237,"sections_dropped":4}
{"ts":"2026-05-25T13:13:28Z","event":"tier_truncated_to_budget","tier":"P","budget":4500,"pre_bytes":5334,"post_bytes":4336,"sections_dropped":3}
```

**Zero `dropped_tiers` events.** The user tier is NEVER dropped.

**Scenario 2** (fresh session, no file reads, asked "what do you know about my preferences?"):

The model listed:

- All 4 session-1 captures (terse, pnpm, Python 3.13, Conventional Commits)
- The user-tier seed bullets that were previously invisible:
  - *"Engineer comfortable with TDD and incremental code review"* (U-PRNQKRaC)
  - *"Commits incrementally as work progresses, not in one big push"* (U-CEKUY3H4)
  - *"Always confirms before destructive git operations"* (U-GXB2C4JZ)
  - *"Read the diff before the commit message; trusts code over claims"* (U-aUMQHVCV)
  - *"Fix the code, not the test"* (U-RDBNQSL7)
  - *"Premature abstraction outlives the requirement"* (U-U5RM2FXH)
  - *"Correlation is not causation; measured profiling beats educated guessing"* (U-APHTKHMQ)
  - *"One PR per parent task; squash-merge into main"* (U-PUYHL2BL)

**The user-tier value prop is now real on day 1 of install.** Before this PR, these 9 seed bullets shipped but never reached the model.

## Meta-lesson — per-file caps and snapshot cap must be coordinated

The original spec specified per-file caps (Task 12 / §2.1) and the snapshot cap (§7.1) **independently**. Sum of per-file caps (12,275) exceeded snapshot cap (10,240) by ~2 KB. Cap pressure on the snapshot was inevitable from day 1; the lowest-priority tier always lost.

This is the same shape as PR-14's seed-trust+at vs consolidator bug — separately-correct, jointly-broken. The author of each spec was right within their own surface; the integration broke because nobody owned the cross-surface invariant ("sum-of-budgets must fit total cap"). Same shape again as the PR-22 plugin-layout convergent-third-party-verification bug — convergent local correctness without the upstream check.

**Discipline addition for future spec work**:

When two specs declare caps / budgets / quotas that COMPOSE (sum into a total), the spec for the total cap must include the budget table — not a "this is the upper bound; specifications elsewhere fit under it" hand-wave. If the sub-budgets aren't documented in the spec for the total, they're undefined, and the only-correct-state is impossible to achieve. The new design §7.1.1 carries the per-tier budget table; if a future task changes per-file caps, the budget table is the load-bearing invariant to check.

## What's NOT in this PR

- **Local-tier seed-content also exceeds its 1500-byte budget** (~2917 actual). Truncated section-granularly in the live run, but the same coordination problem applies to L tier too. The fix is identical (tighten machine-paths + overrides seed templates), separate scope from this PR. Filed as a follow-up.
- **`SessionEnd hook cancelled` messages** continue to surface on scenario 2's terminal output. Same Claude Code race that scenario 5 surfaced — stub SessionEnd hook gets killed during clean shutdown. Investigated when Task 22 wires the real SessionEnd handler.
- **Build plan resumption** (Task 22 / Task 24) — paused per the user's gate; resumes after this PR + the PR-24 follow-up traceability items merge.

## Stats

- **5 new tests** in `tests/cli-inject-context.test.js` for per-tier budgets (24 total).
- **Suite: 672/672 green** (no regressions).
- **3 templates tightened**, frozen IDs preserved.
- **1 design.md amendment** (§7.1.1 new subsection with budget table + meta-lesson).
- **1 implementation change** (`enforceCap()` + new `truncateTierToBudget` helper + new event type).
- **Live re-verification**: scenarios 1 + 2 both pass; user tier reaches Claude.
