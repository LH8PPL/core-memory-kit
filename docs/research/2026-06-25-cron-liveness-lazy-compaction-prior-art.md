# Cron-liveness + lazy-compaction: prior art for the Task 167 fix (2026-06-25)

Research backing for **Task 167 / D-206** — the now.md-roll-at-scale bug. Two
sweeps: an internal scan of the kit's own corpus, and an external deep-research
on how established systems solve "a scheduled compaction didn't run, self-heal
without a manual command."

## The bug (recap)

`detectStaleness` ([lazy-compress.mjs](../../packages/cli/src/lazy-compress.mjs)
L216-219) short-circuits to a `cron-active` no-op whenever the
`context/.locks/cron-registered` sentinel FILE exists — **without verifying the
cron actually ran**. A registered-but-dead cron (laptop asleep at 23:00) disables
the working lazy fallback; `now.md` grows unbounded (hit 410 KB on the dogfood).

## Internal finding — we already had the pattern, and a same-week sibling

- **We invented this bug.** claude-remember (the NDC pipeline Task 105 was based
  on; [code-dive](2026-05-25-claude-remember-code-dive.md)) has NO sentinel gate:
  now→today is per-save, today→recent is optional/manual. The kit ADDED the
  composite `cron-active` short-circuit as an optimization and never wired the
  liveness check.
- **The liveness pattern already exists in our code** — `lock-discipline.mjs`
  probes pids with `process.kill(pid, 0)` to detect dead locks. We just never
  applied "verify it's actually alive" to crons.
- **D-179 (2026-06-20, same week) is the same bug class** — daily-distill went 4
  days stale because it trusted a cron path that silently timed out. Same user
  catch ("if it's not automatic, it's a bug"). D-206 is the fallback-side twin of
  D-179's primary-side failure.

## External finding — every established system converges on ONE invariant

> **Gate on "did a run SUCCEED recently" (a persisted last-success timestamp),
> NEVER on "is a scheduler registered." Make lazy-on-access PRIMARY; the cron is
> an optimization/backstop.**

Our bug is the textbook anti-pattern, named: *"most monitoring detects presence,
not absence. Registration proves the job COULD run, not that it DID."*

### Schedulers and missed-run catch-up (the asleep-laptop case)

| Scheduler | Catches up missed runs? |
| --- | --- |
| vanilla cron | **No** — stateless wall-clock match |
| anacron | Yes — per-job timestamp files, day-granular |
| systemd timer | Yes, opt-in (`Persistent=true`) — coalesces missed runs |
| launchd `StartCalendarInterval` | Asleep: yes (on wake) / powered-off: no |
| Windows Task Scheduler | Yes, **opt-in** (`StartWhenAvailable=true`, **defaults FALSE**) |

Caveat: anacron / systemd / launchd all **coalesce** multiple missed periods into
ONE catch-up run — a design assuming "one catch-up per missed night" is wrong.

Sources: [anacrontab(5)](https://man7.org/linux/man-pages/man5/anacrontab.5.html) ·
[systemd.timer(5)](https://man7.org/linux/man-pages/man5/systemd.timer.5.html) ·
[Apple Scheduled Jobs](https://developer.apple.com/library/archive/documentation/MacOSX/Conceptual/BPSystemStartup/Chapters/ScheduledJobs.html) ·
[MS TaskSettings.StartWhenAvailable](https://learn.microsoft.com/en-us/windows/win32/taskschd/tasksettings-startwhenavailable)

### Last-success freshness gate (the actual fix)

- **logrotate** — stores last-rotation time per log in `/var/lib/logrotate.status`;
  on EVERY invocation re-derives "am I due?" from that marker. This is why
  logrotate-via-anacron self-catches-up.
  [logrotate(8)](https://man7.org/linux/man-pages/man8/logrotate.8.html)
- **Postgres autovacuum / RocksDB / SQLite WAL** — trigger on accumulated change
  (dead-tuple ratio, L0 file count, WAL page count), measured directly, never a
  clock. [PG vacuuming](https://www.postgresql.org/docs/current/routine-vacuuming.html) ·
  [SQLite WAL](https://sqlite.org/wal.html)
- **Dead-man's-switch** (healthchecks.io) — the job pings on SUCCESS; absence of a
  ping within a grace window = alert. Detects "never ran," which exit-code
  monitoring can't. [healthchecks](https://healthchecks.io/docs/monitoring_cron_jobs/)
- **Windows Automatic Maintenance** — runs opportunistically when idle AND carries
  a deadline that forces a catch-up; both paths consult the SAME success state.
  [MS Automatic maintenance](https://learn.microsoft.com/en-us/windows/win32/taskschd/task-maintenence)

### AI-memory peers don't cron the core path

claude-mem (Stop hook), Letta/MemGPT (context-pressure), mem0 (per-interaction),
Zep/Graphiti (per-episode), OpenHands (token-threshold) — all **event-triggered**,
none wall-clock-cron for consolidation. The event IS the trigger, so it can't be
missed.

## Recommendation (folded into Task 167)

**(c) + (b) primary, (a) as a cheap backstop:**

1. **(c) Make lazy-on-access PRIMARY** — compact from the SessionStart hook we
   already own (claude-mem's model). Cron becomes a pure optimization for the
   "idle for days, never opened" case.
2. **(b) Gate every path on ONE persisted `last-success` timestamp** — replace
   `cron-is-registered → disable lazy` with `last-success-fresh → skip; stale →
   run`. Every path writes the marker on success; the lazy path reads it. Makes
   the paths idempotent (both can fire; second no-ops) — add a lockfile for the
   concurrent edge. **This is the actual fix for the bug.**
3. **(a) Keep the scheduler with catch-up flags ON, as optimization only** —
   `StartWhenAvailable=true` on Windows, prefer anacron / systemd-`Persistent` on
   Unix, launchd on macOS. Best-effort; the guarantee lives in (b).

## Sibling bugs the code audit surfaced (same "trust presence/budget not success")

1. **Cooldown conflates spent-budget with success** — `touchCooldownMarker` fires
   on BOTH success and failure (compress-session / daily-distill / weekly-curate /
   auto-extract). A failed Haiku call blocks the next compress 120s; two failures
   = 240s lockout. Touch only on success.
2. **No OS catch-up flag on any platform** — `register-crons` sets neither Windows
   `StartWhenAvailable` (defaults FALSE) nor anacron/systemd-`Persistent` nor
   launchd catch-up → every platform silently drops a missed run.
3. **Zero last-success markers exist** — grep `last-success`/`last-run` = nothing.
   Only presence sentinels + mtime cooldowns + append-only logs. The
   `cron-registered` sentinel even STORES a timestamp (`nowIso()`) that's never
   read.
