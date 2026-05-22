# Requirements — claude-memory-kit v0.1.0

**Status**: Draft for review · **Author**: Claude (Opus 4.7) + Lior Hollander · **Date**: 2026-05-21

---

## 1. Introduction

### 1.1 The problem

Claude Code starts every session with no memory of the last one. Without a system in place, the user must re-explain context — who they are, what they've been working on, what the project conventions are — at the start of every conversation. Over months, this re-explanation cost becomes significant and demoralizing.

This kit installs a persistent, in-repo memory layer that survives across sessions, machines, and `git clone`s. The user opens Claude Code, makes a request, and Claude already knows the answers to who/what/why without being told.

### 1.2 What v0.0.1 already does (baseline)

- Per-project, in-repo `context/` directory (committed to git).
- Three bounded scratchpads: `SOUL.md` (project persona), `USER.md` (user profile), `MEMORY.md` (working state).
- Granular per-fact archive at `context/memory/<type>_<slug>.md` with `INDEX.md`.
- Two Claude Code hooks: `PreToolUse` (frozen-snapshot injection) and `Stop` (transcript capture + spawn auto-extract).
- `memory-write` skill that auto-triggers on phrases ("remember this", "from now on", "forget about").
- Optional Layer 5 (memsearch + Milvus) for semantic recall.
- Optional Layer 6 (cron jobs) for daily distill / nightly index / weekly curate.

### 1.3 What v0.1.0 must add

The competitive landscape (see [docs/SOURCES.md](../../docs/SOURCES.md)) shows two systems with patterns worth folding in:

- **claude-mem** (thedotmack/claude-mem, 77k stars): six lifecycle hooks, AI-compressed observations, citation IDs, MCP server, web viewer, `<private>` tags.
- **claude-remember** (Digital-Process-Tools/claude-remember): rolling-window compression hierarchy (`now → today → recent → archive`).

v0.1.0 absorbs the patterns from both that are compatible with our markdown-first, in-repo design — and **adds a cross-project user tier** that v0.0.1 lacks entirely.

### 1.4 Design tenets (non-negotiable)

These constrain every decision below. If a requirement violates a tenet, the tenet wins.

| Tenet | Why |
| --- | --- |
| **T1**: Markdown is the source of truth. Everything else (SQLite, vector indexes) is regenerable cache. | A user must be able to open `MEMORY.md` in VS Code, edit a typo, and have the system respect it. Opaque storage breaks this. |
| **T2**: Per-project memory lives in `<repo>/context/` and is committed to git. | Memory must travel with `git clone`. A new dev / new laptop is up-to-speed after one clone, no export/import. |
| **T3**: Cross-project user-tier memory lives in `~/.claude-memory-kit/` and is global. | Some facts (your name, your role, your habits) are about *you*, not any one project. Forcing them into every project is silly. |
| **T4**: Capture is mostly automatic. User-explicit triggers ("remember this") still work but are not required for the system to be useful. | The third strike on "make it automatic" — the user has been clear this is a hard requirement. |
| **T5**: Silent by default. No "I've saved that to memory" announcements unless the user explicitly asked. | Auto-capture should be invisible. Announcing breaks the illusion. |
| **T6**: Claude Code first. Other agents (Codex, Gemini, Hermes, Copilot) are explicitly out of scope for v0.1.0. | Don't try to be claude-mem's cross-agent surface. We can revisit in v0.2 if it matters. |

---

## 2. User stories

Format: `As a <role>, I want <capability>, so that <value>`. Each story has functional requirements (FR-*) attached in Section 3.

### US-1 — Cross-session continuity for project context

> As a developer working on a project across multiple Claude Code sessions, I want Claude to know the current project's state at the start of every session — what we've been working on, what tools we use, what's still open — so that I don't have to re-explain the project's context every time I open Claude Code.

Maps to: FR-1, FR-2, FR-3, FR-7, FR-12.

