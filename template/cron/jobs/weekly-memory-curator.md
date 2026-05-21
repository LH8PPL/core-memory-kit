---
name: Weekly Memory Curator
time: '09:00'
days: sun
active: 'true'
description: 'Prunes, merges, and consolidates entries in MEMORY.md; updates Last-health-check timestamp'
timeout: 15m
job_type: shell_command
command: 'bash scripts/run-weekly-curate.sh'
working_directory: '${CLAUDE_PROJECT_DIR}'
---

Conservative cleanup pass on `context/MEMORY.md`. Removes resolved Active Threads, merges duplicate bullets, drops clearly stale entries — but never ADDS content (that's the daily-distill's job). Logs results to today's session log under a "## Session — automated curation" heading.

See `scripts/run-weekly-curate.sh` for the exact prompt and tool allowlist.
