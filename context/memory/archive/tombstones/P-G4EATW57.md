---
deleted_at: 2026-07-18T14:44:27Z
deleted_reason: ''
deleted_by: user-explicit
id: P-G4EATW57
type: project
shape: Timeless
title: Distill Scheduler Cannot Be Triggered On-Demand
created_at: 2026-07-18T14:41:47Z
write_source: auto-extract
trust: medium
recurrence_count: 1
source_file: auto-extract
source_line: 1
source_sha1: f7b561c8f6f1f6b4369bbc505f9c62e696bd5bd644285db2529286442e521586
---

Scheduled distill runs via VBS shim + Task Scheduler execute only at fixed times (23:00). Manual immediate execution within a conversation is not supported. Workaround is a watcher that monitors for completion and reports status.

**Why:** Users will ask to trigger distill "now"; knowing this is not possible prevents false expectations and informs fallback approaches.

**How to apply:** When immediate distill execution is requested, explain the scheduled-only constraint and offer the watcher monitoring approach as the available alternative.
