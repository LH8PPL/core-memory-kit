---
id: P-U5QSXFNa
type: project
title: d198-shipped-pr225-kiro-cli-capture-inject-proven-live
created_at: 2026-06-24T09:07:50Z
write_source: user-explicit
trust: high
source_file: user-explicit
source_line: 1
source_sha1: 4bb7f2bfa495c38ef80f7dfe0e31c7aa02213f4be2fbf7e50ca5580d92546dff
related: [FINAL-kiro-cli-v3-redesigned-hooks-pretooluse-superseded-by-permissions-yaml, TRUE-root-cause-kiro-cli-agent-config-wrong-location-no-hooks-fire]
---

D-198 SHIPPED to PR #225 (2026-06-24) — the kiro-cli agent-location fix is complete + two-pass reviewed. THE FIX (branch fix-kiro-cli-agent-location): kiro-cli-agent.mjs writes ~/.kiro/agents/cmk.json + ~/.kiro/settings/cli.json {"chat.defaultAgent":"cmk"} (was the dead ~/.aws/amazonq/cli-agents/ location). PROVEN LIVE: kiro-cli agent list shows '* cmk Global', agentSpawn FIRES (capture+inject work on kiro-cli). Live-validated via real kiro-cli agent validate (caught managedBy-rejection + includeMcpJson/useLegacyMcpJson dup). Dropped file:// refs (resolve relative to agent-dir not project; AGENTS.md auto-loads + inline prompt). Two-pass review: self caught stale ~/.aws comments; skill-review (code-review-excellence) added the I-1 safety test (foreign cmk.json without marker survives uninstall — rmSync no-false-positive). Added execute_command (2.9.0 shell rename) to guard SHELL_TOOLS. Full suite 2260/0. Docs: D-198 in DECISION-LOG, CHANGELOG updated (kiro-cli capture/inject works, guardrail V2-only/native-fallback on V3), tasks.md current-state + Task 166 (V3 hook support follow-up). GUARDRAIL DEFERRED: preToolUse doesn't fire on kiro-cli V3/2.9.0 (V3 redesigned hooks: standalone .kiro/hooks/*.json PascalCase + permissions.yaml) — Task 166. NET v0.4.0 STATUS: capture+inject work on BOTH Kiro IDE + kiro-cli (the core value proven live); the delete-guardrail works on Claude Code + Kiro-IDE-native-confirm + kiro-cli-V2, falls back to kiro-cli's own shell-approval on V3. REMAINING before tag: merge #225, finish E1 (cold-open wedge) + KU1/KU2 (uninstall) live, restore real tiers from run4 backup, user pushes v0.4.0 tag. The user's live env: cmk IS the real resolved kiro-cli default now (clean agent restored post-probe); the stale ~/.aws/amazonq/cli-agents/q_cli_default.json was removed.

**Why:** D-198 (the real root-cause fix for kiro-cli hooks not firing) is built, two-pass-reviewed, and PROVEN live (agentSpawn fires, cmk is the resolved default). Capture+inject — the core automatic-memory value — now work on kiro-cli. Shipped to PR #225. The guardrail-on-V3 gap is consciously deferred to Task 166 with Kiro's native fallback documented honestly.

**How to apply:** Next: merge #225 (after CI green). Then the remaining v0.4.0 gate items: E1 cold-open wedge (new project, kit scaffolds the user's style unprompted), KU1/KU2 uninstall live (cmk uninstall --ide kiro strips kiro surface, leaves context/), restore real memory tiers from the C:\cut-gate-backups run4 backup, then the user pushes the v0.4.0 tag → publish.yml. Task 166 (V3 hooks) is post-tag. The probe scripts (C:\tmp\kg-probe*.mjs) + this debugging arc are the reusable instrument for the V3 work.
