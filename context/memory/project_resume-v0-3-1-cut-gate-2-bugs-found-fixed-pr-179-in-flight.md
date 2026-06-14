---
id: P-ZMCV7XLP
type: project
title: 'RESUME v0.3.1 cut-gate — 2 bugs found+fixed, PR #179 in flight'
created_at: 2026-06-14T04:25:14Z
write_source: user-explicit
trust: high
source_file: user-explicit
source_line: 1
source_sha1: 06bfc40a01ee24149569e6dfd03469dbf5565603
related: [autopilot-grant-v0-3-x-queue-2026-06-12, production-code-changes-need-a-pr-never-direct-to-main]
---

RESUME (2026-06-14, mid-v0.3.1-cut-gate): v0.3.x within-paradigm queue COMPLETE + merged to main (CI green). Now in the v0.3.1 CUT-GATE live-test (the user's gate before tagging). It has found TWO real bugs unit tests missed: (1) cmk repair --index db bug — FIXED, merged PR #178. (2) <private> tags leaked to committed files via cmk remember/mk_remember/import (strip was only in the UserPromptSubmit hook, not the write boundary) — FIXED in PR #179 (OPEN, stress+CI running): sanitizePrivacyTags now runs first in BOTH memoryWrite + writeFact, all tiers; 1888/1888.

**Why:** Context near auto-compact mid-cut-gate; the next session must not lose where the live-test stands or re-derive the two findings.

**How to apply:** NEXT STEPS in order: (1) confirm PR #179 stress 5/5 + CI green → merge → housekeep (D-entry). (2) Per the user's directive: RE-INSTALL the kit fresh from merged main + RE-RUN the full CLI cut-gate sweep against that clean build (not dev tree), VERIFYING created files are clean. (3) Hand the user the Part B/C live-session steps (status line visible, near-dup→queue, MCP tools). (4) Then the user cuts v0.3.1 via `npm run release -- patch`. Version plan: v0.3.1 (this) → v0.3.2 (node:sqlite, GATED on no-measurable-regression perf bake-off D-147 + sqlite-vec spike) → v0.4.0 (Kiro, D-127). 130 parked with 96. Apply lesson P-SKH3KKJS: production code = branch+PR+CI, never direct-to-main.
