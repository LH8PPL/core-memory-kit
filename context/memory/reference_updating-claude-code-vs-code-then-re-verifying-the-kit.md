---
id: P-BNZAZ2U3
type: reference
shape: State
title: Updating Claude Code + VS Code, then re-verifying the kit
created_at: 2026-07-15T14:03:40Z
write_source: user-explicit
trust: high
recurrence_count: 1
source_file: user-explicit
source_line: 1
source_sha1: 9b18448580a608533ab3930e3194085fab6fdc5284e9ae94b144a10a03e25cee
---

To update local tooling: 'claude update' self-updates the native Claude Code CLI (installed at ~/.local/bin/claude, not npm) — then RESTART Claude Code for it to take effect (restart ends the running session). VS Code updates via Help → Check for Updates → Restart (the code CLI can't self-update the app). After updating + restarting, run 'cmk doctor' to confirm the kit still wired: HC-1 (hooks registered) + HC-11 (backend CLI present) must stay PASS. If a hook/marker drifted: 'cmk repair --hooks' (re-registers hooks) or 'cmk install' (re-stamps the version marker for HC-9).

**Why:** Recurring maintenance task; restarting Claude Code ends the chat so the steps must be recallable next session, and the kit's hooks target Claude Code v2.1.x so an update warrants a cmk doctor re-check

**How to apply:** Run 'cmk search update claude code' to recall this; follow claude update → restart → VS Code Check for Updates → restart → cmk doctor
