# RESUME HERE — 2026-06-20 (updated)

> v0.3.5 is SHIPPED. Next action is v0.4.0 (Kiro). Everything is committed to `main`.

## Latest state (top of mind)

- **✅ v0.3.5 SHIPPED 2026-06-20** — npm `@lh8ppl/claude-memory-kit@0.3.5` (provenance-signed) + GitHub Release `v0.3.5`; publish.yml success. Tag `v0.3.5` pushed.
  - Post-publish live distill PROVED the fix end-to-end: a real slow-Haiku window where attempt-1 timed out at 120s → 5s backoff → attempt-2 succeeded (240s total). 0.3.4 would have failed this. This IS the bug the fix targets.
- **This machine is running cmk 0.3.5** (now matches npm).
- **This repo: all 9 `cmk doctor` HCs PASS** (0 fail, 0 skip), crons registered, semantic on.

## What v0.3.5 fixed (Task 163 / D-179)

The ceiling-free compress callers (daily-distill, weekly-curate, lazy session-roll) used the hook-sized **50s** timeout despite having **no ceiling** → needless `haiku_timeout` when `claude --print` was slow → `recent.md` went 4 days stale. **Two-lever fix:**
1. **Timeout** → 120s on the ceiling-free paths (`CEILING_FREE_TIMEOUT_MS`; D-92/F-2 rule).
2. **Backoff** → 5s between retries (was 600ms; `CEILING_FREE_BACKOFF_MS`) so a retry lands AFTER the slow-Haiku window, not inside it.

Grounded in a 19-system field check (escalating-timeout idea REJECTED — nobody does it; the backoff-too-short bug found). Live-proven: distill ran the real input in 77.9s (died at 50s, succeeds at 120s). Full suite 2030/2030, stress 5/5, two-pass review. Shipped via **PR #209** (merged).

## What this session ALSO verified (the dogfood win)

The full **update path** (v0.3.4's Task 162) end-to-end on this real repo:
- `cmk install` (local-tarball 0.3.5) → **HC-9 went FAIL→PASS** (drift detect → re-stamp).
- `cmk install --with-semantic` → hybrid recall on (your standing preference).
- `cmk register-crons` → daily-distill 23:00 + weekly-curate Sun 09:00 → **HC-5 PASS**.
- The compress fix → **HC-2 went FAIL→PASS** (recent.md 4d stale → 4h fresh).

## What to do next (when you come back)

**Start v0.4.0 = Kiro (Task 50)** — the planned next feature. RESEARCH-FIRST: verify Kiro paths against **kiro.dev** (primary source, the §5.1 convergent-third-party precedent), then build the per-agent adapter seam (`createProfile`-style factory + lifecycle-hook wiring). The seam is the real v0.4.0 work; Kiro is its first consumer. Prior art: [Taskmaster cross-IDE note](docs/research/2026-06-15-claude-task-master-cross-ide-profiles.md).

**To resume, say:** `start v0.4.0`.

## The settled v0.4 map (decided this session — do NOT re-litigate)

| Version | What | Decision |
| --- | --- | --- |
| **v0.4.0** | **Kiro** — cross-agent adapter seam + first agent | D-127 (firm) |
| **v0.4.1** | Cursor | D-157 (locked) |
| **v0.4.2/.3** | **Task 151 — FULL persona-promotion redesign** (NOT a v0.3.5 down-payment — the user: "do the full thing for a real payoff") | D-178 |

## Open findings (filed, not blocking)

- **D-177** — persona graduation/routing soft-spot (a durable trait can transiently graduate out of injected HABITS; self-heals via re-synthesis, so the wedge still works). → Task 151 (v0.4).
- **D-179 secondary** — the lazy compress cascade can starve daily/recent on a busy repo; designed mitigation = `cmk register-crons` (now done on this repo).

## Orientation (always-true pointers)

- Status / next: [`specs/tasks.md`](specs/tasks.md) "Current state" (top).
- Release map: [`docs/RELEASE-PLAN.md`](docs/RELEASE-PLAN.md).
- Decision trail (read before re-opening anything): [`docs/journey/DECISION-LOG.md`](docs/journey/DECISION-LOG.md) — newest at top (D-179 → D-178 → D-177 → D-176 → D-175 → D-174).
- Origin source (what started the kit): `C:\Projects\youtube-to-slide\out\master-claude-memory-to-get-ahead-of-99-of-people\`. The kit already implements the whole "recommended setup" + the cross-project persona wedge beyond it.

## After you reopen VS Code

- The 0.3.5 hooks load fresh on restart (the in-session compress fix activates for live sessions).
- If `cmk doctor` shows anything off, it shouldn't — this repo was left at 9/9 PASS.
- Your REAL cross-project persona backup (this repo's `~/.claude-memory-kit` currently holds the SYNTHETIC cut-gate persona): `C:\Users\tamir.bn-sh\before-cut-gate17-v0.3.4-.claude-memory-kit`. Restore only if you want your real persona back:
  ```powershell
  Remove-Item -Recurse -Force $env:USERPROFILE\.claude-memory-kit
  Copy-Item -Recurse "C:\Users\tamir.bn-sh\before-cut-gate17-v0.3.4-.claude-memory-kit" "$env:USERPROFILE\.claude-memory-kit"
  ```
