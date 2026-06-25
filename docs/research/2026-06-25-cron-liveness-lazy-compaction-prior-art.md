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

## Marker-vs-derive — the design fork, resolved (2026-06-25, second research pass)

The first pass said "one persisted last-success timestamp" (logrotate). A focused
follow-up — *for a file-based system where artifacts already encode state
(ADR-0002)* — sharpened it to a **HYBRID**, with the deciding rule from GNU make
§4.8 / anacron / logrotate:

> **Derive when the work's product carries the signal; stamp ONLY when the signal
> is "a run happened" with no artifact to stat.**

Applied to the kit's 4 levels:

- **`now` / `daily` / `weekly` → DERIVE (no marker).** `now.md` content, `recent.md`
  mtime, `today-*.md` dates already encode success — the work rewrites them. A
  separate marker = a 2nd truth source that drifts from the artifact = the ADR-0002
  violation + the exact "two truths disagree" bug class we're fixing. Keep
  `detectStaleness`'s current derive logic (it was never the broken part).
- **cron liveness → ONE anacron-style heartbeat stamp.** This is the only signal NO
  artifact expresses ("is the background scheduler alive"). Replace the
  `cron-registered` sentinel (records *registration*) with a `cron-heartbeat` the
  cron bins touch on every run (records *a run happened*), written AFTER the work
  (crash-safe, marker-after ordering per SQLite §3.10). `detectStaleness` gates on
  `now − heartbeat.mtime < ttl` (≈ 2× the cron interval), NOT existence. Stale/absent
  → fall through to the lazy roll. Single writer (the cron bins); the lazy path never
  writes it → no two-writers hazard.

Sources: [GNU make §4.8 Empty Targets](https://www.gnu.org/software/make/manual/html_node/Empty-Targets.html) ·
[anacron(8)](https://man7.org/linux/man-pages/man8/anacron.8.html) ·
[logrotate.c](https://github.com/logrotate/logrotate/blob/main/logrotate.c) ·
[SQLite atomic-commit §3.10](https://www.sqlite.org/atomiccommit.html).

## Peer-code validation (2026-06-25, wide clone sweep — projects from OUR collection + 1 new find)

Cloned + read the ACTUAL source (not docs) of the closest peers in our research
collection (claude-mem, mem0, Letta, Graphiti) + **OpenWolf** (new find,
<https://github.com/cytostack/openwolf>). Verdict: **the field's code strongly
validates the hybrid; no peer does anything smarter.**

- **OpenWolf — THE relevant peer** (only one with the kit's architecture: a scheduled
  maintenance job that NEEDS a liveness check). It independently implements EXACTLY
  the kit's two-part design: a `cron-state.json.last_heartbeat` stamp for
  worker-liveness (CLI derives "N minutes ago" by AGE, never existence —
  `src/cli/status.ts:97-101`) + `fs.statSync(cerebrumPath).mtimeMs` derive-from-artifact
  for content freshness (`src/hooks/stop.ts:209-224`). Hybrid capture (Stop hook) +
  scheduled compaction (in-process node-cron). **Validates both halves of our fix in
  real code.** PORTING CAVEAT: OpenWolf's heartbeat is a 30-min daemon `setInterval`
  (it has an always-on PM2 process); the kit has NO always-on process → the kit's
  heartbeat must be stamped BY THE CRON JOB on each fire, liveness = "stamp age > 2×
  interval" (anacron model). Concept ports; mechanism doesn't.
- **claude-mem / mem0 / Letta / Graphiti — all event-driven-synchronous, NO cron.**
  claude-mem (Stop-hook / BullMQ worker), mem0 (inline per `add()`), Letta (live
  token-pressure every turn, evict at 0.75/0.30), Graphiti (inline per episode). They
  SIDESTEP the freshness problem by never deferring — which validates the OTHER lesson:
  **the lazy/derive path must be an always-available FLOOR that never fully disables**
  (the Task 167 bug was the fallback disabling itself). Every peer with any freshness
  signal keys off AGE/recency, never mere existence.

**Two reinforcements for Task 167 from the peer code:** (a) the heartbeat is a
freshness check (age threshold), NEVER an existence check — mirror OpenWolf's
"minutes ago"; (b) keep the lazy/derive path as an always-available floor (mem0/
graphiti) so a missing/stale heartbeat degrades to "do the work now," never to "skip
because a sentinel exists."

> **OpenWolf** ("a second brain for Claude Code" — 6 hook scripts, learning memory +
> file index + token ledger, PM2 daemon + node-cron, AGPL-3.0, npm) is a strong NEW
> addition to the kit's research collection — the closest hook-based Claude-Code memory
> peer with a scheduled-maintenance architecture. Worth a fuller dive for the broader
> kit (its file-index-freshness + token-ledger patterns), beyond just Task 167.
