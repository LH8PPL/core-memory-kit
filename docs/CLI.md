# `cmk` CLI reference

Complete reference for the `cmk` command (installed by `npm install -g @lh8ppl/core-memory-kit`). Run `cmk --help` or `cmk <command> --help` for the live version.

Most commands operate on the **project tier** (`<repo>/context/`) by default, using the current working directory as the project root.

---

## Setup & lifecycle

### `cmk install [--force] [--no-hooks] [--with-semantic | --no-semantic] [--ide <agent>] [--backend <agent>]`
Scaffold the kit into the current project: creates the 3-tier `context/` layout, injects `.gitignore` entries, drops the managed CLAUDE.md block, and **wires the lifecycle hooks** into `.claude/settings.json` (the memory hooks + a `PreToolUse` **delete-guardrail** + a `PermissionRequest` **auto-approver** that keeps the kit's own tools/skills prompt-free, below). Idempotent (re-running skips existing files). Restart Claude Code afterward so hooks load.
- `--force` — allow downgrading an existing newer-version CLAUDE.md block.
- `--no-hooks` — scaffold only; don't touch `.claude/settings.json`.
- `--with-semantic` — install the optional local embedder (`npm install -g @huggingface/transformers`, ~260 MB once), pre-warm the model, and set `search.default_mode: hybrid` for this project — bare `cmk search` then recalls by meaning, no flags. `--no-semantic` pins keyword-only.
- `--ide <agent>` — target an agent other than Claude Code (default `claude-code`). `--ide kiro` wires Kiro for **both** the IDE (GUI) and the `kiro-cli` terminal: MCP (`.kiro/settings/mcp.json`, with `autoApprove`), steering (`.kiro/steering/cmk.md`), the memory skills (`.kiro/skills/`), **automatic IDE hooks** (`.kiro/hooks/cmk-{capture,inject,guard,observe}.json` — the Kiro IDE 1.0 v1 format: `Stop` capture + `UserPromptSubmit` recall + `PreToolUse` delete-guard + `PostToolUse` edit-observation — plus legacy `cmk-{capture,inject}.kiro.hook` for older Kiro), a **CLI agent-config** (`~/.kiro/agents/cmk.json` + a `chat.defaultAgent` pointer in `~/.kiro/settings/cli.json`) carrying `agentSpawn`/`userPromptSubmit`/`postToolUse`/`stop`/`preToolUse` hooks, registered as the default agent (guarded — never clobbers an existing default; installs a named `cmk` agent + a notice instead), **trusted-commands** (`kiroAgent.trustedCommands` in `.vscode/settings.json` on the IDE side, the agent-config's `toolsSettings.shell.allowedCommands` on the CLI side, both scoped to the kit's commands only), and on **Kiro IDE 1.0+** a per-workspace **`permissions.yaml`** (`~/.kiro/workspace-roots/<hash>/`) that pre-trusts the kit's hooks, MCP tools, and skills so even the first skill-load runs with no Allow prompt. Both hook surfaces drive the same `cmk hook` dispatcher. Restart Kiro to activate the hooks. `--ide cursor` wires **Cursor**: MCP (`.cursor/mcp.json`), hooks (`.cursor/hooks.json` — `sessionStart` recall + `beforeSubmitPrompt` prompt-capture + `afterAgentResponse` turn-capture + `afterFileEdit` edit-observation + `sessionEnd` compress + `beforeShellExecution` delete-guard, all driving the `cmk cursor-hook` dispatcher), and an always-applied rule (`.cursor/rules/core-memory-kit.mdc`). Restart Cursor to activate. `--ide codex` wires **Codex**: hooks (`.codex/hooks.json` — `SessionStart` recall + `UserPromptSubmit` prompt-capture + `Stop` turn-capture (read from the session's rollout file) + `PostToolUse` edit-observation + `PreToolUse` delete-guard, all driving the `cmk codex-hook` dispatcher), MCP registered via Codex's own `codex mcp add` (the kit never hand-edits your `config.toml`; if the codex CLI is off-PATH — the Desktop-app bundle — the install prints the one-liner to run yourself), and a managed `AGENTS.md` block. **One-time step:** run `/hooks` inside Codex once to trust the kit's hooks (Codex skips untrusted hooks). See [CODEX.md](CODEX.md). `--ide agents-md` emits a managed `AGENTS.md` block for tools that read it.
- `--backend <agent>` — **split-brain backend**: route the AUTOMATIC memory (compression / extraction / persona) through a DIFFERENT agent's CLI than the one you code in — `claude` | `kiro` | `cursor` | `codex`. E.g. `cmk install --backend kiro` while coding in Claude runs the frequent background "janitor" LLM on cheaper `kiro-cli`, keeping your premium subscription for actual coding. Sets the `backend.agent` config key (identical to `cmk config set backend.agent <agent>`); omit it to follow `--ide`. Verify with `cmk config show`.
```bash
cd ~/my-project && cmk install
cmk install --with-semantic # + local semantic recall, hybrid by default
cmk install --backend kiro  # code here, run automatic memory on kiro-cli
cmk install --no-hooks      # scaffold-only
cmk install --ide kiro      # wire Kiro (IDE + kiro-cli) instead of Claude Code
cmk install --ide cursor    # wire Cursor instead of Claude Code
cmk install --ide codex     # wire Codex instead of Claude Code
```

