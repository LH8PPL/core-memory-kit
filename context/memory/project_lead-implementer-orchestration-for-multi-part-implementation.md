---
id: P-Z9PJXGEG
type: project
shape: Timeless
title: Lead-Implementer Orchestration for Multi-Part Implementation Tasks
created_at: 2026-07-22T17:52:44Z
write_source: auto-extract
trust: medium
recurrence_count: 1
source_file: auto-extract
source_line: 1
source_sha1: 5367cda2148fb0598fe5eedbb48499f0136e36fc9bbbc286a6e2833e335a8043
---

For complex multi-part tasks, split into two roles:

- **Lead**: Reads governing docs/ADRs, scouts module layout, enumerates sub-tasks and test shapes, prepares a detailed work order, then independently reviews implementer output.
- **Implementer**: Receives the brief, executes each sub-task with TDD following the required test shapes, addresses all doc ripples (e.g., MCP-tool-count updates), delivers a completion report.

A comprehensive brief enables the implementer to work at depth without constant clarification.

**Why:** Separates planning (lead) from execution (implementer). Allows both to operate at their respective depths; implementer avoids context-switching; lead can think strategically without interruption.

**How to apply:** For future multi-part tasks, prepare a work order: sub-task list, required test shapes/coverage, doc ripples to address, relevant ADR/reference material. Hand to implementer agent with model pinning and role rules. Review output independently before PR and merge.
