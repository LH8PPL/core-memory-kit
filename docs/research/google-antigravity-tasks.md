# Memory Kit for Claude Code — Tasks v0.1.0

> **Milestone**: v0.1.0 — Minimum Viable Memory
> **Estimated Effort**: ~40–60 hours
> **Status**: Not started

---

## Phase 0: Project Scaffolding
**Goal**: Bootable Python project with CI, linting, and test infrastructure.

- [ ] **T0.1** — Initialize Python project with `pyproject.toml`
  - Python 3.11+ target
  - Dependencies: `click`, `pyyaml`, `python-frontmatter`
  - Dev dependencies: `pytest`, `pytest-cov`, `ruff`, `mypy`
  - Console script entry point: `memory-kit`
  - Package name: `memory_kit`

- [ ] **T0.2** — Set up project structure
  ```
  memory-kit/
  ├── src/
  │   └── memory_kit/
  │       ├── __init__.py
  │       ├── __main__.py          # python -m memory_kit
  │       ├── cli.py               # Click CLI entry point
  │       ├── config.py            # Configuration loading & platform paths
  │       ├── constants.py         # Default char caps, version, etc.
  │       ├── models.py            # Data models (Fact, Scratchpad, Session, etc.)
  │       ├── scratchpad.py        # Scratchpad manager
  │       ├── archive.py           # Fact archive CRUD
  │       ├── sessions.py          # Session log & compression
  │       ├── injector.py          # Context assembly for injection
  │       ├── extractor.py         # Auto-extraction heuristics
  │       ├── security.py          # Secrets filter, frontmatter validation
  │       ├── hooks/
  │       │   ├── __init__.py
  │       │   ├── session_start.py
  │       │   ├── post_tool_use.py
  │       │   └── stop.py
  │       └── utils.py             # Path resolution, date helpers, etc.
  ├── tests/
  │   ├── conftest.py
  │   ├── test_scratchpad.py
  │   ├── test_archive.py
  │   ├── test_sessions.py
  │   ├── test_injector.py
  │   ├── test_extractor.py
  │   ├── test_security.py
  │   ├── test_hooks.py
  │   ├── test_cli.py
  │   └── test_config.py
  ├── pyproject.toml
  ├── README.md
  ├── LICENSE                      # MIT
  └── .github/
      └── workflows/
          └── ci.yml               # Lint + test on push
  ```

- [ ] **T0.3** — Configure ruff (linting/formatting) and mypy (type checking)

- [ ] **T0.4** — Set up pytest with fixtures for temp `.memory/` directories

- [ ] **T0.5** — Create `README.md` with project overview, quick start, philosophy

---

## Phase 1: Core Data Layer
**Goal**: Scratchpad files and fact archive work correctly with char caps.

### 1A — Configuration & Constants

- [ ] **T1.1** — Implement `constants.py`
  - Default char caps for each scratchpad file
  - Supported categories for facts
  - Secrets filter regex patterns
  - Version string

- [ ] **T1.2** — Implement `config.py`
  - Platform-specific user-global directory resolution
    - Linux: `$XDG_CONFIG_HOME/memory-kit/` or `~/.config/memory-kit/`
    - macOS: `~/Library/Application Support/memory-kit/`
    - Windows: `%APPDATA%/memory-kit/`
  - `.memorykit.yaml` loading with defaults
  - Project root detection (walk up to find `.git/`)
  - **Tests**: Platform path resolution, YAML parsing, fallback to defaults

### 1B — Data Models

- [ ] **T1.3** — Implement `models.py`
  - `Scratchpad` dataclass: path, scope, kind, char_cap, char_used, version, frontmatter
  - `Fact` dataclass: id, created, source_session, category, confidence, tags, status, title, body
  - `SessionSummary` dataclass: session_id, started, ended, duration, facts_created, files_modified, summary, open_items
  - `MemoryContext` dataclass: assembled context from all scopes
  - **Tests**: Serialization round-trips, validation

### 1C — Scratchpad Manager