**Memory delete-guardrail.** Beyond the 5 memory hooks, `cmk install` also wires a `PreToolUse` hook (`cmk-guard-memory`) on both agents — Claude Code (matcher `Bash|PowerShell`) and Kiro (`execute_bash`). It inspects every shell command the agent is about to run and **blocks it** (the tool never executes) when it's a destructive command (`rm`, `Remove-Item`, `del`, `git clean`, `git reset --hard`, `find … -delete`, `truncate`, `>`-truncate) aimed at a memory path (`context/`, the `~/.core-memory-kit` persona tier, `MEMORY.md` / `DECISIONS.md`). It's **fail-open** (a broken guard never wedges the session) and intentionally broad (a false block is recoverable by rephrasing; a false allow is the data loss it prevents). `cmk-guard-memory` is an internal hook bin, not a command you run by hand.

### `cmk uninstall [--ide <agent>]`
Remove one agent's kit-managed wiring. **Conservative** — preserves everything outside the kit's markers and **never deletes `context/`** (your memory data).
- (no flag) → removes the **Claude Code** surface: the managed `CLAUDE.md` block (+ hooks).
- `--ide kiro` → removes the **Kiro** surface: the `.kiro/` managed blocks (MCP entry, steering), the `AGENTS.md` managed block, the `.kiro/skills/` + `.kiro/hooks/` files, the kit's `kiroAgent.trustedCommands` entries in `.vscode/settings.json` (your own trusted commands are preserved), the kit's rules in the Kiro IDE 1.0 per-workspace `~/.kiro/workspace-roots/<hash>/permissions.yaml` (your own rules preserved), and the guarded `~/.kiro/agents/cmk.json` CLI agent.
- `--ide cursor` → removes the **Cursor** surface: the kit's events in `.cursor/hooks.json` (your own hooks preserved), the `core-memory-kit` entry in `.cursor/mcp.json` (sibling servers preserved), and the managed block in `.cursor/rules/core-memory-kit.mdc`.
- `--ide codex` → removes the **Codex** surface: the kit's events in `.codex/hooks.json` (your own hooks preserved), the `core-memory-kit` MCP entry via `codex mcp remove` (only when the project shows a kit install — a clean project is a quiet no-op), and the managed `AGENTS.md` block.
- On a dual-agent project, uninstalling one agent leaves the other (and the shared `context/`) working. To remove the memory data, delete `context/` yourself.

