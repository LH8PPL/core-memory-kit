# claude-memory-kit

[![npm](https://img.shields.io/npm/v/@lh8ppl/claude-memory-kit)](https://www.npmjs.com/package/@lh8ppl/claude-memory-kit) [![CI](https://github.com/LH8PPL/claude-memory-kit/actions/workflows/ci.yml/badge.svg)](https://github.com/LH8PPL/claude-memory-kit/actions/workflows/ci.yml) [![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE) ![Node ≥20](https://img.shields.io/badge/node-%E2%89%A520-brightgreen)

**Persistent, per-project memory for [Claude Code](https://docs.claude.com/en/docs/claude-code).**

Claude forgets everything the moment a session ends — so every new chat, you re-explain who you are, what you're building, and how you like things done. claude-memory-kit fixes that. It quietly remembers your decisions, preferences, and project context and hands them back to Claude at the start of each session, so you never have to re-brief it again. Everything is plain text living inside your project, and it travels with the code (`git clone` brings the memory along).

**Do I need to be a developer to use this?** No. If you can open a project in Claude Code, you're set — you can even let Claude run the setup for you (see [Quickstart](#quickstart)).

> **Status:** `v0.1.0` is on npm; `v0.1.1` (one-step install + CI security & signed provenance) publishes shortly. What changed: [CHANGELOG.md](CHANGELOG.md).

## Contents

- [What it does](#what-it-does)
- [Quickstart](#quickstart)
- [Install guides (per OS)](#os-specific-install-guides)
- [Three-tier model](#three-tier-model)
- [Layers](#layers)
- [CLI](#cli)
- [Health checks](#health-checks)
- [Architecture](#architecture)
- [Security](#security)
- [FAQ](#faq)

## What it does

The short version: Claude starts every session already knowing your project, and keeps learning as you work — automatically, no buttons to press. Under the hood:

- **Frozen snapshot at session start**: MEMORY.md + USER.md + SOUL.md + INDEX.md + today's session log inject once at first tool call. Claude sees this context every session without you re-telling it.
- **Auto-extract on every assistant turn**: a background `claude --print` subagent reads the turn and saves durable facts (decisions, preferences, environment) to memory. No manual writes needed.
- **`memory-write` skill**: when you say "remember this", "from now on", "we decided", or "forget X", the skill triggers — dedups against existing memory, enforces char caps, writes silently.
- **Per-project, in-repo**: `context/` lives inside your project and travels with `git clone`. Multiple projects each have their own memory. Nothing crosses boundaries unless you promote via `cmk lessons promote`.
- **9 health checks**: `cmk doctor` validates the install, settings.json hook wiring, distill freshness, transcript firing, INDEX consistency, cron registration, Anthropic auto-memory coexistence, and stale lock detection.

## Quickstart

**Pick ONE route. Each is complete on its own** — both wire the same hooks, so running both would double-wire them.

### Route A — npm (recommended)

*Recommended because it gives you the full `cmk` toolset — including `cmk doctor` to confirm it's actually working (plus search, self-repair, and cron) — and it's the most battle-tested path. Not a terminal person? You don't have to be — see the note below.*

```bash
# 1. Install the CLI globally (Node 20+)
npm install -g @lh8ppl/claude-memory-kit

# 2. Inside a project, scaffold + wire hooks in one step
cd ~/my-project
cmk install            # scaffolds context/ AND wires the hooks into .claude/settings.json

# 3. (optional) Register cron jobs — Layer 6 falls back to lazy-on-read if skipped
cmk register-crons

# 4. Verify, then restart Claude Code
cmk doctor
```

`cmk install` is a complete entry point: it scaffolds `context/` and writes the 5 lifecycle hooks (PATH-resolved, cross-OS) into the project's `.claude/settings.json`. No separate `/plugin` step needed.

> **Not comfortable in a terminal?** You don't have to be. Open your project in Claude Code and just say: *"install claude-memory-kit and set it up in this project."* Claude will run the commands above for you — you only approve them. Or skip the terminal entirely with **Route B** below. Either way, **restart Claude Code once** when it's done so the memory turns on.

### Route B — Claude Code plugin marketplace

Type these slash commands inside a Claude Code session:

```text
/plugin marketplace add LH8PPL/claude-memory-kit
/plugin install claude-memory-kit
/claude-memory-kit:bootstrap        ← scaffolds this project's context/
```

`/claude-memory-kit:bootstrap` runs the bundled bootstrap skill (you can also just ask Claude in plain language: *"set up the memory system here"*). The plugin bundles the hooks + the `bootstrap` and `memory-write` skills, so it's complete on its own. If you also want the `cmk` CLI for search / doctor / cron, `npm install -g @lh8ppl/claude-memory-kit` adds it — but you don't need it for the plugin to work.

Either way: open Claude Code on the project — auto-extract fires on Stop, SessionStart injects the snapshot, and (with the CLI) `cmk search "<term>"` returns accumulated memory.

> **npm note:** `npm install -g @lh8ppl/claude-memory-kit` installs the CLI + the installer. It is the `cmk install` *subcommand* (not the bare `npm install`) that wires the hooks — mirroring claude-mem's library-vs-installer split.

Full walkthrough: [QUICKSTART.md](QUICKSTART.md).

## OS-specific install guides

- [INSTALL-linux.md](INSTALL-linux.md) — Node via NodeSource, optional Docker for Layer 5b
- [INSTALL-macos.md](INSTALL-macos.md) — Homebrew, native launchd cron, milvus-lite (no Docker needed)
- [INSTALL-windows.md](INSTALL-windows.md) — winget, Task Scheduler, optional Docker Desktop for Layer 5b

## Three-tier model

| Tier | Location | Scope | What lives here |
| --- | --- | --- | --- |
| **P** (project) | `<repo>/context/` | committed to git, travels with `clone` | Project-specific facts: decisions, file purposes, conventions |
| **L** (local) | `<repo>/context.local/` | gitignored | Per-machine paths: Tesseract install dir, Python version |
| **U** (user) | `~/.claude-memory-kit/` | cross-project per-user | Persona, lessons learned, cross-project preferences |

Most user-facing commands operate on the project tier by default. `cmk init-user-tier` scaffolds the U tier on a new machine.

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
```

## Layers

| Layer | Module(s) | Required? | Status |
| --- | --- | --- | --- |
| 1 | In-repo location + scaffolding | Yes | ✓ shipped |
| 2 | Granular archive + INDEX.md (typed facts) | Yes | ✓ shipped |
| 3 | Bounded scratchpads (MEMORY.md, USER.md, SOUL.md) | Yes | ✓ shipped |
| 4 | Auto-extract Stop hook + memory-write skill | Recommended | ✓ shipped |
| **5a** | **Keyword search (SQLite + FTS5)** | **Optional** | ✓ shipped |
| 5b | Semantic search (memsearch + ONNX BGE-M3) | Optional | v0.1.x (forward-compat seam in place) |
| 6 | Cron compression (daily-distill + weekly-curate + lazy fallback) | Optional | ✓ shipped |

Layers 1-3 are pure file ops. Layer 4 makes memory writes automatic. Layer 5a (keyword) ships in v0.1.0; Layer 5b (semantic) plugs in via the existing `CompressorBackend` seam without breaking changes. Layer 6 keeps the scratchpad from growing stale; if you can't run cron, it falls back to lazy-on-read compression at SessionStart.

See [ARCHITECTURE.md](ARCHITECTURE.md) for the data-flow diagram and [`specs/v0.1.0/design.md`](specs/v0.1.0/design.md) for the full design.

## CLI

Most-used commands (full list via `cmk --help`):

| Command | Purpose |
| --- | --- |
| `cmk install` | Scaffold `context/` + add `.gitignore` lines + drop CLAUDE.md block + wire hooks into `.claude/settings.json` (complete entry point; `--no-hooks` for scaffold-only) |
| `cmk doctor` | Run HC-1..HC-9 health checks, surface repair commands |
| `cmk repair --hooks` / `--locks` / `--index` / `--all` | Idempotent self-repair |
| `cmk roll --scope now\|today\|recent` | Manually trigger one of the compression pipelines |
| `cmk search "<query>" [--mode keyword\|semantic\|hybrid]` | Search accumulated memory (keyword default; semantic via Layer 5b) |
| `cmk daily-distill` / `cmk weekly-curate` | Manually run cron jobs (normally invoked by host scheduler) |
| `cmk register-crons [--dry-run] [--unregister]` | Register daily + weekly jobs with Linux crontab / macOS launchd / Windows Task Scheduler |
| `cmk forget <id>` | Tombstone a fact (preserves audit trail) |
| `cmk import-anthropic-memory [--dry-run] [--yes]` | Merge useful bullets from Anthropic's native auto-memory into your project MEMORY.md |
| `cmk transcripts extract --session <uuid> --slug <slug> --since <YYYY-MM-DD>` | Extract clean markdown transcripts from `~/.claude/projects/<slug>/<uuid>.jsonl` |
| `cmk mcp serve` | Run the MCP server over stdio (invoked by Claude Code; not by humans) |

## Health checks

`cmk doctor` runs nine checks (HC-1..HC-9) and reports each as PASS / FAIL / SKIP with a repair command on failure:

| ID | Check | Repair |
| --- | --- | --- |
| HC-1 | memsearch installed (Layer 5b semantic backend) | `pip install memsearch[onnx]` — REQUIRES INSTALL (v0.1.0 doesn't auto-install per design §14) |
| HC-2 | Stop + SessionStart hooks wired to .claude/settings.json | `cmk repair --hooks` |
| HC-3 | Daily distill is fresh (≤2 days) | `cmk daily-distill` |
| HC-4 | Transcripts firing (≤3 days) | reopen project as primary cwd in Claude Code |
| HC-5 | INDEX.md matches `context/memory/` fact files | `cmk reindex` |
| HC-6 | Cron jobs registered with host scheduler | `cmk register-crons` |
| HC-7 | memsearch backend reachable | (depends on HC-1) |
| HC-8 | Native Anthropic Auto Memory status detected | (informational; non-fatal) |
| HC-9 | No stale lock files | platform-aware unlink command |

See [HEALTH-CHECKS.md](HEALTH-CHECKS.md) for the detailed recovery paths.

## Architecture

See [ARCHITECTURE.md](ARCHITECTURE.md) for the data-flow diagram, [`specs/v0.1.0/design.md`](specs/v0.1.0/design.md) for full design, and [`specs/v0.1.0/glossary.md`](specs/v0.1.0/glossary.md) for terminology.

## Development

Contributing to claude-memory-kit itself (vs. installing it in your own project)? Tests are wired through npm scripts — **do not** invoke `vitest` directly, the scripts handle Windows `.cmd` shim resolution and suppress the cmd.exe popup that bare `npx` invocations cause.

| Script | When to use |
| --- | --- |
| `npm test` | Single full-suite run with 8 structural validators + 1100+ tests. Live-Haiku spawn-smokes run by default (requires `claude` on PATH; gracefully skips if absent). |
| `npm run test:file -- <path>` | Iterate on a single test file. Pass `-t "test name"` after the path to target one test. Skips the slow prerun. |
| `npm run test:watch` | Interactive vitest watcher. |
| `npm run stress` | 5x full suite. Gate before opening any PR that touches a spawn boundary, hook handler, or detached child. |
| `npm run lint:test-ids` / `npm run validate:template` | Individual prerun pieces. |

The full test discipline (real-binary spawn smokes, stress-run gate, five-exit-doors framework) is documented in [`specs/v0.1.0/design.md` §17](specs/v0.1.0/design.md).

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

Project memory (`context/`) is committed to git — clone the repo and it's there. Cross-project user-tier memory lives in `~/.claude-memory-kit/`; run `cmk init-user-tier` to scaffold it on a new machine.
</details>

## Acknowledgments

See [`docs/SOURCES.md`](docs/SOURCES.md) for the complete index of cited sources and inspirations.

## License

MIT — see [LICENSE](LICENSE).
