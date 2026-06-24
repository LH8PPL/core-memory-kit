---
id: P-CGEE2XSH
type: project
title: kiro-cli-popup-real-cause-cmk-is-npm-shim-not-exe-mcp-and-hook-spawns-flash
created_at: 2026-06-24T10:25:45Z
write_source: user-explicit
trust: high
source_file: user-explicit
source_line: 1
source_sha1: d27ad0869a5698ea2f5ea8113b8d5cd5629926e6e61364f7b39e41a2d1c52e2a
related: [kiro-cli-hook-cmd-exe-popup-window-flash-ux-bug, d198-shipped-pr225-kiro-cli-capture-inject-proven-live]
---

CORRECTED root cause of the kiro-cli popup (2026-06-24): NOT just the hook's cmd.exe /c wrapper. Removing cmd.exe/c from the agent hooks (verified bare 'cmk hook agentSpawn' in the live config) did NOT remove the cmd.exe popup. REAL ROOT CAUSE: on Windows, `cmk` is an npm SHIM (cmk.ps1 + cmk.cmd at ~/AppData/Roaming/npm/), NOT a native cmk.exe (cmk.exe does NOT exist). So ANY time kiro-cli launches `cmk` — the MCP server (mcp.json command:'cmk' → 'cmk mcp serve') OR a hook — Windows runs it through a shell (cmd.exe for cmk.cmd, which can invoke PowerShell for cmk.ps1), and each launch FLASHES a console window. That's why the user sees BOTH a cmd.exe popup AND a PowerShell popup. The MCP server spawn is the persistent one (kiro-cli wraps cmk in cmd.exe itself). This is a Windows + npm-shim + kiro-cli interaction, NOT fixable by editing the agent hook command alone. FIX OPTIONS (real work, investigate): (1) point mcp.json + hooks at the .CMD or the underlying node bin directly with a windowsHide spawn — but kiro-cli controls the MCP spawn, we only control the command string; (2) ship a native cmk.exe (pkg/nexe/bun-compile) so no shell wrapper is needed — heavy; (3) use `conhost --headless` or a VBS/`start /b`-style hidden-launch shim as the command kiro points at; (4) check if kiro-cli 2.9 has a setting to run hooks/MCP without a window. The hook side ALSO needs it (capture flashes per turn), not just MCP. NOTE: this is cosmetic — the kit WORKS (cmk is default, capture/inject fire); the windows are just visual noise on Windows. Likely a v0.4.x UX task. RESTORE: the live agent currently has BARE hooks (my popup test) — re-run `cmk install --ide kiro` to restore the canonical cmd.exe /c form before continuing the gate (the IDE needs cmd.exe /c for its WSL hop; bare may break IDE capture).

**Why:** The popup is NOT just the hook's cmd.exe/c (removing it didn't help). The real cause: cmk is an npm .ps1/.cmd shim (no native cmk.exe), so every kiro-cli launch of cmk — the MCP server AND hooks — gets shell-wrapped by Windows and flashes a console window (both cmd.exe + PowerShell). A Windows-shim interaction, needs a real fix (hidden-window shim, native exe, or a kiro-cli setting), not a config tweak.

**How to apply:** Separate v0.4.x UX task. Investigate: (a) can the MCP/hook command point at a windowsHide-spawning shim or `wscript //nologo a.vbs` / `conhost --headless` form that kiro-cli accepts? (b) does kiro-cli 2.9 have a no-window option for hooks/MCP? (c) is a native cmk.exe (pkg/bun) worth it? The hook side needs it too (capture flashes per turn). For NOW (to continue the gate): re-run `cmk install --ide kiro` to restore the canonical cmd.exe/c hooks (the live agent currently has my bare-hook popup-test edit; the IDE's WSL hop needs cmd.exe/c). The popup is COSMETIC — capture/inject/default-agent all work. Relates D-190 (IDE popup, different), the npm-shim nature of cmk on Windows.
