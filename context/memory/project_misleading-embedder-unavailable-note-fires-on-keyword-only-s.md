---
id: P-355DF75F
type: project
shape: State
title: Misleading "embedder unavailable" note fires on keyword-only scopes (decisions) — cold-open false alarm
created_at: 2026-07-08T13:54:38Z
write_source: user-explicit
trust: high
recurrence_count: 1
source_file: user-explicit
source_line: 1
source_sha1: 14a4a1d29465501c9ce3899e4b996559df9cfe15845b68245f1280997f006d82
related: [decisions-scope-semantic-fallback-warning-task-156-bug, cmk-install-with-semantic-trusts-npm-exit-code-not-the-actua]
---

The mk_search/cmk search "embedder is unavailable — run cmk install --with-semantic" note is a FALSE ALARM on any keyword-only-by-design scope (e.g. --scope decisions): it conflates the benign unknown-scope:<scope> case with a real embedder failure, and fires on the COLD-OPEN showcase path telling a new user their semantic search is broken when it works perfectly.

**Why:** Surfaced live in the v0.5.0 cold-open re-test (cut-gate-coldopen-148, 2026-07-08): the agent's mk_search --scope decisions printed "this project's configured default search is semantic (hybrid), but the embedder is unavailable (unknown-scope:decisions) — keyword-only results. Suggest the user run cmk install --with-semantic to restore semantic recall." But semantic WAS working (cmk search --mode semantic returned real meaning-ranked results; settings.json has default_mode:hybrid). Root cause (mcp-server.mjs:141-149): the !prep.ok degraded-note branch treats ALL failure reasons the same, but prepareSemanticBackend (semantic-backend.mjs:197/350) returns reason='unknown-scope:<scope>' for scopes that are keyword-only BY DESIGN (decisions — Task 156) — distinct from the REAL failures 'embedder-not-installed'/'sqlite-vec-unavailable'/'embedder-disabled'. So a by-design keyword-only scope emits a "your embedder is broken, reinstall" note. This is the P-KRGYHRUX cosmetic bug (Task 156 filed the recall feature but never fixed the warning) — and it's WORSE than cosmetic because (a) it fires on the COLD-OPEN, the kit's showcase moment, giving a brand-new user a false "broken, reinstall" impression on the exact path the product is judged by, and (b) unknown-scope is indistinguishable from a genuine stale-MCP error, a diagnostic hazard. NOT a Task-148 or learn-loop issue; pre-existing since v0.3.3.

**How to apply:** The fix is small + precise (~5 lines + a test): in mcp-server.mjs (and the CLI equivalent in search.mjs if present), when prep.reason startsWith 'unknown-scope:', degrade to keyword SILENTLY — no degradedNote, no "run cmk install" suggestion. The note should fire ONLY for real embedder failures (embedder-not-installed / sqlite-vec-unavailable / embedder-disabled). Test: mk_search {scope:'decisions'} on a semantic-enabled project → keyword results with NO "embedder unavailable" note. DECISION NEEDED (the user's call): fix-before-v0.5.0-tag (it hits the cold-open showcase, same class as the D-247 "search must find the persona" pre-tag fixes — a false impression on the cold-open is worth fixing before shipping; ~5-line fix) VS lane-to-v0.5.1 (pre-existing since v0.3.3, cosmetic-severity, tag is imminent). Relates P-KRGYHRUX (the original cosmetic-bug finding), Task 156 (the recall feature that introduced it), the D-247 pre-tag-fix precedent, the P-EEFMZVXB false-report SIBLING (install-side, Task 170).