- [ ] **T1.4** — Implement `scratchpad.py` — read operations
  - Read scratchpad file and parse YAML frontmatter
  - Validate frontmatter required fields (scope, kind, char_cap)
  - Calculate actual char_used vs declared
  - Handle missing files gracefully (return empty scratchpad)
  - **Tests**: Parse valid file, handle missing file, detect malformed frontmatter

- [ ] **T1.5** — Implement `scratchpad.py` — write operations
  - Enforce char cap before writing
  - Update `char_used`, `last_modified`, `modified_by`, `version` in frontmatter
  - Reject writes that exceed cap with informative error
  - **Tests**: Write within cap, reject overflow, verify frontmatter update

- [ ] **T1.6** — Implement `scratchpad.py` — compact operation
  - Extract individual entries from scratchpad body
  - Archive each entry as a fact file
  - Return compact report (entries_archived, chars_before, chars_after)
  - **Tests**: Compact a full scratchpad, verify archive files created, verify reduced size

- [ ] **T1.7** — Implement `scratchpad.py` — initialize operation
  - Create a new scratchpad file with valid frontmatter and empty body
  - Idempotent: skip if file exists with valid frontmatter
  - **Tests**: Create new, skip existing, handle directory creation

### 1D — Fact Archive

- [ ] **T1.8** — Implement `archive.py` — create operation
  - Generate fact ID (first 8 chars of SHA-256)
  - Generate filename (`{date}_{fact_id}.md`)
  - Write fact file with full YAML frontmatter
  - **Tests**: ID determinism, file creation, frontmatter correctness

- [ ] **T1.9** — Implement `archive.py` — read and list operations
  - Read fact by ID (scan archive directory)
  - List all facts with optional filters (category, status, tags, date range)
  - **Tests**: Read existing, read missing, filter by category, filter by status

- [ ] **T1.10** — Implement `archive.py` — supersede and retract operations
  - Supersede: create new fact with `supersedes: old_id`, mark old as `status: superseded`
  - Retract: mark fact as `status: retracted` (do not delete file)
  - **Tests**: Supersede chain, retract, verify old fact status updated

- [ ] **T1.11** — Implement `archive.py` — search operation
  - Simple text search across all active fact files (grep-style)
  - Search by title, body, tags, category
  - Return results sorted by relevance (title match > body match > tag match)
  - **Tests**: Search by keyword, search by tag, no results, multiple matches

---

## Phase 2: Security & Validation
**Goal**: Secrets never leak into memory, malformed files don't crash the system.

- [ ] **T2.1** — Implement `security.py` — secrets filter
  - `contains_secret(text) -> bool` — check text against secret patterns
  - `sanitize(text) -> str` — redact secrets from text (replace with `[REDACTED]`)
  - Patterns: API keys (`sk-`, `ghp_`, `AKIA`), passwords, tokens, private keys, bearer tokens
  - **Tests**: Match known patterns, avoid false positives on normal code, redaction

- [ ] **T2.2** — Implement `security.py` — frontmatter validation
  - Validate required fields per file type
  - Validate char_used ≤ char_cap
  - Validate status is a known enum value
  - Quarantine files with malformed YAML to `.memory/.quarantine/`
  - **Tests**: Valid file passes, missing field fails, malformed YAML quarantined

- [ ] **T2.3** — Implement `security.py` — source provenance
  - Ensure every fact has `source_session` and `confidence`
  - Auto-extracted facts get `confidence: medium`
  - User-explicit facts get `confidence: high`
  - **Tests**: Provenance fields present on created facts

---

## Phase 3: Session Management
**Goal**: Sessions are summarized and compressed into rolling digests.

- [ ] **T3.1** — Implement `sessions.py` — session summary generation
  - Read Claude Code transcript (JSONL format) from `transcript_path`
  - Extract: tools used, files modified, key decisions
  - Apply secrets filter to output
  - Cap summary at configured `session_max_chars`
  - Write summary to `.memory/sessions/{date}_{session_id}.md` with YAML frontmatter
  - **Tests**: Parse sample transcript, cap enforcement, secrets filtering

