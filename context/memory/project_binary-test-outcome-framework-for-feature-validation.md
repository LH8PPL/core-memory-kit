---
id: P-2F6HQJHF
type: project
title: Binary Test Outcome Framework for Feature Validation
created_at: 2026-06-24T15:02:02Z
write_source: auto-extract
trust: medium
source_file: auto-extract
source_line: 1
source_sha1: c47f5c004074d726e6a6e1d61e8701147d98d19713264412219986061206e2ad
---

Structure environment/integration tests to yield two mutually exclusive, decisive outcomes that immediately point to next action:

**✅ Lands** → feature works as intended → ready for PR/merge
**❌ Doesn't land** → feature has a blocker → identifies root cause, prompts pivot to alternative lever

E.g., for mcp.json env delivery: run fresh test, check if fact wrote to context/ folder (yes = lands; no = doesn't land). No ambiguity.

**Why:** Binary outcomes eliminate guesswork and remove the need for follow-up debugging; each result is actionable and complete.

**How to apply:** Design tests to check a single, clear signal (did the write happen?). Structure success/failure narratives ahead of time so results are immediately interpretable.
