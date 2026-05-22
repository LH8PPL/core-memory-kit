# requirements.md — Claude Code Repo Memory v0.1.0

## 1. Product summary

Claude Code Repo Memory is a per-project, in-repository memory system for Anthropic's Claude Code CLI. It gives Claude Code durable project context across sessions by storing curated memory as auditable Markdown files inside the repository, while preserving local/private machine facts outside Git and coexisting with Claude Code's native CLAUDE.md and auto-memory behavior.

The v0.1.0 release is an MVP focused on reliable file layout, lifecycle-hook capture, explicit user controls, bounded scratchpads, stable fact IDs, session distillation, and a local MCP interface. SQLite and vector search may exist as generated indexes, but Markdown remains the source of truth.

## 2. Goals

### 2.1 Functional goals

1. Store durable project memory inside the Git repository so it travels with `git clone`.
2. Use human-readable Markdown as the canonical memory format.
3. Load memory into Claude Code at session start as additional context.
4. Capture durable facts automatically from Claude Code lifecycle hooks.
5. Support explicit user commands such as `remember this`, `forget that`, `correct memory`, and `what do you remember about ...`.
6. Keep scratchpad files bounded by hard character caps to force curation.
7. Maintain a granular archive where each durable fact has a stable citation ID.
8. Support three scopes:
   - user-global: cross-project identity/preferences, outside the repo by default;
   - project: repo-tracked memory;
   - local: per-machine/private memory, gitignored.
9. Compress session logs into a rolling lifecycle: `now` → `today` → `recent` → `archive`.
10. Coexist safely with Claude Code native auto memory, CLAUDE.md, CLAUDE.local.md, and `.claude/rules/`.
11. Provide an MCP server for programmatic memory search, read, write, forget, and citation lookup.
12. Avoid silent network calls.
13. Provide conservative automatic extraction to reduce memory poisoning.

### 2.2 Non-goals for v0.1.0

1. No hosted sync service.
2. No mandatory vector database.
3. No cloud embedding calls.
4. No automatic commits or pushes.
5. No attempt to override Claude Code's internal auto memory.
6. No hidden binary source-of-truth database.
7. No multi-user conflict resolution beyond Git-friendly Markdown and deterministic IDs.
8. No sophisticated knowledge graph UI.

## 3. Reference constraints

The design is aligned with current Claude Code behavior and adjacent memory systems:

1. Claude Code hook events can run commands, HTTP endpoints, or prompt hooks at lifecycle points such as `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `Stop`, and `SessionEnd`.
2. Claude Code memory consists of user-authored `CLAUDE.md`-style files and native auto memory. Both are loaded at the start of a session as context, not as enforced configuration.
3. Claude Code native auto memory is on by default in v2.1.59+, is stored under `~/.claude/projects/<project>/memory/`, is machine-local, and loads the first 200 lines or 25 KB of native `MEMORY.md` at session start.
4. Hermes Agent demonstrates bounded curated memory files with explicit character limits and session-start injection.
5. Basic Memory demonstrates plain Markdown as owned, editable, graph-like AI memory, with MCP access and Git-friendly workflows.

## 4. User stories

### 4.1 Project onboarding

As a developer cloning a project, I want Claude Code to immediately understand the project's architecture, conventions, decisions, and commands without me re-explaining prior sessions.

Acceptance criteria:
- A fresh clone contains `.memory/project/` Markdown files.
- Running the install command creates local ignored files but does not overwrite tracked memory.
- Session start injects a concise memory bundle into Claude Code.

### 4.2 Explicit remembering

As a user, I want to say `remember this: we use pnpm and never npm` and have the memory system store a durable, auditable fact.

Acceptance criteria:
- `UserPromptSubmit` detects explicit remember intent.
- The system creates a fact with a stable citation ID.
- The fact is added to the appropriate index and scratchpad.
- The resulting Markdown is readable and editable.

### 4.3 Explicit forgetting

As a user, I want to say `forget that we use Jest` and have the system remove or tombstone matching memory.

Acceptance criteria:
- The system finds candidate facts and scratchpad entries.
- It removes active references from loaded memory.
- It writes a tombstone record to preserve auditability without resurfacing the fact.
- It never deletes unrelated facts silently.

### 4.4 Automatic capture

As a user, I want important durable facts discovered during work to be proposed or captured automatically, without storing every transient detail.

Acceptance criteria:
- Auto-extraction runs at `Stop` or `SessionEnd` from session logs.
- Only high-confidence durable facts are captured automatically.
- Low-confidence candidates go to a review queue.
- Secrets, credentials, tokens, raw personal data, and private paths are redacted or rejected by default.

### 4.5 Bounded context

As a user, I want memory files to stay small enough that Claude Code loads useful context, not bloated logs.

Acceptance criteria:
- Scratchpad files have enforced character caps.
- CI or a local check fails when caps are exceeded.
- Distillation jobs move old details from scratchpad files into granular archive facts.

### 4.6 Local/private facts

As a user, I want local machine facts such as local paths, installed tools, or private tokens to stay off Git.

Acceptance criteria:
- `.memory/local/` is gitignored.
- Local facts can be loaded at session start on that machine only.
- Local facts are marked `scope: local`.

### 4.7 Auditability

As a maintainer, I want to inspect every memory fact, know when it was created, why it exists, and where it was derived from.

Acceptance criteria:
- Every fact archive entry includes stable ID, timestamp, scope, confidence, tags, source event, source transcript pointer when available, status, and current text.
- Every fact can be cited as `mem://fact/<id>`.
- Generated indexes point back to granular fact files.

