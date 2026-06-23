---
id: P-EJFDYMR9
type: project
title: task-164-followup-claude-md-template-md022
created_at: 2026-06-23T16:27:31Z
write_source: user-explicit
trust: high
source_file: user-explicit
source_line: 1
source_sha1: 155ca2a2c591939b6413926a7fa286467da5556666ca90d7f56c117dafd79f82
related: [lint-clean-memory-output-plan-and-progress]
---

FOLLOW-UP (Task 164 gap, found in cut-gate18 Claude Code install 2026-06-23): the scaffolded CLAUDE.md has 1 MD022 issue — the CLAUDE.md.template was NOT in Task 164.8's 6-template lint-clean sweep (it's a Claude-Code-only file: template/CLAUDE.md.template). The memory tiers (MEMORY/SOUL/INDEX) + the 6 memory templates are all lint-clean; only CLAUDE.md.template has a heading not blank-surrounded. Low priority (CLAUDE.md is instructions, not memory; and the validate-template lint guard only covers the 6 memory templates). Fix: add a blank line around the offending heading in template/CLAUDE.md.template + add it to checkTemplateLintClean()'s file list.

**Why:** Found while running the regular cut-gate (cut-gate18) on the post-Task-164 artifact. Task 164.8 made the 6 MEMORY/SOUL/USER/HABITS/LESSONS/INDEX templates lint-clean but didn't include CLAUDE.md.template (a Claude-Code instruction file, not a memory tier). The regression guard (checkTemplateLintClean) also doesn't cover it.

**How to apply:** Quick fix when convenient: blank-around the offending heading in template/CLAUDE.md.template; add 'template/CLAUDE.md.template' to the mdTemplates list in scripts/validate-template.mjs checkTemplateLintClean(). Not urgent — CLAUDE.md is instructions; the user is focused on the Kiro gate.
