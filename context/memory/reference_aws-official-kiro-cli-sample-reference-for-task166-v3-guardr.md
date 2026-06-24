---
id: P-ZaQWK9WX
type: reference
title: aws-official-kiro-cli-sample-reference-for-task166-v3-guardrail
created_at: 2026-06-24T11:16:14Z
write_source: user-explicit
trust: high
source_file: user-explicit
source_line: 1
source_sha1: cfc42bf6cf7f3ea4b8423b5f4479491ea5f69df7e2db56176c91a1886460f412
related: [FINAL-kiro-cli-v3-redesigned-hooks-pretooluse-superseded-by-permissions-yaml, FINAL-mcp-popup-is-kiro-cli-wraps-all-mcp-in-cmd-exe-not-kit-bug]
---

REFERENCE for Task 166 (kiro-cli V3 guardrail) — the AWS OFFICIAL sample: github.com/aws-samples/sample-kiro-cli-multiagent-development. It ships WORKING preToolUse guardrail hooks in the embedded agent-config format `"hooks":{"preToolUse":[...]}` with exit-0-allow/exit-2-block — guard-destructive-commands.sh, check-secrets.sh, check-dependency-pins.sh, config-drift-guard.sh. MCP servers are configured WITHIN each agent's JSON under mcpServers (not a separate mcp.json). USEFUL because: (a) it confirms AWS's OWN current sample still uses the V2 embedded preToolUse format we use — so our format is right; (b) it's the gold-standard reference to copy the exact working hook+config shape from when we do Task 166. CAVEAT: the sample does NOT state which kiro-cli version it targets, and OUR live test on 2.9.0 proved embedded preToolUse does NOT fire there — so the sample may target V2, OR 2.9.0 has a preToolUse regression. NONE of the 3 user-provided links (dev.to AWS-Kiro article, patrickjduffy guardrail blog, this AWS sample) address the Windows MCP console-popup — confirming it's an undocumented kiro-cli platform behavior with no config fix (consistent with our FINAL diagnosis: kiro-cli wraps ALL stdio MCP servers in cmd.exe). For Task 166: clone the AWS sample, diff its preToolUse against ours, test on a real 2.9.0 to see if AWS's exact shape fires (if AWS's fires and ours doesn't, it's a format detail; if neither fires, it's a 2.9.0 regression → wait for migration tooling or use permissions.yaml).

**Why:** The AWS official multiagent sample ships working preToolUse guardrail hooks in the embedded format — the gold-standard reference for Task 166 (kiro-cli V3 guardrail). Confirms our format is right but our 2.9.0 doesn't fire it; the sample is what to diff against to determine if it's a format detail or a 2.9.0 regression. Also confirms none of the 3 links fix the popup (it's an undocumented kiro-cli platform behavior).

**How to apply:** When doing Task 166: clone github.com/aws-samples/sample-kiro-cli-multiagent-development, read its agent JSON's hooks.preToolUse + the guard-destructive-commands.sh shape, diff against the kit's kiro-cli-agent.mjs preToolUse, and live-test AWS's exact shape on real kiro-cli 2.9.0. If AWS's fires + ours doesn't → a format/field detail to fix; if neither fires → a 2.9.0 preToolUse regression → fall back to permissions.yaml or wait for the V2→V3 migration tooling. The sample also shows MCP-in-agent-config (mcpServers inside the agent JSON) as an alternative to a separate mcp.json.