## 5. Functional requirements

### FR-001 Repository layout

The system must create and maintain this minimum layout:

```text
.memory/
  README.md
  project/
    MEMORY.md
    DECISIONS.md
    CONVENTIONS.md
    ARCHITECTURE.md
    COMMANDS.md
    OPEN_QUESTIONS.md
  facts/
    active/
      YYYY/
        YYYY-MM-DD-<slug>-<id>.md
    tombstones/
      YYYY/
        YYYY-MM-DD-<slug>-<id>.md
  sessions/
    now.md
    today.md
    recent.md
    archive/
      YYYY/
        YYYY-MM-DD.md
  queues/
    review.md
    conflicts.md
  indexes/
    facts.json
    citations.md
  cache/
    sqlite/
    vector/
  local/
    LOCAL.md
    MACHINE.md
.memoryrc.yml
```

The generated installer must add the following to `.gitignore`:

```gitignore
.memory/local/
.memory/cache/
.memory/sessions/now.md
```

### FR-002 User-global scope

The system must support a user-global directory outside the repo, defaulting to:

- Linux/macOS: `~/.claude-repo-memory/user/`
- Windows: `%USERPROFILE%\.claude-repo-memory\user\`

Minimum files:

```text
USER.md
PREFERENCES.md
IDENTITY.md
```

User-global files must not be automatically copied into project repos.

### FR-003 Markdown source of truth

All canonical memory must be stored as Markdown with YAML frontmatter. Generated SQLite, FTS5, and vector indexes must be rebuildable from Markdown.

### FR-004 Fact schema

Every granular fact file must use this frontmatter schema:

```yaml
id: mem-YYYYMMDD-<8-char-base32-or-hex>
schema_version: 1
status: active | tombstoned | superseded
scope: user | project | local
kind: preference | decision | convention | command | architecture | issue | environment | workflow | reference | warning
tags: []
confidence: high | medium | low
retention: default | private | retain | ephemeral
created_at: ISO-8601
updated_at: ISO-8601
source:
  event: explicit_user | auto_extract | import | manual_edit
  session_id: optional-string
  transcript_ref: optional-string
  tool_ref: optional-string
supersedes: []
superseded_by: []
privacy:
  contains_secret: false
  contains_personal_data: false
```

The body must include:

```markdown
# <short fact title>

## Fact
<one durable fact>

## Rationale
<why this is durable enough to keep>

## Evidence
- <source summary or transcript pointer>

## Related
- mem://fact/<id>
```

### FR-005 Stable citation IDs

The system must generate stable fact IDs at creation time and never reuse them. File renames must not change IDs. Citations must use `mem://fact/<id>`.

### FR-006 Scratchpad caps

The system must enforce these default hard caps:

| File | Default hard cap |
|---|---:|
| `.memory/project/MEMORY.md` | 12,000 chars |
| `.memory/project/DECISIONS.md` | 16,000 chars |
| `.memory/project/CONVENTIONS.md` | 10,000 chars |
| `.memory/project/ARCHITECTURE.md` | 18,000 chars |
| `.memory/project/COMMANDS.md` | 10,000 chars |
| `.memory/project/OPEN_QUESTIONS.md` | 8,000 chars |
| user-global `USER.md` | 8,000 chars |
| `.memory/local/LOCAL.md` | 8,000 chars |
| `.memory/sessions/today.md` | 20,000 chars |
| `.memory/sessions/recent.md` | 40,000 chars |

When a cap is exceeded, the system must fail the write and create a curation task in `.memory/queues/review.md`.

### FR-007 Session rolling window

The system must maintain session summaries as follows:

1. `now.md`: current live session notes; gitignored.
2. `today.md`: append-only summary for the current local day.
3. `recent.md`: rolling summary for the last N days, default 14.
4. `archive/YYYY/YYYY-MM-DD.md`: compressed daily archive.

### FR-008 Claude Code hook integration

The system must support hook handlers for:

| Hook | Required behavior |
|---|---|
| `SessionStart` | Build and print a bounded memory bundle for Claude to load as context. |
| `UserPromptSubmit` | Detect explicit remember/forget/query/correct intents; log prompt metadata safely. |
| `PreToolUse` | Optionally block or warn on dangerous edits to memory files, secrets, or generated caches. |
| `PostToolUse` | Observe file/tool outcomes and collect candidate facts without storing raw secrets. |
| `Stop` | Distill turn-level durable candidates into queue or facts. |
| `SessionEnd` | Finalize session summary and rotate `now → today`. |

The implementation must tolerate missing hook events or older Claude Code versions by degrading gracefully.

