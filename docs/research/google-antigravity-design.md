# Memory Kit for Claude Code — Design v0.1.0

> **Codename**: `memory-kit`
> **Status**: Draft — awaiting review

---

## 1  Design Philosophy

Memory Kit draws inspiration from three reference architectures and
establishes its own identity through five design principles:

| Principle | Inspiration | How We Apply It |
|---|---|---|
| **Bounded Curation** | Hermes Agent | Hard char caps on scratchpads force the agent to curate, not hoard |
| **Markdown as Source of Truth** | Basic Memory | All knowledge is human-readable; indexes are regenerable caches |
| **Frozen Injection** | Hermes Agent | Memory is loaded once at session start for prompt-cache stability |
| **Entity–Observation–Relation** | Basic Memory | Facts have categories, tags, and typed links to other facts |
| **Coexistence, Not Replacement** | Claude Code Auto-Memory | Separate directory (`.memory/`), separate concerns |

### 1.1  Key Differences from Reference Systems

| Feature | Hermes Agent | Basic Memory | Memory Kit |
|---|---|---|---|
| Storage location | `~/.hermes/` (global) | Configurable dir | In-repo `.memory/` + user-global |
| Git integration | None | None | First-class (travels with clone) |
| Scope tiers | 1 (global) | 1 (per-project) | 3 (user / project / local) |
| Agent target | Hermes LLM agent | Any MCP client | Claude Code specifically |
| Hook integration | Custom runtime | MCP tools | Claude Code lifecycle hooks |
| Fact granularity | Single file (MEMORY.md) | One file per entity | Scratchpads + per-fact archive |

---

## 2  Architecture Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                        Claude Code Session                       │
│                                                                  │
│  ┌─────────────┐   ┌──────────────┐   ┌───────────────────────┐ │
│  │  CLAUDE.md   │   │ Hooks Engine │   │   MCP Server (opt.)   │ │
│  │  (loader)    │   │              │   │   memory-kit-mcp      │ │
│  └──────┬───────┘   └──────┬───────┘   └───────────┬───────────┘ │
│         │                  │                       │             │
│         ▼                  ▼                       ▼             │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │                    memory-kit CLI / Library                  │ │
│  │                                                             │ │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────────┐ │ │
│  │  │ Injector │  │ Extractor│  │ Compressor│  │  Indexer   │ │ │
│  │  │ (load)   │  │ (capture)│  │ (sessions)│  │  (search)  │ │ │
│  │  └────┬─────┘  └────┬─────┘  └────┬──────┘  └─────┬──────┘ │ │
│  │       │              │             │               │        │ │
│  │       ▼              ▼             ▼               ▼        │ │
│  │  ┌──────────────────────────────────────────────────────┐   │ │
│  │  │                  Storage Layer                       │   │ │
│  │  │                                                      │   │ │
│  │  │  User-Global        Project          Local           │   │ │
│  │  │  ~/.config/         .memory/         .memory/.local/ │   │ │
│  │  │  memory-kit/        ├─ PROJECT.md    ├─ LOCAL.md     │   │ │
│  │  │  ├─ USER.md         ├─ DECISIONS.md  └─ scratch.md   │   │ │
│  │  │  └─ PREFS.md        ├─ CONVENTIONS.md               │   │ │
│  │  │                     ├─ STACK.md                      │   │ │
│  │  │                     ├─ archive/      ◄── per-fact    │   │ │
│  │  │                     └─ sessions/     ◄── logs        │   │ │
│  │  └──────────────────────────────────────────────────────┘   │ │
│  │                          │                                  │ │
│  │                          ▼ (optional)                       │ │
│  │                 ┌─────────────────┐                         │ │
│  │                 │  SQLite + FTS5  │                         │ │
│  │                 │  (search cache) │                         │ │
│  │                 └─────────────────┘                         │ │
│  └─────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
```

---

## 3  Directory Layout

### 3.1  Project Scope (`.memory/`)

```
<project-root>/
├── .memory/
│   ├── .memorykit.yaml          # Config: char caps, feature flags, version
│   ├── PROJECT.md               # Project overview & architecture (≤ 4,000 chars)
│   ├── DECISIONS.md             # ADR-style decision log (≤ 4,000 chars)
│   ├── CONVENTIONS.md           # Coding standards & patterns (≤ 3,000 chars)
│   ├── STACK.md                 # Tech stack & dependencies (≤ 2,000 chars)
│   │
│   ├── archive/                 # Per-fact granular files
│   │   ├── 2025-01-15_f7a3.md
│   │   ├── 2025-01-15_b2c1.md
│   │   └── ...
│   │
│   ├── sessions/                # Session logs & digests
│   │   ├── 2025-01-16_s1a2b3.md # Today's individual sessions
│   │   ├── 2025-01-15_daily.md  # Yesterday's daily digest
│   │   ├── 2025-W03_weekly.md   # Weekly digest
│   │   └── archive/
│   │       └── 2025-01_monthly.md
│   │
│   ├── .local/                  # Machine-specific (gitignored)
│   │   ├── LOCAL.md             # Local notes (≤ 2,000 chars)
│   │   ├── scratch.md           # Ephemeral notes (≤ 1,500 chars)
│   │   └── cache/
│   │       └── search.db        # SQLite FTS5 index (regenerable)
│   │
│   └── .quarantine/             # Malformed files moved here
│
├── .claude/
│   └── settings.json            # (Modified) hooks config added here
│
├── CLAUDE.md                    # (Modified) loader block added
└── .gitignore                   # (Modified) .memory/.local/ added
```

### 3.2  User-Global Scope

```
# Linux / macOS (XDG)
~/.config/memory-kit/
├── USER.md                      # Identity & preferences (≤ 2,000 chars)
├── PREFERENCES.md               # Coding style & tools (≤ 2,000 chars)
└── config.yaml                  # Global settings

