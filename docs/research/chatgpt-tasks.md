# tasks.md — Claude Code Repo Memory v0.1.0

## Milestone 0 — Repository bootstrap

### T0001 Choose implementation language and package shape

- Decide between TypeScript/Node.js, Python/uv, or compiled Go/Rust.
- Recommendation for v0.1.0: TypeScript/Node.js for cross-platform hooks and simple CLI distribution.
- Define binary name: `memory` or `repo-memory`.

Acceptance criteria:
- A developer can run the CLI on Windows, macOS, and Linux.
- Hook commands do not require Bash.

### T0002 Create project skeleton

Create:

```text
src/
tests/
fixtures/
README.md
package.json or pyproject.toml
```

Acceptance criteria:
- `memory --help` works.
- Test runner works.

## Milestone 1 — Config and paths

### T0101 Implement repo root detection

- Detect Git root.
- Fall back to current working directory with warning.
- Normalize paths cross-platform.

Acceptance criteria:
- Works from repo root and subdirectories.
- Windows paths are handled correctly.

### T0102 Implement `.memoryrc.yml` loader

- Parse config.
- Apply defaults.
- Validate schema version.

Acceptance criteria:
- Missing config returns defaults for `init`.
- Invalid config returns actionable errors.

### T0103 Implement platform path resolver

Resolve:
- project memory root;
- user-global memory root;
- local memory root;
- cache path;
- index path.

Acceptance criteria:
- Unit tests cover Linux/macOS/Windows path examples.

## Milestone 2 — `memory init`

### T0201 Create `.memory/` layout

Create all v0.1.0 directories and starter files.

Acceptance criteria:
- Running `memory init` twice is idempotent.
- Existing files are not overwritten unless `--force` is used.

### T0202 Generate starter scratchpads

Generate:
- `.memory/project/MEMORY.md`
- `.memory/project/DECISIONS.md`
- `.memory/project/CONVENTIONS.md`
- `.memory/project/ARCHITECTURE.md`
- `.memory/project/COMMANDS.md`
- `.memory/project/OPEN_QUESTIONS.md`

Acceptance criteria:
- Each file has a short explanation and citation convention.
- Files stay under default caps.

### T0203 Update `.gitignore`

Add:

```gitignore
.memory/local/
.memory/cache/
.memory/sessions/now.md
.memory/local/logs/
```

Acceptance criteria:
- Existing `.gitignore` content is preserved.
- Duplicate entries are not added.

### T0204 Generate `.memoryrc.yml`

Acceptance criteria:
- Config includes caps, sessions, auto_extract, privacy, native_claude_code, index, and network sections.

### T0205 Optional CLAUDE.md pointer

Implement `memory init --add-claude-pointer`.

Acceptance criteria:
- Adds a short repo-memory section to `CLAUDE.md`.
- Does not add duplicate section.
- Default init does not modify `CLAUDE.md` unless explicitly requested.

## Milestone 3 — Markdown fact store

### T0301 Define fact model

Implement types/schema for:
- id;
- schema_version;
- status;
- scope;
- kind;
- tags;
- confidence;
- retention;
- timestamps;
- source;
- privacy.

Acceptance criteria:
- Schema validation rejects malformed facts.

### T0302 Implement stable ID generator

Format:

```text
mem-YYYYMMDD-XXXXXXXX
```

Acceptance criteria:
- IDs are unique in fixture stress test.
- IDs do not change on file rename.

### T0303 Implement Markdown parser/writer

- Parse YAML frontmatter.
- Preserve body.
- Write canonical frontmatter order.

Acceptance criteria:
- Round-trip tests pass.

### T0304 Implement atomic write utility

Acceptance criteria:
- Simulated failed write does not corrupt original file.
- Temp files are cleaned up when possible.

### T0305 Implement file lock

Acceptance criteria:
- Concurrent writes serialize.
- Lock timeout produces clear error.

## Milestone 4 — Remember, forget, correct

### T0401 Implement `memory remember`

Options:

```bash
memory remember "<text>" --scope project --kind decision --tag api
```

Acceptance criteria:
- Creates active fact file.
- Updates `facts.json`.
- Optionally appends citation to relevant scratchpad.

### T0402 Implement explicit command parser

Recognize:
- `remember this:`
- `remember that`
- `add to project memory:`
- `add to local memory:`
- `forget that`
- `remove from memory:`
- `correct memory:`
- `what do you remember about`

Acceptance criteria:
- Parser returns intent, scope, text, and confidence.
- Ambiguous commands are not destructively executed.

### T0403 Implement `memory forget`

Behavior:
- query facts;
- if exact ID, tombstone directly;
- if ambiguous query, return candidates;
- update indexes;
- remove or rewrite scratchpad references.

