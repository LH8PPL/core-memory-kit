# Changelog

All notable changes to claude-memory-kit are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

<!-- New user-facing capabilities land here in the same PR that ships them (CLAUDE.md "Document user-facing capabilities" rule). -->

### Changed

- **The cold-open now keeps your highest-value memory, not whatever happens to be first in the file (Task 93).** When a memory tier is too big to inject whole at session start, the kit used to drop whole sections from the *end* of the file — so a high-trust rule in a late section could be cut while lower-value earlier content survived, purely by position. Now it drops the **lowest-value section first** (by trust, then recency), so your most important and most recent rules are the ones that reach a fresh session. Behavior is unchanged when memory fits or carries no trust metadata; the overflow that doesn't get injected stays searchable on disk.
- **Memory now self-trims at the end of every session, not just when you write (Task 94.3).** Graduation — moving a scratchpad's overflow into the searchable fact store so the injected slice stays under its load-cap — used to fire only when a new capture pushed a file over the cap. Now a proactive sweep runs at session end across all your fact-bearing scratchpads (project `MEMORY.md`/`SOUL.md` + the user-tier persona `USER.md`/`HABITS.md`/`LESSONS.md`), so a file that drifts over cap between sessions, or whose bullets simply aged past the staleness window, gets trimmed before the next session starts. Overflow is **graduated** (high-trust → fact store, recoverable + searchable) or **archived** (stale low/medium → `memory/archive/`), never silently dropped — the never-lose invariant. The machine-local config tier is left untouched.

## [0.2.0] — 2026-06-04

**The wedge** — your cross-project coding persona + project memory, committed to git and portable, so a brand-new project cold-opens already knowing how you work. Plus automatic capture, self-curating memory, and "Claude stays consistent."

### Added

- **`cmk install` now scaffolds the `memory-write` skill into your project (Task 69).** Both delivery routes — the npm `cmk install` and the Claude Code plugin — now ship the same Claude Code skill at `.claude/skills/memory-write/`, so it travels with `git clone`. The skill is what makes explicit capture work: when you say "remember this", "from now on…", "I prefer…", or "we decided…", Claude saves it through `cmk remember` (the safe path — Poison_Guard secret-screen, home-path sanitization, dedup, audit). A drift guard (`validate-skill-sources.mjs`, run on every test) keeps the two routes byte-identical.
- **`cmk lessons promote <id>` — carry a lesson across all your projects, the safe way (Task 76).** This is the explicit half of the wedge: take a fact you captured in one project and promote it into your user tier (`~/.claude-memory-kit/`) so it applies on **every** project. Defaults to `LESSONS.md`; `--to HABITS.md`/`USER.md` and `--section` route it where you want. The promotion runs through the same safe path as auto-capture — home-path sanitization, Poison_Guard secret-screen, dedup, and an audit entry — so you never have to (and never should) hand-edit the user-tier files. Before this the command was a stub, which is exactly what tempted an unsafe manual edit.
- **Cross-project memory now fills in real time, not weekly (Task 61).** Auto-persona used to promote your cross-project doctrine to the user tier only on the *weekly* maintenance pass — so "Claude knows how I work in every project" could lag up to 7 days, invisible in a short trial. Now the same per-turn auto-extract pass that captures project facts **also promotes cross-project doctrine to the user tier the moment you state it** — no extra LLM call, no waiting. The weekly pass stays on as a dedup/catch-miss janitor. (A turn that is *only* cross-project doctrine — "from now on, in every project, …" — still lands the promotion that turn.)
- **Auto-persona — The user tier fills itself (Task 45).** The weekly maintenance pass now synthesizes your **cross-project doctrine** ("how I work everywhere" — tooling habits, architecture preferences) from a project's captured facts and **auto-promotes it into the user tier** (`~/.claude-memory-kit/`) at `trust: medium` — no manual step. It auto-supersedes a stale persona fact when an updated one arrives, and never overwrites a `trust: high` hand-curated entry (those stage in the conflict queue). Fixes the self-test gap where cross-project preferences were captured but stranded in the project tier, leaving the cross-project memory empty.
- **`cmk disable-native-memory` / `cmk enable-native-memory` — coexist with Claude Code's native Auto Memory, your choice (Task 60, ADR-0011).** Claude Code ships its own Auto Memory (ON by default) that writes the same kind of files the kit does, so with both running you get two memory layers injected at session start (context bloat). The kit now **coexists by default and never touches your setting** — but `cmk disable-native-memory` is a one-command opt-out that writes `autoMemoryEnabled: false` into the project's `.claude/settings.json` (**committable — it travels with `git clone`**), so the kit is the sole lean layer. `cmk install` mentions the coexistence + the opt-out, and `cmk doctor` (HC-8) shows the current state. Reverse anytime with `cmk enable-native-memory`.
- **`cmk persona generate` + durable persona review queue (Task 45 follow-up).** A new command to **run persona synthesis on demand** — promote high-confidence cross-project doctrine to the user tier now, instead of waiting for the weekly pass. And lower-confidence candidates are no longer dropped: they're written to **`<user-tier>/queues/persona-review.md`** (deduped) so nothing the synthesis surfaced gets lost between runs.
- **The review + conflict queues now drain themselves.** The daily-distill and weekly-curate maintenance passes automatically resolve the queues — medium-trust auto-extractions are **promoted** into `MEMORY.md`, and a lower-trust write that conflicts with an existing higher-trust fact is **auto-resolved in favor of the higher-trust fact** — so you no longer have to run `cmk queue review` / `cmk queue conflicts` by hand (those still work if you want manual control). Mistakes self-correct: a later, better fact auto-supersedes, and stale medium-trust entries age out.