# Windows
%APPDATA%/memory-kit/
├── USER.md
├── PREFERENCES.md
└── config.yaml

# macOS (alternative)
~/Library/Application Support/memory-kit/
├── USER.md
├── PREFERENCES.md
└── config.yaml
```

**Platform detection order**: `$XDG_CONFIG_HOME` → platform default → fallback to `~/.memory-kit/`

---

## 4  Component Design

### 4.1  Initialization (`memory-kit init`)

**Responsibility**: Set up `.memory/` directory structure, configure hooks,
update `CLAUDE.md` and `.gitignore`.

```
memory-kit init [--project-root <path>] [--no-hooks] [--no-claude-md]
```

**Steps**:

1. Detect project root (walk up to find `.git/`)
2. Create `.memory/` directory tree (scratchpads, archive/, sessions/, .local/)
3. Create `.memorykit.yaml` with default config
4. Initialize all scratchpad files with YAML frontmatter (empty body)
5. Add `.memory/.local/` to `.gitignore`
6. Append memory-kit loader block to `CLAUDE.md` (with delimiters)
7. Configure hooks in `.claude/settings.json`
8. Print status summary

**Idempotency**: Running `init` twice is safe — it fills missing pieces
without overwriting existing content.

### 4.2  Injector (Session-Start Context Loader)

**Responsibility**: Assemble all memory content into a single context block
for injection into the Claude Code session.

**Triggered by**: `CLAUDE.md` instructions that tell the agent to read memory files, plus the `SessionStart` hook.

**Injection Strategy — "Frozen Snapshot"** (from Hermes):

The `SessionStart` hook script:
1. Reads user-global files (`USER.md`, `PREFERENCES.md`)
2. Reads project scratchpads (`PROJECT.md`, `DECISIONS.md`, `CONVENTIONS.md`, `STACK.md`)
3. Reads local files (`LOCAL.md`, `scratch.md`)
4. Reads today's session logs (newest first, up to 2,000 chars)
5. Outputs a formatted context block to stdout (which Claude Code injects as context)
6. Optionally triggers lazy compression (if daily/weekly digests are overdue)

**Output Format** (emitted to stdout for the hook):

```markdown
<memory-kit-context>
## User Profile
{USER.md content}

## Preferences
{PREFERENCES.md content}

## Project Overview
{PROJECT.md content}

## Decisions
{DECISIONS.md content}

## Conventions
{CONVENTIONS.md content}

