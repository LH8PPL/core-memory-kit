# RESUME HERE — 2026-06-20

> Breadcrumb written before you updated Claude Code + VS Code (context was low).
> Everything is committed + pushed to `main`. Nothing is in flight. Safe to close.

## Where things stand

- **v0.3.4 SHIPPED** ✅ — npm `@lh8ppl/claude-memory-kit@0.3.4` (provenance-signed) + GitHub Release `v0.3.4`. Verified live.
  - Task 161 (compression timeout → bounded transient-only **retry**; D-174/D-175) + 161.12 (retry-rate logging) + Task 162 (update path → docs both routes + `cmk doctor` **HC-9** drift check; D-176).
  - Verified by a full **cut-gate (cut-gate17)** on the real artifact — all gates incl. the new RT1/VD1 + the **E1 cold-open wedge passed clean**.
- **Branch:** `main`, clean. Last commit `c6a6f53` (the Task-151 re-laning).
- **Tag pushed by you; publish.yml succeeded.** No outward step pending.

## The one finding from the cut-gate (already filed, NOT a blocker)

**D-177** — the persona's architecture trait can graduate OUT of the injected `HABITS.md` (explicit `mk_lessons_promote` concentrates in HABITS § Working Style → overflow → cap-relief graduation → fragments → fragments aren't injected at cold-open). **Verified NOT a v0.3.4 regression** (9-file diff, none in the persona path; absent from HABITS in every prior backup; the wedge still WORKS because session-end auto-persona re-synthesizes it back — the E1 cold-open transferred it clean). Filed on **Task 151** with both failure mechanisms + candidate fixes.

## The settled v0.4 map (decided this session — do NOT re-litigate)

| Version | What | Decision |
| --- | --- | --- |
| **v0.4.0** | **Kiro** — cross-agent adapter seam + first agent | D-127 (firm) |
| **v0.4.1** | Cursor | D-157 (locked) |
| **v0.4.2/.3** | **Task 151 — FULL persona-promotion redesign** (recurrence-scored, LLM-judged; covers both D-177 mechanisms) | **D-178** |

**D-178 (this session's call):** Task 151 pulled UP to early-v0.4 (the origin video's thesis = recall/injection is paramount, so 151 = injection-layer reliability = core, not v0.5 depth). **Do the FULL redesign once, NOT a v0.3.5 down-payment** (the user: "all the work + tests for a down-payment, get nothing out of it — do the full thing for a real payoff"). Kiro stays v0.4.0 (one-differentiator rule). The v0.3.1 down-payment (D-154) already shipped, so v0.4.2 is genuinely the full thing.

## What to do next (when you come back)

**Start v0.4.0 = Kiro (Task 50).** It is **RESEARCH-FIRST**:
1. Verify the Kiro paths/config against **kiro.dev** (primary source — the §5.1 convergent-third-party rule; don't assume from notes).
2. Build the per-agent **adapter seam** (`createProfile`-style factory + lifecycle-hook wiring) — the seam is the real v0.4.0 work; Kiro is its first consumer.
3. Prior art: the Taskmaster `createProfile` cross-IDE pattern ([research note](docs/research/2026-06-15-claude-task-master-cross-ide-profiles.md)) — 16 editors from one base + thin per-agent profiles. Design input, not a port.

**To resume, say:** `start v0.4.0` (or `start Task 50`).

## Orientation (the always-true pointers)

- Status / what's next: [`specs/tasks.md`](specs/tasks.md) "Current state" (top).
- Release map: [`docs/RELEASE-PLAN.md`](docs/RELEASE-PLAN.md).
- Decision trail (read before re-opening anything): [`docs/journey/DECISION-LOG.md`](docs/journey/DECISION-LOG.md) — newest at top (D-178 → D-177 → D-176 → D-175 → D-174).
- The origin source (what started the kit): `C:\Projects\youtube-to-slide\out\master-claude-memory-to-get-ahead-of-99-of-people\` (transcript.md + resources/Memory-System-Improvements-Plan.md). The kit already implements the whole "recommended setup" + the cross-project persona wedge beyond it.

## Cut-gate state (only matters if you re-run a cut-gate)

- The cut-gate runbook is bumped to `cut-gate17` / `cut-gate-coldopen17` (your renamed dirs).
- Your user-tier was wiped for cut-gate17's capture-from-zero. **Backup of your real persona:** `C:\Users\tamir.bn-sh\before-cut-gate17-v0.3.4-.claude-memory-kit` (+ a copy at `C:\tmp\cmk-user-tier-backup-2026-06-19`). To restore your real persona:
  ```powershell
  Remove-Item -Recurse -Force $env:USERPROFILE\.claude-memory-kit
  Copy-Item -Recurse "C:\Users\tamir.bn-sh\before-cut-gate17-v0.3.4-.claude-memory-kit" "$env:USERPROFILE\.claude-memory-kit"
  ```
  _(The current `~/.claude-memory-kit` holds the SYNTHETIC cut-gate persona — uv/ruff/layered-architecture from the test sessions, not your real one.)_

## After you update Claude Code + VS Code

- The kit is installed on THIS repo (dogfood). If a `cmk doctor` shows **HC-9** drift after the update, just re-run `cmk install` here (that's exactly the v0.3.4 update-path feature working).
- If the global `cmk` is stale: `npm install -g @lh8ppl/claude-memory-kit@latest` (close Claude Code first on Windows — EBUSY on the native DLLs).