Acceptance criteria:
- Active fact is moved or copied to tombstones with `status: tombstoned`.
- Memory bundle excludes tombstoned facts.

### T0404 Implement `memory correct`

Behavior:
- identify old fact;
- create new fact;
- mark old fact superseded or tombstoned;
- update scratchpads.

Acceptance criteria:
- Old fact links to new fact via `superseded_by`.
- New fact links via `supersedes`.

## Milestone 5 — Scratchpad caps and curation

### T0501 Implement cap checker

Command:

```bash
memory caps check
```

Acceptance criteria:
- Reports file, cap, current chars, and overage.
- Exits non-zero on cap violation.

### T0502 Enforce caps on writes

Acceptance criteria:
- Writes that exceed caps are rejected.
- Review queue entry is created.

### T0503 Implement scratchpad citation validation

Acceptance criteria:
- Broken `mem://fact/...` citations are reported.
- Tombstoned citations are reported separately.

## Milestone 6 — Indexing and search

### T0601 Implement `facts.json` index

Fields:
- id;
- title;
- path;
- status;
- scope;
- kind;
- tags;
- updated_at;
- citation;
- short text/snippet.

Acceptance criteria:
- `memory index rebuild` regenerates deterministic JSON.

### T0602 Implement basic full-text search

Start with Markdown/facts JSON search. Optional SQLite FTS5 behind feature flag.

Acceptance criteria:
- `memory search "deploy"` returns ranked matching facts.
- Tombstoned facts are excluded by default.

### T0603 Implement citation index

Generate `.memory/indexes/citations.md`.

Acceptance criteria:
- Lists active citations by kind/scope.
- Links each citation to a file path.

## Milestone 7 — Session rolling window

### T0701 Implement session files

Create and maintain:
- `now.md`
- `today.md`
- `recent.md`
- `archive/YYYY/YYYY-MM-DD.md`

Acceptance criteria:
- Missing files are created on demand.
- `now.md` is gitignored.

### T0702 Implement `memory rotate`

Behavior:
- merge `now` into `today`;
- compress older `today` into archive when date changes;
- maintain `recent` for last configured N days.

Acceptance criteria:
- Fixture with multiple dates rotates correctly.

### T0703 Implement `memory distill`

Initial rule-based distillation:
- explicit remember commands -> fact;
- uncertain candidates -> review queue;
- transient details -> session only.

Acceptance criteria:
- No network calls.
- Secret-like candidates are rejected or redacted.

## Milestone 8 — Claude Code hooks

### T0801 Implement generic hook command

Command:

```bash
memory hook <HookName>
```

Acceptance criteria:
- Reads JSON from stdin.
- Handles unknown/missing fields gracefully.
- Logs locally when verbose.

### T0802 Implement `SessionStart` hook

Acceptance criteria:
- Emits memory bundle.
- Bundle obeys total character cap.
- Does not include tombstoned facts or ignored local files unless local scope is enabled.

### T0803 Implement `UserPromptSubmit` hook

Acceptance criteria:
- Detects explicit commands.
- Writes safe events to `now.md`.
- Does not store secret-like full prompts.

### T0804 Implement `PreToolUse` hook

Acceptance criteria:
- Warns or blocks direct deletion of active fact files.
- Allows edits via `memory forget`/`memory correct`.
- Does not interfere with normal project file edits.

### T0805 Implement `PostToolUse` hook

Acceptance criteria:
- Captures safe metadata about successful commands/tool use.
- Redacts likely secrets.
- Writes only candidates/session notes, not automatic active facts by default.

### T0806 Implement `Stop` hook

Acceptance criteria:
- Runs distill on current turn notes.
- Updates review queue and `today.md`.

### T0807 Implement `SessionEnd` hook

Acceptance criteria:
- Finalizes session summaries.
- Rebuilds lightweight index if needed.

### T0808 Generate hook config snippets

Command:

```bash
memory hooks print-config
```

Acceptance criteria:
- Prints Claude Code settings JSON snippet.
- Includes comments or docs explaining where to place it.

## Milestone 9 — MCP server

### T0901 Implement stdio MCP server

Command:

```bash
memory mcp
```

Acceptance criteria:
- Starts with stdio transport.
- No network listener by default.

### T0902 Implement `memory.health` tool

Acceptance criteria:
- Reports config, layout, caps, indexes, Git ignore status, and native Claude memory detection.

### T0903 Implement read/search tools

Tools:
- `memory.search`
- `memory.read`
- `memory.list_recent`
- `memory.citations`

Acceptance criteria:
- Tools return structured JSON.
- Tombstoned facts excluded unless requested.

### T0904 Implement write tools

