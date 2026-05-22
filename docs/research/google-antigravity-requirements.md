# Memory Kit for Claude Code — Requirements v0.1.0

> **Codename**: `memory-kit`
> **Target**: Claude Code CLI ≥ v2.1.59 (hooks support)
> **Status**: Draft — awaiting review

---

## 1  Problem Statement

Claude Code starts every session with zero recall of previous sessions.
Users must re-explain project context, coding conventions, architectural
decisions, and personal preferences from scratch every time. This is
**structural amnesia** — not a prompt-engineering problem — and it demands
a structural solution.

### 1.1  Impact

| Pain Point | Consequence |
|---|---|
| No session continuity | Repeated explanations, wasted tokens |
| Lost decisions | Contradictory advice across sessions |
| No user identity | Generic tone, no personalization |
| No project memory | Architecture re-discovery on every session |
| No learning curve | Agent never gets better at your project |

---

## 2  Goals & Non-Goals

### 2.1  Goals (v0.1.0)

| # | Goal | Success Metric |
|---|---|---|
| G1 | Persistent per-project memory | Facts survive session restart |
| G2 | Three-tier scope (user / project / local) | Each scope loads correctly |
| G3 | Human-readable storage | All memory is auditable markdown |
| G4 | Bounded scratchpad files | No file exceeds its char cap |
| G5 | Granular fact archive | Every fact has a stable citation ID |
| G6 | Explicit user controls | "remember X" / "forget Y" work |
| G7 | Automatic fact capture | Lifecycle hooks extract durable facts |
| G8 | Session log compression | Rolling window: now → today → recent → archive |
| G9 | Coexistence with Claude Code auto-memory | No conflicts with `.claude/` |
| G10 | Cross-OS portability | Works on Windows, macOS, Linux |

### 2.2  Non-Goals (v0.1.0)

| # | Non-Goal | Rationale |
|---|---|---|
| NG1 | Multi-user collaboration | Single-user first; collaboration later |
| NG2 | Cloud sync / remote backend | Git is the transport layer |
| NG3 | Real-time vector search | Optional cache, not required for v0.1 |
| NG4 | GUI / web dashboard | CLI + markdown is the interface |
| NG5 | Support for non-Claude agents | Claude Code hooks are the integration point |
| NG6 | Automatic conflict resolution | Git merge handles conflicts; we don't |

---

## 3  Functional Requirements

### 3.1  Memory Scopes

#### FR-SCOPE-01: User-Global Scope

- **Location**: `~/.config/memory-kit/` (XDG) or platform equivalent
- **Contents**: User identity, cross-project preferences, communication style
- **Files**:
  - `USER.md` — identity & preferences (≤ 2,000 chars)
  - `PREFERENCES.md` — coding style, tool preferences (≤ 2,000 chars)
- **Visibility**: Injected into every project session
- **Git**: Not in any repo; lives on the user's machine

#### FR-SCOPE-02: Project Scope

- **Location**: `<project-root>/.memory/`
- **Contents**: Project-specific facts, decisions, architecture notes
- **Git**: Committed to the repo (travels with `git clone`)
- **Files** (see §3.2 for details):
  - `PROJECT.md` — project overview & architecture (≤ 4,000 chars)
  - `DECISIONS.md` — architectural decision log (≤ 4,000 chars)
  - `CONVENTIONS.md` — coding standards & patterns (≤ 3,000 chars)
  - `STACK.md` — tech stack & dependencies (≤ 2,000 chars)
  - `archive/` — granular per-fact files
  - `sessions/` — compressed session logs

#### FR-SCOPE-03: Local Scope

- **Location**: `<project-root>/.memory/.local/`
- **Contents**: Machine-specific paths, secrets references, local tool config
- **Git**: Gitignored (`.memory/.local/` added to `.gitignore`)
- **Files**:
  - `LOCAL.md` — machine-specific notes (≤ 2,000 chars)
  - `scratch.md` — ephemeral working notes (≤ 1,500 chars)

