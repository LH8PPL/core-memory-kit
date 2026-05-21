# claude-memory-kit (Claude Code plugin)

Plugin distribution of the [claude-memory-kit](../README.md) memory system.

## Install

In Claude Code:

```text
/plugin marketplace add <your-username>/claude-memory-kit
/plugin install claude-memory-kit
```

Restart Claude Code. Then in the project where you want the memory system:

```text
/claude-memory-kit:bootstrap
```

The bootstrap skill scaffolds `context/`, `scripts/`, `cron/jobs/`, and `milvus-deploy/` into the project. Existing files are never overwritten.

## What the plugin gives you

- **PreToolUse hook** — injects the frozen memory snapshot (SOUL.md + USER.md + MEMORY.md + INDEX.md + today's session log) before the first tool call of each session.
- **Stop hook** — captures transcripts AND spawns the auto-extract background job after every turn.
- **`memory-write` skill** — auto-triggers on phrases like "remember this", "from now on", "forget about". Available as `/claude-memory-kit:memory-write`.
- **`bootstrap` skill** — one-shot scaffold of the per-project files. Available as `/claude-memory-kit:bootstrap`.

## What the plugin does NOT do

- It does not install `memsearch` (Layer 5) or set up cron jobs (Layer 6). Those still require shell commands — see the kit's `INSTALL-<os>.md`.
- It does not modify your `.claude/settings.json` — the hooks are registered via the plugin's own `hooks/hooks.json`.
- It does not run on session start; the bootstrap is opt-in per project via the slash command.

## Differences vs the script install

The kit ships two install paths:

| Aspect | Plugin (this directory) | Script install (`install.sh` / `.ps1`) |
|---|---|---|
| Distribution | Claude Code marketplace | git clone + run install script |
| Hooks live in | Plugin directory | Project's `.claude/hooks/` |
| Updates | `/plugin update` | `git pull && rerun install` |
| Project-local scripts | Scaffolded by bootstrap skill | Copied by install script |
| Modifies project's `.claude/settings.json` | No (plugin manages own hooks) | No (ships own settings.json) |

Both work. The plugin is more polished but newer; the script install is more transparent.

## File layout (this directory)

```
plugin/
├── .claude-plugin/
│   └── plugin.json             ← manifest
├── README.md                   ← this file
├── hooks/
│   ├── hooks.json              ← registers Stop + PreToolUse
│   ├── pre-tool-memory.js
│   └── transcript-capture.js
├── bin/
│   └── auto-extract-memory.sh  ← background extractor (PATH'd when plugin active)
├── skills/
│   ├── memory-write/SKILL.md
│   └── bootstrap/SKILL.md
└── context-template/           ← seeded into user's project by /bootstrap
    ├── USER.md.template
    ├── MEMORY.md.template
    ├── SOUL.md.template
    ├── SETUP.md
    └── memory/INDEX.md.template
```
