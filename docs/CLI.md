# `cmk` CLI reference

Complete reference for the `cmk` command (installed by `npm install -g @lh8ppl/claude-memory-kit`). Run `cmk --help` or `cmk <command> --help` for the live version.

Most commands operate on the **project tier** (`<repo>/context/`) by default, using the current working directory as the project root.

---

## Setup & lifecycle

### `cmk install [--force] [--no-hooks]`
Scaffold the kit into the current project: creates the 3-tier `context/` layout, injects `.gitignore` entries, drops the managed CLAUDE.md block, and **wires the 5 lifecycle hooks** into `.claude/settings.json`. Idempotent (re-running skips existing files). Restart Claude Code afterward so hooks load.
- `--force` — allow downgrading an existing newer-version CLAUDE.md block.
- `--no-hooks` — scaffold only; don't touch `.claude/settings.json`.
```bash
cd ~/my-project && cmk install
cmk install --no-hooks      # scaffold-only
```

### `cmk uninstall`
Remove the managed CLAUDE.md kit block (preserves everything else byte-for-byte). Conservative — does not delete `context/`.

### `cmk init-user-tier`
Scaffold the cross-project user tier at `~/.claude-memory-kit/` (honors `$MEMORY_KIT_USER_DIR`). Use on a new machine.

---

## Capture

### `cmk remember <text…> [--trust <level>] [--section <name>]`
Explicitly capture a durable fact to the project `MEMORY.md` (the layer recalled at session start). Routes through the kit's safe write path — **Poison_Guard** (rejects secrets), **home-path abstraction** (`C:\Users\you\…` → `~\…` so a committed fact never leaks your username), **dedup**, and correct provenance. This is the safe alternative to hand-writing files under `context/memory/` (which bypasses all of the above).
- `--trust high|medium|low` — default `high`.
- `--section <name>` — MEMORY.md section, default `Active Threads`.
- `--tier P` — v0.1.0 writes the project tier; `U`/`L` are v0.1.x. For machine-only paths, edit `context.local/machine-paths.md` directly.
```bash
cmk remember "We deploy with Kamal to Hetzner; never to Vercel."
cmk remember "Prefers terse responses, no preamble." --trust high
```
Most capture is automatic (the Stop hook extracts facts each turn) — use `cmk remember` when you want an explicit, immediate write.

---

## Inspect & search

### `cmk search <query…> [flags]`
Search accumulated memory.
- `--mode keyword|semantic|hybrid` — default `keyword` (semantic/hybrid need the Layer 5b memsearch backend).
- `--min-trust low|medium|high` · `--tier U|P|L` · `--since <ISO date>` · `--limit <n>` (default 20) · `--include-tombstoned`.
```bash
cmk search "postgres"
cmk search "deploy steps" --min-trust high --tier P --limit 5
```

### `cmk doctor`
Run the 9 health checks (HC-1..HC-9); reports PASS/FAIL/SKIP with a repair command per failure.
```bash
cmk doctor
```

### `cmk reindex [--boot|--full]`
Rebuild the SQLite/FTS5 search cache (regenerable; never source of truth).
- `--boot` — incremental (changed files only) · `--full` — drop + rebuild.

### `cmk config [--show-origin <key>]` · `cmk config get <key>` · `cmk config set <key> <value>`
Read/write settings; `--show-origin` prints which tier a value came from.

### `cmk view [--port <n>]`
Static markdown viewer (default port 37778). *(Lightweight; full web UI is a v0.2 candidate.)*

---

## Maintenance & repair

### `cmk repair [--hooks|--locks|--index|--all]`
Idempotent self-repair (default `--all` if no flag).
- `--hooks` — re-merge the kit hooks into `.claude/settings.json` (fixes HC-2).
- `--locks` — clear stale locks (>1h). `--index` — `reindex --full`.
```bash
cmk repair --hooks
cmk repair --all
```

### `cmk register-crons [--dry-run] [--unregister]`
Register the daily-distill + weekly-curate jobs with the host scheduler (Linux crontab / macOS launchd / Windows Task Scheduler). Optional — without it, Layer 6 falls back to lazy-on-read compression.

---

## Compression (normally automatic)

### `cmk roll [--scope now|today|recent]`
Manually trigger a compression pass. `now` = compress-session (default), `today` = daily-distill, `recent` = weekly-curate.

