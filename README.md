# claude-memory-kit

[![npm](https://img.shields.io/npm/v/@lh8ppl/claude-memory-kit)](https://www.npmjs.com/package/@lh8ppl/claude-memory-kit) [![CI](https://github.com/LH8PPL/claude-memory-kit/actions/workflows/ci.yml/badge.svg)](https://github.com/LH8PPL/claude-memory-kit/actions/workflows/ci.yml) [![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE) ![Node ≥20](https://img.shields.io/badge/node-%E2%89%A520-brightgreen)

**Persistent, per-project memory for [Claude Code](https://docs.claude.com/en/docs/claude-code) — plain markdown, committed with your code, recalled by meaning.**

Claude forgets everything the moment a session ends — so every new chat, you re-explain who you are, what you're building, and how you like things done. claude-memory-kit fixes that. It quietly remembers your decisions, preferences, and project context and hands them back to Claude at the start of each session, so you never have to re-brief it again. Everything is plain text living inside your project, and it travels with the code (`git clone` brings the memory along).

**Do I need to be a developer to use this?** No. If you can open a project in Claude Code, you're set — you can even let Claude run the setup for you (see [Quickstart](#quickstart)).

> **Status:** `v0.2` is live on npm (provenance-signed). Shipped: **the cross-project persona** (a brand-new project cold-opens already knowing how you work) and **semantic recall** — ask in your own words, get the right memory: **R@5 0.941 / paraphrase recall 1.000** on the kit's [benchmark](#benchmarks), zero API calls, everything local. What changed: [CHANGELOG.md](CHANGELOG.md).

## Contents

- [What it does](#what-it-does)
- [Quickstart](#quickstart)
- [Three-tier model](#three-tier-model)
- [Layers](#layers)
- [CLI](#cli)
- [Benchmarks](#benchmarks)
- [Health checks](#health-checks)
- [Architecture](#architecture)
- [Security](#security)
- [FAQ](#faq)

## What it does

The short version: Claude starts every session already knowing your project, and keeps learning as you work — automatically, no buttons to press. Under the hood:

- **Frozen snapshot at session start**: MEMORY.md + USER.md + SOUL.md + INDEX.md + today's session log inject once at first tool call. Claude sees this context every session without you re-telling it — and the snapshot opens with an **authority instruction** ("when injected memory contradicts your assumptions, injected memory wins"), so the agent leads with its memory instead of re-deriving answers from the code.
- **Auto-extract on every assistant turn**: a background `claude --print` subagent reads the turn and saves durable facts to memory — no manual writes needed. Durable project knowledge (setup/config, conventions, workflows, tool quirks) is saved as a **rich Why/How fact file** (structured, searchable, like a careful hand-written note); lighter signals (corrections, preferences) land as terse `MEMORY.md` bullets. Because this runs automatically, the rich tier is captured even when the model uses Claude Code's built-in memory instead.
- **Explicit capture when you want it**: say "remember this" / "from now on" / "we decided" / "forget X" (the `memory-write` skill), or run **`cmk remember "<fact>"`** — both dedup against existing memory, screen for secrets (Poison_Guard), abstract machine paths to `~`, and write silently with the correct schema. For backtick/quote-heavy rich facts, capture them **shell-safe** as JSON — `cmk remember --from-file fact.json` (or `--json` from stdin) — so the content never touches the shell command line.
- **Claude knows WHEN to recall, not just how**: the auto-invoked **`memory-search` skill** fires on "what did we decide about X" / "have we seen this error before" — and before re-deriving recorded project knowledge from code. It searches the deep archive in a forked side-context (raw results never bloat your conversation) and returns a curated, citation-backed summary. Read-only by contract: the recall path can't mutate memory. A lightweight per-prompt hint keeps this awareness alive mid-session, long after the start-of-session snapshot has scrolled into history.
- **Search your memory + let Claude run every memory op in conversation**: `cmk search "<term>"` does keyword (FTS5) retrieval over facts + scratchpads — and with the optional local embedder installed, **semantic + hybrid recall** (`--mode=semantic|hybrid`): ask in your own words ("where do credentials go") and get the fact even when no keyword matches. Measured **R@5 0.941 / paraphrase 1.000** on the kit's recall benchmark, zero API calls — the embedding model runs locally. `cmk install` **registers the kit's MCP server** and allow-lists its tools, so Claude drives the whole memory surface for you — capture (`mk_remember`, rich Why/How too), recall (`mk_search` / `mk_get` / `mk_timeline` / `mk_cite`), adjust trust (`mk_trust`), promote across projects (`mk_lessons_promote`), forget (`mk_forget` — previews, then deletes on confirm), and clear the review/conflict queues (`mk_queue_list` / `mk_queue_resolve`) — with no per-call prompt and without you ever typing `cmk`. Every MCP tool has a matching `cmk` verb (enforced by a parity guard) and runs the same safe write path.
- **Compression that keeps memory bounded**: session → daily → weekly rollups via a background Haiku pass (cron, or lazy-on-read when no scheduler), so the snapshot stays small as history grows. The session-buffer rollup now also self-heals at **session start**, so your memory stays bounded even if you never cleanly close the window — and a roll never races a concurrent write (the buffer is claimed atomically).
- **Cross-project persona, built automatically and in real time**: when you state "how you work everywhere" (tooling habits, architecture preferences — "I always use pnpm", "from now on, in every project, run the linter first"), the same per-turn auto-extract pass promotes it into your **user tier** (`~/.claude-memory-kit/`) **that turn** — so a brand-new project already knows your style, with no hand-curation and no waiting for a weekly job. It updates itself when your preferences change and never overwrites a rule you wrote by hand; a weekly pass still runs to dedup and catch anything missed.
- **Per-project, in-repo**: `context/` lives inside your project and travels with `git clone`. Multiple projects each have their own memory. Nothing crosses boundaries unless you promote via `cmk lessons promote`.
- **7 health checks**: `cmk doctor` validates hook wiring, distill freshness, transcript firing, INDEX consistency, cron registration, Anthropic auto-memory coexistence, and stale lock detection — each failure comes with its repair command.

## Quickstart

**Pick ONE route. Each is complete on its own** — both wire the same hooks, so running both would double-wire them.

### Route A — npm (recommended)

*Recommended because it gives you the full `cmk` toolset — including `cmk doctor` to confirm it's actually working (plus search, self-repair, and cron) — and it's the most battle-tested path. Not a terminal person? You don't have to be — see the note below.*

```bash
# 1. Install the CLI globally (Node 20+)
npm install -g @lh8ppl/claude-memory-kit

# 2. Inside a project, scaffold + wire hooks in one step
cd ~/my-project
cmk install            # scaffolds context/ + the memory-write + memory-search skills AND wires the hooks into .claude/settings.json

# 3. (optional) Enable semantic recall — ask in your own words, fully local
cmk install --with-semantic   # one-time ~260 MB; flips search to hybrid by default

# 4. (optional) Register cron jobs — Layer 6 falls back to lazy-on-read if skipped
cmk register-crons

# 5. Verify, then restart Claude Code so the new hooks load:
#    inside Claude Code type  /exit  (or /quit), then run  claude  again.
cmk doctor
```

`cmk install` is a complete entry point: it scaffolds `context/`, drops the `memory-write` skill into `.claude/skills/` (committed — it travels with `git clone`), and writes the 5 lifecycle hooks (PATH-resolved, cross-OS) into the project's `.claude/settings.json`. No separate `/plugin` step needed.

Step 3 (cron) is **optional** — skip it and the kit falls back to lazy-on-read compression on its own. For that and every other command — search, self-repair, `cmk persona generate`, native-memory coexistence (`cmk disable-native-memory`), and more — see the **[full CLI reference → `docs/CLI.md`](docs/CLI.md)**.

> **Not comfortable in a terminal?** You don't have to be. Open your project in Claude Code and just say: *"install claude-memory-kit and set it up in this project."* Claude will run the commands above for you — you only approve them. Or skip the terminal entirely with **Route B** below. Either way, **restart Claude Code once** when it's done so the memory turns on — there's no "restart" button: type **`/exit`** in Claude Code, then run **`claude`** again.

### Route B — Claude Code plugin marketplace

Type these slash commands inside a Claude Code session:

```text
/plugin marketplace add LH8PPL/claude-memory-kit
/plugin install claude-memory-kit
/claude-memory-kit:bootstrap        ← scaffolds this project's context/
```

`/claude-memory-kit:bootstrap` runs the bundled bootstrap skill (you can also just ask Claude in plain language: *"set up the memory system here"*). The plugin bundles the hooks + the `bootstrap` and `memory-write` skills, so it's complete on its own. After installing, run **`/reload-plugins`** (or restart with `/exit` then `claude`) to activate the hooks. If you also want the `cmk` CLI for search / doctor / cron, `npm install -g @lh8ppl/claude-memory-kit` adds it — but you don't need it for the plugin to work.

Either way: open Claude Code on the project — auto-extract fires on Stop, SessionStart injects the snapshot, and (with the CLI) `cmk search "<term>"` returns accumulated memory.

> **npm note:** `npm install -g @lh8ppl/claude-memory-kit` installs the CLI + the installer. It is the `cmk install` *subcommand* (not the bare `npm install`) that wires the hooks — mirroring claude-mem's library-vs-installer split.

Full walkthrough: [QUICKSTART.md](QUICKSTART.md). Both routes are cross-OS (Windows / macOS / Linux) — `cmk install` writes PATH-resolved hooks and is verified on all three in CI; you don't need per-OS instructions.

## Three-tier model

| Tier | Location | Scope | What lives here |
| --- | --- | --- | --- |
| **P** (project) | `<repo>/context/` | committed to git, travels with `clone` | Project-specific facts: decisions, file purposes, conventions |
| **L** (local) | `<repo>/context.local/` | gitignored | Per-machine paths: Tesseract install dir, Python version |
| **U** (user) | `~/.claude-memory-kit/` | cross-project per-user | Persona, lessons learned, cross-project preferences |

Most user-facing commands operate on the project tier by default. `cmk install` already scaffolds the user tier (`~/.claude-memory-kit/`) too; `cmk init-user-tier` exists for an explicit user-tier-only re-init.

What `cmk install` drops into your project:

```text
context/
├── MEMORY.md          ← bounded scratchpad, injected every session
├── SOUL.md            ← agent disposition / working style
├── memory/
│   ├── INDEX.md       ← pointer index, walked at session start
│   └── <type>_<slug>.md   ← granular, content-addressed fact files
├── sessions/          ← rolling compression: now → today → recent → archive
├── transcripts/       ← raw Stop-hook session captures
└── .locks/, .index/   ← gitignored runtime (audit log, SQLite cache)

.claude/
├── settings.json      ← the 5 lifecycle hooks (PATH-resolved, cross-OS)
└── skills/
    ├── memory-write/SKILL.md   ← safe capture skill — routes writes through `cmk` (committed, travels with git clone)
    └── memory-search/SKILL.md  ← auto-invoked recall skill — read-only, forked, curated summaries
```

## Layers

| Layer | Module(s) | Required? | Status |
| --- | --- | --- | --- |
| 1 | In-repo location + scaffolding | Yes | ✓ shipped |
| 2 | Granular archive + INDEX.md (typed facts) | Yes | ✓ shipped |
| 3 | Bounded scratchpads (MEMORY.md, USER.md, SOUL.md) | Yes | ✓ shipped |
| 4 | Auto-extract Stop hook + memory-write/memory-search skills | Recommended | ✓ shipped |
| **5a** | **Keyword search (SQLite + FTS5)** | **Optional** | ✓ shipped |
| 5b | Semantic search (embedded vector backend — TBD) | Optional | planned (the `semanticBackend` DI seam is in place) |
| 6 | Cron compression (daily-distill + weekly-curate + lazy fallback) | Optional | ✓ shipped |

Layers 1-3 are pure file ops. Layer 4 makes memory writes automatic. Layer 5a (keyword) ships in every install; Layer 5b (semantic) is sqlite-vec inside the same index + a local ONNX embedder — included, with the embedder as an optional install (see [`specs/design.md`](specs/design.md) §9.3.1 / ADR-0015). Layer 6 keeps the scratchpad from growing stale; if you can't run cron, it falls back to lazy-on-read compression at SessionStart.

See [ARCHITECTURE.md](ARCHITECTURE.md) for the data-flow diagram and [`specs/design.md`](specs/design.md) for the full design.

## CLI

Most-used commands below; **full reference with examples: [`docs/CLI.md`](docs/CLI.md)** (or `cmk --help`). For the tools Claude drives in conversation, see **[`docs/MCP.md`](docs/MCP.md)**.

| Command | Purpose |
| --- | --- |
| `cmk install` | Scaffold `context/` + the `memory-write` skill (`.claude/skills/`) + add `.gitignore` lines + drop CLAUDE.md block + wire hooks into `.claude/settings.json` + register the MCP server (`.mcp.json`) & allow-list `mcp__cmk__*` (complete entry point; `--no-hooks` skips hooks + MCP wiring for scaffold-only) |
| `cmk doctor` | Run HC-1..HC-7 health checks, surface repair commands |
| `cmk repair --hooks` / `--locks` / `--index` / `--all` | Idempotent self-repair |
| `cmk roll --scope now\|today\|recent` | Manually trigger one of the compression pipelines |
| `cmk search "<query>" [--mode keyword\|semantic\|hybrid]` | Search accumulated memory (keyword default; semantic/hybrid via the Layer-5b backend, not yet shipped) |
| `cmk get <id…>` / `cmk timeline <id>` / `cmk cite <id>` / `cmk recent-activity [--window 1h\|24h\|7d]` | Read the index back — full fact bodies + provenance, sequential context around an observation, a canonical citation link, recent changes (the CLI side of the `mk_*` MCP read tools) |
| `cmk trust <id> <low\|medium\|high>` | Override a fact's trust level (audited; the CLI side of `mk_trust`) |
| `cmk daily-distill` / `cmk weekly-curate` | Manually run cron jobs (normally invoked by host scheduler) |
| `cmk persona generate` | Synthesize your cross-project doctrine from this project's captured facts now — promote high-confidence "how I work everywhere" into the user tier, queue the rest to `queues/persona-review.md` (normally automatic; this is the manual trigger) |
| `cmk lessons promote <id> [--to HABITS.md\|USER.md] [--section <title>]` | Carry one project fact into your user tier so it applies on **every** project (defaults to `LESSONS.md`) — routed through the safe path (home-path sanitization + Poison_Guard + dedup + audit). Never hand-edit `~/.claude-memory-kit/` |
| `cmk persona export <file>` | Bundle your cross-project persona (the user tier) into one portable file, to carry to **another of your machines**. The persona stays private — it's never committed to a project |
| `cmk persona import <file>` | Apply a persona bundle (from `cmk persona export`) to this machine's user tier. Overwrites; any file it replaces is backed up first, and the import is transactional (rolls back on failure) |
| `cmk register-crons [--dry-run] [--unregister]` | Register daily + weekly jobs with Linux crontab / macOS launchd / Windows Task Scheduler |
| `cmk forget <id>` | Tombstone a fact — disappears from `cmk search` immediately, no manual reindex (audit trail preserved) |
| `cmk import-anthropic-memory [--dry-run] [--yes]` | Merge useful bullets from Anthropic's native auto-memory into your project MEMORY.md |
| `cmk disable-native-memory` / `cmk enable-native-memory` | Opt this project out of (or back into) Claude Code's _native_ Auto Memory — writes `autoMemoryEnabled` to the committable `.claude/settings.json` (travels with `git clone`). The kit coexists with native memory by default; use this to run one lean layer instead of two (ADR-0011) |
| `cmk transcripts extract --session <uuid> --slug <slug> --since <YYYY-MM-DD>` | Extract clean markdown transcripts from `~/.claude/projects/<slug>/<uuid>.jsonl` |
| `cmk mcp serve` | Run the MCP server over stdio (invoked by Claude Code; not by humans) |

## Benchmarks

Recall quality is **measured, not claimed** — `npm run bench:recall` (in this repo) runs a LongMemEval-style harness over a memory-shaped corpus through the kit's REAL write/index/search paths, reporting R@5 / R@10 / NDCG@10 with a per-question-type breakdown. Raw and reranked pipelines are reported separately.

| pipeline | R@5 | paraphrase recall | API calls |
| --- | --- | --- | --- |
| keyword (FTS5 one-shot) | 0.176 | 0.000 | 0 |
| agentic keyword (iterative + LLM reformulation) | 0.529 | 0.300 | 1/query |
| **semantic (sqlite-vec + local bge-base, the default)** | **0.941** | **1.000** | **0** |

The story behind the numbers: keyword search structurally misses natural-language questions ("where do credentials go" never matches a fact that says "secrets live in 1Password"); iterative keyword search triples recall for free; the embedded semantic backend closes the paraphrase gap entirely. The embedding model was chosen by a measured ladder — the 5×-heavier bge-m3 scored *worse* than bge-base on short memory facts (full data: [ADR-0015](docs/adr/0015-semantic-backend-sqlite-vec-plus-local-onnx-embedder.md)).

## Health checks

`cmk doctor` runs seven checks (HC-1..HC-7) and reports each as PASS / FAIL / SKIP with a repair command on failure:

| ID | Check | Repair |
| --- | --- | --- |
| HC-1 | Stop + SessionStart hooks wired to .claude/settings.json | `cmk repair --hooks` |
| HC-2 | Daily distill is fresh (≤2 days) | `cmk daily-distill` |
| HC-3 | Transcripts firing (≤3 days) | reopen project as primary cwd in Claude Code |
| HC-4 | INDEX.md matches `context/memory/` fact files | `cmk reindex` |
| HC-5 | Cron jobs registered with host scheduler | `cmk register-crons` |
| HC-6 | Native Anthropic Auto Memory status detected | (informational; non-fatal) |
| HC-7 | No stale lock files | platform-aware unlink command |

See [HEALTH-CHECKS.md](HEALTH-CHECKS.md) for the detailed recovery paths.

## Architecture

See [ARCHITECTURE.md](ARCHITECTURE.md) for the data-flow diagram, [`specs/design.md`](specs/design.md) for full design, and [`specs/glossary.md`](specs/glossary.md) for terminology.

## Development

Contributing to claude-memory-kit itself (vs. installing it in your own project)? Tests are wired through npm scripts — **do not** invoke `vitest` directly, the scripts handle Windows `.cmd` shim resolution and suppress the cmd.exe popup that bare `npx` invocations cause.

| Script | When to use |
| --- | --- |
| `npm test` | Single full-suite run with 11 structural validators + 1,500+ tests. Live-Haiku spawn-smokes run by default (requires `claude` on PATH; gracefully skips if absent). |
| `npm run test:file -- <path>` | Iterate on a single test file. Pass `-t "test name"` after the path to target one test. Skips the slow prerun. |
| `npm run test:watch` | Interactive vitest watcher. |
| `npm run stress` | 5x full suite. Gate before opening any PR that touches a spawn boundary, hook handler, or detached child. |
| `npm run lint:test-ids` / `npm run validate:template` | Individual prerun pieces. |

The full test discipline (real-binary spawn smokes, stress-run gate, five-exit-doors framework) is documented in [`specs/design.md` §17](specs/design.md).

CI matrix runs on every PR against Windows / macOS / Linux: see [`.github/workflows/install-matrix.yml`](.github/workflows/install-matrix.yml).

## Security

Every push + PR runs SCA + SAST + secret scanning (the same shape as Artifactory Xray + SonarQube, built from the free GitHub-native/OSS stack):

- **Secrets** — `gitleaks` ([`.github/workflows/security.yml`](.github/workflows/security.yml)) + GitGuardian.
- **Known CVEs / supply chain** — `osv-scanner` + `npm audit` (hard gate on high/critical) + weekly **Dependabot** PRs.
- **SAST** — `CodeQL` ([`.github/workflows/codeql.yml`](.github/workflows/codeql.yml)) on the kit's JavaScript.

Releases publish from CI on a `v*` tag with a **signed npm provenance attestation** ([`.github/workflows/publish.yml`](.github/workflows/publish.yml)). Threat model + responsible-disclosure policy: [`SECURITY.md`](SECURITY.md). Verify what you install:

```bash
npm view @lh8ppl/claude-memory-kit dist.attestations
```

## FAQ

<details>
<summary><b>Does this send my code or memory anywhere?</b></summary>

No silent network calls (NFR-5). Your memory is plain markdown stored locally in your repo. The only outbound requests are the Haiku compression/auto-extract calls the kit makes on your behalf (documented), and nothing leaves unless you commit + push it yourself.
</details>

<details>
<summary><b>How is this different from Anthropic's native auto-memory (Claude Code v2.1.59+)?</b></summary>

They converge on the same granular `<type>_<slug>.md` pattern. The kit adds a three-tier *committed* scope (so memory travels with `git clone`), content-addressed citation IDs, a trust hierarchy + conflict/review queues, provenance on every fact, keyword search, and an MCP server. It also *coexists* with native auto-memory and can pull useful bullets in via `cmk import-anthropic-memory`.
</details>

<details>
<summary><b>How is it different from claude-mem?</b></summary>

claude-mem is global, OS-level memory in an opaque SQLite store you manage across all projects. The kit is per-project *intent* stored as readable markdown committed to your repo — a different design choice (project-scoped + git-portable vs. global + opaque). Both are defensible; pick what fits.
</details>

<details>
<summary><b>What if I can't run cron / a scheduler?</b></summary>

Layer 6 falls back to lazy-on-read compression at SessionStart, so the scratchpad still stays bounded without any scheduler. Cron just makes it proactive instead of on-demand.
</details>

<details>
<summary><b>Is my memory portable to a new machine or teammate?</b></summary>

**Two scopes, two transports.** *Project* memory (`context/`) follows the **repo** — it's committed to git, so `git clone` brings it (and your teammates get it). Your *persona* (the cross-project user tier — `~/.claude-memory-kit/`) follows the **human, not the repo**: it's deliberately machine-local and kept *out* of any project, because committing your working-style would leak it to everyone who clones. So the persona is private by design, and on a new machine it starts fresh.

To carry your persona across **your own** machines, use the explicit portability commands:

```bash
# On machine A:
cmk persona export persona-bundle.json
# carry the file via your own private channel (USB / a private git repo / Dropbox), then on machine B:
cmk persona import persona-bundle.json
```

`import` overwrites the target tier (backing up anything it replaces, and rolling back on failure), then rebuilds the search index. The content is already home-path-sanitized and secret-screened at capture time, so the bundle carries no machine paths or usernames. A seamless auto-syncing variant (`cmk persona sync <your-private-git-url>`) is planned (Task 72.2). **Teammates never share a persona** — each person keeps their own, which is exactly why it's never committed to the project.
</details>

## Acknowledgments

See [`docs/SOURCES.md`](docs/SOURCES.md) for the complete index of cited sources and inspirations.

## License

MIT — see [LICENSE](LICENSE).
