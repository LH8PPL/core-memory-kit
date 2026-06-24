---
id: P-BKZ97QGE
type: project
title: d198-proven-agentspawn-fires-but-pretooluse-not-on-2.9.0-execute-command-rename
created_at: 2026-06-24T07:13:43Z
write_source: user-explicit
trust: high
source_file: user-explicit
source_line: 1
source_sha1: c7fdd5d24c9d15397c505e9b03b63d32693476c87dac0bcd3d6b893f1b203578
related: [d198-fix-built-kiro-dir-location-open-file-uri-resolution-question, kiro-cli-rejects-bom-in-agent-config-ps-convertto-json-adds-it]
---

D-198 PARTIALLY PROVEN + a NEW 2.9.0-specific finding (2026-06-24). After the D-198 location fix (agent → ~/.kiro/agents/cmk.json + chat.defaultAgent in ~/.kiro/settings/cli.json), the cmk agent RESOLVES as default (`* cmk Global`) and agentSpawn FIRES — probe log captured: stdin {"hook_event_name":"agentSpawn","cwd":"C:\\Temp\\kiro-gate2","session_id":...}, env KIRO_VERSION=2.9.0. So D-198 is CORRECT — the location was THE bug, hooks now fire. BUT a NEW finding: preToolUse did NOT fire on an `ls`, EVEN with matcher '*'. The screenshot shows the 2.9.0 shell tool is named `execute_command` (NOT `execute_bash`! a 2.9.0 rename — the V3 banner's "expanded hooks"). The kiro.dev/docs/cli/hooks STILL say execute_bash + '*'=all-tools, so DOCS LAG THE 2.9.0 BINARY. agentSpawn fires (no matcher), preToolUse does not (with '*'). Currently testing the literal matcher 'execute_command'. THREE possibilities: (H1) 2.9.0 preToolUse needs the literal new tool name 'execute_command' not '*' — fix: add execute_command to the matcher OR confirm '*' is honored; (H2) 2.9.0 changed/broke preToolUse firing entirely (the "expanded hooks" migration) — version issue, document + the IDE/native-confirm covers it; (H3) the `<tool_use>` shown was model NARRATION and the real exec didn't hit preToolUse. KEY: agentSpawn proves the AGENT + hook mechanism work post-D-198; only the preToolUse/guardrail leg is uncertain on 2.9.0. The guard BIN reads stdin correctly (agentSpawn payload came via stdin). Payload IS stdin (not _HOOK_EVENT env) — original bin design right.

**Why:** D-198 (the location fix) is PROVEN correct — agentSpawn fires, cmk is the resolved default. But on kiro-cli 2.9.0 the shell tool was renamed execute_bash→execute_command and preToolUse did not fire even with matcher '*'; the docs still say execute_bash so they lag the binary. The guardrail leg's live status on 2.9.0 is the last open question; agentSpawn/inject/capture work.

**How to apply:** Testing matcher 'execute_command' (literal 2.9.0 tool name) live now. If preToolUse fires with it: the guard.mjs SHELL_TOOLS set must add 'execute_command' AND the matcher should be '*' (or both names) — but since '*' didn't fire, may need the literal. If it still doesn't fire: 2.9.0 preToolUse is changed/broken (the V3 'expanded hooks' migration) — document the guardrail as a known 2.9.0 limitation (IDE native-confirm + kiro-cli's own shell-approval gate still protect), ship D-198 for the agentSpawn/capture/inject wins which DO work. Either way: update guard-memory.mjs SHELL_TOOLS to include 'execute_command' (the new name) regardless. Re-read kiro.dev/docs/cli/v3/ for the 2.9.0 hook contract. The agentSpawn-fires result already justifies shipping D-198.
