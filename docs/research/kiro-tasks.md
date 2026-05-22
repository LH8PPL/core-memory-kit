# Implementation Plan: claude-code-memory

## Overview

Implement the claude-code-memory TypeScript/Node.js CLI tool and MCP server. The implementation follows a bottom-up approach: core data models and storage first, then business logic layers (Fact Store, Scratchpad, Session Log), then the Auto_Extractor and Poison_Guard, then the Context Payload Assembler and Hook Controller, then the MCP Server and CLI, and finally maintenance jobs and the search index. Each layer is wired into the next before moving on.

## Tasks

- [ ] 1. Project scaffold and core type definitions
  - Initialize a Node.js/TypeScript project with `package.json`, `tsconfig.json`, and `vitest` as the test runner
  - Install dependencies: `@modelcontextprotocol/sdk`, `better-sqlite3`, `fast-check`, `gray-matter`, `js-yaml`, `zod`, `commander`
  - Define all shared TypeScript types and interfaces: `Scope`, `Fact`, `CreateFactOpts`, `ScratchpadContent`, `SessionLog`, `SessionHandle`, `HookEvent`, `HookResponse`, `ExtractionResult`, `ValidationResult`, `ContextPayload`, `JobResult`, `SearchResult`
  - Create the directory layout for `src/` (scope-manager, fact-store, scratchpad, session-log, auto-extractor, poison-guard, context-payload, hook-controller, mcp-server, search-index, maintenance, cli)
  - _Requirements: 1.1, 2.1, 13.3_

- [ ] 2. Scope Manager
  - [ ] 2.1 Implement `ScopeManager.resolveScopePath` for all three scopes with platform-aware home directory resolution (`%USERPROFILE%` / `$HOME` / `os.homedir()` fallback)
    - _Requirements: 1.2, 1.3, 1.4, 13.2_
  - [ ]* 2.2 Write property test for scope path distinctness (Property 1)
    - **Property 1: Scope path distinctness**
    - **Validates: Requirements 1.1**
  - [ ] 2.3 Implement `ScopeManager.initializeScopes` — create missing scope directories before any read/write
    - _Requirements: 1.6_
  - [ ] 2.4 Implement `ScopeManager.ensureGitignore` — add `.claude/memory-local/` entry to `.gitignore`, creating the file if absent
    - _Requirements: 1.7, 1.8_
  - [ ] 2.5 Implement `ScopeManager.loadAllScopes` with priority merge (`local` > `project` > `user-global`)
    - _Requirements: 1.9_
  - [ ]* 2.6 Write property test for scope priority merge correctness (Property 2)
    - **Property 2: Scope priority merge correctness**
    - **Validates: Requirements 1.9**

- [ ] 3. Fact Store
  - [ ] 3.1 Implement Citation_ID generation (`mem-YYYYMMDD-<6-char>`) with collision detection (up to 10 retries, error on all collisions)
    - _Requirements: 3.1, 3.2, 3.3_
  - [ ]* 3.2 Write property test for Citation_ID format and uniqueness invariants (Property 4)
    - **Property 4: Citation_ID format and uniqueness invariants**
    - **Validates: Requirements 3.2, 3.3**
  - [ ] 3.3 Implement `FactStore.create` — write YAML front-matter + CommonMark body to `<citation-id>.md`, enforcing safe filename characters
    - _Requirements: 2.2, 2.3, 3.5, 13.3_
  - [ ]* 3.4 Write property test for Fact file round-trip integrity (Property 3)
    - **Property 3: Fact file round-trip integrity**
    - **Validates: Requirements 2.2, 2.3**
  - [ ]* 3.5 Write property test for generated filename safety (Property 14)
    - **Property 14: Generated filenames use only safe characters**
    - **Validates: Requirements 13.3**
  - [ ] 3.6 Implement `FactStore.read` — parse YAML front-matter and return `Fact`; update `last_accessed_at` on read; return `null` for missing/deleted facts
    - _Requirements: 3.6, 3.7_
  - [ ] 3.7 Implement `FactStore.softDelete` — set `deleted_at` in YAML front-matter without removing the file
    - _Requirements: 7.2_
  - [ ] 3.8 Implement `FactStore.hardDelete` — permanently remove the fact file from disk
    - _Requirements: 7.3_
  - [ ] 3.9 Implement `FactStore.list` — return all non-deleted facts for a scope, sorted by `last_accessed_at` descending
    - _Requirements: 7.4_
  - [ ]* 3.10 Write unit tests for Fact Store
    - Test collision retry logic (mock RNG to force collisions)
    - Test soft-delete excludes fact from list
    - Test hard-delete removes file
    - Test `read` returns null for deleted fact
    - _Requirements: 3.3, 7.2, 7.3_