- [ ] **T3.2** — Implement `sessions.py` — daily compression
  - Find all session files from a given date
  - Merge into a single daily digest (`{date}_daily.md`)
  - Cap at `daily_max_chars`
  - Delete original session files after successful merge
  - **Tests**: Merge multiple sessions, cap enforcement, cleanup

- [ ] **T3.3** — Implement `sessions.py` — weekly compression
  - Find all daily digests from a given ISO week
  - Merge into weekly digest (`{year}-W{week}_weekly.md`)
  - Cap at `weekly_max_chars`
  - Delete source dailies after successful merge
  - **Tests**: Merge dailies into weekly, cross-week boundary handling

- [ ] **T3.4** — Implement `sessions.py` — monthly compression
  - Find all weekly digests from a given month
  - Merge into monthly archive (`sessions/archive/{year}-{month}_monthly.md`)
  - Cap at `monthly_max_chars`
  - Delete source weeklies
  - **Tests**: Merge weeklies into monthly, year boundary handling

- [ ] **T3.5** — Implement `sessions.py` — lazy compression trigger
  - `check_and_compress()` function called at session start
  - Checks for overdue daily/weekly/monthly compressions
  - Runs any needed compressions sequentially
  - **Tests**: Trigger detection, idempotent re-runs

---

## Phase 4: Context Injection
**Goal**: All memory scopes assembled and output as a context block.

- [ ] **T4.1** — Implement `injector.py` — scope resolution
  - Resolve user-global directory (platform-specific)
  - Resolve project `.memory/` directory
  - Resolve local `.memory/.local/` directory
  - Handle missing scopes gracefully (skip and continue)
  - **Tests**: All three scopes present, one missing, all missing

- [ ] **T4.2** — Implement `injector.py` — context assembly
  - Read all scratchpads from all scopes
  - Read today's session logs (newest first)
  - Assemble into formatted `<memory-kit-context>` block
  - Verify total chars ≤ 20,500
  - **Tests**: Full assembly, partial scopes, total cap respected

- [ ] **T4.3** — Implement `injector.py` — output formatting
  - Section headers for each scope/file
  - Empty sections omitted
  - Citation IDs preserved in output
  - Clean markdown formatting
  - **Tests**: Output format matches spec, empty sections skipped

---

## Phase 5: Auto-Extraction
**Goal**: PostToolUse hook captures durable facts from agent activity.

- [ ] **T5.1** — Implement `extractor.py` — tool type classification
  - Map tool names to extraction categories:
    - `Bash` → check for package installs, test results
    - `Write`/`Edit` → check for config file creation/modification
  - Skip tools not in the extraction list
  - **Tests**: Classify known tools, skip unknown tools

- [ ] **T5.2** — Implement `extractor.py` — extraction heuristics
  - Package install detection: `npm install`, `pip install`, `cargo add`, etc.
  - Config file detection: common config filenames
  - Test result detection: pass/fail count patterns
  - Cap extracted fact at `max_fact_length` (500 chars)
  - **Tests**: Extract from package install, detect config file, detect test results

- [ ] **T5.3** — Implement `extractor.py` — fact creation pipeline
  - Run secrets filter before creating fact
  - Create fact in archive with `confidence: medium`
  - Never write to scratchpads (conservative policy)
  - **Tests**: Full pipeline, secrets blocked, fact created correctly

---

## Phase 6: Lifecycle Hooks
**Goal**: Claude Code hooks call memory-kit and integrate with the session lifecycle.

- [ ] **T6.1** — Implement `hooks/session_start.py`
  - Parse JSON from stdin (hook event envelope)
  - Resolve project root from `cwd`
  - Call lazy compression (`sessions.check_and_compress()`)
  - Call context assembly (`injector.assemble()`)
  - Output context block to stdout
  - Exit 0
  - **Tests**: Valid input, missing `.memory/`, output format

- [ ] **T6.2** — Implement `hooks/post_tool_use.py`
  - Parse JSON from stdin (tool name, tool input, tool output)
  - Call extractor pipeline
  - Output nothing (silent operation) or brief confirmation
  - Exit 0
  - **Tests**: Bash tool with npm install, Edit tool with config, non-extractable tool

