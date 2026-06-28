---
id: P-5AFG567T
type: project
title: 'RESUME: commit the in-loop setDeep guard to main to close CodeQL #29 (v0.4.2 shipped but #29 still open)'
created_at: 2026-06-28T17:33:44Z
write_source: user-explicit
trust: high
source_file: user-explicit
source_line: 1
source_sha1: c6677f3879522dd415b5a8c7d0ca8310426135aeb38d39f02977034b3e65a25a
---

RESUME-HERE (2026-06-28, context near-full): v0.4.2 SHIPPED to npm (security patch, Task 173, 3 CodeQL alerts). BUT alert #29 (js/prototype-pollution-utility, config-core.mjs setDeep) is STILL OPEN — my first fix used a PRE-LOOP guard; CodeQL's query-help docs require the guard INSIDE the walk loop at the assignment site (verified at codeql.github.com/codeql-query-help/javascript/js-prototype-pollution-utility). The 2 High regex alerts (#21/#24) DID close. CORRECTED FIX IS DONE + UNCOMMITTED on branch task-173-codeql-security-fixes... NO wait, that branch was merged+deleted; the corrected fix is UNCOMMITTED on MAIN working tree (packages/cli/src/config-core.mjs setDeep restructured: guard `if(FORBIDDEN_KEYS.has(p)) throw` is now INSIDE the for-loop, at each property access, matching CodeQL Approach 2). Tests 25/25, config-core 100% line cov, full suite 2381 passed. DECISION (user chose, mid-explanation, context ran out): user said "lets document everything" — was deciding between Option 1 (ship corrected fix as v0.4.3, 151→v0.4.4), Option 2 (RECOMMENDED: merge fix to main, NO separate release — #29 closes on CodeQL re-scan since CodeQL scans main on push, npm 0.4.2 stays; alert-closure is independent of npm publish), Option 3 (dismiss — rejected, user dislikes not-fixing). KEY INSIGHT: a CodeQL alert closes when the fix hits MAIN (CodeQL re-scans every push), NOT when published to npm — so #29 needs only a main commit, not a release. NEXT SESSION: (1) commit the uncommitted config-core.mjs fix to main (or via quick PR per workflow — branch first), msg noting it completes #29's in-loop guard; (2) push, watch CI green; (3) confirm #29 closes on CodeQL re-scan (gh api code-scanning/alerts → 0 open); (4) add a CHANGELOG honesty note that v0.4.2's #29 fix needed an in-loop follow-up; (5) flip Task 173's last checkbox. PROCESS MISS (capture as lesson): I shipped v0.4.2 claiming '3 alerts resolved' without verifying CodeQL would recognize the #29 guard — should have read CodeQL query-help FIRST. Also: v0.4.1 docs (D-213/214), README reorg, GitHub About+topics, user-tier fresh-seeded, all dep PRs handled (#235 js-yaml v5 closed/declined), all DONE this session.

**Why:** Context ran out mid-decision. v0.4.2 published but CodeQL #29 (prototype-pollution) didn't actually close because the first guard was pre-loop; the corrected in-loop guard is done+tested but uncommitted. The alert closes on a main push (CodeQL re-scans main), independent of npm — so it needs only a commit to main, not a release.

**How to apply:** Next session: branch, commit the uncommitted config-core.mjs in-loop setDeep guard, push, watch CI green, confirm gh api code-scanning/alerts shows 0 open (#29 closes on re-scan), add a CHANGELOG honesty note, flip Task 173's checkbox. Do NOT cut a separate npm release (Option 2, the user's lean) unless the user wants the fix on npm too. Lesson: read CodeQL query-help BEFORE claiming an alert is fixed.
