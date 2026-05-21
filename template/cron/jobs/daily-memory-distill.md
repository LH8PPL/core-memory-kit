---
name: Daily Memory Distillation
time: '23:00'
days: daily
active: 'true'
description: 'Distills durable facts from today''s session log into MEMORY.md and updates Last-distilled timestamp'
timeout: 10m
job_type: shell_command
command: 'bash scripts/run-daily-distill.sh'
working_directory: '${CLAUDE_PROJECT_DIR}'
---

Invokes Claude headlessly to extract durable facts from `context/sessions/{today}.md` into `context/MEMORY.md`. Promotes typed facts to `context/memory/<type>_*.md` granular files. Enforces the 2,500-char MEMORY.md cap by consolidating older entries if needed. Updates the `Last distilled` timestamp so HC-3 stays green.

See `scripts/run-daily-distill.sh` for the exact prompt and tool allowlist.