- [ ] **T6.3** — Implement `hooks/stop.py`
  - Parse JSON from stdin (session ID, stop_hook_active, transcript_path)
  - **Guard**: If `stop_hook_active` is true → immediate exit 0
  - Read transcript and generate session summary
  - Write session summary file
  - Update scratch.md with detected open items
  - Output `{}` to stdout
  - Exit 0
  - **Tests**: Normal stop, stop_hook_active guard, transcript parsing, missing transcript

---

## Phase 7: CLI Interface
**Goal**: Full `memory-kit` CLI with all user-facing commands.

- [ ] **T7.1** — Implement `cli.py` — `init` command
  - Create `.memory/` directory tree
  - Initialize all scratchpad files with frontmatter
  - Add `.memory/.local/` to `.gitignore`
  - Append loader block to `CLAUDE.md` (create if missing)
  - Configure hooks in `.claude/settings.json` (create if missing)
  - Print setup summary
  - Idempotent: fill gaps without overwriting
  - **Tests**: Fresh init, re-init idempotency, --no-hooks flag, --no-claude-md flag

- [ ] **T7.2** — Implement `cli.py` — `status` command
  - Read each scratchpad and report: chars used / cap / percentage
  - Count archived facts (total, active, superseded, retracted)
  - Report session log status (pending compressions)
  - Report last modified timestamp per file
  - **Tests**: Full status, empty project, partial files

- [ ] **T7.3** — Implement `cli.py` — `remember` command
  - Accept text from argument or stdin
  - Prompt for category (or auto-classify)
  - Create fact in archive
  - Update appropriate scratchpad if space allows
  - Print confirmation with citation ID
  - **Tests**: Remember with category, auto-classify, scratchpad full

- [ ] **T7.4** — Implement `cli.py` — `forget` command
  - Accept fact ID or search text
  - Show matching facts and confirm
  - Retract the selected fact
  - Remove from scratchpad if present
  - Print confirmation
  - **Tests**: Forget by ID, forget by search, confirmation flow

- [ ] **T7.5** — Implement `cli.py` — `recall` command
  - Search facts and scratchpads by query
  - Display results with citation IDs, categories, confidence
  - Sort by relevance
  - **Tests**: Recall with matches, recall with no matches, multiple results

- [ ] **T7.6** — Implement `cli.py` — `compact` command
  - Accept scratchpad filename
  - Run compact operation
  - Print report (entries archived, chars saved)
  - **Tests**: Compact a full file, compact an empty file

- [ ] **T7.7** — Implement `cli.py` — `doctor` command
  - Validate all scratchpad files (frontmatter, char counts)
  - Validate all fact files (required fields, ID consistency)
  - Check for orphaned references
  - Report issues and auto-fix where safe
  - **Tests**: Healthy project, corrupted frontmatter, missing required fields

- [ ] **T7.8** — Implement `cli.py` — `export` command
  - Concatenate all memory into a single markdown document
  - Include all scratchpads, active facts, recent session logs
  - Add table of contents
  - **Tests**: Full export, empty project

- [ ] **T7.9** — Implement `cli.py` — `hook` subcommand group
  - Wire `session-start`, `post-tool-use`, `stop` subcommands to hook modules
  - **Tests**: Each hook callable via CLI

---

## Phase 8: Integration Testing
**Goal**: End-to-end flows work across the full lifecycle.

- [ ] **T8.1** — Integration test: full lifecycle
  - `init` → `remember` → `status` → `recall` → `compact` → `forget`
  - Verify file system state at each step
  - Verify no leftover temp files

- [ ] **T8.2** — Integration test: hook round-trip
  - Simulate SessionStart hook → inject context
  - Simulate PostToolUse hook → verify auto-extraction
  - Simulate Stop hook → verify session summary written
  - Verify next SessionStart includes previous session's data

