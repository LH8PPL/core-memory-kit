---
id: P-GMG9W7AZ
type: project
shape: State
title: 'Resume: fix-l3-promote-timeout WIP at 4e33935, then v0.5.0 tag'
created_at: 2026-07-08T14:57:46Z
write_source: user-explicit
trust: high
recurrence_count: 1
source_file: user-explicit
source_line: 1
source_sha1: d57513d8167c558b466c9114fc2521e78719857cce0611e553c58fba8a774711
related: [l3-promote-20s-judge-timeout-starves-the-committed-transcrip, ceiling-free-compress-callers-used-hook-sized-timeout-d-179]
---

RESUME POINT (paused 2026-07-08): the L3-promote timeout fix (P-AAHW235S) is mid-flight on branch fix-l3-promote-timeout, WIP-committed at 4e33935 (nothing pushed). Code + the 2 touched test suites are DONE (46/46); remaining before the v0.5.0 tag: full suite + stress + doc walk + D-301 + two-pass review + PR + merge + repack + re-verify the cold-open promote.

**Why:** This is the LAST fix before the v0.5.0 tag. The v0.5.0 cut-gate cold-open (cut-gate-coldopen-148b) fully PASSED — E1 wedge exemplary, D-300 scope-note fix confirmed live, E2 privacy screen proven both halves (L1 mask + L3 promote end-to-end, committed transcript «USER»-masked with raw username count 0). The ONE finding was P-AAHW235S: the L3 judge's 20s timeout was too tight for the slow-Haiku window so the promote deferred every run (fail-closed = safe, never leaks, but the committed transcript never landed). The user chose fix-before-tag (same class + size as the D-300 showcase fix). The fix is the D-179 site-aware-timeout pattern.

**How to apply:** On resume, on branch fix-l3-promote-timeout (WIP commit 4e33935): (1) run `npm test` (full suite) then `npm run stress` (no concurrent git — the Task-150 EPERM flake lesson); (2) DOC WALK — session-end-tasks.mjs code comment already updated, but check design.md §6.10 Boundary-1 + ADR-0019 consequences for a stale "20s"/"per-file judge timeout" mention and fix; add a CHANGELOG [0.5.0] Fixed entry ("the committed transcript no longer starves on a slow-Haiku day"); (3) DECISION-LOG D-301 (the fix); (4) two-pass review (self + the change is small/localized like D-300 — self-review + composition-verify may suffice, note it); (5) PR + merge + watch CI green; (6) REPACK the global (npm pack in packages/cli + reinstall — KILL the cmk mcp serve procs first, they hold vec0.dll and broke the last reinstall: Get-CimInstance Win32_Process where CommandLine like *cmk.mjs*mcp*serve* then Stop-Process); (7) re-verify on cut-gate-coldopen-148b: the promote should now succeed at the new 120s default with NO manual 90s override (last time it took an explicit timeoutMs:90000 to promote the 4 pending turns); (8) THEN the user tags v0.5.0. The change: PII_JUDGE_TIMEOUT_MS 20s->120s (ceiling-free detached-child default) + new PII_JUDGE_SESSIONEND_TIMEOUT_MS=50s passed explicitly at the SessionEnd site (60s ceiling composition) + defer-reason surfaced in summarizeSessionEnd. Also filed but NOT tag-blocking: Tasks 203+204 (distill starvation + incremental-resumable principle, committed v0.5.1) and P-355DF75F (the D-300 sibling, already fixed).
