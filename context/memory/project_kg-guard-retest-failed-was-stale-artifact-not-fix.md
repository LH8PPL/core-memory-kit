---
id: P-G39LPLQG
type: project
title: kg-guard-retest-failed-was-stale-artifact-not-fix
created_at: 2026-06-23T20:26:57Z
write_source: user-explicit
trust: high
source_file: user-explicit
source_line: 1
source_sha1: e497cc284350a8cff9ecbb6119a6e8762a66bd614ea166e0846321673cbbb225
related: [kg-guard-failed-matcher-pipe-alternation-not-literal, v0-4-0-local-installation-workflow]
---

KG-guard re-test "still failed" was a STALE-ARTIFACT false alarm, NOT a fix failure (2026-06-23). After merging PR #224 (D-197 matcher '*' fix to main — verified on main), the user re-ran KG-guard live and it STILL deleted context/sessions. DIAGNOSIS (checked the live state, did not theorize): the GLOBALLY-INSTALLED cmk 0.4.0 at C:\Users\<user>\AppData\Roaming\npm\node_modules\@lh8ppl\claude-memory-kit\src\kiro-cli-agent.mjs STILL has matcher:'execute_bash|executeBash|shell' (the OLD pipe-string) — and the live q_cli_default.json (mtime 20:24) also has the old matcher. So the tgz was built BEFORE the merge / never rebuilt after it; `cmk install` wrote the old config; KG-guard tested OLD code → failed as expected for old code. The fix on MAIN is correct (matcher:'*' confirmed). This is the live-test discipline: test the CURRENT repo build, not the stale installed cmk. FIX: rebuild the tgz from current main (npm pack), npm install -g the fresh tgz, re-run `cmk install --ide kiro` in the gate project (so the new '*' matcher lands in q_cli_default.json), THEN re-run KG-guard. Until the installed artifact is rebuilt post-merge, every live test runs pre-merge code. NOTE the WINDOWS EBUSY gotcha: npm i -g may fail (vec0.dll/better_sqlite3.node locked) if Claude Code/Kiro hold the MCP DLLs — close them first if it errors.

**Why:** Prevents misreading the D-197 re-test: the matcher '*' fix is correct on main, but the live test ran the STALE pre-merge installed cmk (old pipe-string matcher), so it failed. Not a fix failure — a deploy gap. The live-test-current-repo-code rule applied to the install artifact.

**How to apply:** Rebuild + reinstall before re-testing: (1) cd repo; npm pack; (2) npm install -g .\lh8ppl-claude-memory-kit-0.4.0.tgz (close Claude Code/Kiro first if EBUSY on vec0.dll); (3) verify the installed src has matcher:'*' (grep node_modules\@lh8ppl\...\src\kiro-cli-agent.mjs); (4) cd gate project; cmk install --ide kiro; (5) verify live q_cli_default.json hooks.preToolUse[0].matcher == '*'; (6) THEN re-run KG-guard. Expect: blocked this time.