### `cmk hook`
`cmk hook <agentSpawn|promptSubmit|stop>` — the **Kiro** hook entrypoint, called by Kiro's IDE + CLI hooks (not by users). `agentSpawn`/`promptSubmit` inject recalled memory into the agent's context; `stop` captures the turn from Kiro's transcript. Always exits 0 so a hook failure never breaks the Kiro session. Wired automatically by `cmk install --ide kiro`.

### `cmk cursor-hook`
The **Cursor** hook entrypoint, called by `.cursor/hooks.json` (not by users). Reads Cursor's JSON payload on stdin and routes on its `hook_event_name`: `sessionStart` injects recalled memory (`additional_context`), `beforeSubmitPrompt` captures the prompt, `afterAgentResponse` captures the turn, `afterFileEdit` records the edit observation, `sessionEnd` runs the compress+persona tasks, `beforeShellExecution` is the memory delete-guardrail (denies via the JSON `permission` field). Always exits 0 so a hook failure never blocks a prompt or shell command. Wired automatically by `cmk install --ide cursor`.

### `cmk codex-hook`
The **Codex** hook entrypoint, called by `.codex/hooks.json` (not by users). Reads Codex's JSON payload on stdin and routes on its `hook_event_name`: `SessionStart` injects recalled memory (`hookSpecificOutput.additionalContext`), `UserPromptSubmit` captures the prompt, `Stop` captures the turn (read from the payload's `transcript_path` rollout file), `PostToolUse` records the edit observation, `PreToolUse` is the memory delete-guardrail (denies via `hookSpecificOutput.permissionDecision`). Always exits 0 so a hook failure never blocks a prompt or tool call. Wired automatically by `cmk install --ide codex` (one-time `/hooks` trust inside Codex required).

### `cmk init-user-tier`
Scaffold the cross-project user tier at `~/.core-memory-kit/` (honors `$MEMORY_KIT_USER_DIR`). Use on a new machine.

---

## Capture

### `cmk remember <text…> [flags]`
Explicitly capture a durable fact. Routes through the kit's safe write path — **Poison_Guard** (rejects secrets), **home-path abstraction** (`C:\Users\you\…` → `~\…` so a committed fact never leaks your username), **dedup**, and correct provenance. This is the safe alternative to hand-writing files under `context/memory/` (which bypasses all of the above).

**Terse form** (no rich flags) → a one-line bullet in the project `MEMORY.md` (the layer recalled at session start):
- `--trust high|medium|low` — default `high`.
- `--section <name>` — MEMORY.md section, default `Active Threads`.
- `--tier P` — writes the project tier (default). `U`/`L` are **captured to P with a note** (not a direct write target yet); promote a fact (`cmk lessons promote <id>`) to make it cross-project. For machine-only paths, edit `context.local/machine-paths.md` directly.

**Rich form** (any of the flags below) → a granular **fact file** under `context/memory/` with full rationale:
- `--why <text>` — the rationale (becomes the **Why:** block).
- `--how <text>` — how to apply it (becomes the **How to apply:** block).
- `--type feedback|project|reference|user` — fact type, default `feedback`.
- `--title <text>` — a short title (also the fact-file slug).
- `--links <a,b>` — related fact names for `[[cross-links]]`.
- `--shape State|Event|Plan|Relationship|Preference|Absence|Timeless` — what KIND of truth the fact asserts, default `State` (Task 66.1).
- `--expires <date>` — a declared validity end (ISO date/datetime, e.g. `2026-08-01`): after it the fact **hides from search** and the weekly sweep **tombstones** it (recoverable; never hard-deleted) (Task 66.3).
- `--from-file <path>` / `--json` — read the whole fact as a JSON object from a file / stdin (shell-safe for backtick/quote-heavy rationale). JSON keys: `text` (required), `why`, `how`, `type`, `title`, `links`, `shape`, `expires`.

```bash
cmk remember "We deploy with Kamal to Hetzner; never to Vercel."
cmk remember "Prefers terse responses, no preamble." --trust high
cmk remember "Demo to the team is on Friday" --shape Plan --expires 2026-07-04
```
Most capture is automatic (the Stop hook extracts facts each turn) — use `cmk remember` when you want an explicit, immediate write.

