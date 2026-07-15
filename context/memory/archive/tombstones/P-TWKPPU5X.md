---
deleted_at: 2026-07-15T13:19:41Z
deleted_reason: ''
deleted_by: user-explicit
id: P-TWKPPU5X
type: project
shape: State
title: SonarCloud Automatic Analysis Conflicts with CI-Based Scanning
created_at: 2026-07-15T12:41:11Z
write_source: auto-extract
trust: medium
recurrence_count: 1
source_file: auto-extract
source_line: 1
source_sha1: 625417b355920cc31037ce5695fb80c505972f7937ff16875796654eb3019198
---

Automatic Analysis and CI-based analysis are mutually exclusive in SonarCloud. Having both enabled causes the A3S Context Collector to replay a stale pre-analysis manifest containing Windows dev paths into the CI scan, which runs on Linux and crashes when it tries to access those invalid paths.

**Fix:** SonarCloud → Administration → Analysis Method → turn OFF "Automatic Analysis". Architecture analysis still runs cleanly in the CI environment without the stale manifest.

**Root cause detection:**
- Scan logs name the exact sensor: `Sensor Scan Manifest A3S Context Collector` → `WebSensor.analyzeProject` → ENOENT
- Settings API reveals `sonar.autoscan.enabled=true`, re-enabled during Architecture rollout (2026-07-11 12:42)
- CI workflow header documents mutual exclusivity
- Evidence committed: commit 753609e, `sonar-project.properties` documentation

**Why:** Crashed CI for 4+ days. Initial diagnosis ("tool is advisory; unfixable") was incorrect. The real issue required identifying the specific sensor mechanism from logs rather than treating the path error as a generic config problem.

**How to apply:** When debugging SonarCloud/CI crashes: (1) grep logs for the exact "Sensor" name that threw the error, (2) check SonarCloud Analysis Method settings for mutual exclusivity (Automatic vs CI-based), (3) verify no stale manifests are cached/replayed into CI. For this project: keep Automatic Analysis OFF and rely only on CI-based scanning.
