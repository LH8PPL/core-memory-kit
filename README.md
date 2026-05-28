# claude-memory-kit

A per-project, in-repo memory system for [Claude Code](https://docs.claude.com/en/docs/claude-code). Fixes Claude's per-session amnesia so you don't have to re-tell the backstory every time you start a new session.

Inspired by [Simon Scrapes' "Master Claude Memory"](https://www.youtube.com/watch?v=rFWxRZ5D-lM) video. Independently converges with [Anthropic's native auto-memory](https://docs.anthropic.com/en/docs/claude-code/auto-memory) (Claude Code v2.1.59+) on the `<type>_<slug>.md` granular pattern.

## Status

**v0.1.0** — released 2026-05-28. Architecture-first first release, ~55 dev days, 42 tasks shipped (45 task ledger; 3 deferred to v0.1.1), 1100+ tests, 8 structural validators, cross-OS CI matrix (Windows + macOS + Linux). See [`docs/journey/v0.1.0-build-log.md`](docs/journey/v0.1.0-build-log.md) for the full narrative.

## What it does

- **Frozen snapshot at session start**: MEMORY.md + USER.md + SOUL.md + INDEX.md + today's session log inject once at first tool call. Claude sees this context every session without you re-telling it.
- **Auto-extract on every assistant turn**: a background `claude --print` subagent reads the turn and saves durable facts (decisions, preferences, environment) to memory. No manual writes needed.
- **`memory-write` skill**: when you say "remember this", "from now on", "we decided", or "forget X", the skill triggers — dedups against existing memory, enforces char caps, writes silently.
- **Per-project, in-repo**: `context/` lives inside your project and travels with `git clone`. Multiple projects each have their own memory. Nothing crosses boundaries unless you promote via `cmk lessons promote`.
- **9 health checks**: `cmk doctor` validates the install, settings.json hook wiring, distill freshness, transcript firing, INDEX consistency, cron registration, Anthropic auto-memory coexistence, and stale lock detection.

## Quickstart (60 seconds)

```bash
# 1. Install the CLI globally (Node 20+)
npm install -g @claude-memory-kit/cli
```

```text
# 2. Inside Claude Code: install the kit as a plugin (registers the hooks)
/plugin marketplace add LH8PPL/claude-memory-kit
/plugin install claude-memory-kit
```

```bash
# 3. Inside a project, scaffold the kit
cd ~/my-project
cmk install

# 4. Register the cron jobs (optional; Layer 6 — falls back to lazy-on-read if not registered)
cmk register-crons

# 5. Verify
cmk doctor
```

Both halves are needed: the CLI scaffolds the project + runs cron; the plugin loads the hooks. Open Claude Code on the project — auto-extract fires on Stop. SessionStart injects the snapshot. `cmk search "<term>"` returns accumulated memory.

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

## Layers (6 total)

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
| `cmk install` | Scaffold `context/` + add `.gitignore` lines + drop CLAUDE.md block |
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

## Health checks (HC-1..HC-9)

`cmk doctor` runs nine checks per session start and reports each as PASS / FAIL / SKIP with a repair command on failure:

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

## Architecture (six layers + cross-cutting)

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

## Credit

- Pattern: Simon Scrapes' [Master Claude Memory](https://www.youtube.com/watch?v=rFWxRZ5D-lM) (the source pattern for layered per-project memory and the frozen-snapshot concept)
- Frozen snapshot: [Hermes Agent](https://github.com/NousResearch/hermes-agent) (the closest production reference architecture; verified char-cap parity)
- Architecture inspiration: [claude-mem](https://github.com/thedotmack/claude-mem), [claude-remember](https://github.com/Digital-Process-Tools/claude-remember), [GBrain](https://github.com/garrytan/gbrain)
- memsearch and the Milvus stack (Layer 5b semantic backend) by [Zilliz](https://github.com/zilliztech/memsearch)
- See [`docs/SOURCES.md`](docs/SOURCES.md) for the complete index of cited sources

## License

MIT — see [LICENSE](LICENSE).
