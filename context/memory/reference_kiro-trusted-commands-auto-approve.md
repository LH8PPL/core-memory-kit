---
id: P-MF7BXG6W
type: reference
title: kiro-trusted-commands-auto-approve
created_at: 2026-06-22T19:49:14Z
write_source: user-explicit
trust: high
source_file: user-explicit
source_line: 1
source_sha1: ba92273a9616904284986f980d3d9877ae2a8e41f635d748b5df487f721b1f1a
related: [use-mcp-mk-remember-not-bash-cli]
---

Kiro IDE hooks are gated by a command-trust system: a hook's shell command shows a "Run / Reject" approval prompt on every fire unless pre-trusted. The IDE trust mechanism is `kiroAgent.trustedCommands` (an array of wildcard-PREFIX patterns) in settings.json — user scope `…/Kiro/User/settings.json` or workspace scope `.vscode/settings.json`. The CLI equivalent is the agent-config's `allowedCommands` (regex). Trust matches only the START of the command string. cmk install --ide kiro must write trustedCommands for the kit's own hook commands or "automatic memory" prompts every turn.

**Why:** Found live in the v0.4.0 cut-gate-kiro (50.M): the inject hook (cmd.exe /c cmk hook promptSubmit) prompted Run/Reject in the IDE instead of firing silently — defeating automatic memory. The docs bury the IDE mechanism; the user found it by trial-and-error and it was confirmed against kiro.dev.

**How to apply:** When wiring Kiro IDE/CLI hooks, also pre-trust their commands: write a managed kiroAgent.trustedCommands entry to the workspace .vscode/settings.json (specific prefixes like 'cmd.exe /c cmk hook *', NOT an over-permissive 'cmd.exe /c *'), and allowedCommands on the CLI agent-config. Merge into existing arrays, never clobber user entries.
