---
id: P-KZ5YCCGB
type: project
title: guard-code-proven-correct-ps-pipe-exit0-was-artifact
created_at: 2026-06-23T20:34:13Z
write_source: user-explicit
trust: high
source_file: user-explicit
source_line: 1
source_sha1: 262f38ce5bbe52614f476803a8046bb310e808c97907a761e08fc04dd95a4f99
related: [kg-guard-retest-failed-was-stale-artifact-not-fix, kg-guard-failed-matcher-pipe-alternation-not-literal]
---

GUARD CODE IS PROVEN CORRECT — the "exit 0" scare was a PowerShell-pipe artifact, NOT a bug (2026-06-23). While diagnosing the KG-guard live failure I ran `$json | node cmk-guard-memory.mjs` in PowerShell and got exit 0 (looked like the guard doesn't block). FALSE ALARM: PowerShell's `|` and `Write-Output` to a NATIVE exe don't deliver stdin like a real OS pipe (PS object-pipeline + text encoding/EOF quirk) → the bin fail-opened on effectively-empty stdin. PROOF the guard is correct: (1) IN-PROCESS evaluatePayload({tool_name:'execute_bash',tool_input:{command:'Remove-Item -Recurse -Force context/sessions'}}).block === TRUE (isDestructive+touchesMemory+SHELL_TOOLS all match); (2) BIN with FILE-REDIRECT stdin (`node cmk-guard-memory.mjs < payload.json` — how a real OS pipe delivers bytes) → exits 2, BLOCKED, prints the reason; (3) the DEV-REPO's own Claude Code guard hook BLOCKED my diagnostic commands 3× live (proof it fires + blocks in Claude Code). So ALL layers are correct: decideGuard logic ✅, bin stdin→exit2 ✅, Claude Code firing ✅. The ONLY unproven layer is whether KIRO-CLI fires preToolUse + pipes the payload — which needs the '*' matcher (D-197, merged) + a REBUILT artifact (the installed cmk still had the old pipe-string matcher). LESSON: never test a stdin-reading bin via a PowerShell `|` pipe — use a FILE REDIRECT (`< file.json`) which delivers real bytes; the PS pipe gives false exit-0s. The KG-guard live failure was STALE ARTIFACT (old matcher), full stop — the guard itself was never broken.

**Why:** Corrects a scary mid-diagnosis false alarm: a PowerShell-pipe exit-0 made it look like the delete-guard logic was broken even in the current build. It is NOT — proven 3 ways (in-process block, file-redirect bin block exit 2, dev-repo guard blocking my own commands live). The live KG-guard failure was purely the stale installed artifact (old pipe-string matcher), which the merged '*' fix + a rebuild resolves.

**How to apply:** To test a stdin-reading hook bin on Windows, use a FILE REDIRECT (`node bin.mjs < payload.json`), NEVER a PowerShell `|` pipe or Write-Output (they don't deliver stdin to a native exe like a real OS pipe — you get false exit-0/fail-open). The guard needs no code change. Next: rebuild the tgz (already built with '*' at packages/cli/lh8ppl-claude-memory-kit-0.4.0.tgz, VERIFIED to contain matcher:'*'), npm i -g it (EBUSY — close Kiro + this Claude Code session's cmk MCP first, PIDs were 3248/9772), cmk install --ide kiro in the gate, confirm live q_cli_default.json matcher=='*', then re-run KG-guard in kiro-cli — expect BLOCKED.