### US-2 — Cross-project continuity for user identity

> As a developer who is the same person across multiple projects, I want my universal identity (name, role, preferences, working style) to be known to Claude regardless of which project I'm in — so that I don't have to repeat "I'm Lior, I prefer terse responses, I work on Windows" in every project's USER.md.

Maps to: FR-4, FR-7, FR-13.

### US-3 — Project-specific overrides of global facts

> As a developer whose projects sometimes have project-specific conventions that override my global preferences, I want the project tier to override the user tier when they conflict — so that working in a Rust-shop project doesn't bring along my global "I prefer Python" preference.

Maps to: FR-7, FR-13.

### US-4 — Machine-specific overrides without committing them

> As a developer working on the same project from multiple machines, I want machine-specific paths and overrides (where Tesseract is installed, which Python version is active) to NOT be committed to git but to still load automatically — so that my work laptop's paths don't conflict with my desktop's paths.

Maps to: FR-5, FR-7.

### US-5 — Automatic capture of durable facts without manual flagging

> As a developer who corrects Claude or makes a decision mid-conversation, I want those corrections and decisions to be saved automatically — so that I don't have to remind Claude to "save this to memory" every time something important happens.

Maps to: FR-8, FR-9, FR-14.

### US-6 — Manual capture when I do want to flag something

> As a developer who occasionally wants to explicitly mark something as worth remembering, I want a phrase trigger ("remember this", "from now on", "forget about") that saves silently with the right structure — so that I can override the auto-capture when I want to.

Maps to: FR-10, FR-11.

### US-7 — Sensitive content exclusion

> As a developer who sometimes works with secrets, tokens, or private information, I want a way to mark content as no-capture (`<private>` tags) — so that sensitive content doesn't end up in committed memory files.

Maps to: FR-15.

### US-8 — Force-retain critical content

> As a developer who knows something is durable but the auto-extractor might miss it, I want a way to mark content as force-retain (`<retain>` tags) — so that critical facts don't get filtered out by the conservative auto-extractor.

Maps to: FR-16.

### US-9 — Traceability via citation IDs

> As a developer reviewing what Claude knows, I want every memory entry to have a stable ID so Claude can cite "see fact M-1042" when reasoning — so that I can audit where Claude's claims come from.

Maps to: FR-17.

### US-10 — Fast search across all memory

> As a developer with months of accumulated memory, I want fast keyword search AND semantic search across project memory, user memory, sessions, and transcripts — so that I can find a half-remembered fact in seconds without scrolling.

Maps to: FR-18, FR-19, FR-20.

### US-11 — Auto-curation to keep scratchpads clean

