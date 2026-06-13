---
id: P-SKH3KKJS
type: feedback
title: production-code changes need a PR, never direct-to-main
created_at: 2026-06-13T12:18:06Z
write_source: user-explicit
trust: high
source_file: user-explicit
source_line: 1
source_sha1: 0bcf7def25eac5d9e692a9ebfaa53a3bfa5d0f7a
related: [autopilot-grant-v0-3-x-queue-2026-06-12]
---

A change touching production code (packages/cli/src/) goes through a branch + PR + CI cycle — NOT direct-to-main — even when it feels like a small "follow-up." On 2026-06-13 the .gitattributes follow-up (D-126) modified install.mjs but was committed straight to main like a docs change; it bypassed the CI cross-platform install matrix + Sonar gate, and it was pushed while the last full-suite run still showed 2 failures (a later fragment-fix resolved them, but the push preceded the green confirmation). Outcome was fine (main verified 1883/1883 after) but the discipline broke.

**Why:** The campaign rule allows direct-to-main only for DOCS-only commits (tracker/decision-log updates). install.mjs is production code with a CI gate (cross-platform install matrix + Sonar) that a direct push skips entirely; and pushing before a green full suite is the exact "did you check?" failure the project's verification rules exist to prevent.

**How to apply:** If a diff touches packages/cli/src/ or any runtime code, branch (git checkout -b task-N-...) → PR → wait for CI green → merge. Reserve direct-to-main for docs/tracker/decision-log only. Before ANY push, confirm the full suite is green on the CURRENT tree (re-run if the last green predates the latest edit).