### Changed

- **The scaffolded `memory-write` skill is now safe, and the scaffolded `CLAUDE.md` is leaner (Task 69, security).** The old skill granted itself `Edit`/`Write` and told Claude to **hand-edit** `MEMORY.md`/`USER.md` directly — bypassing the secret-screen and home-path sanitization (the same class as the v0.1.2 username-leak). The rewritten skill grants only `Bash(cmk remember *)` / `Bash(cmk forget *)` / `Read`, routes every write through `cmk`, and carries a hard "NEVER hand-edit memory files" gate. The memory-write *procedure* moved out of the appended `CLAUDE.md` block (now 4 invariant facts + a pointer to the skill) and into the skill itself, where it loads only when needed — your `CLAUDE.md` stays shorter and the kit stops competing with your own instructions.
- **Explicit capture is seamless again — no "Use skill?" prompt (Task 90).** Task 69 moved capture into the `memory-write` skill, which Claude Code gates with its own approval prompt — so the first explicit capture popped a *"Use skill /memory-write?"* dialog even though Task 79 had already silenced the `cmk` command prompt. `cmk install` now also allow-lists `Skill(memory-write)` in `.claude/settings.json`, so a model-invoked capture runs without prompting — the explicit half of the wedge is friction-free on a fresh install. (Surfaced by the v0.2.0 cut-gate manual run.)
- **The wedge promotes reliably and session summaries stay grounded (Tasks 86 / 87 / 84b).** Cross-project rules stated across a busy build turn now promote to your persona (not only single-rule turns) — a dedicated persona pass runs at session end over the actual conversation. The end-of-session summary is built from the **dialogue** rather than file-write logs (no more invented frameworks in your memory). And all three compression layers keep only the **latest** version when a fact changes, so stale memory self-supersedes instead of accumulating contradictions.
- **The kit's hooks now run on Node alone — no bash, on any OS (Task 62).** Both install routes now invoke the lifecycle hooks directly with `node` (the plugin route via `node "${CLAUDE_PLUGIN_ROOT}/bin/<hook>.mjs"`; the npm route already used PATH-resolved node bins). Previously the plugin route shipped bash wrapper scripts, which required a POSIX shell (Git Bash or WSL) on Windows — a hidden dependency that could fail on a machine without a real bash. Node is the only runtime requirement now, exactly like Claude Code itself. No action needed; install and hooks work the same on Windows, macOS, and Linux.
- **`cmk doctor` no longer reports a healthy fresh install as broken.** On a brand-new project, three checks were marked **FAIL** when they were really "nothing's happened yet" or "optional": distill freshness (HC-3) and transcript firing (HC-4) before you've had a session, and cron registration (HC-6) — which is optional, since the kit falls back to lazy-on-read compression. These are now **SKIP** on a fresh project (matching how the README already describes cron), so a clean install reads `6 pass · 0 fail · 3 skip` and `cmk doctor` exits `0` instead of `1`. The genuine failure cases still FAIL: a *stale* distill, and transcripts that exist but stopped firing.