## Tech Stack
{STACK.md content}

## Local Notes
{LOCAL.md content}

## Recent Sessions
{Today's session summaries, newest first}

## Working Notes
{scratch.md content}
</memory-kit-context>
```

**Token Budget**: Total output is capped at 20,500 chars (~5,100 tokens).
If individual files are within their caps, the total is guaranteed to fit.

### 4.3  Extractor (Fact Capture)

**Responsibility**: Extract durable facts from agent activity and user commands.

**Two modes**:

#### 4.3.1  Explicit Extraction (User Commands)

User says "remember X" → the agent (guided by `CLAUDE.md` instructions):
1. Classifies the fact (decision / convention / bug / insight / etc.)
2. Generates YAML frontmatter
3. Writes to the appropriate scratchpad (if space allows)
4. Creates a fact file in `archive/`
5. Returns confirmation with citation ID

#### 4.3.2  Auto-Extraction (PostToolUse Hook)

The `PostToolUse` hook script receives tool output and:
1. Checks if the tool type warrants extraction (file edits, package installs, config changes)
2. Runs a lightweight heuristic to identify durable facts
3. Creates fact files in `archive/` with `confidence: medium`
4. **Never writes directly to scratchpads** (conservative — agent must promote)

**Auto-Extraction Heuristics** (v0.1.0 — intentionally conservative):

| Tool | Pattern | Extracted As |
|---|---|---|
| `Bash` | `npm install`, `pip install`, `cargo add` | Stack dependency |
| `Edit`/`Write` | New config file created | Architecture note |
| `Bash` | Test suite results (pass/fail counts) | Test insight |

**Never extract**:
- Content matching secrets patterns (`sk-*`, `ghp_*`, `AKIA*`, `password=`, etc.)
- Raw error output (too ephemeral)
- File contents longer than 500 chars (too verbose for a fact)

### 4.4  Scratchpad Manager

**Responsibility**: Enforce char caps, handle overflow, support compaction.

**Data Model** (each scratchpad file):

```yaml
---
scope: project
kind: decisions
char_cap: 4000
char_used: 2847         # Auto-calculated on each write
last_modified: 2025-01-15T14:30:00Z
modified_by: session-abc123
version: 3              # Monotonic counter for conflict detection
tags: [architecture, database]
---

# Decisions

## 2025-01-15: PostgreSQL over MySQL [ref:f7a3c1d2]
Chose PostgreSQL for JSONB support and team familiarity.

## 2025-01-10: Monorepo Structure [ref:b2c14e8f]
Single repo with packages/ directory for shared code.
```

**Write Algorithm**:

```
function write_to_scratchpad(file, content):
    current = read_file(file)
    frontmatter = parse_frontmatter(current)

    new_body = apply_edit(current.body, content)
    new_char_count = len(new_body)

    if new_char_count > frontmatter.char_cap:
        return Error("Exceeds cap: {new_char_count}/{frontmatter.char_cap}. "
                     "Run 'compact' to free space or archive old entries.")

    frontmatter.char_used = new_char_count
    frontmatter.last_modified = now()
    frontmatter.modified_by = current_session_id()
    frontmatter.version += 1

    write_file(file, serialize(frontmatter, new_body))
    return Ok(citation_id)
```

**Compact Algorithm**:

```
function compact(file):
    current = read_file(file)
    entries = parse_entries(current.body)

    # Archive each entry as a standalone fact
    for entry in entries:
        create_fact_file(entry, source="compact")

    # Ask the LLM to produce a summary
    summary = llm_summarize(entries, target_chars=frontmatter.char_cap * 0.6)

    write_scratchpad(file, summary)
    return CompactReport(
        entries_archived=len(entries),
        chars_before=current.char_used,
        chars_after=len(summary)
    )
```

### 4.5  Fact Archive Manager

**Responsibility**: CRUD operations on granular fact files in `.memory/archive/`.

**Fact ID Generation**:

```python
import hashlib, datetime

def generate_fact_id(content: str) -> str:
    """First 8 chars of SHA-256 of the initial content."""
    return hashlib.sha256(content.encode()).hexdigest()[:8]

def fact_filename(fact_id: str) -> str:
    """Date-prefixed filename for sort order."""
    date = datetime.date.today().isoformat()
    return f"{date}_{fact_id}.md"
```

**Fact File Template**:

```yaml
---
id: {fact_id}
created: {iso_timestamp}
source_session: {session_id}
category: {decision|convention|bug|insight|preference|tool|architecture}
confidence: {high|medium|low}
tags: [{tag1}, {tag2}]
supersedes: null
status: active
private: false
retain: false
---

# {Title}

{Body — the actual fact content}

**Source**: {How this fact was captured}
```

**Operations**:

| Operation | Description |
|---|---|
| `create(content, category, tags)` | Create a new fact file |
| `read(fact_id)` | Read a fact by ID |
| `search(query, filters)` | Search facts by text, category, tags |
| `supersede(old_id, new_content)` | Create new fact that supersedes old |
| `retract(fact_id)` | Mark fact as retracted |
| `list(filters)` | List facts with optional filtering |

### 4.6  Session Compressor

**Responsibility**: Write session summaries and compress them into rolling digests.

**Compression Pipeline**:

```
                     SessionEnd hook
                          │
                          ▼
              ┌───────────────────┐
              │  Session Summary  │  ~500-1000 chars
              │  {date}_{sid}.md  │  Full detail
              └────────┬──────────┘
                       │  daily (lazy on next session start)
                       ▼
              ┌───────────────────┐
              │   Daily Digest    │  ≤ 2,000 chars
              │  {date}_daily.md  │  Merged sessions
              └────────┬──────────┘
                       │  weekly (lazy or cron)
                       ▼
              ┌───────────────────┐
              │  Weekly Digest    │  ≤ 1,500 chars
              │  {date}_weekly.md │  Key decisions only
              └────────┬──────────┘
                       │  monthly (lazy or cron)
                       ▼
              ┌───────────────────┐
              │  Monthly Archive  │  ≤ 1,000 chars
              │  {year-mo}.md     │  High-level summary
              └───────────────────┘
```

**Lazy Compression Strategy**:

At each `SessionStart`, before injecting context:
1. Check if any daily digests are overdue (sessions from yesterday not yet merged)
2. Check if any weekly digests are overdue (daily digests from last week not merged)
3. Run compression if needed — this is a lightweight operation (read + summarize + write)
4. Delete source files after successful compression

**Summarization**: In v0.1.0, session summaries are generated by the
`Stop` hook script reading the session transcript (available at
`transcript_path` in the hook input) and extracting key points. This uses
a simple heuristic approach — not an LLM call (to avoid network
dependencies). The heuristic:
- Extracts tool uses and their outcomes
- Extracts file paths modified
- Preserves any text the agent output as "decisions" or "conclusions"
- Caps at 1,000 chars

For daily/weekly/monthly digests, a more sophisticated approach is used
when the agent is available (via `CLAUDE.md` instructions telling the
agent to run compression tasks).

### 4.7  Search Indexer (Optional — v0.1.0+)

**Responsibility**: Build and query a full-text search index over all facts and scratchpads.

**Implementation**: SQLite with FTS5 extension.

**Index Location**: `.memory/.local/cache/search.db` (gitignored, regenerable)

**Schema**:

```sql
CREATE VIRTUAL TABLE facts_fts USING fts5(
    fact_id,
    title,
    body,
    category,
    tags,
    created,
    status
);

CREATE TABLE index_meta (
    key TEXT PRIMARY KEY,
    value TEXT
);
-- key='last_rebuild', value=ISO timestamp
-- key='version', value='1'
```

**Rebuild**: `memory-kit reindex` scans all `.md` files in `.memory/`
and rebuilds the FTS5 index from scratch. This is idempotent and safe
to run at any time.

**Query**: `memory-kit search "database migration" --category decision`

---

## 5  Claude Code Integration

### 5.1  Hook Configuration

Hooks are configured in `.claude/settings.json`:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "memory-kit hook session-start"
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Bash|Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "memory-kit hook post-tool-use"
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "memory-kit hook stop"
          }
        ]
      }
    ]
  }
}
```

### 5.2  Hook Scripts

Each hook is a subcommand of the `memory-kit` CLI:

#### `memory-kit hook session-start`

```
stdin  → { hook_event_name, session_id, cwd, source }
stdout → <memory-kit-context>...</memory-kit-context>
exit 0
```

1. Parse JSON from stdin
2. Resolve project root from `cwd`
3. Run lazy compression if overdue
4. Assemble context from all scopes
5. Output formatted context block to stdout
6. Exit 0 (non-blocking)

#### `memory-kit hook post-tool-use`

```
stdin  → { hook_event_name, session_id, tool_name, tool_input, tool_output }
stdout → (empty or extraction confirmation)
exit 0
```

1. Parse JSON from stdin
2. Check tool type against extraction heuristics
3. If extractable → create fact in archive with `confidence: medium`
4. Output nothing (silent) or brief confirmation
5. Exit 0

#### `memory-kit hook stop`

```
stdin  → { hook_event_name, session_id, stop_hook_active, transcript_path }
stdout → {} (empty to allow stop)
exit 0
```

1. Parse JSON from stdin
2. **Check `stop_hook_active`** — if true, immediately exit 0 (avoid infinite loop)
3. Read transcript from `transcript_path`
4. Generate session summary (heuristic extraction)
5. Write session summary to `.memory/sessions/{date}_{session_id}.md`
6. Update `scratch.md` with any open items detected
7. Output `{}` to stdout (allow stop)
8. Exit 0

### 5.3  CLAUDE.md Loader Block

Added to the project's `CLAUDE.md` between delimiters:

```markdown
<!-- memory-kit:start -->
## Memory Kit

This project uses memory-kit for persistent memory across sessions.

### Memory Commands
- Say "remember <fact>" to store a durable fact
- Say "forget <fact>" to retract a stored fact
- Say "recall <topic>" to search memory
- Say "memory status" to see usage stats
- Say "compact <file>" to consolidate a scratchpad

### Memory Files
Memory is stored in `.memory/`. At session start, a SessionStart hook
injects all memory content as context. You can also directly read files
in `.memory/` for full detail.

### Important Rules
1. Never store secrets, API keys, or tokens in memory files
2. When near a scratchpad's char cap, archive old entries before adding new ones
3. Always include citation IDs [ref:xxxxxxxx] when referencing stored facts
4. Respect `private: true` and `retain: true` flags on facts
<!-- memory-kit:end -->
```

### 5.4  Coexistence with Auto-Memory

| Concern | Strategy |
|---|---|
| Directory separation | Memory Kit uses `.memory/`, auto-memory uses `~/.claude/projects/<id>/memory/` |
| CLAUDE.md | Memory Kit's additions are delimited; auto-memory doesn't modify CLAUDE.md |
| Duplicate facts | Both systems may store the same fact; this is acceptable — the user can curate |
| Disable collision | Memory Kit works whether auto-memory is enabled or disabled |
| Token budget | Memory Kit's 5K token budget is set assuming auto-memory may also inject ~2K tokens |

---

## 6  CLI Design

### 6.1  Command Tree

```
memory-kit
├── init                         # Initialize .memory/ in current project
├── status                       # Show per-file usage, archive stats
├── remember <text>              # Create a fact (interactive categorization)
├── forget <fact-id>             # Retract a fact
├── recall <query>               # Search facts and scratchpads
├── compact <file>               # Consolidate a scratchpad
├── reindex                      # Rebuild FTS5 search index
├── hook                         # Hook subcommands (called by Claude Code)
│   ├── session-start
│   ├── post-tool-use
│   └── stop
├── export                       # Export all memory as a single markdown doc
├── doctor                       # Validate file integrity, fix issues
└── version                      # Show version
```

### 6.2  Implementation Language

**Python 3.11+** with:
- `click` for CLI framework
- `pyyaml` for YAML parsing
- `python-frontmatter` for markdown + YAML frontmatter
- No external services or network calls
- Optional: `sqlite3` (stdlib) for FTS5 indexing

**Packaging**: Published as `memory-kit` on PyPI. Installed via `pip install memory-kit` or `pipx install memory-kit`.

**Entry point**: `memory-kit` (console script)

---

## 7  Data Flow Diagrams

### 7.1  Session Start

```
SessionStart hook fires
         │
         ▼
memory-kit hook session-start
         │
         ├── Read ~/.config/memory-kit/USER.md
         ├── Read ~/.config/memory-kit/PREFERENCES.md
         ├── Read .memory/PROJECT.md
         ├── Read .memory/DECISIONS.md
         ├── Read .memory/CONVENTIONS.md
         ├── Read .memory/STACK.md
         ├── Read .memory/.local/LOCAL.md
         ├── Read .memory/.local/scratch.md
         ├── Read .memory/sessions/ (today's logs)
         │
         ├── Run lazy compression if overdue
         │
         ▼
    Assemble context block
         │
         ▼
    Output to stdout → Claude Code injects as context
```

### 7.2  Remember Flow

```
User: "remember that we use black for formatting with line-length 88"
         │
         ▼
Claude Code agent (guided by CLAUDE.md instructions)
         │
         ├── Classify: category=convention, tags=[python, formatting]
         ├── Generate fact ID: sha256("we use black...")[:8] → "a1b2c3d4"
         │
         ├── Check CONVENTIONS.md capacity
         │   ├── If space: append entry with [ref:a1b2c3d4]
         │   └── If full: suggest compact, skip scratchpad update
         │
         ├── Create .memory/archive/2025-01-16_a1b2c3d4.md
         │
         └── Respond: "Stored as [ref:a1b2c3d4] in CONVENTIONS.md and archive."
```

### 7.3  Session End

```
Stop hook fires
         │
         ▼
memory-kit hook stop
         │
         ├── Check stop_hook_active (if true → exit 0 immediately)
         │
         ├── Read transcript from transcript_path
         │
         ├── Heuristic extraction:
         │   ├── Tool uses + outcomes
         │   ├── Files modified
         │   ├── Key decisions/conclusions
         │
         ├── Write .memory/sessions/2025-01-16_s1a2b3.md
         │
         ├── Update scratch.md with open items
         │
         └── Output {} → allow stop
```

---

## 8  Configuration Schema

### `.memorykit.yaml`

```yaml
# Memory Kit Configuration
version: "0.1.0"

# Character caps for scratchpad files (can be customized per-project)
caps:
  USER.md: 2000
  PREFERENCES.md: 2000
  PROJECT.md: 4000
  DECISIONS.md: 4000
  CONVENTIONS.md: 3000
  STACK.md: 2000
  LOCAL.md: 2000
  scratch.md: 1500

# Feature flags
features:
  auto_extract: true           # Enable PostToolUse auto-extraction
  lazy_compression: true       # Compress session logs on next session start
  session_logging: true        # Write session summaries on Stop
  fts_index: false             # Build FTS5 search index (optional)

# Auto-extraction settings
extraction:
  confidence_default: medium   # Default confidence for auto-extracted facts
  secrets_filter: true         # Enable secrets pattern filtering
  max_fact_length: 500         # Max chars for a single auto-extracted fact
  patterns:                    # Secrets patterns to filter (regex)
    - 'sk-[a-zA-Z0-9]{20,}'
    - 'ghp_[a-zA-Z0-9]{36}'
    - 'AKIA[A-Z0-9]{16}'
    - 'password\s*[=:]\s*\S+'
    - 'secret\s*[=:]\s*\S+'
    - 'token\s*[=:]\s*\S+'

# Session compression settings
compression:
  session_max_chars: 1000      # Max chars per session summary
  daily_max_chars: 2000        # Max chars per daily digest
  weekly_max_chars: 1500       # Max chars per weekly digest
  monthly_max_chars: 1000      # Max chars per monthly archive

# Gitignore patterns to add
gitignore:
  - ".memory/.local/"
  - ".memory/.quarantine/"
```

---

## 9  Security & Integrity

### 9.1  Secrets Filter

Before writing any auto-extracted fact:

```python
import re

SECRETS_PATTERNS = [
    r'sk-[a-zA-Z0-9]{20,}',
    r'ghp_[a-zA-Z0-9]{36}',
    r'AKIA[A-Z0-9]{16}',
    r'password\s*[=:]\s*\S+',
    r'secret\s*[=:]\s*\S+',
    r'token\s*[=:]\s*\S+',
    r'-----BEGIN\s+(RSA\s+)?PRIVATE\s+KEY-----',
    r'Bearer\s+[a-zA-Z0-9\-._~+/]+=*',
]

def contains_secret(text: str) -> bool:
    return any(re.search(p, text, re.IGNORECASE) for p in SECRETS_PATTERNS)
```

### 9.2  Frontmatter Validation

On every file read:

```python
def validate_frontmatter(filepath: str) -> Result:
    try:
        post = frontmatter.load(filepath)
        # Check required fields
        required = ['scope', 'kind', 'char_cap']
        for field in required:
            if field not in post.metadata:
                return Error(f"Missing required field: {field}")
        # Check char_used <= char_cap
        if post.metadata.get('char_used', 0) > post.metadata['char_cap']:
            return Warning(f"char_used exceeds char_cap")
        return Ok(post)
    except Exception as e:
        # Quarantine malformed file
        move_to_quarantine(filepath)
        return Error(f"Malformed file quarantined: {e}")
```

### 9.3  Source Provenance

Every fact records:
- `source_session`: The session ID that created it
- `confidence`: high (user-explicit) | medium (auto-extracted) | low (inferred)
- `created`: Immutable timestamp
- `status`: active | superseded | retracted (never truly deleted)

---

## 10  Error Handling & Graceful Degradation

| Scenario | Behavior |
|---|---|
| `.memory/` doesn't exist | Hook outputs empty context; agent works without memory |
| Scratchpad missing | Created on first write with empty body + valid frontmatter |
| Malformed frontmatter | File moved to `.quarantine/`; logged; operation continues |
| Hook script crashes | Claude Code shows error in verbose mode; session continues |
| SQLite index missing | Search falls back to grep over markdown files |
| User-global dir missing | Only project + local scopes loaded |
| Char cap exceeded on write | Write rejected with informative error; agent prompted to compact |
| `stop_hook_active` is true | Immediate exit 0 — prevents infinite hook loops |
| Transcript file missing/empty | Session summary skipped; logged as warning |

---

## 11  Testing Strategy

### 11.1  Unit Tests

| Module | Key Tests |
|---|---|
| Scratchpad Manager | Char cap enforcement, frontmatter parsing, overflow rejection |
| Fact Archive | ID generation, CRUD operations, supersession, retraction |
| Session Compressor | Summary generation, compression pipeline, file cleanup |
| Injector | Context assembly, scope resolution, char budget compliance |
| Secrets Filter | Pattern matching for all secret types, false positive avoidance |
| Config Loader | YAML parsing, defaults, platform-specific paths |

### 11.2  Integration Tests

| Test | Description |
|---|---|
| `init` idempotency | Run `init` twice → no errors, no overwrites |
| Hook round-trip | Simulate SessionStart → tool use → Stop → verify files created |
| Compression pipeline | Create 5 sessions → daily digest → verify merge |
| Cross-platform paths | Test on Windows, macOS, Linux path resolution |
| Git clone portability | Init in repo A → clone → verify memory loads in repo B |

### 11.3  Property-Based Tests

- Char cap is never exceeded after any sequence of writes
- Fact IDs are deterministic (same content → same ID)
- Retracted facts never appear in injected context
- Session compression never loses referenced fact IDs

---

## 12  Future Considerations (Post v0.1.0)

| Feature | Version | Notes |
|---|---|---|
| MCP server (`memory-kit-mcp`) | v0.2.0 | Expose read/write/search as MCP tools |
| Vector search (semantic) | v0.2.0 | Local embeddings via sentence-transformers |
| Cron jobs (daily distill, weekly curate) | v0.2.0 | OS-native scheduled tasks |
| Multi-user support | v0.3.0 | Fact attribution per user |
| Claude Code `/memory` slash command integration | v0.3.0 | Register as a custom command |
| Web dashboard | v0.4.0 | Local web UI for browsing memory graph |
| Obsidian plugin | v0.4.0 | Two-way sync with Obsidian vault |