- [ ] 4. Checkpoint — Ensure all tests pass, ask the user if questions arise.

- [ ] 5. Scratchpad Manager
  - [ ] 5.1 Implement `ScratchpadManager.read` — read scratchpad file, return content with char count, cap, and utilization percentage
    - _Requirements: 4.1, 4.6_
  - [ ] 5.2 Implement `ScratchpadManager.write` — enforce hard character cap; reject writes that exceed cap with error containing current count, cap, and overage
    - _Requirements: 4.1, 4.2, 4.3_
  - [ ]* 5.3 Write property test for scratchpad cap enforcement (Property 5)
    - **Property 5: Scratchpad cap enforcement with complete error information**
    - **Validates: Requirements 4.1, 4.3**
  - [ ] 5.4 Implement `ScratchpadManager.trim` — display current content + stats, accept replacement, validate cap before writing
    - _Requirements: 4.4, 4.5_
  - [ ]* 5.5 Write unit tests for Scratchpad Manager
    - Test custom cap configuration (1,000–32,000 range)
    - Test trim re-prompts on overage
    - _Requirements: 4.2, 4.5_

- [ ] 6. Session Log Manager
  - [ ] 6.1 Implement `SessionLogManager.beginSession` — create a `SessionHandle` with start timestamp and empty tool call map
    - _Requirements: 5.1_
  - [ ] 6.2 Implement `SessionLogManager.endSession` — write YAML front-matter + summary body to `sessions/now/<timestamp>.md` within 2,000 ms
    - _Requirements: 5.1, 5.2, 6.4_
  - [ ]* 6.3 Write property test for session log structural completeness (Property 6)
    - **Property 6: Session log structural completeness**
    - **Validates: Requirements 5.1, 5.2**
  - [ ]* 6.4 Write property test for generated session log filename safety (Property 14 — session log filenames)
    - **Property 14: Generated filenames use only safe characters (session logs)**
    - **Validates: Requirements 13.3**
  - [ ] 6.5 Implement rolling-window compression: `now/` → `today/` (same-date merge), `today/` → `recent/` (date advance), `recent/` → `archive/` (>7 files)
    - _Requirements: 5.3, 5.4, 5.5_
  - [ ]* 6.6 Write property test for now→today compression (Property 7)
    - **Property 7: Rolling-window now→today compression**
    - **Validates: Requirements 5.3**
  - [ ]* 6.7 Write property test for recent/ bounded size (Property 8)
    - **Property 8: Rolling-window recent/ bounded size**
    - **Validates: Requirements 5.4, 5.5**

- [ ] 7. Checkpoint — Ensure all tests pass, ask the user if questions arise.

- [ ] 8. Poison_Guard
  - [ ] 8.1 Implement `PoisonGuard.validate` — synchronous checks for injection phrases (case-insensitive), length > 4,000 chars, HTML comments, zero-width characters, and CSS hidden constructs; fail-closed on internal error
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.6_
  - [ ]* 8.2 Write property test for Poison_Guard completeness (Property 12)
    - **Property 12: Poison_Guard rejects all invalid content**
    - **Validates: Requirements 10.2, 10.3, 10.4**
  - [ ] 8.3 Implement audit log writes for Poison_Guard rejections (NDJSON format: rejection reason, UTC timestamp, first 200 chars of content)
    - _Requirements: 10.5_