## [0.1.2] — 2026-05-30

First real-world self-test (build a small app across two sessions) surfaced that the kit **captured** facts but couldn't **recall** them, plus a cluster of write-path and Windows issues. This release fixes the whole loop end-to-end and adds the code-quality gate.

### Fixed

- **Session-start recall (the headline).** The injected memory snapshot was ~70% template-comment noise + placeholder seed bullets, with the real captured facts buried mid-payload — so a fresh session reported "no real facts populated yet" and re-derived everything from the codebase. `inject-context` now strips format-comment headers + placeholder seed bullets, drops the reference `INDEX.md` (which self-declares "NOT auto-loaded"), and excludes scaffolding-only tiers. A real project's snapshot dropped from ~11 KB of noise to a few hundred bytes of just-the-facts.
- **`cmk search` returned "no results" on a fresh install** even for facts sitting in `MEMORY.md` — the FTS5 index was never built (nothing reindexed for a one-shot CLI call). `cmk search` (and the MCP `mk_search`) now reindex before querying; `reindexBoot` gained an mtime fast-path so the per-search cost stays flat as memory grows.
- **Durable-fact writes could leak your username + ship the wrong schema.** Hand-written fact files used a frontmatter schema the index couldn't read, and an absolute interpreter path (`C:\Users\<you>\…`) landed in the **committed** project tier. Fact-file + scratchpad writes now run through home-path abstraction (`C:\Users\you\…` → `~`, case-insensitive, all OSes) **and** Poison_Guard (fact files previously bypassed the secret screen).
- **Windows: compression/auto-extract silently failed for usernames with a space.** `spawn(..., {shell:true})` with an args array (a) emitted Node's DEP0190 and (b) concatenated argv unescaped, so a temp path under `C:\Users\First Last\…` broke cmd.exe tokenization. New `spawn-bin` helper never pairs `shell:true` with an args array (POSIX argv-style; Windows single pre-quoted command string).

### Added

- **`cmk remember "<fact>"`** — explicit, safe durable capture (Poison_Guard + home-path abstraction + dedup + correct schema). The agent uses this instead of hand-writing files under `context/memory/`. `--trust`, `--section`; `cmk remember --help` for details.
- **Coverage gate (Task 54):** `npm run test:coverage` (vitest v8) with 70% ratchet thresholds enforced in CI; **SonarQube Cloud** CI-based analysis (maintainability / reliability / security-hotspots + coverage) on every PR.
- **`cmk install --verbose`** for the full per-tier file breakdown.

### Changed

- **`cmk install` output is outcome-first** — "`<project> ready — context/ scaffolded, hooks wired`" instead of a confusing file tally ("skipped 4 existing" read like a problem; those were the cross-project user-tier files *outside* the folder). The breakdown moved to `--verbose`.
- The scaffolded `CLAUDE.md` capture guidance now routes durable writes through `cmk remember` and never tells the agent to hand-write fact files.

## [0.1.1] — 2026-05-29

Unify install (Task 49): a tester now needs a **single** complete entry point — `npm install -g @lh8ppl/claude-memory-kit && cmk install` — with no separate `/plugin install` step. Both install routes are now complete on their own; pick one.

