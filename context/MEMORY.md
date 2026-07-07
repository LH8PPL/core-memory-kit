<!-- Cap: 2500 chars · Last distilled: 2026-06-10 · Last health check: 2026-06-10 -->

# Working Memory

<!-- Your project's working scratchpad. Replace the example bullets with real state; empty sections are fine. -->

## Active Threads

<!-- Current work in progress. Drop bullets as work resolves. -->

- (P-3EVDAURQ) URGENT RESUME: the GLOBAL cmk is HALF-INSTALLED/BROKEN (ERR_MODULE_NOT_FOUND) - the 0.5.0 tarball install hit EBUSY on better_sqlite3.node (this session's own cmk mcp serve held the DLL). FIX FIRST, new session: (1) close all Claude/kiro sessions using cmk, (2) npm uninstall -g @lh8ppl/claude-memory-kit, (3) npm install -g C:/Projects/claude-memory-kit/packages/cli/lh8ppl-claude-memory-kit-0.5.0.tgz, (4) cmk --version = 0.5.0 + cmk doctor. THEN the user's call: v0.5.0 tag is ON HOLD until the FULL cut-gate guide (docs/process/cut-gate.md sessions 1-3 + cold-open) runs on 0.5.0 - the user's directive; the Kiro+Cursor guides also never ran for v0.4.5. Dev-repo bins (node packages/cli/bin/cmk.mjs) still work - only the GLOBAL is broken. Release commit 8de88ae + D-291 on main, CI green, NO TAG YET.
  <!-- source: user-explicit, source_line: 1, sha1: 680809a58cb723ef3eef3b0aad348e2966a04117189abdb9b0d05d90ab8688a8, write: user-explicit, trust: high, at: 2026-07-07T12:35:49Z -->
- (P-WRF66BAY) Cut-gate guide should have been run for v0.4.5 and v0.5.0 on kiro and cursor before release tagging — user corrects that step was skipped
  <!-- source: auto-extract-session, source_line: 1, sha1: 957dabd09083b5909560684f1f73aaba8375962515539a316e26f1c7b5f0f541, write: auto-extract, trust: high, at: 2026-07-07T12:36:06Z -->
- (P-SaM22R7B) Global cmk is broken; Windows sqlite DLL lock held by active MCP server prevents clean package reinstall
  <!-- source: review-promote, source_line: 1, sha1: 354f724cf8d5b796bd398f0365a9de7d369d80e08906f3943859e1215463ccde, write: user-explicit, trust: high, at: 2026-07-07T12:58:02Z -->
- (P-SMMGGXQW) v0.5.0 release tag is ON HOLD until cut-gate guide passes; corrects earlier statement that tag was ready
  <!-- source: review-promote, source_line: 1, sha1: ec453b246aa762fe6cc207dbd12aef1a8143fe4130c01a339bce80f656bc75b3, write: user-explicit, trust: high, at: 2026-07-07T12:58:02Z -->

## Environment Notes

<!-- Tool versions, paths, URLs, env state. -->


## Pending Decisions

<!-- Things still to decide. Remove when resolved. -->

