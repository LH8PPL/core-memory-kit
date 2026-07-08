---
id: P-aLLW62HD
type: project
shape: State
title: cmk install breaks itself on its own running MCP server DLL lock (Windows) — a real bug, never code-fixed
created_at: 2026-07-08T16:52:06Z
write_source: user-explicit
trust: high
recurrence_count: 1
source_file: user-explicit
source_line: 1
source_sha1: 008bf40e9e79242054ade37ce689e9143ccfdfa6a9046d47938aab70c95e9a3c
related: [global-cmk-is-broken-windows-sqlite-dll-sam22r7b, windows-sqlite-dll-lock-from-running-mcp-server, windows-dll-lock-blocks-npm-reinstall]
---

cmk install / global reinstall can break itself: the kit's own running `cmk mcp serve` holds a Windows lock on vec0.dll / better_sqlite3.node, so npm install -g can't overwrite them → EBUSY → occasionally a HALF-INSTALLED broken global (cmk --version errors). The kit handles its own lock ungracefully and has never fixed it — only documented "kill the server first."

**Why:** The user's catch (2026-07-08): "killing the cmk mcp serve procs first — that is a bug, no?" — Yes. Extensively documented (P-SaM22R7B, P-EMNaBNWT high-trust) but NEVER filed as a code-fix task; the recorded disposition is only "document + tell the user to manually kill cmk mcp serve before reinstall." That's a workaround, not a fix — a tool that breaks itself when you reinstall it while it's running is a defect, and the user shouldn't have to know to hand-kill processes. Nuances: (1) usually the EBUSY is COSMETIC — fires during cleanup, install still succeeds (verify by cmk --version not error count, P-aPH3CKPU high); the genuinely-broken half-install (uninstall completed, install couldn't overwrite the locked DLL) is the rarer case we hit live during v0.5.0 gate-prep. (2) The STRUCTURAL cure (better-sqlite3 → node:sqlite, Task 141b) would eliminate the whole locked-DLL class but is REJECTED (~10% slower FTS5, fails the D-147 no-perf-regression bar) — so the DLL fragility is a knowingly-accepted cost of the perf choice. The gap: even accepting the lock as an OS reality, cmk install should not leave a BROKEN global — graceful handling was floated for cmk doctor/cmk update but never scoped.

**How to apply:** File as a v0.5.1 task (NOT a v0.5.0 tag blocker — pre-existing, usually cosmetic, workaround known, hits reinstall/upgrade not first-install or normal use, doesn't touch the v0.5.0 feature surface). Fix directions to scope (pick at task time): (a) cmk install/update DETECTS its own running MCP server (the cmk mcp serve procs) and offers to stop them first — they auto-reconnect on next tool call, so it's safe (the P-VJL254MX manual kill, automated); (b) RETRY-on-EBUSY with a short backoff after releasing/killing; (c) at minimum, DETECT the half-install failure and print the exact recovery (which procs to kill + rerun) instead of leaving a cryptic ESM-resolve error; (d) cmk doctor HC that flags a broken/half global. Likely (a)+(c) together. NOT (structural) node:sqlite — that cure is rejected on perf (P-WB2VQPWN). Relates P-SaM22R7B/P-EMNaBNWT (the bug), P-3VT9YT6L (root cause: stale cmk mcp serve procs), P-VJL254MX (the manual kill workaround to automate), Task 141b (the rejected structural cure), P-NNM9F73K (the user's file-immediately rule this honors).