### 3.2  Scratchpad Files (Bounded)

#### FR-PAD-01: Character Caps

Every scratchpad file has a hard character limit. The system MUST:

| File | Max Chars | Purpose |
|---|---|---|
| `USER.md` | 2,000 | Identity & preferences |
| `PREFERENCES.md` | 2,000 | Coding style & tools |
| `PROJECT.md` | 4,000 | Project overview & architecture |
| `DECISIONS.md` | 4,000 | ADR-style decision log |
| `CONVENTIONS.md` | 3,000 | Coding standards |
| `STACK.md` | 2,000 | Tech stack |
| `LOCAL.md` | 2,000 | Machine-specific |
| `scratch.md` | 1,500 | Ephemeral notes |

Total injected context budget: ≤ 20,500 chars (~5,100 tokens)

#### FR-PAD-02: Overflow Behavior

When a write would exceed the cap:
1. Reject the write with an error message stating remaining capacity
2. Suggest the agent consolidate or archive existing content
3. Provide a `compact` command that asks the agent to summarize and reduce

#### FR-PAD-03: YAML Frontmatter

Each scratchpad file MUST have YAML frontmatter:

```yaml
---
scope: project          # user | project | local
kind: decisions         # identity | preferences | overview | decisions | conventions | stack | local | scratch
char_cap: 4000
char_used: 2847
last_modified: 2025-01-15T14:30:00Z
modified_by: session-abc123
tags: [architecture, database]
---
```

### 3.3  Fact Archive (Granular)

#### FR-ARCH-01: Fact Files

Each archived fact is a single markdown file in `.memory/archive/`:

```
.memory/archive/
  ├── 2025-01-15_f7a3.md    # {date}_{short-hash}.md
  ├── 2025-01-15_b2c1.md
  └── 2025-01-16_d4e8.md
```

#### FR-ARCH-02: Fact File Format

```yaml
---
id: f7a3c1d2                    # Stable 8-char hash (first 8 of SHA-256 of content)
created: 2025-01-15T14:30:00Z
source_session: session-abc123
category: decision               # decision | convention | bug | insight | preference | tool | architecture
confidence: high                 # high | medium | low
tags: [database, migration, postgres]
supersedes: null                  # ID of fact this replaces, if any
status: active                   # active | superseded | retracted
private: false                   # If true, never auto-extract from sessions
retain: true                     # If true, resist auto-archival
---

# PostgreSQL chosen over MySQL for JSONB support

We evaluated PostgreSQL and MySQL for the project's relational database.
PostgreSQL was chosen because:

1. Native JSONB column type for flexible metadata storage
2. Better full-text search with tsvector
3. Team has more PostgreSQL experience

**Context**: Discussed in session-abc123 on 2025-01-15.
**Alternatives considered**: MySQL 8.0, SQLite (for dev only).
```

#### FR-ARCH-03: Citation IDs

- Every fact MUST have a stable `id` field (first 8 chars of SHA-256 of initial content)
- The agent can reference facts by ID: `[ref:f7a3c1d2]`
- IDs are immutable; updating content creates a new fact that `supersedes` the old one

#### FR-ARCH-04: Fact Lifecycle

```
created → active → superseded (by newer fact)
                  → retracted (explicitly deleted)
```

### 3.4  Session Logs & Compression

#### FR-SESS-01: Session Recording

At session end, write a session summary to `.memory/sessions/`:

```
.memory/sessions/
  ├── 2025-01-16_s1a2b3.md     # Today's sessions (full detail)
  ├── 2025-01-15_daily.md       # Yesterday's daily digest
  ├── 2025-W03_weekly.md        # Last week's weekly digest
  └── archive/
      └── 2025-01_monthly.md    # Monthly archive
```

#### FR-SESS-02: Rolling Compression Window