> As a developer who accumulates memory over time, I want a rolling-window compression hierarchy (today's session → today summary → this week → archive) that keeps MEMORY.md bounded — so that the scratchpad stays fast to load and doesn't grow unbounded.

Maps to: FR-21, FR-22, FR-23.

### US-12 — Cross-machine setup from a fresh clone

> As a developer setting up a new laptop or onboarding a teammate to my project, I want `git clone` + a single bootstrap command to fully install the memory system on Windows, macOS, or Linux — so that setup is a one-liner regardless of OS.

Maps to: FR-24, FR-25, FR-26.

### US-13 — Survives Claude Code "primary cwd" quirk

> As a developer who sometimes opens projects as added/additional directories in VS Code workspaces, I want the memory system to either (a) work in additional-cwd mode OR (b) give a clear error telling me to reopen as primary — so that I'm not silently running with broken hooks.

Maps to: FR-27, FR-32.

---

## 3. Functional requirements

Format: each FR is **testable**. Acceptance criteria use EARS-style: "When [trigger], the system shall [behavior]."

### 3.1 Storage and structure

**FR-1 — Project tier directory layout**
The kit shall scaffold the following directory structure into a target project on bootstrap, never overwriting existing files:

```text
<repo>/context/
├── SOUL.md           (≤ 1,800 chars)
├── MEMORY.md         (≤ 2,500 chars)
├── memory/
│   ├── INDEX.md
│   └── <type>_<slug>.md  (per-fact, no size cap)
├── sessions/
│   ├── now.md        (current session, replaced each session)
│   ├── today-{YYYY-MM-DD}.md   (Haiku-compressed daily summary)
│   ├── recent.md     (rolling 7-day consolidation, replaced)
│   └── archive.md    (older history, append-only)
└── transcripts/{YYYY-MM-DD}.md  (verbatim capture, append-only)
```

Acceptance: When bootstrap runs in a project with no `context/` directory, the system shall create the structure above. When bootstrap runs in a project with an existing `context/`, the system shall skip every existing file and create only missing ones.

**FR-2 — Project tier is committed to git**
The `<repo>/context/` directory shall be designed to live inside the project repo. The kit shall NOT add `context/` to `.gitignore`.

Acceptance: When the user runs `git status` after bootstrap, all `context/` files shall be untracked (ready to commit).

**FR-3 — Bounded scratchpads enforce caps at write time**
The `memory-write` skill shall enforce the documented char caps on `SOUL.md` (1,800), `USER.md` (1,375), `MEMORY.md` (2,500) at write time. When a write would exceed the cap, the skill shall consolidate existing entries first.

Acceptance: When the skill is invoked to add content to a file already at 95% of cap, the skill shall consolidate (merge similar bullets, drop stale entries older than 14 days with no current reference) BEFORE writing the new content.

**FR-4 — User tier directory layout**
The kit shall support a global user tier at `~/.claude-memory-kit/` (Windows: `%USERPROFILE%\.claude-memory-kit\`) with this layout:

```text
~/.claude-memory-kit/
├── USER.md           (≤ 1,375 chars, global user identity)
├── HABITS.md         (≤ 1,800 chars, cross-project working style)
└── fragments/
    ├── INDEX.md
    └── <type>_<slug>.md
```

Acceptance: When the user runs `claude-memory-kit init-user`, the system shall create `~/.claude-memory-kit/` with the layout above. When the directory already exists, the command shall be a no-op for existing files.

**FR-5 — Local tier directory layout**
The kit shall support a per-project + per-machine local tier at `<repo>/context.local/`, automatically added to `.gitignore`:

```text
<repo>/context.local/
├── machine-paths.md   (≤ 1,000 chars, absolute paths for this machine)
└── overrides.md       (≤ 1,000 chars, machine-specific overrides)
```

Acceptance: When bootstrap runs, the system shall create `<repo>/context.local/` AND add `context.local/` to `<repo>/.gitignore` if not already present.

**FR-6 — Markdown is the source of truth**
All durable storage shall be human-readable markdown files. The system shall NOT use SQLite, vector DBs, or other opaque formats as the source of truth. (Indexes and caches built FROM markdown are allowed; see FR-18.)

Acceptance: When the user opens any memory file in a text editor and makes a manual edit, the system shall preserve that edit on the next session (no auto-overwrite that loses manual edits).

### 3.2 Snapshot injection (session start)

**FR-7 — Three-tier frozen snapshot injection**
At session start, the system shall inject memory in this priority order via the SessionStart hook (with PreToolUse as a fallback):

1. **Local tier** (highest priority — overrides everything): `<repo>/context.local/*.md`
2. **Project tier** (middle priority): `<repo>/context/SOUL.md`, `MEMORY.md`, `memory/INDEX.md`, latest `sessions/today-*.md`, `sessions/now.md` (if any)
3. **User tier** (lowest priority — defaults): `~/.claude-memory-kit/USER.md`, `HABITS.md`, `fragments/INDEX.md`

When the same key/topic conflicts between tiers, higher-priority tier wins. Total injection budget: ≤ 10 KB to preserve prefix-cache.

Acceptance: When a session starts in a project that has bootstrapped all three tiers, Claude shall report (when asked) facts from all three tiers in its known-context. When a fact is in BOTH project tier and user tier with different values, Claude shall use the project tier value.

**FR-8 — Snapshot fires once per session**
The SessionStart hook shall fire exactly once per Claude Code session. Subsequent tool calls in the same session shall NOT re-inject the snapshot. A `/tmp/cmk-{project-slug}-session-{sid}` flag file shall guard re-firing.

Acceptance: When a session has 50 tool calls, the SessionStart hook shall have produced log output exactly once.

### 3.3 Hook coverage

**FR-9 — Six lifecycle hooks**
The kit shall register the following Claude Code hooks:

| Hook | Purpose |
| --- | --- |
| SessionStart | Inject the three-tier frozen snapshot (FR-7) |
| UserPromptSubmit | Capture the user's prompt to `transcripts/{today}.md` and tag intent (question / decision / correction) |
| PreToolUse | (Fallback for FR-7 if SessionStart didn't fire) |
| PostToolUse | If tool output > 50 lines, append summary to `sessions/now.md` |
| Stop | Append turn to `transcripts/{today}.md` + spawn auto-extract |
| SessionEnd | Compress `sessions/now.md` → `sessions/today-{date}.md` via Haiku |

Acceptance: When the user runs a session with at least one tool call, the system shall produce log entries from every hook except SessionEnd (which only fires on session close).

**FR-10 — Auto-extract on Stop**
The Stop hook shall spawn `auto-extract-memory.sh` in the background. The script shall invoke `claude --print` with a focused fact-extraction prompt that decides whether the turn contains anything durable. If yes, the script shall use the `memory-write` skill to save it.

Acceptance: When a turn contains the phrase "let's standardize on Python 3.13," the auto-extract shall save a corresponding bullet to MEMORY.md within 60s. When a turn contains only conversational chatter, the auto-extract shall log "skip: nothing durable" and write nothing.

**FR-11 — User-explicit memory-write skill**
The kit shall ship a `memory-write` skill that auto-triggers on phrases: "remember this", "remember that", "note this", "note that", "save this", "save that", "update memory", "forget about", "from now on", "going forward", "i prefer", "we decided", "we agreed".

Acceptance: When the user says "remember that we use uv, not pip," the skill shall save a corresponding bullet to MEMORY.md within the same turn (synchronous, not background).

### 3.4 Tags

**FR-12 — `<private>` tag exclusion**
Content wrapped in `<private>...</private>` tags in any user prompt or assistant turn shall NOT be captured to any memory file (sessions, transcripts, MEMORY.md, etc.). The tags themselves and their contents shall be stripped before any write.

Acceptance: When the user types `<private>my API key is sk-abc</private>` in a prompt, the resulting `transcripts/{today}.md` shall contain neither the tag nor "sk-abc" — instead, a placeholder `[private content redacted]` shall appear.

**FR-13 — `<retain>` tag force-keep**
Content wrapped in `<retain>...</retain>` tags shall be force-saved to MEMORY.md regardless of the auto-extractor's heuristics, even if the content wouldn't otherwise pass the "durable fact" filter.

Acceptance: When the user types `<retain>random note: blue cabinet</retain>`, the corresponding bullet shall appear in MEMORY.md after the turn even though "blue cabinet" doesn't match any durable-fact pattern.

### 3.5 Citation IDs

**FR-14 — Stable observation IDs**
Every captured fact (in MEMORY.md, USER.md, granular files, today summaries) shall carry a stable observation ID of the form `M-{6-char-base32}` (e.g., `M-7K2X9Q`). IDs shall be generated once at write time and never change.

Acceptance: When a bullet `- (M-7K2X9Q) milvus pinned at v2.6.16` exists in MEMORY.md and the file is curated (e.g., weekly curator merges nearby bullets), the merged bullet shall preserve the original ID. When two facts are merged, both IDs shall be preserved in the merged bullet.

**FR-15 — Claude can cite observation IDs**
When Claude references a memory fact in its response, it shall be able to cite the observation ID (e.g., "per M-7K2X9Q, we're on v2.6.16"). The system shall expose a `get-observation` tool (via MCP, FR-29) that returns the full text and source file for a given ID.

Acceptance: When Claude says "per M-7K2X9Q, we're on v2.6.16" and the user invokes `get-observation M-7K2X9Q`, the tool shall return the bullet text, file path, and line number.

### 3.6 Search

**FR-16 — Two-mode search interface**
The kit shall expose a unified search command `cmk search "query"` that runs:

1. **Keyword search** (FTS5 over a regenerable SQLite index built from markdown).
2. **Semantic search** (memsearch + Milvus/milvus-lite over the same content).

Results from both modes shall be merged with a configurable weighting (default 0.5 keyword, 0.5 semantic).

Acceptance: When the user runs `cmk search "milvus version"`, the system shall return relevant bullets from MEMORY.md (and other files) regardless of whether the query exactly matches the bullet text. Both keyword and semantic hits shall appear in the results.

**FR-17 — Search index is regenerable**
The SQLite index shall live at `<repo>/context/.index/memory.db` and shall be in `.gitignore`. The kit shall ship `cmk reindex` that rebuilds the index from markdown in O(n) over file count.

Acceptance: When the user deletes `context/.index/`, running `cmk reindex` shall rebuild it in under 5 seconds for ≤ 1,000 markdown files. When markdown content changes, `cmk reindex` shall detect changed files via hash and only re-index those.

**FR-18 — Semantic search is optional**
The kit shall function without semantic search (Layer 5). When memsearch / Milvus is not installed, `cmk search` shall return only keyword results and shall NOT error.

Acceptance: When `memsearch --version` fails (not installed), `cmk search "foo"` shall still return FTS5 results from the SQLite index.

### 3.7 Compression and curation

**FR-19 — Rolling-window compression**
A scheduled job (cron / Task Scheduler) shall implement a four-layer rolling-window compression:

1. `sessions/now.md` — current session, appended live by hooks.
2. `sessions/today-{date}.md` — at SessionEnd, Haiku compresses `now.md` into a daily summary, then truncates `now.md`.
3. `sessions/recent.md` — daily cron consolidates the last 7 `today-*.md` into a rolling 7-day view.
4. `sessions/archive.md` — weekly cron moves `today-*.md` older than 7 days into the archive (append-only).

Acceptance: When 8 days have passed since bootstrap, `sessions/today-*.md` shall contain ≤ 7 files. Older entries shall appear in `archive.md`. `recent.md` shall summarize all 7.

**FR-20 — Compression uses Haiku for cost**
Compression operations (today summary, recent rollup) shall use `claude-haiku-4-5` via `claude --print --model haiku` for cost efficiency. The compression prompt shall enforce structure: section headings preserved, bullets de-duplicated, citations retained.

Acceptance: When `sessions/now.md` is 5 KB and gets compressed to `today-{date}.md`, the resulting file shall be ≤ 1 KB AND shall preserve all observation IDs that appeared in the source.

**FR-21 — Curator preserves citations**
The weekly curator (FR-19) shall NEVER drop or change observation IDs. When merging bullets, both IDs shall be preserved (e.g., `- (M-7K2X9Q, M-3L8N1P) milvus pinned at v2.6.16 (woodpecker WAL needs manual flush)`).

Acceptance: When the curator merges two bullets with IDs M-A and M-B, the merged bullet shall contain both IDs in the format above.

### 3.8 Setup and portability

**FR-22 — One-command bootstrap on each OS**
The kit shall provide:

- `install.sh` (Bash, works on macOS / Linux / Git Bash on Windows).
- `install.ps1` (PowerShell, native Windows).
- `npx claude-memory-kit install` (Node-based universal installer — to be added in v0.1.0).

Each shall scaffold the project tier into the current directory.

Acceptance: When the user runs `bash install.sh` from a project root, the system shall complete bootstrap in under 10 seconds with zero errors on a machine where prerequisites are met.

**FR-23 — Dependency check at install time**
The installers shall check for prerequisites (Node ≥ 18, Python ≥ 3.10, optionally Docker) and report clearly what's missing. The check shall NOT install missing prerequisites silently — the user must approve each install.

Acceptance: When `install.sh` runs on a machine without Node, the script shall print `"ERROR: Node >= 18 required, install via <OS-specific command>"` and exit non-zero.

**FR-24 — Cross-OS test matrix**
The kit shall ship CI configuration that runs install + smoke test on Windows, macOS, Linux for every PR.

Acceptance: When a PR is opened, GitHub Actions shall run the install script on all three OSes and verify a `cmk health` command passes.

### 3.9 Claude Code primary-cwd handling

**FR-25 — Detect non-primary cwd and warn**
When the kit is loaded as a non-primary working directory in Claude Code, the bootstrap shall NOT silently fail. Either:

1. The hooks shall fire from the additional cwd (preferred — if Claude Code supports it by v0.1.0 release date).
2. A startup check shall detect non-primary and print a clear warning to the session: "claude-memory-kit hooks won't fire when this project is loaded as an additional cwd. Reopen as primary."

Acceptance: When a user opens project A as primary and project B (with the kit installed) as additional in a VS Code workspace, project B's `context/sessions/now.md` shall either receive captures OR Claude shall emit a warning in its first response that the hooks aren't firing.

### 3.10 MCP server (optional)

**FR-26 — MCP server exposes memory as tools**
The kit shall include an optional MCP server exposing these tools:

- `search-memory(query, mode=keyword|semantic|hybrid, top_k=5)` — search across all tiers.
- `get-observation(id)` — retrieve full text + source for a citation ID.
- `list-pending-decisions()` — return MEMORY.md "Pending Decisions" section.
- `list-active-threads()` — return MEMORY.md "Active Threads" section.
- `get-soul()` — return SOUL.md.
- `recent-sessions(n=5)` — return last N today-*.md summaries.

Server is opt-in; bootstrap shall NOT enable it by default.

Acceptance: When the user enables the MCP server and invokes `search-memory("milvus")` via MCP, the tool shall return relevant memory entries with their observation IDs.

### 3.11 Web viewer (optional)

**FR-27 — Lightweight static markdown viewer**
The kit shall ship `cmk view` that starts a local static HTTP server (default port 37778, avoiding claude-mem's 37777) rendering all of `context/` and `~/.claude-memory-kit/` as a navigable markdown wiki. No JavaScript required; pure server-rendered HTML.

Acceptance: When the user runs `cmk view`, a browser at `http://localhost:37778` shall display a directory listing and clicking any `.md` file shall render its content with syntax highlighting.

---

## 4. Non-functional requirements

### NFR-1 — Performance budgets

EARS-form (per Kiro spec convergence: more precise + testable than v0.0.1 prose):

- **WHEN** the SessionStart hook fires, **THE** Memory_System **SHALL** assemble and inject the Context_Payload (≤ 10 KB) **within 500 ms** for projects with up to 1,000 fact files.
- **WHEN** the Stop hook fires, **THE** Memory_System **SHALL** spawn the detached auto-extract subprocess **within 50 ms** (the extract itself may take seconds, but the hook must not block).
- **WHEN** `cmk search` is invoked in keyword mode, **THE** Memory_System **SHALL** return results **within 100 ms** for corpora up to 10,000 observations.
- **WHEN** `cmk search` is invoked in semantic or hybrid mode (Layer 5 installed), **THE** Memory_System **SHALL** return results **within 1,000 ms** for the same corpora.
- **WHEN** the user runs `bash install.sh` on a machine where prereqs are met, **THE** installer **SHALL** complete scaffolding **within 10 seconds**.
- **WHEN** the `cmk reindex --boot` command runs, **THE** Memory_System **SHALL** complete the full rebuild **within 30 seconds** for corpora up to 1,000 fact files.
- **WHEN** the `mk_get`, `mk_search`, `mk_recent_activity`, or `mk_cite` MCP tools are invoked, **THE** MCP server **SHALL** respond **within 200 ms** for corpora up to 10,000 observations.

Cumulative budget for session start (snapshot injection + cold filesystem reads + cache validation): **< 500 ms p95**.

**NFR-2 — Token budget for snapshot**
The three-tier snapshot shall total ≤ 10 KB injected at session start. This is roughly 2,500 tokens — small enough to preserve prefix-cache, large enough to carry meaningful context.

**NFR-3 — OS support**
First-class: Windows 10/11, macOS 14+, Ubuntu 22.04+. Best-effort: other Linux distros, WSL.

**NFR-4 — Storage growth**
After 90 days of daily use, total `context/` size shall remain under 50 MB (excluding `transcripts/`, which can be large). The rolling-window compression (FR-19) enforces this.

### NFR-5 — No silent network calls

The kit shall NOT make any network calls except those explicitly initiated by:

1. `claude --print` invocations (which hit Anthropic's API).
2. `memsearch` indexing (which embeds locally via ONNX — no network).
3. Initial `pip install memsearch[onnx]` (one-time, user-approved).

All other operations shall be local-only.

### NFR-6 — Security

- `<private>` tag content shall NEVER be written to disk.
- `context.local/` shall be in `.gitignore` automatically.
- The MCP server (FR-26) shall bind to `127.0.0.1` only, never 0.0.0.0.
- The web viewer (FR-27) shall bind to `127.0.0.1` only.

**NFR-7 — Backwards compatibility within v0.x**
Within the v0.x series, the kit shall preserve compatibility for files created by an older v0.x — no destructive migrations required between v0.1 and v0.2. (A migration script may be PROVIDED, but the system shall still read old-format files.)

### NFR-8 — Documentation completeness

The kit shall ship:

- `README.md` — overview and three install paths.
- `ARCHITECTURE.md` — six-layer design.
- `HEALTH-CHECKS.md` — HC-1..HC-N with self-repair.
- `INSTALL-{windows,macos,linux}.md` — per-OS guides.
- `specs/v0.1.0/{requirements,design,tasks}.md` — this spec set.
- `CHANGELOG.md` — semver-tracked changes from v0.0.1 onward.

---

## 5. Out of scope (explicit non-goals for v0.1.0)

The following are deferred to v0.2 or later:

- **OS-1**: Multi-agent support (Codex, Gemini, Hermes, Copilot). Claude Code only in v0.1.
- **OS-2**: Companion skills (make-plan, pathfinder, weekly-digests, knowledge-agent, etc.). These are valuable but a separate package. v0.1 ships memory-write and bootstrap only.
- **OS-3**: Web viewer with rich UI. v0.1 ships a minimal static viewer; rich UI (search, browse by date, observation graph) is v0.2.
- **OS-4**: Profile separation within a single project (work-mode vs personal-mode SOUL.md). Single mode per project in v0.1.
- **OS-5**: E2E test infrastructure with Docker. Unit tests only in v0.1.
- **OS-6**: Multilingual support / translation cache.
- **OS-7**: Replacement of `memsearch` + `Milvus` with a different vector backend. We continue to use memsearch.
- **OS-8**: Public marketplace distribution. v0.1 stays in a private GitHub repo. v0.2 may publish to npm + the Claude Code plugins marketplace.

---

## 6. Resolved questions (decisions for v0.1.0)

Resolved by the user 2026-05-21 after reviewing my recommendations. Locked unless research (in progress) surfaces a meaningfully better option.

### OQ-1 — User tier directory name: **RESOLVED → `~/.claude-memory-kit/`**

Keep the current name for v0.1. **Future-rename trigger**: if we add cross-agent support (Codex, Gemini, Hermes, Copilot) in v0.2+, rename the package and user-tier directory to `ai-agent-memory-kit` (or similar agent-neutral name). The Claude-specific name is acceptable while we ship Claude-only.

### OQ-2 — Bootstrap UX: **RESOLVED → all three**

Ship: `bash install.sh` (offline-capable), `pwsh install.ps1` (Windows-native), `npx claude-memory-kit install` (cross-OS one-liner), AND a Claude Code plugin slash command (`/claude-memory-kit:bootstrap`). Each serves a different audience.

### OQ-3 — SessionStart hook handling: **RESOLVED → SessionStart with PreToolUse fallback**

Use `SessionStart` as the primary snapshot-injection hook. If `SessionStart` doesn't fire for any reason (older Claude Code version, hook misconfigured, user disabled), `PreToolUse` catches up at the first tool call. Both fire at most once per session thanks to the `/tmp` flag.

What other systems do (for context): claude-mem and claude-remember both depend on SessionStart being available. Our fallback is defense in depth — costs ~5 extra lines.

### OQ-4 — Citation ID scope: **RESOLVED → namespaced (`U-`, `P-`, `L-` prefixes + 6-char base32)**

Example IDs: `U-7K2X9Q`, `P-3L8N1P`, `L-9M2X4R`. Tier prefix tells you at a glance where the fact lives. Base32 (no ambiguous chars like 0/O, 1/l) keeps IDs readable when spoken aloud or pasted into URLs.

Revisit if research surfaces a meaningfully better scheme (e.g., content-addressable hashes that give stable dedup across merges).

### OQ-5 — `<private>` tag handling: **RESOLVED → strip + `[redacted]` placeholder**

When `<private>...</private>` content appears in any turn, the tag and its content are stripped at the hook level. The turn still appears in `transcripts/{today}.md` (preserving conversational flow), but where the private content was, the file shows `[private content redacted]`. Sensitive content NEVER touches disk in cleartext anywhere.

Origin: pattern borrowed from claude-mem. Anthropic's official Memory tool docs explicitly recommend stripping sensitive info from memory files. Two-tag system: `<private>` (exclude) + `<retain>` (force-keep). No additional tags in v0.1 — more tags is feature creep until we have real-world evidence we need them.

### OQ-6 — Unified `cmk` CLI: **RESOLVED → yes**

Ship a `cmk` Node binary that proxies to the underlying scripts (`cmk search`, `cmk reindex`, `cmk health`, `cmk view`, `cmk install-user-tier`, etc.). Single discoverable entry point. Matches the pattern claude-mem uses.

### OQ-7 — Scheduler backend: **RESOLVED → cron / schtasks only for v0.1**

Windows: Task Scheduler via `schtasks`. macOS/Linux: `crontab`. User works on both Windows AND macOS/Linux, so both must work; both already do via `register-crons.py`.

`launchd` (macOS-native) and `systemd timers` (Linux-server-native) are deferred to v0.2 as enhancements. Cron works fine for desktop/dev use.

---

## 7. Review checklist

Before approving this requirements doc, verify each:

- [ ] T1-T6 design tenets are correct and complete.
- [ ] US-1 through US-13 cover the user needs the user actually has.
- [ ] No FR violates any tenet.
- [ ] OQ-1 through OQ-7 are resolved with concrete answers.
- [ ] Out-of-scope list is correct — nothing important got deferred by accident.
- [ ] NFRs are realistic (performance budgets achievable, OS support feasible).

---

## 8. Approval

When this document is approved, write `design.md` next. Until approved, `design.md` shall NOT be written.

**User**: approved by: __________  date: __________
**Author (Claude)**: drafted 2026-05-21