### Added

- **`cmk install` now wires the lifecycle hooks** into `<repo>/.claude/settings.json` (PATH-resolved bare bin names, cross-OS shell form), making the npm route a complete entry point. `--no-hooks` opts out for scaffold-only installs.
- **5 hook bins shipped in the npm package** (`cmk-inject-context`, `cmk-capture-prompt`, `cmk-observe-edit`, `cmk-capture-turn`, `cmk-compress-session`) plus the spawned `cmk-auto-extract.mjs` — de-plugin-ified twins of the `plugin/bin/` handlers (Task 33/36 pattern), so the hooks resolve after `npm install -g` without `${CLAUDE_PLUGIN_ROOT}`.
- **`.claude-plugin/marketplace.json`** at the repo root makes the plugin route registerable via `/plugin marketplace add LH8PPL/claude-memory-kit` — a complete parallel entry point to `cmk install`.
- **Shared `settings-hooks.mjs`** boundary (`writeKitHooks`) used by both `cmk install` and `cmk repair --hooks`, so the two never drift.

### Changed

- **`cmk repair --hooks` now writes the npm-route hook form** (PATH-resolved bare bin names, 5 functional events) instead of the plugin form (`bash "${CLAUDE_PLUGIN_ROOT}/bin/..."`, 6 events incl. the `Setup`/`cmk-version-check` stub) — so repaired hooks work with no plugin loaded. The plugin form still lives in `plugin/hooks/hooks.json` for the plugin route.
- **README + QUICKSTART** reframed to present the two install routes as "pick one, each complete" (was: "you need both").

### Fixed

- **`cmk doctor` HC-2** now traverses the canonical nested hooks shape (`{hooks:[{command}]}`) that `cmk install` / `cmk repair` actually write — previously it only inspected a flat top-level `command`, so `cmk install` followed by `cmk doctor` reported HC-2 fail on hooks the kit itself had just written (a latent install→doctor composition gap surfaced while shipping Task 49).

### Security (Task 53)

- **CI security scanning** on every push + PR: `gitleaks` (secrets), `osv-scanner` + `npm audit --audit-level=high` (CVEs/supply-chain, hard gate on high/critical), `CodeQL` (SAST, JavaScript), and weekly **Dependabot** PRs. Same SCA/SAST/secrets shape as Artifactory Xray + SonarQube, built from the free GitHub-native/OSS stack.
- **CI publish with signed provenance** (`.github/workflows/publish.yml`): releases now publish on a `v*` tag from GitHub Actions via OIDC + `npm publish --provenance`, with the npm credential stored only as the encrypted `NPM_TOKEN` secret — replacing the local-publish flow whose on-disk token was the v0.1.0 leak vector.
- **`SECURITY.md`** threat model + responsible-disclosure policy; `bugs` URL added to both packages.

## [0.1.0] — 2026-05-28

The first public release of claude-memory-kit — a per-project, in-repo memory system for Claude Code that fixes per-session amnesia by storing durable facts as markdown inside `<repo>/context/` (committed) + `<repo>/context.local/` (gitignored) + `~/.claude-memory-kit/` (user-tier). Architecture-first first release: ~55 dev days, 42 tasks shipped (45-task ledger; 3 deferred to v0.1.1).

### Added

#### Foundation (Layers 1–3)

- **3-tier memory model** (P/L/U): project tier in `<repo>/context/` (committed), local tier in `<repo>/context.local/` (gitignored), user tier in `~/.claude-memory-kit/` (cross-project per-user)
- **`cmk install`** scaffolds the 3-tier layout into a project, drops a managed CLAUDE.md block, and adds `.gitignore` entries for regenerable + machine-local state
- **Granular fact archive** with content-addressed 8-char base32 IDs (Node ⇔ Python parity package `@lh8ppl/cmk-canonicalize`); INDEX.md pointer file walked at session start
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
