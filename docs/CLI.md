# `cmk` CLI reference

Complete reference for the `cmk` command (installed by `npm install -g @lh8ppl/claude-memory-kit`). Run `cmk --help` or `cmk <command> --help` for the live version.

Most commands operate on the **project tier** (`<repo>/context/`) by default, using the current working directory as the project root.

---

## Setup & lifecycle

### `cmk install [--force] [--no-hooks] [--with-semantic | --no-semantic]`
Scaffold the kit into the current project: creates the 3-tier `context/` layout, injects `.gitignore` entries, drops the managed CLAUDE.md block, and **wires the 5 lifecycle hooks** into `.claude/settings.json`. Idempotent (re-running skips existing files). Restart Claude Code afterward so hooks load.
- `--force` — allow downgrading an existing newer-version CLAUDE.md block.
- `--no-hooks` — scaffold only; don't touch `.claude/settings.json`.
- `--with-semantic` — install the optional local embedder (`npm install -g @huggingface/transformers`, ~260 MB once), pre-warm the model, and set `search.default_mode: hybrid` for this project — bare `cmk search` then recalls by meaning, no flags. `--no-semantic` pins keyword-only.
```bash
cd ~/my-project && cmk install
cmk install --with-semantic # + local semantic recall, hybrid by default
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
- `--tier P` — writes the project tier (default). `U`/`L` are **captured to P with a note** (not a direct write target yet); promote a fact (`cmk lessons promote <id>`) to make it cross-project. For machine-only paths, edit `context.local/machine-paths.md` directly.
```bash
cmk remember "We deploy with Kamal to Hetzner; never to Vercel."
cmk remember "Prefers terse responses, no preamble." --trust high
```
Most capture is automatic (the Stop hook extracts facts each turn) — use `cmk remember` when you want an explicit, immediate write.

---

## Inspect & search

### `cmk search <query…> [flags]`
Search accumulated memory.
- `--mode keyword|semantic|hybrid` — the project default is `keyword`, or `hybrid` after `cmk install --with-semantic` (the `search.default_mode` setting). Semantic/hybrid need the optional local embedder; explicitly requesting them without it exits 2 with the install hint, while a configured default degrades gracefully to keyword.
- `--scope facts|transcripts|decisions` — `facts` (default) searches curated memory; `transcripts` searches the raw session record (verbatim transcripts + compressed session summaries) — the last-resort recall tier; hits are `T:<file>:<line>` locations, and fact-only filters (tier/trust/since) don't apply. `decisions` searches the append-only decision journal (`context/DECISIONS.md`) — use it for decision **history / evolution / "what did we reject"** queries; it returns superseded + retracted decisions the live fact store no longer carries (keyword-only; fact-only filters don't apply).
- `--min-trust low|medium|high` · `--tier U|P|L` · `--since <ISO date>` · `--limit <n>` (default 20) · `--include-tombstoned`.
```bash
cmk search "postgres"
cmk search "deploy steps" --min-trust high --tier P --limit 5
```

### `cmk get <ids…>`
Fetch full observation bodies + provenance by citation ID (parity with the `mk_get` MCP tool). Takes one or more ids from `cmk search` output. **Live facts only** — a forgotten (tombstoned) id returns `not found`. After `cmk forget`, the fact's body persists on disk in `context/memory/archive/tombstones/<id>.md` (the durable recovery artifact); read it there to recover. Automatic recall never resurfaces a forgotten fact by design — forgetting it makes it invisible to the agent, not re-asserted from memory. _(An explicit opt-in `cmk get --include-tombstoned` recovery flag is planned — see RELEASE-PLAN; until then, the archive file is the recovery path.)_
```bash
cmk get P-S79MJHFN
cmk get P-S79MJHFN P-QT4CMNXH      # batch
```

### `cmk timeline <anchor> [--before <n>] [--after <n>]`
Sequential context around an anchor observation — what was captured before and after it, by creation time (`mk_timeline` parity).
- `--before <n>` / `--after <n>` — observations on each side (default 5 each).
```bash
cmk timeline P-S79MJHFN --before 3 --after 3
```

### `cmk cite <id>`
Render the canonical Markdown citation link for an observation (`mk_cite` parity) — paste-ready provenance for docs/PRs.

### `cmk recent-activity [--window 1h|24h|7d] [--limit <n>]`
List recently added observations within a time window (`mk_recent_activity` parity; default window 24h, limit 20). The "what did the kit capture lately?" view.

### `cmk digest`
Print a readable digest of everything in memory (facts grouped by type, with trust + date), AND sync `context/DECISIONS.md` — the **append-only decision journal**. Two surfaces, two lifecycles:
- The **digest** is a *regenerated* snapshot of current knowledge (printed to stdout) — like a rebuilt index, it reflects only what exists now.
- **`context/DECISIONS.md`** is a *committed, append-only* chronological log of every decision (`type: project` facts) and its **Why**. Unlike the digest it is **never regenerated and never rolls**: a superseded or forgotten decision stays in the file, annotated `_(retracted …)_` in place — because the value of a decision log is the trail (what you decided *and* what you moved away from). It travels with `git clone` and shows up in the PR diff that captured the decision.
```bash
cmk digest
```

### `cmk doctor`
Run the 8 health checks (HC-1..HC-8); reports PASS/FAIL/SKIP with a repair command per failure. HC-8 (npm 12 readiness) verifies the native bindings load and emits the exact `--allow-scripts` remediation when npm blocked an install script. The report ends with an informational **memory-health section** (content quality: fact count + trust distribution, old-and-untouched facts, possible duplicate pairs, pending queue items) — read-only, never affects the exit code.
```bash
cmk doctor
```

### `cmk reindex [--boot|--full]`
Rebuild the SQLite/FTS5 search cache (regenerable; never source of truth).
- `--boot` — incremental (changed files only, **and prunes removed files**) · `--full` — drop + rebuild.
- **Rarely needed by hand.** Every read path (`cmk search` / `get` / `timeline` / `cite` / `recent-activity`) reindexes incrementally before reading, and `cmk forget` reindexes in-band — so captures, edits, and deletions all show up in search automatically (Task 110). Reach for this only to force a `--full` rebuild after manual surgery on the markdown.

### `cmk config get <key>` · `cmk config set <key> <value> [--local]` · `cmk config --show-origin <key>`
Read/write kit settings (`context/settings.json`) without hand-editing JSON. Keys are dotted paths (e.g. `search.default_mode`). `get` resolves across tiers (local > project > user) and prints the winning value; `set` writes the project tier by default, or the gitignored local tier with `--local`, preserving every sibling key; `--show-origin` lists every tier that defines the key, marking the winner and the shadowed (the "where did this come from?" surface — the direnv lesson). `true`/`false`/numbers are coerced; everything else stays a string. A key set in no tier exits 2.

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

### `cmk daily-distill` · `cmk weekly-curate`
Run one pipeline pass directly (these are what the scheduler invokes; humans normally use `cmk register-crons` or `cmk roll`). `daily-distill` consolidates the day's session buffers into `today-{date}.md`; `weekly-curate` archives `today-*.md` older than 7 days into `archive.md`, dedups bullets, and rebuilds `recent.md`.

### `cmk compress --lazy`
The lazy-on-read fallback for no-cron environments: checks staleness and delegates to daily-distill / weekly-curate as needed. Typically invoked detached from the SessionStart hook — not by hand. (Bare `cmk compress` without `--lazy` is a stub.)

These also ship as standalone bins for the scheduler: `cmk-daily-distill`, `cmk-weekly-curate`, `cmk-compress-lazy` (invoked by cron; not typically by hand).

---

## Memory management

### `cmk trust <id> <low|medium|high>`
Override an observation's trust level. IDs come from `cmk search` (e.g. `P-S79MJHFN`).

### `cmk forget <id-or-query> [--yes] [--reason <text>] [--deleted-by <enum>]`
Tombstone a fact (preserves an audit trail). `--yes` required. **Disappears from `cmk search` immediately** — forget reindexes in-band, so no manual `cmk reindex` (Task 110). The content stays recoverable via `cmk get <id>` (reads the tombstone archive). Claude can also do this in conversation via the `mk_forget` tool.
```bash
cmk forget P-S79MJHFN --yes --reason "superseded"
```

### `cmk purge <id> --hard`
Hard-delete an observation (irreversible; `--hard` required). **Not yet implemented (stub)** — use `cmk forget` (tombstone, recoverable) for normal deletion.

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

### `cmk import-claude-md [file] [--dry-run] [--yes]`
Onboard from the rules file you already own: parse an existing `CLAUDE.md` (default), `.cursorrules`, `AGENTS.md`, or any rules file into **typed granular facts** (`user` / `feedback` / `project` / `reference`, inferred from the nearest heading). Every candidate goes through the kit's safe write path — Poison_Guard secret screening, home-path sanitization, dedup against existing memory — and lands with `write_source: imported`, `trust: medium`, and real `source_file` / `source_line` provenance. Code fences and the kit's own managed CLAUDE.md block are never imported. `--dry-run` previews the typed proposals; apply requires explicit `--yes`.

### `cmk disable-native-memory` · `cmk enable-native-memory`
Opt this project out of (or back into) Claude Code's **native** Auto Memory. `disable` writes `autoMemoryEnabled: false` into the committable `.claude/settings.json` (travels with `git clone`) so only the kit's memory runs — avoids the context bloat of both layers injecting at session start. The kit coexists with native memory by default; this is the one-command opt-out (ADR-0011). `enable` reverses it.

### `cmk transcripts extract [flags]`
Extract clean markdown transcripts from `~/.claude/projects/<slug>/<uuid>.jsonl`.
- `--session <uuid-suffix>` · `--slug <slug>` · `--since <YYYY-MM-DD>` · `--output <dir>` · `--include-thinking`.

---

## Advanced

### `cmk mcp serve`
Run the MCP server over stdio (invoked by Claude Code, not by humans) — exposes memory as the **11** `mcp__cmk__*` tools: read — `mk_search`, `mk_get`, `mk_timeline`, `mk_cite`, `mk_recent_activity`; write/mutate — `mk_remember`, `mk_trust`, `mk_lessons_promote`, `mk_forget`, `mk_queue_list`, `mk_queue_resolve`. See [`MCP.md`](MCP.md) for the full reference.

### `cmk version` / `cmk --version`
Print the installed kit version.

---

## Hook bins (not run by hand)
`cmk-inject-context` (SessionStart), `cmk-capture-prompt` (UserPromptSubmit), `cmk-observe-edit` (PostToolUse), `cmk-capture-turn` (Stop), `cmk-compress-session` (SessionEnd) — wired into `.claude/settings.json` by `cmk install`; Claude Code invokes them automatically.
