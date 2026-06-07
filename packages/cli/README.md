# @lh8ppl/claude-memory-kit

**`cmk`** — the CLI for [claude-memory-kit](https://github.com/LH8PPL/claude-memory-kit), a per-project, in-repo memory system for [Claude Code](https://docs.claude.com/en/docs/claude-code). It fixes Claude's per-session amnesia so you don't have to re-tell the backstory every time you start a new session.

## What it does

- **Cross-project persona — the wedge (v0.2)** — when you state how you work *everywhere* ("always use uv, never pip", "from now on run the linter before committing"), the per-turn auto-extract promotes it into your **user tier** (`~/.claude-memory-kit/`) **that turn**. So a brand-new project **cold-opens already knowing your style** — layered structure, your tooling, your testing discipline — with no hand-curation and no waiting. Carry it between your own machines with `cmk persona export`/`import`, or pin a single fact across projects with `cmk lessons promote`.
- **Frozen snapshot at session start** — MEMORY.md + USER.md + SOUL.md + INDEX.md + today's session log inject once at the first tool call, so Claude sees your context every session without you re-telling it.
- **Auto-extract on every assistant turn** — a background `claude --print` subagent reads each turn and saves durable facts to memory. Durable project knowledge (setup/config, conventions, workflows, tool quirks) becomes a **rich Why/How fact file** (structured + searchable); lighter signals stay terse `MEMORY.md` bullets. Runs automatically, so the rich tier survives even when the model uses Claude Code's built-in memory instead. No manual writes needed.
- **Explicit capture when you want it** — say "remember this" / "from now on" / "we decided" / "forget X" (the `memory-write` skill), or run `cmk remember "<fact>"`. Both dedup, screen for secrets, abstract machine paths to `~`, and write silently. For backtick/quote-heavy rich facts, capture them shell-safe as JSON: `cmk remember --from-file fact.json` (or `--json` from stdin) — content never touches the shell.
- **Search + MCP** — `cmk search "<term>"` (keyword/hybrid over facts + scratchpads); `cmk mcp` exposes the same to Claude Code as tools.
- **Bounded by compression** — session → daily → weekly Haiku rollups (cron or lazy-on-read) keep the snapshot small as history grows. The session-buffer rollup self-heals at session start too, so memory stays bounded even if you never cleanly close the window.
- **Per-project, in-repo** — `context/` lives inside your project and travels with `git clone`. Each project keeps its own memory.
- **9 health checks** — `cmk doctor` validates install, hook wiring, distill freshness, INDEX consistency, cron registration, and stale locks.

## Install — pick ONE route

Each route is complete on its own. **Don't run both** — they wire the same hooks.

### Route A — npm (recommended)

```bash
npm install -g @lh8ppl/claude-memory-kit
cd ~/my-project
cmk install        # scaffolds context/ + the memory-write skill AND wires the lifecycle hooks into .claude/settings.json
cmk doctor         # verify, then restart Claude Code
```

`cmk install` is a complete entry point: it scaffolds `context/`, drops the `memory-write` skill into `.claude/skills/` (committed — travels with `git clone`), and writes the 5 lifecycle hooks (PATH-resolved, cross-OS) into the project's `.claude/settings.json`. No separate `/plugin` step needed. Use `cmk install --no-hooks` for a scaffold-only install.

> Installing the package globally adds the `cmk` CLI **and** the installer. It's the `cmk install` *subcommand* that wires the hooks — not the bare `npm install`.

### Route B — Claude Code plugin marketplace

Inside Claude Code:

```text
/plugin marketplace add LH8PPL/claude-memory-kit
/plugin install claude-memory-kit
```

Then say *"bootstrap the memory system"* to scaffold this project's `context/`. The plugin bundles the hooks + the `bootstrap` and `memory-write` skills, so it's complete without the npm CLI (add the CLI later only if you want `cmk search` / `cmk doctor` / cron).

## CLI

Most-used commands (full list via `cmk --help`):

| Command | Purpose |
| --- | --- |
| `cmk install` | Scaffold `context/` + the `memory-write` skill + `.gitignore` + CLAUDE.md block + wire hooks (`--no-hooks` for scaffold-only) |
| `cmk doctor` | Run HC-1..HC-9 health checks, surface repair commands |
| `cmk repair --hooks` / `--locks` / `--index` / `--all` | Idempotent self-repair |
| `cmk search "<query>" [--mode keyword\|semantic\|hybrid]` | Search accumulated memory (keyword default) |
| `cmk roll --scope now\|today\|recent` | Manually trigger a compression pipeline |
| `cmk register-crons [--dry-run] [--unregister]` | Register daily + weekly jobs with cron / launchd / Task Scheduler |
| `cmk forget <id>` | Tombstone a fact (preserves audit trail) |
| `cmk lessons promote <id> [--to USER.md\|HABITS.md]` | Promote one captured fact to your cross-project **user tier** (the safe path — sanitized, secret-screened, audited) so it applies in **every** project |
| `cmk disable-native-memory` / `enable-native-memory` | Opt out of Claude Code's built-in Auto Memory so the kit is your single, lean memory layer (committable — travels with `git clone`) |
| `cmk persona generate` | Run cross-project persona synthesis on demand (instead of waiting for the weekly pass) |
| `cmk persona export <file>` / `import <file>` | Carry your cross-project persona (the user tier) to another of **your** machines — export to one portable bundle, import on the other (overwrites with backup + rollback). The persona stays private (never committed to a project) |
| `cmk import-anthropic-memory [--dry-run] [--yes]` | Merge bullets from Anthropic's native auto-memory into MEMORY.md |

## Requirements

- Node.js ≥ 20
- Claude Code (for the hook-driven auto-memory loop)
- Optional: Python 3.12+ for Layer 5b semantic search (deferred to a later release; keyword search ships today)

## Three-tier model

| Tier | Location | Scope |
| --- | --- | --- |
| **P** (project) | `<repo>/context/` | committed to git, travels with `clone` |
| **L** (local) | `<repo>/context.local/` | gitignored, per-machine |
| **U** (user) | `~/.claude-memory-kit/` | cross-project per-user |

## Documentation

Full docs, architecture, and design live in the repository:
**<https://github.com/LH8PPL/claude-memory-kit>**

## License

MIT © the maintainer