| Window | Retention | Detail Level |
|---|---|---|
| Current session | Live | Full transcript summary |
| Today | 24 hours | Per-session summaries |
| Recent (7 days) | 7 days | Daily digests |
| Archive (30+ days) | Indefinite | Weekly/monthly digests |

#### FR-SESS-03: Compression Process

1. **SessionEnd hook** writes a session summary (~500-1000 chars)
2. **Daily cron** (or next session start) merges today's sessions into a daily digest
3. **Weekly cron** (or lazy on session start) merges daily digests into weekly
4. **Monthly cron** (or lazy) merges weekly into monthly archive
5. Original session files are deleted after successful compression

#### FR-SESS-04: Session Summary Format

```yaml
---
session_id: s1a2b3c4
started: 2025-01-16T10:00:00Z
ended: 2025-01-16T11:30:00Z
duration_minutes: 90
facts_created: [f7a3c1d2, b2c14e8f]
files_modified: [src/db.py, tests/test_db.py]
---

## Summary
Implemented PostgreSQL connection pooling using asyncpg.
Fixed N+1 query in user listing endpoint.

## Key Decisions
- Chose asyncpg over psycopg3 for better async performance
- Set pool size to 20 based on load testing

## Open Items
- [ ] Add connection retry logic
- [ ] Benchmark under concurrent load
```

### 3.5  User Commands

#### FR-CMD-01: Remember Command

```
User: "remember that we use 4-space indentation in Python files"
```

The agent MUST:
1. Extract the fact
2. Categorize it (→ convention)
3. Write to the appropriate scratchpad (`CONVENTIONS.md`) if space allows
4. Also create a fact file in `archive/`
5. Confirm to the user with the citation ID

#### FR-CMD-02: Forget Command

```
User: "forget the decision about using MySQL"
```

The agent MUST:
1. Search for matching facts
2. Show matches and ask for confirmation
3. Mark the fact as `retracted` in the archive
4. Remove from the relevant scratchpad
5. Confirm with the citation ID

#### FR-CMD-03: Recall Command

```
User: "what do you remember about our database setup?"
```

The agent MUST:
1. Search scratchpads and archive for matching facts
2. Present findings with citation IDs
3. Indicate confidence and source

#### FR-CMD-04: Compact Command

```
User: "compact the decisions file"
```

The agent MUST:
1. Read the target scratchpad
2. Summarize and consolidate entries
3. Archive displaced details as individual facts
4. Write the compacted version
5. Report chars saved

#### FR-CMD-05: Status Command

```
User: "memory status"
```

The agent MUST report:
- Per-file: chars used / cap / percentage
- Total context budget used
- Number of archived facts
- Session log compression status
- Last modified timestamps

### 3.6  Lifecycle Hook Integration

#### FR-HOOK-01: SessionStart

When a Claude Code session starts:
1. Read all user-global files (`USER.md`, `PREFERENCES.md`)
2. Read all project scratchpads (`PROJECT.md`, `DECISIONS.md`, etc.)
3. Read local scope (`LOCAL.md`, `scratch.md`)
4. Read today's session logs (if any)
5. Inject all content as a "Memory Context" block in the system prompt
6. Run lazy compression if overdue (daily/weekly digests)

#### FR-HOOK-02: PostToolUse — Auto-Extract

After tool use (file edits, command runs, etc.), optionally extract durable facts:
- New dependencies added → update `STACK.md`
- Config files modified → note in relevant scratchpad
- Test results → note failures/fixes
- **Conservative extraction**: Only extract high-confidence, durable facts
- **Never extract**: Secrets, tokens, passwords, ephemeral debugging output

#### FR-HOOK-03: Stop — Session Summary

When the agent stops (session ends):
1. Generate a session summary
2. Write to `.memory/sessions/{date}_{session-id}.md`
3. Update `scratch.md` with any open items