- [ ] 9. Auto_Extractor
  - [ ] 9.1 Implement pattern matchers for the four extraction patterns: `preference`, `config-kv`, `decision-rationale`, `named-entity-3x`
    - _Requirements: 9.1_
  - [ ] 9.2 Implement confidence scoring: `min(1.0, Σ pattern_weight)` with tuned weights per pattern
    - _Requirements: 9.2_
  - [ ]* 9.3 Write property test for Auto_Extract confidence score range (Property 9)
    - **Property 9: Auto_Extract confidence score range**
    - **Validates: Requirements 9.2**
  - [ ] 9.4 Implement disposition logic: auto-persist (≥0.85), suggest (0.50–0.84), discard (<0.50); route candidates through Poison_Guard before persisting
    - _Requirements: 9.3, 9.4, 9.5, 10.1_
  - [ ]* 9.5 Write property test for Auto_Extract persistence threshold (Property 10)
    - **Property 10: Auto_Extract persistence threshold**
    - **Validates: Requirements 9.3, 9.4, 9.5**
  - [ ] 9.6 Implement deduplication check — normalize content (whitespace collapse + case fold) and discard if identical fact already exists in archive
    - _Requirements: 9.7_
  - [ ]* 9.7 Write property test for deduplication prevents re-persistence (Property 11)
    - **Property 11: Deduplication prevents re-persistence**
    - **Validates: Requirements 9.7**
  - [ ] 9.8 Implement audit log writes for all Auto_Extract decisions (candidate preview, patterns, confidence, decision, UTC timestamp)
    - _Requirements: 9.6_

- [ ] 10. Checkpoint — Ensure all tests pass, ask the user if questions arise.

- [ ] 11. Context Payload Assembler
  - [ ] 11.1 Implement `ContextPayloadAssembler.assemble` — merge scratchpad + up to 10 facts (by last-accessed) + rolling-window summary from all three scopes in priority order; exclude private facts
    - _Requirements: 8.1, 8.2, 8.5_
  - [ ] 11.2 Implement token-budget truncation — remove content in reverse priority order (user-global first) until payload fits within `maxTokens`
    - _Requirements: 8.3_
  - [ ] 11.3 Implement coexist-mode wrapping — wrap payload in `<!-- claude-code-memory --> ... <!-- /claude-code-memory -->` when `coexistMode` is true
    - _Requirements: 12.5_
  - [ ] 11.4 Implement empty-payload handling — inject labeled empty block and log when all scopes are empty, all facts are private, and no session summary exists
    - _Requirements: 8.7_
  - [ ]* 11.5 Write unit tests for Context Payload Assembler
    - Test private fact exclusion
    - Test truncation removes user-global content first
    - Test coexist-mode wrapping
    - Test empty-payload path
    - _Requirements: 8.3, 8.5, 8.7, 12.5_

- [ ] 12. Hook Controller
  - [ ] 12.1 Implement `HookController.handleSessionStart` — call `assemble`, inject Context_Payload within 500 ms; on error log to audit log and allow session to proceed with empty context; detect native auto-memory and log outcome
    - _Requirements: 6.2, 6.3, 12.3, 12.4_
  - [ ] 12.2 Implement `HookController.handleSessionEnd` — call `endSession` within 2,000 ms; on timeout retain in-memory data and schedule deferred write on next SessionStart
    - _Requirements: 6.4, 6.5_
  - [ ] 12.3 Implement `HookController.handleUserPromptSubmit` — scan prompt for memory command patterns and dispatch to CLI handlers; forward unmodified if no command recognized
    - _Requirements: 6.6, 6.7, 7.7_
  - [ ] 12.4 Implement `HookController.handlePostToolUse` — call `Auto_Extractor.extract` on tool output
    - _Requirements: 6.8_
  - [ ] 12.5 Implement `HookController.handleStop` — flush all pending in-memory writes within 1,000 ms; write partial-flush warning to audit log on timeout
    - _Requirements: 6.9_
  - [ ]* 12.6 Write unit tests for Hook Controller
    - Test SessionStart proceeds with empty context on assembly error
    - Test SessionEnd deferred write on timeout
    - Test Stop partial-flush warning
    - _Requirements: 6.3, 6.5, 6.9_

- [ ] 13. Checkpoint — Ensure all tests pass, ask the user if questions arise.

