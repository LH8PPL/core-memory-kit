---
deleted_at: 2026-07-07T14:45:29Z
deleted_reason: Superseded by P-5VJJUEES (confirmed temporalSweep semantic re-sync leak). The distill Haiku-timeout finding it also held is separately captured.
deleted_by: user-explicit
id: P-VAMNaEL5
type: project
shape: Event
title: 9gb-node-hog-haiku-print-hang-machine-freeze
created_at: 2026-07-07T14:25:59Z
write_source: user-explicit
trust: high
recurrence_count: 1
source_file: user-explicit
source_line: 1
source_sha1: adcbd98e0bf1fbfff3af16fae63b6b3931a367b14d4d71c7d407e536c4a4e155
---

2026-07-07: A Node process ballooned to ~9.3 GB RAM + pinned disk at 100%, making the machine unresponsive (required restart + End Task). Root cause NOT confirmed but strongly implicated: the earlier `cmk daily-distill` chain spawned `claude --print --model haiku` subprocesses that HUNG — the model returned text but the process never exited (reproduced: `timeout 60`/`timeout 90` had to SIGTERM them past 3 min). Three back-to-back distill attempts today each hit the 120s haiku_timeout while the Haiku endpoint was at 35-87s/trivial-call latency (norm ~7s). The VS Code "Subprocess initialization did not complete within 60000ms" panel error was a SYMPTOM of whole-machine disk thrash post-restart (memory/fetch/aws-knowledge MCP servers ALL timed out at 38-41s at once), NOT a cmk fault — cmk 0.5.0 MCP connected fine in both startup attempts (3s). Kit fail-safe worked (cooldown marker + haiku_timeout, no corruption). OPEN: a non-exiting `claude --print` under repeated spawns is a real memory/disk hazard; the distill's kill-chain SIGTERMs on timeout but the accumulated cost during the hang window is unbounded. Gate/docs implication for the upgrade + slow-backend story.

**Why:** The user's machine froze (9.3 GB / 100% disk) during the 0.5.0 gate-prep session; the offending process is dead so root cause can't be re-confirmed, but the reproduced `claude --print --model haiku` non-exit + three timed-out distills is the strongest-supported explanation. Capturing prevents re-deriving it and flags a real user-facing hazard.

**How to apply:** Before running the cut-gate on a machine with a slow Haiku endpoint, watch for a growing node process. Decide whether the distill kill-chain needs a hard memory/RSS ceiling or a max-concurrent-Haiku guard for the non-exit case. Do NOT attribute the VS Code 60s subprocess-init error to cmk — it was IO starvation (all MCP servers timed out together).
