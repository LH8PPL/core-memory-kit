# claude-memory-kit — Quickstart

A 5-minute walkthrough from zero to a working kit on your first project.

## Prerequisites

- Node 20 or later (`node --version`)
- Claude Code installed (`claude --version`)
- A git repo to install into (the kit's `context/` lives inside)

Optional (Layer 5b — semantic search):

- Python 3.12+ and `pip` (for memsearch)
- ~600MB free disk (for the ONNX BGE-M3 model)

## 1. Install — pick ONE route

Each route is complete on its own. **Don't run both** — they wire the same hooks, so doing both would double-wire them.

### Route A — npm (recommended)

```bash
npm install -g @lh8ppl/claude-memory-kit
cmk --version          # should print 0.2.x
```

This installs the `cmk` CLI **and** the 5 lifecycle hook bins. The `cmk install` step (§2) then scaffolds `context/` **and** wires those hooks into the project's `.claude/settings.json` — making it a complete entry point. Nothing else to install.

> The bare `npm install -g` adds the CLI + installer; it's the `cmk install` *subcommand* that wires the hooks (mirroring claude-mem's library-vs-installer split). You never need a separate `/plugin` step on this route.

### Route B — Claude Code plugin marketplace

In Claude Code:

```text
/plugin marketplace add LH8PPL/claude-memory-kit
/plugin install claude-memory-kit
```

Restart Claude Code. The plugin bundles the hooks (it sets `${CLAUDE_PLUGIN_ROOT}` and loads `plugin/hooks/hooks.json`) plus the `bootstrap` and `memory-write` skills. To scaffold this project's `context/`, run the bootstrap skill — say *"bootstrap the memory system"*. This route does **not** require the npm CLI; add it later (`npm install -g @lh8ppl/claude-memory-kit`) only if you want `cmk search` / `cmk doctor` / cron.

## 2. Scaffold the kit into your project (Route A)

```bash
cd ~/my-project
cmk install
```

`cmk install` is idempotent — re-running on an existing kit-enabled project is safe. It scaffolds `context/`, updates `.gitignore`, drops the CLAUDE.md loader block, and wires the hooks into `.claude/settings.json`. Restart Claude Code afterward so the new hooks load. Use `cmk install --no-hooks` for a scaffold-only install (e.g. if you wire hooks another way).

What it creates:

- `context/MEMORY.md` — the bounded scratchpad (loaded at session start)
- `context/SOUL.md` — agent disposition (loaded at session start)
- `context/memory/INDEX.md` — pointer index for granular fact files
- `context/sessions/` — session log staging area (now.md, today-*.md, recent.md, archive.md)
- `context/transcripts/` — full session transcripts (Stop-hook captures)
- `context/.locks/` — kit-internal lock files + audit log

Plus `.gitignore` updates so `context.local/` and `context/.index/` (regenerable) don't get committed.

## 3. Verify the install

```bash
cmk doctor
```

You'll see something like:

```text
[PASS] HC-1: memsearch installed (semantic search backend)
[FAIL] HC-2: Stop + SessionStart hooks registered
         missing hook references: SessionStart.cmk-inject-context, Stop.cmk-capture-turn, SessionEnd.cmk-compress-session
         → repair: cmk repair --hooks
[FAIL] HC-3: Daily distill is fresh (≤2 days)
         context/sessions/recent.md missing — distill never ran
         → repair: cmk daily-distill
[FAIL] HC-4: Transcripts firing (≤3 days)
         ...
```

That's expected on a fresh install — `cmk doctor` will report several failures until you've held at least one session in Claude Code. Run the repair command for HC-2:

```bash
cmk repair --hooks
```

This writes the kit's canonical hooks into `<repo>/.claude/settings.json`. Re-run `cmk doctor` — HC-2 should now PASS.

## 4. Register the cron jobs (optional but recommended)

```bash
cmk register-crons
```

This registers two jobs with your OS scheduler:

- **daily-distill** at 23:00 daily (compresses today's sessions into a rolling window)
- **weekly-curate** on Sundays at 09:00 (archives old sessions, dedups bullets)

`--dry-run` previews the commands; `--unregister` removes both entries.

If you can't run cron (corporate Windows without Task Scheduler access, restricted CI runners), the kit falls back to lazy-on-read compression triggered by the SessionStart hook. No manual action needed — just skip this step.

## 5. Open a session in Claude Code

Open Claude Code on the project. The SessionStart hook fires; you'll see the kit's snapshot in the conversation context. Have a real conversation — make a decision, set a preference, learn something about your environment.

When you end the conversation (Stop hook fires), the auto-extract subagent reads the turn and silently writes durable facts to `context/MEMORY.md`. No manual action needed.

## 6. Open a second session — verify memory persists

Open Claude Code on the same project again. The SessionStart hook injects the updated MEMORY.md. Ask Claude something that depends on the prior session's context (e.g., "what did we decide about X yesterday?"). Claude answers from the snapshot, not from re-asking you.

## 7. Search accumulated memory

```bash
cmk search "X decision"
```

By default, this runs keyword search via SQLite + FTS5 (Layer 5a). If you've installed Layer 5b (`pip install memsearch[onnx]`), you can also use:

```bash
cmk search "X decision" --mode hybrid
```

Hybrid = keyword + semantic with RRF fusion.

## 8. Common commands

| Command | Purpose |
| --- | --- |
| `cmk doctor` | Full health check (HC-1..HC-9) |
| `cmk search "<query>"` | Search memory (default keyword) |
| `cmk roll --scope now\|today\|recent` | Manually trigger compression |
| `cmk repair --hooks\|--locks\|--index\|--all` | Idempotent self-repair |
| `cmk forget <id>` | Tombstone a fact (preserves audit trail) |
| `cmk import-anthropic-memory --dry-run` | Preview merging Anthropic's native auto-memory |

Full reference: `cmk --help`.

## Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| `cmk: command not found` | Global install not on PATH | `npm install -g @lh8ppl/claude-memory-kit` (re-run); check `npm config get prefix` is on PATH |
| `cmk doctor` shows HC-2 FAIL after install | Settings.json missing kit hooks | `cmk repair --hooks` |
| `cmk doctor` shows HC-4 FAIL ("transcripts not firing") | Project not Claude Code's primary cwd | Reopen the project as primary cwd |
| `cmk search` returns no results | Index never built | `cmk reindex --full` |
| `cmk register-crons` errors on Windows | Task Scheduler permission denied | Run from elevated PowerShell, or use lazy-fallback (skip cron registration entirely) |
| MEMORY.md keeps growing past 2500 chars | Auto-extract not pruning | `cmk roll --scope today` to trigger consolidation |

For complex issues, see [HEALTH-CHECKS.md](HEALTH-CHECKS.md) for per-HC repair paths, and [`docs/journey/v0.1.0-build-log.md`](docs/journey/v0.1.0-build-log.md) for the build's accumulated lessons.

## Next steps

- Read [README.md](README.md) for the architectural overview
- Read [ARCHITECTURE.md](ARCHITECTURE.md) for the data-flow diagram
- Read [`specs/v0.1.0/design.md`](specs/v0.1.0/design.md) for the full design
- Optionally install Layer 5b (`pip install memsearch[onnx]`) to enable semantic search