- [ ] 14. Search Index (SQLite FTS5)
  - [ ] 14.1 Implement SQLite schema creation — `facts_fts` virtual table (FTS5, porter tokenizer) and `facts_meta` table
    - _Requirements: 2.4, 2.5_
  - [ ] 14.2 Implement `SearchIndex.upsert` and `SearchIndex.remove` — keep FTS5 index in sync with fact writes; exclude private and deleted facts from the index
    - _Requirements: 11.3_
  - [ ] 14.3 Implement `SearchIndex.search` — return results ordered by descending FTS5 rank, capped at 50; fall back to linear markdown scan if SQLite is unavailable
    - _Requirements: 11.3, 11.5_
  - [ ]* 14.4 Write property test for MCP search result ordering and bound (Property 13)
    - **Property 13: MCP search result ordering and bound**
    - **Validates: Requirements 11.3**
  - [ ] 14.5 Implement `SearchIndex.rebuild` — drop and recreate FTS5 index from all eligible markdown files; verify markdown wins on conflict
    - _Requirements: 2.4, 2.5_
  - [ ]* 14.6 Write unit tests for Search Index
    - Test SQLite markdown-wins conflict resolution
    - Test linear scan fallback when SQLite unavailable
    - _Requirements: 2.4, 2.5_

- [ ] 15. MCP Server
  - [ ] 15.1 Implement MCP authentication — generate 256-bit random hex token on first run, store at `~/.claude-memory/mcp-token`; reject requests without valid token
    - _Requirements: 11.4_
  - [ ] 15.2 Implement `memory_read` tool — retrieve fact by Citation_ID; respond within 200 ms for ≤10,000 facts
    - _Requirements: 11.1, 11.5_
  - [ ] 15.3 Implement `memory_write` tool — apply Poison_Guard validation before persisting; return rejection reason on failure
    - _Requirements: 11.1, 11.2_
  - [ ] 15.4 Implement `memory_delete` tool — soft or hard delete by Citation_ID; return error if Citation_ID not found
    - _Requirements: 11.1, 11.7_
  - [ ] 15.5 Implement `memory_list` tool — list non-deleted facts filtered by scope and/or tag; respond within 200 ms
    - _Requirements: 11.1, 11.5_
  - [ ] 15.6 Implement `memory_search` tool — delegate to `SearchIndex.search`; respond within 200 ms
    - _Requirements: 11.1, 11.3, 11.5_
  - [ ] 15.7 Implement `memory_stats` tool — return total fact count, scratchpad utilization per scope, last Distill_Job time, total store size in bytes; respond within 200 ms
    - _Requirements: 11.1, 11.5, 11.6_
  - [ ]* 15.8 Write unit tests for MCP Server
    - Test authentication rejection for missing/invalid token
    - Test `memory_write` Poison_Guard integration
    - Test `memory_delete` with unknown Citation_ID
    - _Requirements: 11.2, 11.4, 11.7_

- [ ] 16. Checkpoint — Ensure all tests pass, ask the user if questions arise.

- [ ] 17. CLI Layer
  - [ ] 17.1 Implement `claude-memory remember "<content>"` — create fact in active project scope (fallback to user-global); print assigned Citation_ID
    - _Requirements: 7.1_
  - [ ] 17.2 Implement `claude-memory forget <citation-id> [--hard]` — soft or hard delete; print error if Citation_ID not found or already deleted
    - _Requirements: 7.2, 7.3_
  - [ ] 17.3 Implement `claude-memory list [--scope] [--tag]` — display non-deleted facts grouped by tag, showing Citation_ID, creation date, and first 80 chars of content
    - _Requirements: 7.4_
  - [ ] 17.4 Implement `claude-memory show <citation-id>` — display full content and YAML front-matter; print error if not found or deleted
    - _Requirements: 7.5_
  - [ ] 17.5 Implement `claude-memory edit <citation-id>` — open fact file in `$EDITOR` or configured editor; print error if neither is set
    - _Requirements: 7.6_
  - [ ] 17.6 Implement `claude-memory scratchpad trim [--scope]` — display content + stats, prompt for replacement, validate cap before writing
    - _Requirements: 4.4, 4.5_
  - [ ] 17.7 Implement `claude-memory stats` — print total facts, scratchpad utilization, last job times, store size
    - _Requirements: 11.6_
  - [ ]* 17.8 Write unit tests for CLI Layer
    - Test `remember` returns Citation_ID
    - Test `forget` error on unknown Citation_ID
    - Test `edit` error when no editor configured
    - _Requirements: 7.1, 7.2, 7.6_