These also ship as standalone bins for the scheduler: `cmk-daily-distill`, `cmk-weekly-curate`, `cmk-compress-lazy` (invoked by cron; not typically by hand).

---

## Memory management

### `cmk trust <id> <low|medium|high>`
Override an observation's trust level. IDs come from `cmk search` (e.g. `P-S79MJHFN`).

### `cmk forget <id-or-query> [--yes] [--reason <text>] [--deleted-by <enum>]`
Tombstone a fact (preserves an audit trail). `--yes` required in v0.1.x.
```bash
cmk forget P-S79MJHFN --yes --reason "superseded"
```

### `cmk purge <id> --hard`
Hard-delete an observation (irreversible; `--hard` required).

### `cmk lessons promote <id>`
Promote a project-tier lesson to the cross-project user tier.

### `cmk persona generate`
Synthesize your **cross-project doctrine** ("how you work everywhere") from this project's captured facts right now, instead of waiting for the weekly pass: high-confidence doctrine auto-promotes into the user tier (`~/.claude-memory-kit/`), and lower-confidence candidates are saved to `queues/persona-review.md`. A manual trigger for the pipeline `weekly-curate` runs automatically.

### `cmk persona export <file>` · `cmk persona import <file>`
Carry your cross-project persona across **your own machines**. Two scopes, two transports: *project* memory follows the repo (committed git), but your *persona* (the user tier) follows the **human** — it's machine-local and deliberately kept out of any project, so committing your working-style never leaks it to teammates.

- **`export <file>`** bundles the user tier (the `USER`/`HABITS`/`LESSONS` scratchpads + the `fragments/` fact store + `settings.json` + `queues/`) into one OS-agnostic JSON file. Runtime state (`.locks/`, the `.index/` cache) is never bundled, and the content is already home-path-sanitized + secret-screened at capture time, so the bundle carries no machine paths or usernames.
- **`import <file>`** applies a bundle to this machine's user tier. It **overwrites** (the explicit primitive has no merge), but it backs up any file it replaces to `.import-backups/<timestamp>/` first and is **transactional** — a mid-import failure rolls back fully, never leaving a half-applied persona. It then rebuilds the user-tier search index.

Carry the file via your own private channel (USB / a private git repo / Dropbox). A seamless auto-syncing variant (`cmk persona sync <your-private-git-url>`) is planned. Honors `MEMORY_KIT_USER_DIR` if you point the user tier at a synced folder.

### `cmk queue review` · `cmk queue conflicts`
Walk pending items interactively. `review` = medium-trust auto-extracts (promote/discard/skip). `conflicts` = contradictions vs. existing high-trust facts (keep-old/keep-new/merge-both/skip).

---

## Import & transcripts

### `cmk import-anthropic-memory [--dry-run] [--yes]`
Merge useful bullets from Anthropic's native auto-memory into the project MEMORY.md. `--dry-run` previews; `--yes` applies.

### `cmk disable-native-memory` · `cmk enable-native-memory`
Opt this project out of (or back into) Claude Code's **native** Auto Memory. `disable` writes `autoMemoryEnabled: false` into the committable `.claude/settings.json` (travels with `git clone`) so only the kit's memory runs — avoids the context bloat of both layers injecting at session start. The kit coexists with native memory by default; this is the one-command opt-out (ADR-0011). `enable` reverses it.

### `cmk transcripts extract [flags]`
Extract clean markdown transcripts from `~/.claude/projects/<slug>/<uuid>.jsonl`.
- `--session <uuid-suffix>` · `--slug <slug>` · `--since <YYYY-MM-DD>` · `--output <dir>` · `--include-thinking`.

---

## Advanced

### `cmk mcp serve`
Run the MCP server over stdio (invoked by Claude Code, not by humans) — exposes memory as MCP tools (`mk_search`, `mk_get`, `mk_timeline`, `mk_cite`, `mk_remember`).

### `cmk version` / `cmk --version`
Print the installed kit version.

---

## Hook bins (not run by hand)
`cmk-inject-context` (SessionStart), `cmk-capture-prompt` (UserPromptSubmit), `cmk-observe-edit` (PostToolUse), `cmk-capture-turn` (Stop), `cmk-compress-session` (SessionEnd) — wired into `.claude/settings.json` by `cmk install`; Claude Code invokes them automatically.