Tools:
- `memory.remember`
- `memory.forget`
- `memory.correct`
- `memory.rebuild_index`

Acceptance criteria:
- Same safety behavior as CLI.
- Ambiguous forget returns candidates rather than destructive action.

### T0905 Print MCP registration command

Command:

```bash
memory mcp print-config claude-code
```

Acceptance criteria:
- Outputs a copy-pasteable `claude mcp add ...` command or settings snippet.

## Milestone 10 — Privacy and poisoning defenses

### T1001 Implement secret scanner

Detect common patterns:
- AWS keys;
- GitHub/GitLab tokens;
- private key headers;
- JWT-like strings;
- URLs with embedded credentials;
- `password=` / `token=` style assignments.

Acceptance criteria:
- Test fixtures are detected.
- False positives can be overridden only with explicit `--allow-sensitive --scope local`.

### T1002 Implement redaction utility

Acceptance criteria:
- Redacts detected secrets in session logs and review queue.
- Never writes raw secret to active project fact.

### T1003 Implement trust-level classifier

Acceptance criteria:
- Explicit user commands rank higher than tool output.
- Untrusted output goes to review by default.

### T1004 Implement conflict detector

Acceptance criteria:
- New fact conflicting with active fact creates conflict queue entry.
- Explicit correction resolves conflict.

## Milestone 11 — Native Claude Code coexistence

### T1101 Detect Claude Code availability

Command:

```bash
memory status
```

Acceptance criteria:
- Reports whether `claude` command is available.
- Reports detected version if available.
- Does not fail if Claude Code is absent.

### T1102 Detect native auto-memory status where possible

Acceptance criteria:
- Reports `unknown` when not detectable.
- Does not write native memory.

### T1103 Document coexistence policy

Acceptance criteria:
- README explains `.memory/` versus native auto memory.
- README recommends not duplicating large memory into native `MEMORY.md`.

## Milestone 12 — Tests and fixtures

### T1201 Unit tests

Cover:
- config parsing;
- path resolution;
- ID generation;
- frontmatter parse/write;
- cap enforcement;
- search;
- remember;
- forget;
- correct;
- rotation;
- secret scanning.

Acceptance criteria:
- Test suite runs locally without network.

### T1202 Integration tests

Scenarios:
- fresh init;
- explicit remember through hook;
- forget through CLI;
- session rotation;
- MCP search/read;
- index rebuild from Markdown.

Acceptance criteria:
- All integration tests use temp directories.
- No network access required.

### T1203 Cross-platform smoke tests

Acceptance criteria:
- CI matrix or documented manual tests for Windows, macOS, Linux.

## Milestone 13 — Documentation

### T1301 Write README quickstart

Include:
- install;
- `memory init`;
- Claude Code hooks setup;
- MCP setup;
- remember/forget examples;
- Git behavior;
- native auto-memory coexistence.

Acceptance criteria:
- New user can set up in under 10 minutes.

### T1302 Write memory authoring guide

Include:
- fact schema;
- citations;
- scratchpad rules;
- curation workflow;
- privacy tags.

Acceptance criteria:
- Users can edit Markdown manually without breaking indexes.

### T1303 Write security/privacy guide

Include:
- no silent network calls;
- secret scanning;
- local scope;
- private/retain/ephemeral tags;
- poisoning model.

Acceptance criteria:
- Clear operational guidance for teams.

## Milestone 14 — Release packaging

### T1401 Create version command

```bash
memory version
```

Acceptance criteria:
- Prints semantic version and build metadata.

### T1402 Package CLI

Acceptance criteria:
- Installable from local package manager path.
- Can be run in air-gapped environment after dependencies are mirrored.

### T1403 Prepare v0.1.0 release notes

Include:
- features;
- limitations;
- known risks;
- migration notes.

Acceptance criteria:
- Release notes mention Markdown source-of-truth and default no-network behavior.

## Suggested v0.1.0 implementation order

1. Config/paths/init.
2. Markdown fact store.
3. Remember/forget/correct.
4. Caps and indexes.
5. Session rolling window.
6. Hooks.
7. MCP server.
8. Secret scanning and conflict detection.
9. Native Claude Code coexistence status.
10. Docs, tests, packaging.

## Definition of done for v0.1.0

- Fresh repo can run `memory init`.
- Claude Code can load a session-start memory bundle.
- Explicit remember/forget/correct works from CLI and hook parser.
- Durable facts are Markdown with stable citations.
- Scratchpad caps are enforced.
- Session rolling window works.
- MCP server provides local search/read/write tools.
- Native Claude Code auto memory is not modified by default.
- No default network calls exist.
- Tests pass on at least one OS, with documented cross-OS smoke test commands.
