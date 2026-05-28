# Changelog

All notable changes to claude-memory-kit are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] — 2026-05-28

The first public release of claude-memory-kit — a per-project, in-repo memory system for Claude Code that fixes per-session amnesia by storing durable facts as markdown inside `<repo>/context/` (committed) + `<repo>/context.local/` (gitignored) + `~/.claude-memory-kit/` (user-tier). Architecture-first first release: ~55 dev days, 42 tasks shipped (45-task ledger; 3 deferred to v0.1.1).

### Added

#### Foundation (Layers 1–3)

- **3-tier memory model** (P/L/U): project tier in `<repo>/context/` (committed), local tier in `<repo>/context.local/` (gitignored), user tier in `~/.claude-memory-kit/` (cross-project per-user)
- **`cmk install`** scaffolds the 3-tier layout into a project, drops a managed CLAUDE.md block, and adds `.gitignore` entries for regenerable + machine-local state
- **Granular fact archive** with content-addressed 8-char base32 IDs (Node ⇔ Python parity package `@cmk/canonicalize`); INDEX.md pointer file walked at session start
- **Bounded scratchpads** (MEMORY.md / USER.md / SOUL.md) with character caps + consolidation discipline
- **Frontmatter-everything provenance**: every observation carries `created_at`, `source_file`, `source_sha1`, `write_source`, `trust` fields enforced by `writeFact()` boundary

#### Auto-extract + Hook chain (Layer 4)

- **`cmk-inject-context`** SessionStart hook composes a Frozen snapshot ≤ 13KB (NFR-1) across the 3 tiers with cross-tier ID dedup and budget-driven truncation
- **`cmk-capture-turn`** Stop hook detached-spawns the auto-extract subagent against the bi-turn temp file (user + assistant exchanges)
- **`cmk-capture-prompt`** UserPromptSubmit + **`cmk-observe-edit`** PostToolUse(Write/Edit) hooks capture intent + structural-edit signals
- **`cmk-compress-session`** SessionEnd hook compresses `now.md` → `today-{date}.md` via Haiku with 50s timeout + 120s shared cooldown
- **`memory-write` skill** for explicit user phrases ("remember this", "from now on", "we decided", "forget about X")
- **Trust hierarchy** (high/medium/low) with auto-extract routing: high → MEMORY.md, medium → `queues/review.md`, low → discarded with audit
- **Poison guard** regex catalog (PG-001…PG-013) gates auto-extract writes against secrets + prompt-injection patterns
- **Conflict queue** when an extracted fact contradicts an existing trust:high observation; resolved via `cmk queue conflicts`
- **Review queue** for medium-trust auto-extracts; resolved via `cmk queue review`

#### Search (Layer 5a)

- **SQLite + FTS5 keyword index** at `context/.index/memory.db` (regenerable; never source of truth)
- **chokidar runtime watcher** keeps the index in sync with markdown edits
- **`cmk reindex` + `cmk reindex --full`** boot + drop-and-rebuild paths
- **`cmk search "<query>"`** with BM25 + RRF hybrid mode (semantic backend deferred to v0.1.x)
- **MCP server** (`cmk mcp serve`) exposes 6 tools to Claude Code: `mk_search`, `mk_get`, `mk_timeline`, `mk_cite`, `mk_remember`, `mk_recent_activity`

#### Cron compression (Layer 6)

- **`cmk daily-distill`** rolls up the last 7 days of `today-*.md` into `recent.md`
- **`cmk weekly-curate`** archives `today-*.md` > 7 days into `archive.md` with cross-day bullet dedup via canonicalize primitive
- **`cmk register-crons`** registers both jobs with the host scheduler (Linux crontab pipe-pattern, macOS launchd `~/Library/LaunchAgents/`, Windows Task Scheduler) — emits absolute paths to dodge cron's restricted PATH
- **`cmk compress --lazy`** fallback for no-cron environments; SessionStart hook detached-spawns it on staleness detection
- **Cron-detection sentinel** (`context/.locks/cron-registered`) coordinates lazy-fallback with cron-active mode

#### Cross-cutting

