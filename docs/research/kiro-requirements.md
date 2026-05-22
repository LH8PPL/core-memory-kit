# Requirements Document

## Introduction

Claude Code Memory is a per-project, in-repo memory system for Anthropic's Claude Code CLI agent. It solves the structural amnesia problem: every Claude Code session starts with zero context about the project, the user's preferences, or prior decisions. This system captures durable facts automatically via lifecycle hooks, exposes explicit user controls for managing memory, and loads relevant context at session start — all stored as human-readable markdown files that travel with the repository via `git clone`.

The system targets v0.1.0 and must coexist peacefully with Claude Code's native auto-memory feature (introduced in v2.1.59+).

---

## Glossary

- **Memory_System**: The overall claude-code-memory software described in this document.
- **Memory_Store**: The on-disk collection of markdown files that constitute the memory for a given scope.
- **Fact**: A discrete, citable unit of information stored in the Memory_Store (e.g., a decision, preference, or project convention).
- **Scratchpad**: A bounded markdown file with a hard character cap used for mutable, frequently-updated context.
- **Fact_Archive**: A granular, append-only collection of individual Fact files, each with a stable citation ID.
- **Citation_ID**: A stable, unique identifier assigned to each Fact at creation time (e.g., `mem-20240601-abc123`).
- **Session_Log**: A time-stamped record of a single Claude Code session, subject to rolling-window compression.
- **Rolling_Window**: The compression scheme that collapses Session_Logs over time: `now → today → recent → archive`.
- **Scope**: One of three memory tiers — `user-global` (cross-project, per-user), `project` (in-repo, shared via git), or `local` (per-machine, gitignored).
- **Hook**: A Claude Code lifecycle event handler (SessionStart, UserPromptSubmit, PreToolUse, PostToolUse, Stop, SessionEnd).
- **MCP_Server**: The Model Context Protocol server that exposes Memory_System operations programmatically.
- **Auto_Extract**: The Memory_System's conservative automatic extraction of Facts from session activity.
- **Distill_Job**: A scheduled or on-demand process that compresses Session_Logs and promotes durable Facts.
- **Index_Job**: A scheduled or on-demand process that rebuilds the optional SQLite/vector search cache.
- **Curate_Job**: A scheduled or on-demand process that reviews and prunes stale or low-value Facts.
- **Private_Tag**: A metadata tag (`<!-- private -->`) that prevents a Fact from being surfaced in context or exported.
- **Retain_Tag**: A metadata tag (`<!-- retain -->`) that prevents a Fact from being deleted by automated curation.
- **Poison_Guard**: A validation layer that rejects Facts containing injection patterns or anomalous structure.
- **Context_Payload**: The assembled markdown content injected into a Claude Code session at start.
- **CLAUDE.md**: Claude Code's native project-level context file; the Memory_System must not overwrite it.

---

## Requirements

### Requirement 1: Three-Tier Scope Model

**User Story:** As a developer working across multiple projects and machines, I want memory to be organized into user-global, project, and local scopes, so that identity and cross-project preferences persist everywhere, project knowledge travels with the repo, and machine-specific state stays private.

#### Acceptance Criteria

1. THE Memory_System SHALL maintain three distinct scopes: `user-global`, `project`, and `local`.
2. THE Memory_System SHALL store `user-global` scope files at `~/.claude-memory/` resolved using the platform home directory convention (`%USERPROFILE%` on Windows, `$HOME` on macOS/Linux).
3. THE Memory_System SHALL store `project` scope files at `.claude/memory/` within the repository root.
4. THE Memory_System SHALL store `local` scope files at `.claude/memory-local/` within the repository root.
5. WHEN a repository is cloned, THE Memory_System SHALL make all `project` scope files available to the new clone by reading them from `.claude/memory/` without requiring any additional setup or configuration commands.
6. WHEN the Memory_System initializes, IF any of the three scope directories do not exist, THEN THE Memory_System SHALL create them before performing any read or write operations.
7. WHEN the Memory_System initializes for a project scope, THE Memory_System SHALL ensure `.claude/memory-local/` is listed in the repository's `.gitignore` file using the exact entry `.claude/memory-local/` on its own line.
8. IF a `.gitignore` file does not exist at the repository root, THEN THE Memory_System SHALL create one containing the entry `.claude/memory-local/` before performing any local-scope writes.
9. THE Memory_System SHALL load memory from all three scopes at session start. WHEN the same key appears in more than one scope, THE Memory_System SHALL use the value from the highest-priority scope (`local` > `project` > `user-global`) and discard the lower-priority values for that key.

