---
id: P-MNA5QMCG
type: project
title: 'RESUME: PR #244 (direct === guard) to close CodeQL #37 — if it re-flags again, DISMISS as false-positive'
created_at: 2026-06-28T17:46:23Z
write_source: user-explicit
trust: high
source_file: user-explicit
source_line: 1
source_sha1: 4680517b2ad20d827042620adeee6295fbbbc62efc9dcab1905a7cab4dee084d
---

RESUME (2026-06-28, context critical): the CodeQL prototype-pollution alert on config-core.mjs setDeep keeps re-flagging (was #29 → closed but re-opened as #37). THREE guard forms tried: (1) pre-loop pass — not recognized; (2) in-loop FORBIDDEN_KEYS.has(p) Set-lookup — not recognized (#37, msg "recursively assigned to cur without guarding"); (3) CURRENT/PENDING in PR #244: in-loop DIRECT === comparisons `if (p === '__proto__' || p === 'constructor' || p === 'prototype') throw` — this is CodeQL's EXACT query-help example form, highest confidence it'll finally be recognized. PR #244 is OPEN (branch fix-codeql-37-direct-compare), tests 25/25 green, behavior identical across all 3 forms (runtime security was ALWAYS sound; only static-analyzer recognition differs). NEXT SESSION: (1) watch PR #244 CI green → merge → pull main; (2) watch the CodeQL workflow re-scan main → confirm `gh api repos/LH8PPL/claude-memory-kit/code-scanning/alerts --jq '[.[]|select(.state==\"open\")]|length'` returns 0; (3) IF STILL FLAGGED after direct-=== (4th re-flag): STOP guessing — DISMISS the alert in GitHub as false-positive (public configSet already guards via hasForbiddenSegment + tested; not exploitable; the version is the user's earlier "real reason not to fix" — CodeQL can't recognize ANY in-function guard here). The 2 High regex alerts (#21/#24) closed cleanly in v0.4.2. v0.4.2 is SHIPPED on npm. Task 173 parent checkbox already flipped to [x]. #29/#37 take NO version — they close on a main push (CodeQL re-scans main), independent of npm; the code rides into v0.4.3 (Task 151). LESSON captured (P-5AFG567T area): read CodeQL query-help BEFORE claiming an alert fixed; for js/prototype-pollution-utility the ONLY recognized sanitizer is direct === comparisons inline at the assignment loop, NOT a Set/helper lookup, NOT a pre-loop pass.

**Why:** The CodeQL prototype-pollution alert keeps re-flagging through 3 guard forms; PR #244 uses CodeQL's exact documented === pattern (highest confidence). Context ran out, so the next session must verify the merge closes it, with a clear stop-condition: dismiss as false-positive if a 4th re-flag occurs (the runtime guard is sound + tested; not exploitable).

**How to apply:** Next session: watch PR #244 CI green, merge, pull main, watch CodeQL re-scan, confirm 0 open alerts. If it STILL flags after the direct-=== form, dismiss in GitHub as false-positive (public API already guards, not exploitable) rather than chase a 4th guess. The fix rides into v0.4.3/151; no separate npm release. Lesson: js/prototype-pollution-utility only recognizes direct === comparisons inline.
