---
description: >
  Scaffolds the claude-memory-kit directory structure (context/, scripts/,
  cron/jobs/, milvus-deploy/) into the current project. Idempotent — never
  overwrites existing files. Run once per project after installing the
  plugin. Use when the user says "bootstrap the memory system", "set up
  memory here", or "scaffold the memory kit".
---

# bootstrap

## Purpose

Scaffold the memory-system files into the user's current project. The plugin itself ships with the hooks and skill, but the user's project needs its own `context/` directory tree, `scripts/` for the auto-extract helper to read project-relative paths, and the cron job declarations.

## Steps

1. **Check** the current project directory (`CLAUDE_PROJECT_DIR` or pwd) for an existing `context/` directory.
   - If exists: ASK the user "context/ already exists. Run bootstrap anyway (skipping existing files)?" Default to yes if no answer.

2. **Create directories** (idempotent):
   ```
   context/memory
   context/sessions
   context/transcripts
   scripts
   milvus-deploy
   cron/jobs
   ```

3. **For each template file in the plugin's `context-template/` directory**, copy into the user's `context/` if the destination doesn't already exist. Substitute `{{TODAY}}` with today's date and `{{PROJECT_NAME}}` with the project's basename.

   Files to scaffold:
   - `USER.md.template`         → `context/USER.md`
   - `MEMORY.md.template`       → `context/MEMORY.md`
   - `SOUL.md.template`         → `context/SOUL.md`
   - `memory/INDEX.md.template` → `context/memory/INDEX.md`
   - `SETUP.md`                 → `context/SETUP.md` (no substitution)

4. **Operational scripts** — v0.1.0 ships these as Node bins inside the published `@claude-memory-kit/cli` npm package, NOT as plugin-copied scripts. Users invoke them via `cmk` subcommands:
   - `cmk daily-distill` (was: `run-daily-distill.sh`)
   - `cmk weekly-curate` (was: `run-weekly-curate.sh`)
   - `cmk compress --lazy` (no-cron fallback; new in Task 35)
   - `cmk register-crons` (was: `register-crons.py`)
   - memsearch indexing — covered by Task 29's runtime watcher + `cmk reindex` (no separate script needed)

5. **Copy cron job declarations** from the plugin's `cron-template/jobs/` into the user's `cron/jobs/`:
   - `daily-memory-distill.md`
   - `nightly-memsearch-index.md`
   - `weekly-memory-curator.md`

6. **Copy Milvus compose** from the plugin's `milvus-deploy-template/` into the user's `milvus-deploy/` (Windows users will need this; Linux/macOS can ignore).

7. **Report**: list which files were created vs skipped. Then tell the user:
   - Open `context/SETUP.md` for Layer 5 (memsearch) and Layer 6 (crons) install steps
   - Open `INSTALL-<your-os>.md` from the kit repo for OS prerequisites
   - The plugin's hooks already activate on session start — no per-project hook registration needed

## Constraints

- **NEVER overwrite existing files** in the user's project.
- **NEVER modify their `.claude/settings.json`** — the plugin's hooks are registered via the plugin's own `hooks/hooks.json`, not the user's settings file.
- Confirm before scaffolding if `context/` already has content.

## Why this is a skill, not the install script

The standalone `install.sh` / `install.ps1` (in the kit repo root) copies files from `template/`. The plugin can't do that because Claude Code plugins don't run setup scripts at install time — they only register skills, hooks, agents, and MCP servers.

So instead the plugin ships the template content under `context-template/` and exposes this bootstrap skill, which the user runs explicitly with `/claude-memory-kit:bootstrap` after installing the plugin.