---

### Requirement 2: Human-Readable Markdown Storage

**User Story:** As a developer, I want all memory stored as plain markdown files, so that I can read, edit, audit, and version-control my memory without special tooling.

#### Acceptance Criteria

1. THE Memory_System SHALL store all Facts, Scratchpads, Session_Logs, and Memory_System configuration as UTF-8 encoded markdown files with no binary encoding or compression applied to the file content.
2. THE Memory_System SHALL include a YAML front-matter block at the top of each Fact file containing exactly the following fields: `citation_id` (string, matching the Citation_ID format), `created_at` (ISO 8601 UTC timestamp), `scope` (one of `user-global`, `project`, `local`), `tags` (YAML list of strings, may be empty), and `source_hook` (string identifying the agent or tool name that created the Fact, or `cli` if created via CLI).
3. WHEN a Fact file is written, THE Memory_System SHALL produce output that is valid CommonMark markdown, including the YAML front-matter block delimited by `---` lines.
4. IF the content of a markdown file and its corresponding SQLite or vector cache entry differ, THEN THE Memory_System SHALL treat the markdown file value as correct, discard the cache entry, and update the cache to match the markdown file on the next Index_Job run.
5. IF the SQLite database or vector index is deleted or corrupted, THEN THE Memory_System SHALL rebuild it by scanning all markdown files in the Memory_Store, and every Fact file present before deletion SHALL be queryable after the rebuild with content identical to its markdown source.

---

### Requirement 3: Fact Archive with Stable Citation IDs

**User Story:** As a developer, I want each stored fact to have a stable, unique ID, so that I can reference specific facts in code comments, documentation, or conversations without the reference breaking.

#### Acceptance Criteria

1. WHEN a Fact is created, THE Memory_System SHALL assign a Citation_ID to it before writing the Fact file to disk.
2. THE Citation_ID SHALL follow the format `mem-YYYYMMDD-<6-char>` where `<6-char>` is exactly 6 characters drawn from lowercase letters (a–z) and digits (0–9) only (e.g., `mem-20240601-abc123`).
3. WHEN generating a Citation_ID, THE Memory_System SHALL verify it does not already exist in the Memory_Store. IF a collision is detected, THE Memory_System SHALL regenerate the 6-character segment and re-verify, repeating up to 10 times. IF all 10 attempts collide, THE Memory_System SHALL return an error and not persist the Fact.
4. WHEN a Fact is created, THE Memory_System SHALL never reuse or reassign its Citation_ID, even after the Fact is soft-deleted, archived, or hard-deleted.
5. THE Memory_System SHALL store each Fact as an individual file named `<citation-id>.md` within the Fact_Archive directory for the appropriate scope.
6. WHEN a user requests a Fact by Citation_ID and the Fact exists and is not deleted, THE Memory_System SHALL retrieve and return it in under 100 ms for archives containing up to 10,000 Facts.
7. IF a user requests a Fact by Citation_ID and the Citation_ID does not exist or the Fact has been deleted, THEN THE Memory_System SHALL return an error message stating the Citation_ID was not found, without modifying any existing data.

---

### Requirement 4: Bounded Scratchpad Files

**User Story:** As a developer, I want scratchpad files to have a hard character cap, so that I am forced to curate and summarize rather than accumulate unbounded context.

#### Acceptance Criteria

1. THE Memory_System SHALL enforce a hard character cap of 8,000 characters per Scratchpad file by default, where character count is measured as the number of Unicode code points in the file content.
2. WHERE a user configures a custom cap via the Memory_System configuration, THE Memory_System SHALL enforce the user-specified cap instead, accepting integer values between 1,000 and 32,000 inclusive.
3. WHEN a write operation would cause a Scratchpad to exceed its configured cap, THE Memory_System SHALL reject the write without modifying the Scratchpad file and SHALL return an error message containing: the current character count, the configured cap, and the number of characters by which the attempted write exceeded the cap.
4. WHEN a user issues the `scratchpad trim` command, THE Memory_System SHALL display the full current content of the Scratchpad along with its current character count and configured cap, then prompt the user to provide replacement content.
5. WHEN the user provides replacement content in response to `scratchpad trim`, THE Memory_System SHALL validate that the replacement content does not exceed the configured cap before writing it. IF the replacement content exceeds the cap, THE Memory_System SHALL reject it and re-display the trim prompt with an error indicating the overage.
6. THE Memory_System SHALL maintain exactly one Scratchpad file per combination of scope (`user-global`, `project`, or `local`) and project identifier (the repository root path for `project` and `local` scopes, or a fixed global path for `user-global`).