- [ ] 18. Maintenance Jobs
  - [ ] 18.1 Implement `DistillJob.run` — execute rolling-window compression; promote unreferenced facts from compressed logs to Fact_Archive; write completion status to jobs.log
    - _Requirements: 5.6, 5.7, 5.8_
  - [ ] 18.2 Implement `IndexJob.run` — drop and rebuild FTS5 index from all eligible markdown files; complete within 30 s for ≤1,000 facts
    - _Requirements: 11.5_
  - [ ] 18.3 Implement `CurateJob.run` — identify facts not accessed in ≥90 days without `retain: true`; present to user for confirmation before deletion
    - _Requirements: 10.7_
  - [ ] 18.4 Implement concurrency guard — `.lock` file with cross-platform advisory locking (`fs.open` exclusive flag) to prevent duplicate job runs
    - _Requirements: 13.5_
  - [ ] 18.5 Wire `claude-memory distill`, `claude-memory index`, and `claude-memory curate` CLI commands to their respective jobs
    - _Requirements: 5.6_
  - [ ]* 18.6 Write unit tests for Maintenance Jobs
    - Test distill promotes unreferenced facts
    - Test index job completes within time budget
    - Test curate skips facts with `retain: true`
    - Test concurrency guard rejects duplicate run
    - _Requirements: 5.8, 10.7, 13.5_

- [ ] 19. Network isolation enforcement
  - [ ] 19.1 Implement network call interceptor — block any outbound network call during core operations; log attempted destination and UTC timestamp to audit log; continue operation without the call
    - _Requirements: 14.1, 14.2_
  - [ ]* 19.2 Write integration test for network isolation
    - Intercept network calls during all core operations; verify none are made
    - _Requirements: 14.1_

- [ ] 20. Integration wiring and end-to-end tests
  - [ ] 20.1 Wire all components into the main entry point — register hook handlers, start MCP server, expose CLI commands
    - _Requirements: 6.1, 11.1, 12.1, 12.2_
  - [ ]* 20.2 Write integration test for full session lifecycle
    - SessionStart → PostToolUse (auto-extract) → SessionEnd → verify session log + facts written correctly
    - _Requirements: 6.1, 6.2, 6.4, 6.8_
  - [ ]* 20.3 Write integration test for MCP server tool round-trips
    - `memory_write` → `memory_read` → `memory_delete` → verify state
    - _Requirements: 11.1, 11.2, 11.7_
  - [ ]* 20.4 Write integration test for cross-OS path portability
    - Simulate cloned store with different OS path separator conventions; verify correct initialization and fact reads
    - _Requirements: 13.1, 13.4_

- [ ] 21. Final checkpoint — Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation at each major layer boundary
- Property tests use `fast-check` with a minimum of 100 iterations per property (1,000 for pure functions)
- Unit tests use `vitest`
- The design uses TypeScript/Node.js throughout; all code examples should use TypeScript
- Markdown files are always the source of truth; SQLite is a regenerable cache

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1"] },
    { "id": 1, "tasks": ["2.1", "2.3", "2.4", "2.5"] },
    { "id": 2, "tasks": ["2.2", "2.6", "3.1", "3.3"] },
    { "id": 3, "tasks": ["3.2", "3.4", "3.5", "3.6", "3.7", "3.8", "3.9"] },
    { "id": 4, "tasks": ["3.10", "5.1", "5.2", "6.1", "6.2", "8.1"] },
    { "id": 5, "tasks": ["5.3", "5.4", "6.3", "6.4", "6.5", "8.2", "8.3", "9.1"] },
    { "id": 6, "tasks": ["5.5", "6.6", "6.7", "9.2", "9.6"] },
    { "id": 7, "tasks": ["9.3", "9.4", "9.8"] },
    { "id": 8, "tasks": ["9.5", "9.7", "11.1", "14.1"] },
    { "id": 9, "tasks": ["11.2", "11.3", "11.4", "14.2", "14.3"] },
    { "id": 10, "tasks": ["11.5", "12.1", "12.2", "12.3", "12.4", "12.5", "14.4", "14.5"] },
    { "id": 11, "tasks": ["12.6", "14.6", "15.1"] },
    { "id": 12, "tasks": ["15.2", "15.3", "15.4", "15.5", "15.6", "15.7", "17.1", "17.2", "17.3", "17.4", "17.5", "17.6", "17.7"] },
    { "id": 13, "tasks": ["15.8", "17.8", "18.1", "18.2", "18.3", "18.4"] },
    { "id": 14, "tasks": ["18.5", "18.6", "19.1"] },
    { "id": 15, "tasks": ["19.2", "20.1"] },
    { "id": 16, "tasks": ["20.2", "20.3", "20.4"] }
  ]
}
```