### FR-009 Explicit controls

The system must recognize at least these command patterns:

- `remember this: <text>`
- `remember that <text>`
- `add to project memory: <text>`
- `add to local memory: <text>`
- `forget that <text>`
- `remove from memory: <text>`
- `correct memory: <old> => <new>`
- `what do you remember about <topic>`

### FR-010 Auto-extraction rules

Automatic extraction must be conservative. A fact is eligible for automatic active storage only when:

1. It is likely to remain true for weeks or months.
2. It is useful for future coding sessions.
3. It is not a secret, credential, token, or private path unless scoped local/private.
4. It is supported by explicit user statement, project files, command output, or repeated interaction.
5. It does not conflict with higher-priority memory.

Otherwise, it must go to `.memory/queues/review.md`.

### FR-011 Poisoning defenses

The system must include:

1. Source tagging on every fact.
2. Confidence labels.
3. `private`, `retain`, and `ephemeral` retention tags.
4. Secret scanning before writes.
5. Contradiction detection against active facts.
6. Tombstones instead of destructive deletion by default.
7. No automatic promotion from untrusted tool output to active memory without user confirmation or high-confidence project evidence.
8. A review queue for suspicious or low-confidence candidates.

### FR-012 MCP server

The system must expose a local MCP server with at least these tools:

- `memory.search(query, scope?, kind?, limit?)`
- `memory.read(id_or_path)`
- `memory.remember(text, scope?, kind?, tags?, retention?)`
- `memory.forget(query_or_id, mode?)`
- `memory.correct(id_or_query, replacement_text)`
- `memory.list_recent(limit?)`
- `memory.citations(query?)`
- `memory.health()`
- `memory.rebuild_index()`

MCP must use local stdio by default and must not make network calls.

### FR-013 Generated indexes

The system must generate:

- `.memory/indexes/facts.json`
- optional SQLite FTS5 cache under `.memory/cache/sqlite/`
- optional vector index under `.memory/cache/vector/`

Indexes must be rebuildable from Markdown using `memory index rebuild`.

### FR-014 Coexistence with native Claude Code memory

The system must:

1. Keep repo memory under `.memory/` and not write into Claude Code native auto-memory by default.
2. Optionally add a short pointer to `CLAUDE.md` instructing Claude to read the repo-memory bundle.
3. Detect native auto-memory availability and configuration where possible.
4. Avoid duplicating large generated summaries into native `MEMORY.md`.
5. Provide a `memory status` command showing native memory status and repo-memory status separately.

### FR-015 Cross-OS support

The CLI and hooks must run on Windows, macOS, and Linux. Requirements:

- Path handling must use platform-safe APIs.
- Hook scripts must be invocable via `node`, `python`, or a compiled single binary, not Bash-only.
- Newline handling must be deterministic.
- File locking must work across OSes.

### FR-016 No silent network calls

The system must not call remote APIs unless the user explicitly enables a feature requiring network access. v0.1.0 defaults to fully local operation.

### FR-017 Configuration

The project config file `.memoryrc.yml` must support:

```yaml
schema_version: 1
memory_root: .memory
project_name: auto
caps:
  project_memory_chars: 12000
  today_chars: 20000
  recent_chars: 40000
sessions:
  recent_days: 14
auto_extract:
  enabled: true
  default_destination: review
  promote_high_confidence: false
privacy:
  secret_scan: true
  local_private_by_default: true
native_claude_code:
  coexist: true
  write_native_memory: false
index:
  sqlite: true
  vector: false
network:
  allow: false
```

## 6. Quality requirements

### QR-001 Reliability

Memory writes must be atomic. Interrupted writes must not corrupt Markdown files.

### QR-002 Idempotency

Running install, index rebuild, distill, and hook handlers repeatedly must not duplicate facts.

### QR-003 Observability

The CLI must support `--verbose` and write local logs to `.memory/local/logs/`, which is gitignored.

### QR-004 Testability

v0.1.0 must include unit tests for fact parsing, cap enforcement, ID stability, forget/correct flows, and session rotation.

### QR-005 Performance

SessionStart bundle generation should complete in under 500 ms for 1,000 fact files on a typical developer laptop, excluding optional vector index rebuild.

## 7. CLI requirements

Minimum CLI commands:

```bash
memory init
memory status
memory bundle
memory remember "<text>" --scope project
memory forget "<query-or-id>"
memory correct "<query-or-id>" "<new text>"
memory search "<query>"
memory distill
memory rotate
memory index rebuild
memory caps check
memory mcp
```

## 8. Release acceptance checklist

v0.1.0 is complete when:

- `memory init` creates the repo layout and `.memoryrc.yml`.
- Claude Code hooks can call the CLI on all target OSes.
- `SessionStart` produces a bounded memory bundle.
- Explicit remember/forget/correct flows work.
- Facts are stored as Markdown with stable IDs.
- Scratchpad caps are enforced.
- Session rolling window works.
- MCP server exposes the required tools.
- All generated indexes are rebuildable.
- Native Claude Code auto-memory is detected but not modified by default.
- No network calls are made in default configuration.