---

### Requirement 5: Rolling-Window Session Log Compression

**User Story:** As a developer, I want old session logs compressed automatically, so that the memory store stays lean and the most recent context is always the most detailed.

#### Acceptance Criteria

1. THE Memory_System SHALL record a Session_Log for every Claude Code session. Each Session_Log SHALL contain: the session start timestamp (ISO 8601 UTC), the session end timestamp (ISO 8601 UTC), a list of every tool call made during the session (tool name and invocation count), and the Citation_IDs of all Facts extracted during the session.
2. THE Memory_System SHALL write the current session's Session_Log as a single markdown file in the `now/` subdirectory of the session log store, named `<session-start-timestamp>.md`, preserving all fields from criterion 1 without summarization.
3. WHEN a session ends and the `now/` subdirectory contains two or more Session_Log files all sharing the same calendar date (UTC), THE Memory_System SHALL merge all same-date `now/` logs into a single daily summary file in the `today/` subdirectory and delete the merged `now/` files.
4. WHEN the Memory_System detects that the calendar date (UTC) has advanced past the date of the current `today/` summary, THE Memory_System SHALL move the `today/` summary file into the `recent/` subdirectory and clear the `today/` subdirectory. The `recent/` subdirectory SHALL retain at most 7 daily summary files; if moving the file would result in 8 or more files, THE Memory_System SHALL first compress the oldest file(s) into the `archive/` subdirectory per criterion 5.
5. WHEN the `recent/` subdirectory contains more than 7 daily summary files, THE Memory_System SHALL compress all summaries beyond the 7 most recent into a single weekly entry appended to the `archive/` subdirectory, then delete the compressed files from `recent/`.
6. WHEN a user issues the `distill` CLI command, THE Memory_System SHALL immediately execute the Distill_Job and report its completion status to the user.
7. WHERE a user has configured a cron schedule for the Distill_Job, THE Memory_System SHALL register the job with the OS scheduler to run at the configured interval.
8. WHEN the Distill_Job runs, THE Memory_System SHALL scan all Session_Logs being compressed for Fact references. For each referenced Fact that is not already present in the Fact_Archive (matched by Citation_ID), THE Memory_System SHALL promote it to the Fact_Archive.

---

### Requirement 6: Lifecycle Hook Integration

**User Story:** As a developer, I want the memory system to capture context automatically through Claude Code's lifecycle hooks, so that I don't have to manually record every decision or preference.

#### Acceptance Criteria

