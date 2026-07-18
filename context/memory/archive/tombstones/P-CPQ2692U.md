---
deleted_at: 2026-07-18T07:02:52Z
deleted_reason: ''
deleted_by: user-explicit
id: P-CPQ2692U
type: project
shape: State
title: 'SonarCloud D-341 update 2026-07-17: SonarJS 13.3.0.43633 (released that day) was'
created_at: 2026-07-17T15:34:14Z
write_source: user-explicit
trust: high
recurrence_count: 1
source_file: user-explicit
source_line: 1
source_sha1: 643cc5af47b5da1fcba082bffd262db068d50b0ae52c52a4b05761eaa8dc14eb
---

SonarCloud D-341 update 2026-07-17: SonarJS 13.3.0.43633 (released that day) was already server-delivered and TESTED via rerun — the opendir C:/proj/context crash signature is IDENTICAL, so the analyzer upgrade does NOT fix it. New lever: the A3S/context-augmentation feature is the 'Agent-Centric Development' BETA toggle in SonarCloud ORGANIZATION admin settings (per Sonar's 2026-03-31 announcement) — a maintainer UI step, distinct from Architecture analysis and from code analysis itself. Also still worth checking: a stale C:/proj/context path in the project's web-UI settings.

**Why:** Prevents a future session from re-testing 13.3.0 or advising a repo-side fix; the remaining levers are all UI/outward steps only the maintainer can take

**How to apply:** If the crash persists: (1) maintainer checks org admin > Agent-Centric Development beta toggle; (2) maintainer scans project settings for a stale C:/proj path; (3) if both clean, post to the Sonar community with the 13.2->13.3 persistence + BridgeServerImpl gRPC ENOENT stack + the 2026-07-11 flag-rollout start date
