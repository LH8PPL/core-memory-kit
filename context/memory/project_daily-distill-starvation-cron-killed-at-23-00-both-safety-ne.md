---
id: P-LUUUZYLT
type: project
shape: State
title: 'Daily-distill starvation: cron killed at 23:00 + both safety nets fail to catch it'
created_at: 2026-07-08T12:43:02Z
write_source: user-explicit
trust: high
recurrence_count: 1
source_file: user-explicit
source_line: 1
source_sha1: 31084baeb1ad42ea2fc88d1eb67352fb39b8ae9d798f5349d76613b42bba7ca4
related: [cascade-starvation-lazy-distill-limitation-on-busy-repos, now-md-bloat-root-cause-was-cron-active-short-circuit-not-ti, cron-liveness-gate-by-heartbeat-age-task-167-a]
---

On a busy large-corpus repo the automatic daily-distill silently starves: the 23:00 cron gets terminated (0xC000013A STATUS_CONTROL_C_EXIT — machine asleep/battery/too-slow at 23:00) before the 3.4-min distill finishes, AND both safety nets miss it (HC-10 false-green + lazy-fallback cascade-starvation).

**Why:** Diagnosed live on the dev repo 2026-07-08 (the user: "'daily distill is 5 days stale' means there's a problem, it's supposed to be automatic"). recent.md was 5 days stale despite HC-10 PASS. Evidence: (1) Get-ScheduledTaskInfo shows cmk-daily-distill LastRun updates daily but Result=3221225786 (0xC000013A = STATUS_CONTROL_C_EXIT = terminated) EVERY night, while the sibling ytslide-daily task at the same 23:00 exits 0; (2) running the EXACT cron command manually SUCCEEDS but takes 202815ms (3.4 min) — the distill logic is fine, it's just slow on 1494 facts + 6 days of today-*.md (the P-6WEYN2TM unbound-compress class); (3) task settings: WakeToRun=False, StopIfGoingOnBatteries=True → at 23:00 the machine is asleep/logging-off/on-battery and Task Scheduler kills the started-but-unfinished task. TWO real kit defects compound the environmental cause: (A) HC-10 is FALSE-GREEN — the heartbeat records at/near task START so 'compaction alive, heartbeat fresh' reports PASS while the distill DIES before completing (the D-169 false-green class — a health check green while the work fails 5 nights running); (B) the lazy SessionStart fallback (the always-on floor meant to catch a dead/failing cron, D-75) is SHADOWED by the stale-now verdict on this busy repo (cascade-starvation D-105) so it only ever does the session roll, never the daily distill. So neither the health check nor the fallback caught a 5-day automatic-distill outage. NOT the Task-167.A dead-cron-sentinel bug (that fix works — the cron fires); this is a cron-completes-the-heartbeat-but-not-the-work variant.

**How to apply:** File a task (candidate v0.5.x). Three fixable angles: (1) HC-10 should verify the distill OUTCOME (recent.md mtime freshness) not just heartbeat existence/age — a heartbeat without a fresh recent.md is the false-green tell; make HC-10 cross-check the artifact it claims is alive. (2) The lazy fallback's cascade-starvation: when stale-now is the verdict but stale-daily/weekly ALSO apply, the detached roll should be allowed to ALSO trigger the daily distill (or round-robin the verdicts) instead of stale-now permanently shadowing — otherwise a busy repo's daily/weekly tiers never distill lazily. (3) register-crons should set WakeToRun=True (or document that a 23:00 cron on a laptop that sleeps won't fire to completion) + consider AllowStartIfOnBatteries. Interim recovery is `cmk daily-distill` manually (works, 3.4 min). Relates P-6WEYN2TM (unbound compress = the slowness), P-DZDQSDQG (the prior dead-cron false-defer, a sibling class), P-ZMRE4MSU (cascade-starvation), Task 167.A (the heartbeat-by-age fix this exposes a gap beyond).