---

## Inspect & search

### `cmk search <query…> [flags]`
Search accumulated memory.
- `--mode keyword|semantic|hybrid` — the project default is `keyword`, or `hybrid` after `cmk install --with-semantic` (the `search.default_mode` setting). Semantic/hybrid need the optional local embedder; explicitly requesting them without it exits 2 with the install hint, while a configured default degrades gracefully to keyword.
- `--scope facts|transcripts|decisions` — `facts` (default) searches curated memory; `transcripts` searches the raw session record (verbatim transcripts + compressed session summaries) — the last-resort recall tier; hits are `T:<file>:<line>` locations, and fact-only filters (tier/trust/since) don't apply. `decisions` searches the append-only decision journal (`context/DECISIONS.md`) — use it for decision **history / evolution / "what did we reject"** queries; it returns superseded + retracted decisions the live fact store no longer carries (keyword-only; fact-only filters don't apply).
- `--min-trust low|medium|high` · `--tier U|P|L` · `--since <ISO date>` · `--limit <n>` (default 20) · `--include-tombstoned`.
- `--include-expired` — include facts past their declared `expires_at` (hidden from results by default; hidden ≠ deleted — the human-only recovery opt-in, symmetric with tombstones) (Task 66.3).
- **State labels (Task 209, automatic — no flag):** a non-current fact prints its temporal state ahead of the snippet — `[superseded — kept for history]` / `[expired]` / `[retracted]` — and a one-line reading instruction follows the results whenever a labeled row is present. Unlabeled = current. Zero noise when everything is current.
- **Query state-view gate (Task 211, automatic — no flag):** a history/transition question ("what did we use *before* X", "how did Y *change*") is detected by a rule-based classifier and automatically reaches the history — expired facts included, superseded ones listed first (historical view), all labeled. A plain or "current" question behaves exactly as before. `--state-view current|historical|transition|neutral` exists only as an override; when the gate fired, a `state view: …` note follows the results.
```bash
cmk search "postgres"
cmk search "deploy steps" --min-trust high --tier P --limit 5
```

### `cmk get <ids…>`
Fetch full observation bodies + provenance by citation ID (parity with the `mk_get` MCP tool). Takes one or more ids from `cmk search` output. **Live facts only by default** — a forgotten (tombstoned) id returns `not found`. After `cmk forget`, the fact's body persists on disk in `context/memory/archive/tombstones/<id>.md` (the durable recovery artifact). Automatic recall never resurfaces a forgotten fact by design — forgetting it makes it invisible to the agent, not re-asserted from memory.

- `--include-tombstoned` — **human-only recovery opt-in.** On a live miss, also reads the tombstone archive and returns the forgotten fact's body + deletion provenance (`deleted_at` / `deleted_by`), marked `tombstoned: true`. This flag exists ONLY on the CLI; the `mk_get` MCP tool is tombstone-blind, so the AI can never recover a fact you forgot (D-163). A live fact always wins — recovery is a miss-only fallback.