- **`cmk doctor`** runs HC-1..HC-9 with structured report + repair commands (exit 0 all-pass, 1 some-fail, 2 error)
- **`cmk repair --hooks` / `--locks` / `--index` / `--all`** idempotent self-repair surfaces
- **`cmk roll --scope now|today|recent`** manually trigger any compression pipeline
- **`cmk import-anthropic-memory`** merges bullets from `~/.claude/projects/<slug>/memory/MEMORY.md` into project MEMORY.md
- **`cmk transcripts extract`** filters Claude Code session jsonls into clean markdown corpora
- **`cmk forget <id>`** tombstones a fact (audit-preserved, not deleted)
- **`cmk lessons promote <id>`** copies a project-tier fact to the user tier
- **Cross-OS install CI matrix** (`.github/workflows/install-matrix.yml`) validates `cmk install` produces byte-identical scaffolds on Windows / macOS / Linux

#### Quality + Discipline

- **1100+ tests** across 57 test files spanning unit, integration, and live-Haiku spawn-smoke layers
- **8 structural validators** running as `npm test` prerun: test-ids alphabet, template scaffold cap-coordination, exit-doors headers, internal references, spawn discipline, numbering gaps, composition addressing, platform-commands cross-OS
- **Two-pass code-review discipline** (self + code-review-excellence skill) on every PR — empirically every PR in the autopilot run had at least one skill-review-only catch
- **Composition verification** rule with 7 documented instances of the cross-module gap class
- **Stress-test gate** (5x full suite) before any PR touching spawn boundaries, hook handlers, or detached children
- **Decision-trail preservation** rule: documented plans are appended-to, not substituted (the Task 33 Python → Node pivot is the canonical precedent)

### Deferred to v0.1.1

- **Task 45 — Auto-persona generation**: persona candidate surfacing + `cmk persona accept/reject` subcommands + auto-apply mode + conflict-with-hand-curated handling. Originally tail-appended as a v0.1.0 release blocker on 2026-05-24; re-prioritized to v0.1.1 on 2026-05-28 per the autopilot sequencing. Forward-compat seams (Task 12 scratchpad + Task 22 compression + Task 23 auto-extract) are all in place.
- **Layer 5b — Semantic search**: memsearch + ONNX BGE-M3 backend. Surface seam in place via the `CompressorBackend` interface (ADR-0008) + `SEMANTIC_UNAVAILABLE` error category. Install via `pip install memsearch[onnx]` post-v0.1.0 unlocks `cmk search --mode=semantic` and `--mode=hybrid`.
- **Tasks 46-48** (added 2026-05-28 after research into other products' install-time consent patterns): `cmk install --with-semantic` opt-in semantic-backend bootstrap, `cmk doctor --repair` prompt-then-install, NFR promotion for the ask-before-install rule.
- **Live end-to-end acceptance test on a real project**: gate moved from Task 42 (pre-release) to Task 44 (post-release verification) per the autopilot sequencing.

### Known limitations (documented in design §15 trade-offs)

- Provenance frontmatter adds ~150 bytes per bullet (acceptable; preserves full audit trail)
- Token budget at session start is ~20-35 KB (higher than ideal but well inside Claude's 200K context)
- Cross-project facts require explicit `cmk lessons promote` (cross-project search is v0.2)
- Markdown-as-source / SQLite-as-cache requires regeneration on schema changes (simpler than DB-as-source)
- 8 v0.1.x candidates documented inline in design.md §16

### Acknowledgements

- Pattern source: Simon Scrapes' [Master Claude Memory](https://www.youtube.com/watch?v=rFWxRZ5D-lM)
- Closest production reference: [Hermes Agent](https://github.com/NousResearch/hermes-agent) (verified character-cap parity)
- Architectural inspiration: [claude-mem](https://github.com/thedotmack/claude-mem), [claude-remember](https://github.com/Digital-Process-Tools/claude-remember), [GBrain](https://github.com/garrytan/gbrain)
- Convergence with Anthropic's native auto-memory (Claude Code v2.1.59+) on the `<type>_<slug>.md` granular pattern
- Test discipline (five exit doors) from [Yoni Goldberg's nodejs-testing-best-practices](https://github.com/goldbergyoni/nodejs-testing-best-practices)

[0.1.0]: https://github.com/LH8PPL/claude-memory-kit/releases/tag/v0.1.0