- [ ] **T8.3** — Integration test: compression pipeline
  - Create 5 session summaries over 3 days
  - Trigger daily compression → verify daily digests
  - Trigger weekly compression → verify weekly digest
  - Verify source files cleaned up

- [ ] **T8.4** — Integration test: cross-platform paths
  - Mock platform detection for Windows, macOS, Linux
  - Verify correct user-global directory resolution
  - Verify path separators in file operations

- [ ] **T8.5** — Integration test: git clone portability
  - Initialize memory-kit in a temp git repo
  - Add facts and scratchpad content
  - Clone the repo to a new location
  - Verify project-scope memory loads correctly
  - Verify local-scope is empty in the clone

- [ ] **T8.6** — Integration test: coexistence with auto-memory
  - Create `.claude/` directory with settings
  - Initialize memory-kit
  - Verify `.claude/settings.json` is properly updated (hooks added)
  - Verify no `.claude/` files are read/modified by memory-kit storage layer

---

## Phase 9: Documentation & Packaging
**Goal**: Ready for PyPI release and community use.

- [ ] **T9.1** — Write comprehensive README.md
  - Quick start (install, init, basic usage)
  - Architecture overview with diagrams
  - Configuration reference
  - CLI reference (all commands with examples)
  - FAQ
  - Contributing guide

- [ ] **T9.2** — Write `CLAUDE.md` template
  - The memory-kit loader block content
  - Example configurations
  - Troubleshooting section

- [ ] **T9.3** — Set up PyPI packaging
  - Build with `hatch` or `setuptools`
  - Console script entry point: `memory-kit`
  - Verify `pipx install memory-kit` works

- [ ] **T9.4** — Set up GitHub Actions CI
  - Run tests on Python 3.11, 3.12, 3.13
  - Run on Ubuntu, macOS, Windows
  - Lint with ruff, type-check with mypy
  - Publish to PyPI on tag push

- [ ] **T9.5** — Create `CHANGELOG.md`
  - v0.1.0 release notes
  - Known limitations
  - Roadmap teaser

---

## Dependency Graph

```
Phase 0 (Scaffolding)
    │
    ▼
Phase 1 (Data Layer)  ──────────────────┐
    │                                    │
    ├──► Phase 2 (Security)              │
    │        │                           │
    │        ▼                           │
    ├──► Phase 3 (Sessions) ◄────────────┘
    │        │
    │        ▼
    ├──► Phase 4 (Injection)
    │        │
    │        ▼
    ├──► Phase 5 (Extraction)
    │        │
    │        ▼
    ├──► Phase 6 (Hooks)
    │        │
    │        ▼
    └──► Phase 7 (CLI)
             │
             ▼
         Phase 8 (Integration Tests)
             │
             ▼
         Phase 9 (Docs & Packaging)
```

---

## Milestones

| Milestone | Phases | Deliverable |
|---|---|---|
| **M1: Data works** | 0 + 1 + 2 | Scratchpads and facts CRUD with validation |
| **M2: Sessions work** | 3 + 4 | Session logging, compression, context injection |
| **M3: Hooks work** | 5 + 6 | Auto-extraction and Claude Code hook integration |
| **M4: CLI works** | 7 | Full user-facing CLI |
| **M5: Release-ready** | 8 + 9 | Integration tests pass, docs complete, PyPI published |

---

## Risk Register

| Risk | Impact | Mitigation |
|---|---|---|
| Claude Code hook API changes | Hooks break | Pin to known Claude Code version; test against nightly |
| Transcript JSONL format undocumented | Session summary extraction fails | Parse defensively; degrade to no-summary gracefully |
| Large repos with 1000+ facts slow search | Bad UX | FTS5 index (optional) solves this; grep fallback for small sets |
| Auto-extraction produces low-quality facts | Noise in archive | Conservative heuristics; never auto-promote to scratchpads |
| YAML frontmatter corruption | Data loss | Quarantine mechanism; `doctor` command for repair |
| Merge conflicts in scratchpad files | Git friction | One-fact-per-file archive is conflict-free; scratchpad conflicts are rare |
