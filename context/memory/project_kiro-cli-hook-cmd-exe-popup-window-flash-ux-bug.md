---
id: P-9LPPCKBT
type: project
title: kiro-cli-hook-cmd-exe-popup-window-flash-ux-bug
created_at: 2026-06-24T10:21:53Z
write_source: user-explicit
trust: high
source_file: user-explicit
source_line: 1
source_sha1: 5c01a7989676e9294667a844ecad987d6357176bb8180f3a5744d8293df091c9
related: [d198-shipped-pr225-kiro-cli-capture-inject-proven-live]
---

UX BUG found in the clean kiro-cli gate (2026-06-24): every kiro-cli hook fire (agentSpawn at session start, stop at turn-end) FLASHES a visible cmd.exe console popup window on Windows. ROOT CAUSE: the hook command is `cmd.exe /c cmk hook <event>` (kiro-hook-command.mjs kiroHookCommand/kiroGuardCommand) — `cmd.exe /c` opens a visible console window on Windows. The cmd.exe wrapper was added (P-PM2CD6CB, 2026-06-21) because the IDE routes hooks through WSL (where bare `cmk` = 'node: not found'), so cmd.exe /c forces the Windows-native shell. BUT: this wrapper is SHARED by both the IDE .kiro.hook writer AND the kiro-cli agent-config writer. The WSL-hop reasoning was for the IDE; kiro-cli (2.9.0) may run hooks natively WITHOUT the WSL hop — in which case the CLI agent could use BARE `cmk hook` (no popup) while the IDE keeps cmd.exe /c. This is a real, annoying, user-facing UX bug — the kit works (cmk is the resolved default, hooks fire) but flashes a window every turn. NOT the same as D-190 (that was an IDE Kiro-hook-config popup, a different mechanism). FIX OPTIONS (investigate, don't guess): (1) does kiro-cli need cmd.exe /c at all? test bare `cmk hook stop` as a kiro-cli hook command — if it runs, drop the wrapper for the CLI side (cleanest, no popup); (2) if the wrapper IS needed, hide the window — conhost headless / `start /b` / a windowsHide spawn / a .vbs or powershell -WindowStyle Hidden shim; (3) the kiroCliAllowedCommands trust regex must match whatever form we choose. Split kiroHookCommand into an IDE variant (cmd.exe /c, WSL) + a CLI variant (bare or hidden) since their shells differ. Live-test each on real kiro-cli 2.9.0.

**Why:** The clean gate surfaced a real UX bug: kiro-cli hooks flash a visible cmd.exe console window every fire on Windows because the command is `cmd.exe /c cmk hook`. The cmd.exe wrapper exists for the IDE's WSL hop but is shared with the CLI agent, which may not need it. Annoying for every kiro-cli user on Windows.

**How to apply:** Investigate (live on kiro-cli 2.9.0): (1) FIRST test whether kiro-cli runs a BARE `cmk hook stop` hook command (no cmd.exe /c) — if yes, the CLI agent uses bare (no popup), the IDE keeps cmd.exe /c for WSL. Split kiroHookCommand/kiroGuardCommand into IDE vs CLI variants. (2) If kiro-cli ALSO needs the wrapper, hide the window: try a windowsHide approach or a conhost-headless/`start /b` form, or a wscript .vbs shim — verify the hook still fires AND the trust regex (kiroCliAllowedCommands) still matches. Test-first, then live-verify the popup is gone on real kiro-cli. This is a separate task (kiro-cli UX polish) — likely v0.4.x. Relates D-190 (the IDE popup, different mechanism), P-PM2CD6CB (why cmd.exe /c was added — the WSL hop).