1. THE Memory_System SHALL register handlers for the following Claude Code lifecycle events: `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `Stop`, and `SessionEnd`.
2. WHEN the `SessionStart` hook fires, THE Memory_System SHALL assemble and inject the Context_Payload into the session within 500 ms of the hook firing.
3. IF the `SessionStart` hook handler encounters an error during Context_Payload assembly or injection, THEN THE Memory_System SHALL allow the session to proceed without a Context_Payload and SHALL log the error to the session audit log.
4. WHEN the `SessionEnd` hook fires, THE Memory_System SHALL write the Session_Log for the completed session within 2,000 ms of the hook firing.
5. IF the `SessionEnd` hook handler fails to write the Session_Log within 2,000 ms, THEN THE Memory_System SHALL retain the in-memory session data and attempt to write it on the next `SessionStart`, logging the deferred write to the session audit log.
6. WHEN the `UserPromptSubmit` hook fires, THE Memory_System SHALL scan the user's prompt for explicit memory commands matching the patterns defined in Requirement 7 and execute any recognized commands before the prompt is forwarded for processing.
7. IF the `UserPromptSubmit` hook handler does not recognize a memory command pattern in the prompt, THEN THE Memory_System SHALL forward the prompt unmodified without logging an error.
8. WHEN the `PostToolUse` hook fires, THE Memory_System SHALL run Auto_Extract on the tool's output to identify candidate Facts per the rules in Requirement 9.
9. WHEN the `Stop` hook fires, THE Memory_System SHALL flush all pending in-memory writes to disk within 1,000 ms. IF the flush does not complete within 1,000 ms, THE Memory_System SHALL write a partial-flush warning to the session audit log and exit.

---

### Requirement 7: Explicit User Memory Controls

**User Story:** As a developer, I want to explicitly tell the system to remember or forget specific facts, so that I have full control over what persists across sessions.

#### Acceptance Criteria

1. WHEN a user issues a "remember this: <content>" command via prompt or CLI, THE Memory_System SHALL create a new Fact in the Fact_Archive for the active project scope (falling back to `user-global` if no project scope is active) and return the assigned Citation_ID to the user.
2. WHEN a user issues a "forget <citation-id>" command, THE Memory_System SHALL mark the specified Fact as soft-deleted by setting a `deleted_at` field in its YAML front-matter and exclude it from all future Context_Payloads. IF the Citation_ID does not exist or is already deleted, THE Memory_System SHALL return an error message stating the Citation_ID was not found or is already deleted.
3. WHEN a user issues a "forget <citation-id> --hard" command, THE Memory_System SHALL permanently delete the Fact file from disk. IF the Citation_ID does not exist, THE Memory_System SHALL return an error message stating the Citation_ID was not found.
4. WHEN a user issues a "list memories" command, THE Memory_System SHALL display all non-deleted Facts for the current scope, grouped by tag (Facts with no tags grouped under "untagged"), showing each Fact's Citation_ID, creation date, and first 80 characters of content.
5. WHEN a user issues a "show memory <citation-id>" command, THE Memory_System SHALL display the full content and all YAML front-matter metadata of the specified Fact. IF the Citation_ID does not exist or is deleted, THE Memory_System SHALL return an error message stating the Citation_ID was not found.
6. WHEN a user issues an "edit memory <citation-id>" command, THE Memory_System SHALL open the Fact file in the editor specified by the `EDITOR` environment variable or the Memory_System's configured editor setting. IF neither is set, THE Memory_System SHALL return an error message instructing the user to set the `EDITOR` environment variable or configure an editor in the Memory_System settings.
7. THE Memory_System SHALL accept memory commands both as natural-language phrases within a Claude Code prompt and as explicit CLI subcommands.

---

### Requirement 8: Context Payload Assembly at Session Start

**User Story:** As a developer, I want the most relevant memory loaded automatically at the start of every session, so that Claude Code has the context it needs without me having to re-explain anything.

#### Acceptance Criteria

1. WHEN a session starts, THE Memory_System SHALL assemble a Context_Payload by merging content from all three scopes. WHEN the same key appears in more than one scope, THE Memory_System SHALL use the value from the highest-priority scope (`local` > `project` > `user-global`). Scopes that are empty or unavailable SHALL be silently skipped without error.
2. THE Memory_System SHALL include in the Context_Payload: the active Scratchpad content for each available scope, up to 10 Facts ordered by most-recently-accessed timestamp (or all Facts if fewer than 10 exist), and the rolling-window summary from the most recently completed prior session.
3. WHERE a user has configured a custom context size limit (an integer between 1,000 and 200,000 tokens inclusive), THE Memory_System SHALL truncate the Context_Payload to fit within that limit by removing content in reverse priority order (`user-global` first, then `project`, then `local`) until the payload fits.
4. THE Memory_System SHALL inject the Context_Payload as a system-level context block, not as a user message, so that it does not appear in the visible conversation history.
5. THE Memory_System SHALL exclude any Facts whose YAML front-matter contains `private: true` from the Context_Payload.
6. WHEN a session ends, THE Memory_System SHALL record the Citation_IDs of all Facts included in that session's Context_Payload along with the session end timestamp in the Session_Log to support future relevance scoring.
7. IF all scopes are empty, all Facts are private, and no rolling-window summary exists, THEN THE Memory_System SHALL inject an empty Context_Payload block (the labeled comment block with no content) and log that no context was available for the session.

---

### Requirement 9: Conservative Auto-Extraction

**User Story:** As a developer, I want the system to automatically extract durable facts from session activity, but only when it is highly confident, so that the memory store doesn't fill up with noise or incorrect information.

#### Acceptance Criteria

1. WHEN Auto_Extract runs on tool output, THE Memory_System SHALL only consider a candidate for promotion to a Fact if it matches at least one of the following patterns: a first-person assertion of preference by the user (e.g., sentences beginning with "I prefer", "I always", "I want", "I use"), a project configuration value (key-value pair from a recognized config file format), a decision recorded with explicit rationale (a statement paired with a "because" or "so that" clause), or a named entity (file path, dependency name, or API endpoint URL) that appears in three or more distinct tool outputs within the same session.
2. THE Memory_System SHALL assign a confidence score between 0.0 and 1.0 to each candidate Fact during Auto_Extract, based on how many of the patterns in criterion 1 the candidate matches and the strength of the match.
3. IF a candidate Fact's confidence score is 0.85 or higher AND an identical Fact (same content after normalization) does not already exist in the Fact_Archive, THEN THE Memory_System SHALL automatically persist it as a new Fact.
4. WHEN Auto_Extract produces a candidate with a confidence score between 0.50 and 0.84 inclusive, THE Memory_System SHALL surface it to the user as a suggestion with the candidate content and confidence score, and SHALL require explicit user confirmation (yes/no) before persisting it.
5. IF a candidate Fact's confidence score is below 0.50, THEN THE Memory_System SHALL discard it without surfacing it to the user.
6. WHEN Auto_Extract makes a decision about a candidate (promoted, suggested, or discarded), THE Memory_System SHALL write an entry to the session audit log containing: the first 200 characters of the candidate content, the matched pattern(s), the confidence score, the decision outcome, and a UTC timestamp.
7. IF a candidate Fact's content, after normalization (whitespace collapse and case folding), is identical to a Fact already present in the Fact_Archive, THEN THE Memory_System SHALL discard the candidate without surfacing it to the user, regardless of confidence score.

---

### Requirement 10: Memory Poisoning Defenses

**User Story:** As a developer, I want the memory system to defend against prompt injection and memory poisoning attacks, so that malicious content in tool outputs cannot corrupt my memory store.

#### Acceptance Criteria

1. WHEN Auto_Extract processes any content, THE Poison_Guard SHALL scan the candidate Fact for prompt injection patterns before it is persisted.
2. IF a candidate Fact's content contains any phrase that matches a prompt injection pattern — including at minimum: "ignore previous instructions", "you are now", "system prompt", "disregard all prior", or "your new instructions" — THEN THE Poison_Guard SHALL reject that candidate Fact without persisting it.
3. IF a candidate Fact's content length exceeds 4,000 characters, THEN THE Poison_Guard SHALL reject that candidate Fact without persisting it.
4. IF a candidate Fact's content contains HTML comment blocks (`<!-- -->`), zero-width characters, or CSS `display:none` / `visibility:hidden` constructs that conceal text from normal rendering, THEN THE Poison_Guard SHALL reject that candidate Fact without persisting it.
5. WHEN the Poison_Guard rejects a candidate Fact, THE Memory_System SHALL write an entry to the session audit log containing the rejection reason, a UTC timestamp, and the first 200 characters of the rejected content.
6. IF the Poison_Guard is unavailable or returns an error during scanning, THEN THE Memory_System SHALL reject the candidate Fact without persisting it and SHALL log the Poison_Guard failure to the session audit log.
7. THE Memory_System SHALL allow users to mark any Fact with a Retain_Tag (`retain: true` in YAML front-matter) to prevent automated curation processes (Curate_Job) from deleting or modifying that Fact.
8. THE Memory_System SHALL allow users to mark any Fact with a Private_Tag (`private: true` in YAML front-matter) to prevent that Fact from being included in Context_Payloads or in any export operation that produces output outside the local Memory_System.

---

### Requirement 11: MCP Server Interface

**User Story:** As a developer or tool author, I want to access the memory system programmatically via MCP, so that other tools and agents can read and write memory without shelling out to the CLI.

#### Acceptance Criteria

1. THE MCP_Server SHALL expose the following tools: `memory_read`, `memory_write`, `memory_delete`, `memory_list`, `memory_search`, and `memory_stats`.
2. WHEN `memory_write` is called, THE MCP_Server SHALL apply the same Poison_Guard validation as the CLI and Auto_Extract paths. IF Poison_Guard rejects the content, THE MCP_Server SHALL return an error response to the caller indicating the rejection reason, and no Fact SHALL be persisted.
3. WHEN `memory_search` is called with a query string, THE MCP_Server SHALL return matching Facts ordered by descending relevance score (FTS rank if SQLite FTS5 is available, or character-overlap count otherwise), returning at most 50 results.
4. IF a caller invokes any MCP_Server tool without a valid local authentication token, THEN THE MCP_Server SHALL reject the request with an authentication error and SHALL NOT perform any read or write operation.
5. WHEN `memory_read`, `memory_list`, `memory_search`, or `memory_stats` is called with a valid token, THE MCP_Server SHALL respond within 200 ms for Memory_Stores containing up to 10,000 Facts.
6. WHEN `memory_stats` is called, THE MCP_Server SHALL return: total non-deleted Fact count across all scopes, Scratchpad utilization as a percentage of the configured cap for each scope, last Distill_Job run time (ISO 8601 UTC or "never"), and total Memory_Store size in bytes across all scopes.
7. IF `memory_delete` is called with a Citation_ID that does not exist in the Memory_Store, THEN THE MCP_Server SHALL return an error response stating the Citation_ID was not found, and no state change SHALL occur.

---

### Requirement 12: Coexistence with Claude Code Native Auto-Memory

**User Story:** As a developer using Claude Code v2.1.59+, I want the memory system to coexist with Claude Code's built-in auto-memory feature, so that I don't have to choose between them and they don't conflict.

#### Acceptance Criteria

1. THE Memory_System SHALL never write to or modify any file outside `.claude/memory/` and `.claude/memory-local/` that the Memory_System did not itself create, including `CLAUDE.md` and any other file managed by Claude Code's native auto-memory feature.
2. THE Memory_System SHALL store all its files under `.claude/memory/` and `.claude/memory-local/`, which are distinct from the paths used by Claude Code's native feature.
3. WHEN the `SessionStart` hook fires, THE Memory_System SHALL attempt to detect whether Claude Code's native auto-memory is active and SHALL write an audit log entry containing the detection outcome (`active: true`, `active: false`, or `active: unknown`) and a UTC timestamp.
4. IF detection of native auto-memory is indeterminate (e.g., the detection mechanism returns an error or inconclusive result), THEN THE Memory_System SHALL treat native auto-memory as active (`active: unknown`) and proceed as if it were active.
5. WHEN the `SessionStart` hook fires AND `native_memory_coexist` is `true` (the default), THE Memory_System SHALL inject its Context_Payload as a supplementary block wrapped in `<!-- claude-code-memory -->` and `<!-- /claude-code-memory -->` comment tags to distinguish it from native context.
6. WHEN the `SessionStart` hook fires AND `native_memory_coexist` is `false`, THE Memory_System SHALL skip Context_Payload injection but SHALL still perform native auto-memory detection and audit logging.

---

### Requirement 13: Cross-OS and Cross-Machine Portability

**User Story:** As a developer working on Windows, macOS, and Linux across multiple machines, I want the memory system to work identically on all platforms, so that I don't encounter OS-specific failures.

#### Acceptance Criteria

1. THE Memory_System SHALL store all file path references within markdown files using forward-slash separators (`/`). WHEN reading or writing files at runtime, THE Memory_System SHALL normalize any OS-specific path separators to the platform's native separator before performing file I/O.
2. THE Memory_System SHALL resolve the `user-global` scope root path using `%USERPROFILE%` on Windows and `$HOME` on macOS and Linux. IF neither environment variable is set, THE Memory_System SHALL fall back to the platform's `os.homedir()` equivalent and log a warning to the session audit log.
3. THE Memory_System SHALL use only the following characters in all generated file names (Citation_IDs, Session_Log names, etc.): lowercase letters (a–z), digits (0–9), and hyphens (`-`). No spaces, uppercase letters, or special characters SHALL appear in generated file names.
4. WHEN a `project` scope Memory_Store is cloned to a machine running a different OS, THE Memory_System SHALL initialize and load the Memory_Store correctly on first run without requiring any manual path reconfiguration, as verified by successfully reading at least one existing Fact from the cloned store.
5. THE Memory_System's core operation (session start, fact read/write, hook processing, CLI commands) SHALL NOT rely on POSIX shell features, symbolic links, or OS-specific file locking mechanisms. All file locking SHALL use cross-platform advisory locking via the runtime's standard library.

---

### Requirement 14: No Silent Network Calls

**User Story:** As a developer with privacy and security requirements, I want the memory system to make no network calls without my explicit knowledge, so that my project context and facts are never transmitted to external services without consent.

#### Acceptance Criteria

1. THE Memory_System SHALL make no outbound network calls during any of the following operations: session start, Context_Payload assembly, Fact creation, Fact retrieval, Fact deletion, Scratchpad read/write, hook processing, and maintenance job execution (Distill_Job, Index_Job, Curate_Job).
2. IF any code path in the Memory_System attempts an outbound network call during the operations listed in criterion 1, THEN THE Memory_System SHALL block the call, log the attempted destination and UTC timestamp to the session audit log, and continue operation without the network call.
3. WHERE optional vector search via an external service is configured, THE Memory_System SHALL require the user to explicitly set a configuration flag to a non-default enabled value (e.g., `external_vector_search: true`) before making any network calls to that service.
4. WHEN a network call is made as part of an optional feature, THE Memory_System SHALL log to the session audit log: the destination hostname, a UTC timestamp, and a data category label drawn from the set (`embedding`, `search_query`, `metadata`). Raw Fact content, file paths, and project identifiers SHALL NOT be included in the log entry.
5. WHEN `memory_stats` is called and no optional network features are enabled, THE Memory_System SHALL include `network_calls: none` in the response. WHEN one or more optional network features are enabled, THE Memory_System SHALL include `network_calls: [list of enabled feature names]` in the response.

---

### Requirement 15: Optional Search Index (SQLite / Vector)

**User Story:** As a developer with a large memory store, I want optional full-text and semantic search over my facts, so that I can quickly find relevant context without reading every file.

#### Acceptance Criteria

1. WHERE the SQLite FTS5 extension is available, THE Memory_System SHALL maintain a full-text search index of all Facts whose YAML front-matter does not contain `private: true`.
2. WHEN the Index_Job runs, THE Memory_System SHALL perform a full rebuild of the search index by dropping and recreating the FTS5 index from all eligible markdown source files. The rebuild SHALL complete within 30 seconds for Memory_Stores containing up to 1,000 Facts.
3. WHERE a user configures a local vector embedding model, THE Memory_System SHALL generate and store an embedding for each Fact at the time the Fact is created or updated.
4. THE Memory_System SHALL treat the SQLite database and vector index as regenerable caches; deleting them SHALL not result in data loss, as all authoritative data resides in the markdown files.
5. WHEN `memory_search` is called and the search index is absent, corrupt, or disabled, THE Memory_System SHALL fall back to a linear full-text scan of all eligible markdown files and return up to 50 matching results within 2,000 ms for Memory_Stores containing up to 1,000 Facts.
6. IF the fallback linear scan does not complete within 2,000 ms, THEN THE Memory_System SHALL return a timeout error response containing any partial results collected up to that point and a message indicating the search timed out.

---

### Requirement 16: Scheduled Maintenance Jobs

**User Story:** As a developer, I want background maintenance jobs to keep the memory store healthy automatically, so that I don't have to manually compress logs, rebuild indexes, or curate stale facts.

#### Acceptance Criteria

1. THE Memory_System SHALL provide three maintenance jobs: Distill_Job, Index_Job, and Curate_Job.
2. WHEN a user issues the corresponding CLI command (`distill`, `index`, or `curate`), THE Memory_System SHALL immediately execute the specified maintenance job and report its completion status to the user.
3. WHERE a user configures cron schedules for one or more maintenance jobs, THE Memory_System SHALL register those jobs with the OS scheduler (cron on macOS/Linux, Task Scheduler on Windows) using the configured schedule expressions.
4. WHEN the Curate_Job runs, THE Memory_System SHALL identify all Facts that have not been accessed in 90 or more days and do not have `retain: true` in their YAML front-matter, and SHALL flag them for user review without deleting or modifying them.
5. WHEN the Curate_Job completes its flagging pass, THE Memory_System SHALL present the user with: the total count of flagged Facts, and for each flagged Fact, its Citation_ID, its last-accessed date, and the first 80 characters of its content. THE Memory_System SHALL then require explicit user confirmation (yes/no per Fact or bulk yes/no) before deleting any flagged Fact.
6. WHEN a maintenance job completes, THE Memory_System SHALL append an entry to `jobs.log` in the `local` scope containing: the job name, completion status (`succeeded` or `failed`), the count of items processed, a UTC timestamp, and an error description if the status is `failed`.
7. IF a maintenance job is triggered (via CLI or scheduler) while the same job is already running, THEN THE Memory_System SHALL reject the duplicate trigger, return a message indicating the job is already in progress, and take no further action.
