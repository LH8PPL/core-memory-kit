---
id: P-REVFHLBK
type: project
title: kit skills are modular thin-orchestrators over a deep cmk substrate
created_at: 2026-06-13T07:34:51Z
write_source: user-explicit
trust: high
source_file: user-explicit
source_line: 1
source_sha1: 3cb82296e7df693aa6bd0953dc11dd02da60fc0c
related: [autopilot-grant-v0-3-x-queue-2026-06-12]
---

The kit's skills are MODULAR building blocks, not a mega-skill: two single-responsibility skills (memory-search = recall-only/read-only/context:fork; memory-write = capture-only) that are THIN trigger-and-orchestrate layers over a DEEP tool substrate (cmk CLI verbs + mcp__cmk__* tools + shared cores: memory-write/read-core/semantic-backend). The skills decide WHEN; the cmk tools do the work. In the skill-scaling-system framing (orchestrator pipelines over a shared-context band), the kit is correctly the SHARED-CONTEXT SUBSTRATE (context/ = the brand_context/ band), NOT a chaining framework itself — Task 146 (Workflows swarm) is where cold subagent blocks reach this shared memory via the MCP allowlist + CLAUDE.md.

**Why:** The user surfaced the mega-vs-modular / skill-scaling question (2026-06-13 whiteboard images); the answer is reusable architecture framing for Task 146 (Workflows) and for any future skill the kit scaffolds — keep skills thin, push capability into composable cmk/MCP cores.

**How to apply:** When adding a skill: one capability per skill, narrow allowed-tools, body loads on demand (progressive disclosure); put real logic in a cmk verb + MCP tool (parity-guarded), not in the skill. Don't build a skill-chaining/orchestrator layer into the kit — the kit is the stateful substrate other systems' chains compose, per Task 146.