#### FR-HOOK-04: PreToolUse — Memory Guards

Before tool use:
- If writing to a scratchpad, check char cap
- If deleting a memory file, require confirmation
- Log the operation for auditability

### 3.7  CLAUDE.md Integration

#### FR-CLAUDE-01: Loader Instruction

The system MUST add a loader block to the project's `CLAUDE.md` (or create it):

```markdown
## Memory Kit

This project uses memory-kit for persistent session memory.
Memory files are in `.memory/`. At session start, read all
scratchpad files and recent session logs to restore context.

Commands:
- "remember X" — store a fact
- "forget X" — retract a fact
- "recall X" — search memory
- "memory status" — show usage
- "compact FILE" — consolidate a scratchpad
```

#### FR-CLAUDE-02: Coexistence

- Memory Kit uses `.memory/` — does NOT touch `.claude/`
- Memory Kit's `CLAUDE.md` additions are clearly delimited with markers
- If Claude Code's auto-memory has already stored a fact, Memory Kit
  should not duplicate it (best-effort deduplication)

---

## 4  Non-Functional Requirements

### NFR-01: Cross-OS Compatibility

- All file paths use `path.join()` or equivalent (no hardcoded separators)
- Config directory follows XDG on Linux, `~/Library/` on macOS, `%APPDATA%` on Windows
- Line endings: LF in repo files; OS-native in local-only files
- Tested on: Windows 11, macOS 14+, Ubuntu 22.04+

### NFR-02: Portability via Git

- `.memory/` (project scope) is git-tracked by default
- `.memory/.local/` is gitignored
- `.memory/sessions/` may optionally be gitignored (user choice)
- `git clone` of a repo with memory-kit gives a new user immediate project context

### NFR-03: Markdown as Source of Truth

- All memory is human-readable markdown with YAML frontmatter
- No binary formats for primary storage
- SQLite/FTS5 and vector DBs are regenerable caches, NEVER the source of truth
- If the cache is deleted, it MUST be fully rebuildable from markdown files

### NFR-04: Performance

- Session start injection: < 2 seconds for 100 archived facts
- Scratchpad read: < 100ms per file
- Fact search (without index): < 500ms for 1,000 facts
- Fact search (with FTS5 index): < 50ms for 10,000 facts
- Memory files total: ≤ 20,500 chars injected per session

### NFR-05: Security & Privacy

- **No silent network calls**: Memory Kit makes zero network requests
- **Private facts**: Facts tagged `private: true` are never auto-extracted
- **Retain protection**: Facts tagged `retain: true` resist auto-archival
- **No secrets in memory**: The system MUST NOT store passwords, API keys,
  tokens, or other credentials in memory files
- **Sanitization**: Auto-extracted facts are passed through a secrets filter
  before storage (regex for common patterns: `sk-*`, `ghp_*`, `AKIA*`, etc.)

### NFR-06: Memory Poisoning Defenses

- **Source tracking**: Every fact records its source session ID
- **Confidence scoring**: Auto-extracted facts start at `confidence: medium`;
  user-explicit facts start at `confidence: high`
- **Conservative extraction**: Auto-extract only writes to archive, never
  directly to scratchpads (user or agent must promote)
- **Retraction audit trail**: Retracted facts are marked, not deleted
- **Frontmatter integrity**: YAML frontmatter is validated on every read;
  malformed files are quarantined to `.memory/.quarantine/`

### NFR-07: Graceful Degradation

- If `.memory/` doesn't exist: system works but with no project memory
- If a scratchpad is missing: treat as empty, create on first write
- If archive is corrupted: quarantine bad files, continue with healthy ones
- If user-global config is missing: work with project scope only
- If hooks fail: session continues normally, log the error

---

## 5  Constraints

### C1: Claude Code Hook API