```bash
cmk get P-S79MJHFN
cmk get P-S79MJHFN P-QT4CMNXH      # batch
cmk get P-S79MJHFN --include-tombstoned   # recover a forgotten fact (human-only)
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
Run the health checks (HC-1..HC-11); reports PASS/FAIL/SKIP with a repair command per failure. HC-8 (npm 12 readiness) verifies the native bindings load and emits the exact `--allow-scripts` remediation when npm blocked an install script. HC-9 flags project-scaffold version drift after a global update; HC-10 is an informational scheduled-compaction-liveness heads-up; **HC-11 (backend LLM CLI present)** checks that the CLI of the agent this project runs its automatic engine on (`claude` / `kiro-cli` / `cursor-agent`) is on your PATH — when it's missing, it FAILS with an honest "automatic features degraded, file-only still works" message (never a silent no-op). The report ends with an informational **memory-health section** (content quality: fact count + trust distribution, old-and-untouched facts, possible duplicate pairs, pending queue items) — read-only, never affects the exit code.
```bash
cmk doctor
```

### `cmk reindex [--boot|--full]`
Rebuild the SQLite/FTS5 search cache (regenerable; never source of truth).
- `--boot` — incremental (changed files only, **and prunes removed files**) · `--full` — drop + rebuild.
- **Rarely needed by hand.** Every read path (`cmk search` / `get` / `timeline` / `cite` / `recent-activity`) reindexes incrementally before reading, and `cmk forget` reindexes in-band — so captures, edits, and deletions all show up in search automatically (Task 110). Reach for this only to force a `--full` rebuild after manual surgery on the markdown.

### `cmk config get <key>` · `cmk config set <key> <value> [--local]` · `cmk config show` · `cmk config --show-origin <key>`
Read/write kit settings (`context/settings.json`) without hand-editing JSON. Keys are dotted paths (e.g. `search.default_mode`). `get` resolves across tiers (local > project > user) and prints the winning value; `set` writes the project tier by default, or the gitignored local tier with `--local`, preserving every sibling key; `--show-origin` lists every tier that defines the key, marking the winner and the shadowed (the "where did this come from?" surface — the direnv lesson). `true`/`false`/numbers are coerced; everything else stays a string. A key set in no tier exits 2.

**`cmk config show`** — a one-glance INFORMATIONAL readout of this project's memory setup (distinct from `cmk doctor`, which is a health/pass-fail check): the agent you installed for, the **active backend agent** that runs your automatic memory (and whether it's a `--backend`/`backend.agent` override that differs from the installed-for agent), whether that backend CLI is on your PATH, and the semantic-search mode. This is what makes the split-brain backend override legible — without it, "which agent runs my automatic memory" is invisible. Read-only; never a non-zero exit.

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
Run one pipeline pass directly (these are what the scheduler invokes; humans normally use `cmk register-crons` or `cmk roll`). `daily-distill` consolidates the day's session buffers into `today-{date}.md`; `weekly-curate` archives `today-*.md` older than 7 days into `archive.md`, dedups bullets, and rebuilds `recent.md`. The weekly pass also runs the kit's maintenance sweeps (Task 66, v0.4.4): the **expiry sweep** (facts past their declared `expires_at` are tombstoned — recoverable, never hard-deleted) and the **temporal sweep** (same-subject facts judged in one batched Haiku call; a newer "current state" fact closes the older one's validity window, so stale states stop surfacing — the next session start mentions what was resolved).

### `cmk compress --lazy`
The lazy-on-read fallback for no-cron environments: checks staleness and delegates to daily-distill / weekly-curate as needed. Typically invoked detached from the SessionStart hook — not by hand. (Bare `cmk compress` without `--lazy` is a stub.)

These also ship as standalone bins for the scheduler: `cmk-daily-distill`, `cmk-weekly-curate`, `cmk-compress-lazy` (invoked by cron; not typically by hand).

---

## Memory management

### `cmk trust <id> <low|medium|high>`
Override an observation's trust level. IDs come from `cmk search` (e.g. `P-S79MJHFN`).

### `cmk forget <id-or-query> [--yes] [--reason <text>] [--deleted-by <enum>]`
Tombstone a fact (preserves an audit trail). `--yes` required. **Disappears from `cmk search` immediately** — forget reindexes in-band, so no manual `cmk reindex` (Task 110). The content stays recoverable by a human via `cmk get <id> --include-tombstoned` (reads the tombstone archive) — never by the AI (D-163). Claude can also do this in conversation via the `mk_forget` tool.
```bash
cmk forget P-S79MJHFN --yes --reason "superseded"
```

### `cmk purge <id> --hard`
Hard-delete an observation (irreversible; `--hard` required). **Not yet implemented (stub)** — use `cmk forget` (tombstone, recoverable) for normal deletion.

### `cmk lessons promote <id> [--to <file>] [--section <name>]`

Promote a project-tier fact to the cross-project user tier. By default the fact is **topic-routed by content** — an identity/preference lands in `USER.md`, a working-style rule in `HABITS.md`, a cross-project lesson in `LESSONS.md` — so promotes spread across the persona instead of piling into one section. (Offline + deterministic; no LLM call.)

- `--to <USER.md|HABITS.md|LESSONS.md>` — force the target file (overrides the router).
- `--section <name>` — force the landing section. With `--to`, it's that file's section; **without `--to`, the section applies to the routed file** (so an unusual `--section X` with no `--to` can create section `X` inside whichever file the content routes to).

### `cmk persona generate`
Synthesize your **cross-project doctrine** ("how you work everywhere") from this project's captured facts right now, instead of waiting for the weekly pass: high-confidence doctrine auto-promotes into the user tier (`~/.core-memory-kit/`), and lower-confidence candidates are saved to `queues/persona-review.md`. A manual trigger for the pipeline `weekly-curate` runs automatically.

### `cmk persona export <file>` · `cmk persona import <file>`
Carry your cross-project persona across **your own machines**. Two scopes, two transports: *project* memory follows the repo (committed git), but your *persona* (the user tier) follows the **human** — it's machine-local and deliberately kept out of any project, so committing your working-style never leaks it to teammates.

- **`export <file>`** bundles the user tier (the `USER`/`HABITS`/`LESSONS` scratchpads + the `fragments/` fact store + `settings.json` + `queues/`) into one OS-agnostic JSON file. Runtime state (`.locks/`, the `.index/` cache) is never bundled, and the content is already home-path-sanitized + secret-screened at capture time, so the bundle carries no machine paths or usernames.
- **`import <file>`** applies a bundle to this machine's user tier. It **overwrites** (the explicit primitive has no merge), but it backs up any file it replaces to `.import-backups/<timestamp>/` first and is **transactional** — a mid-import failure rolls back fully, never leaving a half-applied persona. It then rebuilds the user-tier search index.

Carry the file via your own private channel (USB / a private git repo / Dropbox). A seamless auto-syncing variant (`cmk persona sync <your-private-git-url>`) is planned. Honors `MEMORY_KIT_USER_DIR` if you point the user tier at a synced folder.

### `cmk stats memory-health [--window <days>]`
The memory PROCESS behavioral dashboard (Task 212 — AutoMem's indicator set). Aggregates logs the kit already writes (recall.log / audit.log / truncation.log) into five metrics with trend arrows vs the prior window: **writes-per-search** (falling = healthier consult-before-write), **empty-search rate** (with the recovered-by-retry split), **redundant-write rate** (writes that later dedup-merged / conflict-queued / superseded), **repeated identical searches** (the "stuck" signal), and **snapshot cap pressure** (truncations + dropped sections). REPORT-ONLY — no thresholds, no pass/fail, no exit-code effect (observe before alarming); these are also the tuning numbers for the outcome-learning search blend. `--window 7|30` (default 7). Content quality (stale facts, duplicates, pending queues) lives in `cmk doctor`, not here.

### `cmk queue review` · `cmk queue conflicts` · `cmk queue prune`
Walk pending items interactively. `review` = medium-trust auto-extracts (promote/discard/skip). `conflicts` = contradictions vs. existing high-trust facts (keep-old/keep-new/merge-both/skip). `prune` = **survival-gate candidates** (Task 194): facts whose evolved `trust_score` sat at the floor and *still* took a failing outcome signal — the learn-loop's "this memory keeps not working" verdict, surfaced for YOUR decision, never auto-deleted. Options: `convert` (retain it as a typed **anti-pattern** — reframed `⚠️ AVOID …`, kept searchable + injected as a warning), `forget` (tombstone through the safe path), `keep` (you vouch for it — dismissed, never re-asked), `skip`. Candidates arrive automatically (no command needed); this verb is only the resolution step.

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
