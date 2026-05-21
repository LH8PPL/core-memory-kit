---
name: Nightly MemSearch Index
time: '02:00'
days: daily
active: 'true'
description: 'Re-indexes context/ markdown files for vector search'
timeout: 10m
job_type: shell_command
command: 'bash scripts/memsearch-index-with-flush.sh context/memory context/sessions context/transcripts'
working_directory: '${CLAUDE_PROJECT_DIR}'
# Requires Layer 5 installed (memsearch on PATH + a reachable Milvus backend).
# On Windows: Docker Desktop running with Milvus container — see context/SETUP.md.
# If memsearch isn't installed or backend isn't reachable, the task will fail;
# HC-7 (backend reachability) will flag it on the next session start.
---

Updates the memsearch vector index with any new content from `context/memory/`, `context/sessions/`, and `context/transcripts/`. Idempotent: only re-embeds chunks whose hash changed since the last run.