The system is constrained by the hook types Claude Code exposes:
- `PreToolUse` — fires before a tool runs
- `PostToolUse` — fires after a tool completes
- `Notification` — fires on status/progress events
- `Stop` — fires when the agent finishes a turn
- `SubagentStop` — fires when a sub-agent finishes

Hooks are configured in `.claude/settings.json` under the `hooks` key.
Each hook specifies a `type` (command), the command to run, and optional
matchers (e.g., tool name patterns).

> **Note**: There is no explicit `SessionStart` hook in Claude Code.
> Session-start behavior must be achieved via `CLAUDE.md` instructions
> that tell the agent to read memory files at the beginning of each session.

### C2: CLAUDE.md Size

`CLAUDE.md` content is injected into every prompt. Memory Kit's additions
to `CLAUDE.md` MUST be minimal (< 500 chars) — just the loader instruction,
not the memory content itself.

### C3: Token Budget

The total injected memory context MUST stay within ~5,000 tokens to leave
room for the actual conversation. This constrains the total char caps
across all scratchpads.

### C4: Git Merge Friendliness

- Scratchpad files should be structured to minimize merge conflicts
- Fact archive files are append-only (one fact per file = no conflicts)
- Session logs are append-only per day

---

## 6  Acceptance Criteria

### AC-01: First Session Setup

```
Given: A project with no .memory/ directory
When: The user runs `memory-kit init`
Then:
  - .memory/ directory is created with all scratchpad files
  - .memory/.local/ is created and added to .gitignore
  - CLAUDE.md is updated with the loader instruction
  - .claude/settings.json is updated with hook configuration
  - All scratchpads have valid YAML frontmatter
  - `memory status` reports all files at 0% usage
```

### AC-02: Remember and Recall

```
Given: An initialized memory-kit project
When: User says "remember that we use pytest with --strict-markers"
Then:
  - A fact file is created in .memory/archive/
  - The fact is categorized as "convention"
  - CONVENTIONS.md is updated (if space allows)
  - The agent confirms with citation ID

When: User says "recall testing conventions"
Then:
  - The agent finds and presents the pytest fact
  - Citation ID is included in the response
```

### AC-03: Character Cap Enforcement

```
Given: CONVENTIONS.md is at 2,950 / 3,000 chars
When: Agent attempts to write 200 chars to CONVENTIONS.md
Then:
  - Write is rejected
  - Error message shows remaining capacity (50 chars)
  - Agent is prompted to compact or archive
```

### AC-04: Session Compression

```
Given: 5 session logs from today
When: The daily compression runs
Then:
  - A daily digest is created
  - Original session files are removed
  - Digest is ≤ 2,000 chars
  - Key facts and decisions are preserved
```

### AC-05: Cross-Machine Portability

```
Given: A project with memory-kit initialized and facts stored
When: Another user runs `git clone` and starts a Claude Code session
Then:
  - Project scratchpads are immediately available
  - Archived facts are searchable
  - .local/ scope is empty (machine-specific)
  - User-global scope uses the new user's config
```

### AC-06: Coexistence with Auto-Memory

```
Given: Claude Code's auto-memory is enabled
When: Memory Kit is also active
Then:
  - Both systems operate independently
  - Memory Kit does not read or write .claude/ files
  - No duplicate injection of the same facts
  - CLAUDE.md changes are clearly delimited
```

---

## 7  Glossary

| Term | Definition |
|---|---|
| **Scratchpad** | A bounded markdown file with a char cap (e.g., `PROJECT.md`) |
| **Fact** | A single unit of durable knowledge, stored in `archive/` |
| **Citation ID** | Stable 8-char hash identifying a fact (e.g., `f7a3c1d2`) |
| **Scope** | Memory tier: user-global, project, or local |
| **Session log** | Summary of a Claude Code session's activities |
| **Compression** | Process of merging session logs into digests |
| **Hook** | Claude Code lifecycle event that triggers memory-kit logic |
| **Injection** | Loading memory content into the agent's context at session start |
