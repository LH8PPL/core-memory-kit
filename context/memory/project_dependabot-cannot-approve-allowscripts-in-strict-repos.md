---
id: P-XBB4aELR
type: project
title: Dependabot Cannot Approve allowScripts in Strict Repos
created_at: 2026-06-12T20:06:07Z
write_source: auto-extract
trust: medium
source_file: auto-extract
source_line: 1
source_sha1: d6421033d5701828c9e08f874d7d029c60de4ab2
---

Dependabot refuses to modify `allowScripts` approval configurations in dependency-bump PRs. On strict-CI repos with approval gates, this means Dependabot-generated PRs will fail until human re-approval, causing approval patterns to drift from version-pinned (re-prompts per upgrade) to name-only pins (lower friction, lower security).

**Why:** Affects approval fatigue and long-term security posture in strict-mode npm repos.

**How to apply:** When using Dependabot + strict npm approvals, plan for manual re-approval overhead per Dependabot PR, or accept degradation to name-only approval pins.
