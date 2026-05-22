# Tasks — claude-memory-kit v0.1.0

**Status**: Draft · **Author**: Claude (Opus 4.7) + Lior Hollander · **Date started**: 2026-05-23

This document specifies **WHAT to build, in what ORDER, with HOW-DONE criteria**. It is the bridge between [`requirements.md`](requirements.md) (WHAT v0.1.0 must do) and [`design.md`](design.md) (HOW v0.1.0 is built).

## How to read this file

Each task is a **PR-sized unit of work** (~1–3 days for a single developer). For each:

- **ID**: stable identifier `T-NNN`.
- **Scope**: one-paragraph what gets built.
- **Implements**: which FRs (requirements.md) and which §sections (design.md) it covers.
- **Depends on**: prior tasks that must be done first.
- **Done when**: a checklist of observable conditions that must all be true before the task can be marked done. Each item is a single CI- or manually-verifiable assertion.
- **Estimate**: S (≤1 day) / M (1–3 days) / L (3–5 days).
- **Status**: `pending` / `in-progress` / `done`.

The "Done when" checklists are written for the **future implementer** (us, when we build), not the day-to-day user. The day-to-day user runs `cmk install` once and then just chats with Claude — memory writes/reads happen automatically via the hooks.

## Ordering

Dependency-DAG order: foundations first, then per-layer, then cross-cutting. Each layer's tasks can be parallelized if their internal dependencies allow it.

## Scope of v0.1.0

| Layer | Tasks | Required for v0.1.0? |
| --- | --- | --- |
| Layer 1 — Foundation | T-001 .. T-005 | **Yes** |
| Layer 2 — Granular archive | T-006 .. T-009 | **Yes** |
| Layer 3 — Scratchpads | T-010 .. T-013 | **Yes** |
| Layer 4 — Hooks + skill + auto-extract | T-014 .. T-023 | **Yes** |
| Layer 5 — Search (SQLite+FTS5 + MCP) | T-024 .. T-027 | **Optional** (deferrable to v0.1.x) |
| Layer 6 — Cron compression | T-028 .. T-030 | **Optional** (deferrable to v0.1.x) |
| Cross-cutting (CLI, doctor, docs, CI, release) | T-031 .. T-036 | **Yes** |

Optional tasks ship if time permits; otherwise they roll forward into v0.1.x patches. The kit is fully usable without Layer 5 + 6 — search degrades to grep/`cmk view`; compression runs lazily on SessionStart (per §8.2.1).

---

## Layer 1 — Foundation

### T-001 — Repo scaffolding + `template/` skeleton

**Scope**: Create the `template/` directory containing the canonical per-project file tree the installer copies into target projects. Includes empty `context/`, `context/memory/`, `context/sessions/`, `context/transcripts/`, `context/queues/`, `context/.index/.gitkeep`, plus seed files (CLAUDE.md block, README.md placeholders, `.gitignore` rules).

**Implements**: FR-1, FR-4, FR-5; design §1.1, §13.

**Depends on**: —

**Done when**:

- [ ] `template/` exists and contains the canonical 3-tier file tree (project tier + local-tier scaffolds; user-tier is created separately by `cmk init-user-tier`).
- [ ] `scripts/validate-template.sh` passes — asserts required files exist and have non-empty content.

**Estimate**: S · **Status**: pending

---

### T-002 — `cmk` Node CLI scaffold

**Scope**: Create the `@claude-memory-kit/cli` npm package as a Node binary entry point with the subcommand table from design §12 wired as stubs (each prints "not yet implemented" and exits 0). Use `commander` or `cac` for arg parsing.

**Implements**: FR-22, FR-23; design §12.

**Depends on**: T-001.

**Done when**:

- [ ] `cmk --help` lists every subcommand in design §12 with a one-line description.
- [ ] Every subcommand stub (e.g. `cmk search "foo"`) exits 0 with a clear "not yet implemented in v0.1.0 milestone N" message.
- [ ] `npm install -g @claude-memory-kit/cli` registers `cmk` on the user's PATH (verified on macOS, Linux, Windows).

**Estimate**: M · **Status**: pending

---

### T-003 — `cmk install` cross-OS implementation

**Scope**: Implement the install path (Node-driven). Creates 3-tier directory structure, copies `template/*` into target, injects gitignore entries for `context.local/`, `context/.index/`, `context/.locks/`, and creates `~/.claude-memory-kit/` if missing. Never overwrites existing user files. Honors `MEMORY_KIT_USER_DIR` env var for the user-tier path.

**Implements**: FR-22, FR-23, FR-24; design §1.1, §13.

**Depends on**: T-001, T-002.

**Done when**:

- [ ] Running `cmk install` in a fresh directory creates the full project-tier scaffold and exits 0.
- [ ] Re-running `cmk install` in an already-scaffolded directory leaves existing files unchanged (no overwrites), refreshes only kit-managed files (e.g. gitignore lines), exits 0.
- [ ] `MEMORY_KIT_USER_DIR=/custom/path cmk install` uses the override path for the user tier instead of `~/.claude-memory-kit/`.
- [ ] Output is byte-identical across Windows 10/11, macOS 14+, Ubuntu 22.04+ (verified by CI matrix in T-034).

**Estimate**: M · **Status**: pending

---

### T-004 — CLAUDE.md loader block with versioned delimiters

**Scope**: Implement the idempotent CLAUDE.md injection described in design §13.1. Includes the `<!-- claude-memory-kit:start vX.Y.Z -->` / `:end` delimiters, in-place replacement on re-install, downgrade-guard, and `cmk uninstall` clean removal.

**Implements**: FR-22; design §13.1.

**Depends on**: T-003.

**Done when**:

- [ ] Installing against a project with no kit delimiters appends the versioned block at end-of-file, preserving all prior content verbatim.
- [ ] Re-installing against a project with a same-or-older-version block replaces only the block contents; everything outside the delimiters is unchanged.
- [ ] Installing against a project with a newer-version block prints a warning, makes no changes, exits 0 (unless `--force` is supplied).
- [ ] `cmk uninstall` strips the delimited block exactly (delimiters included) and leaves all other CLAUDE.md content byte-for-byte.

**Estimate**: S · **Status**: pending

---

### T-005 — `canonicalize()` + ID generation (Node + Python parity)

**Scope**: Implement the `canonicalize()` text-normalization function (design §3.2) and `generateId()` (design §3.3) as a shared library in **both** Node (`@cmk/canonicalize` package) and Python (for the cron + auto-extract scripts). Ship a shared test vector file (`fixtures/canonicalize-vectors.json`) and run both implementations against it in CI.

**Implements**: FR-14; design §3.

**Depends on**: T-002.

**Done when**:

- [ ] Every string in `fixtures/canonicalize-vectors.json` produces byte-identical results in both the Node and Python implementations.
- [ ] Hashing the same bullet text twice on different machines produces the same 8-char base32 ID (cross-machine determinism).
- [ ] Pre-existing `(P-XXXXXXXX)` backrefs in the input are stripped before hashing (so adding/removing the backref doesn't change the ID).
- [ ] The base32 alphabet excludes ambiguous chars `0`, `O`, `1`, `l`, `I`, `8` (per design §3.1).

**Estimate**: M · **Status**: pending

---

## Layer 2 — Granular archive

### T-006 — Per-fact file format + writer

**Scope**: Implement the YAML-frontmatter per-fact file format described in design §2.2. Includes a writer helper (`writeFact(tier, type, slug, body, provenance)`) used by `memory-write` skill and `cmk` import paths. Validates required frontmatter fields, computes ID via T-005, writes the markdown body.

**Implements**: FR-1, FR-29; design §2.2.

**Depends on**: T-005.

**Done when**:

- [ ] `writeFact(...)` with valid args creates `<tier_dir>/<type>_<slug>.md` containing the YAML frontmatter required fields: `id`, `type`, `title`, `created_at`, `write_source`, `trust`, `source_file`, `source_line`, `source_sha1`.
- [ ] `writeFact(...)` with any required field missing rejects the write with `error_category: "schema"` and does not create the file.
- [ ] Two writes that produce identical canonical IDs in the same tier — the second is detected as duplicate, logged, and skipped (no overwrite, no error).

**Estimate**: M · **Status**: pending

---

### T-007 — INDEX.md generation + maintenance

**Scope**: Implement `cmk reindex` (the markdown-side variant; SQLite reindex is T-025). Walks `<tier>/memory/*.md`, reads frontmatter, regenerates `<tier>/memory/INDEX.md` and `~/.claude-memory-kit/fragments/INDEX.md` in the format from design §2.3.

**Implements**: FR-1, FR-7; design §2.3.

**Depends on**: T-006.

**Done when**:

- [ ] `cmk reindex` produces an `INDEX.md` with exactly one line per non-tombstoned `.md` file in `memory/`, in the documented `- ({id}) [type] [title](filename.md) — <hook>` format.
- [ ] Adding, removing, or retitling a fact file updates `INDEX.md` correctly on the next `cmk reindex` invocation.
- [ ] INDEX.md > 25 KB triggers a warning suggesting consolidation, but the file still writes (no hard cap).

**Estimate**: S · **Status**: pending

---

### T-008 — Tombstone discipline

**Scope**: Implement the tombstone flow from design §6.5: `cmk forget <id-or-query>` moves the matched fact file to `<tier>/memory/archive/tombstones/<id>.md`, adds `deleted_at` + `deleted_reason` + `deleted_by` frontmatter, removes any matching bullet from scratchpads (MEMORY.md etc.), marks the SQLite row as `deleted_at` (when Layer 5 installed).

**Implements**: FR-29; design §6.5.

**Depends on**: T-006.

**Done when**:

- [ ] `cmk forget P-A8FN3MQ2` prompts for confirmation; on confirm, moves the fact file to `archive/tombstones/<id>.md` with deletion frontmatter added.
- [ ] After tombstoning, the matching bullet (matched by ID) is removed from any scratchpad file that contained it.
- [ ] `mk_get(P-A8FN3MQ2)` against a tombstoned ID returns the tombstoned content plus an explicit `deleted_on: <ISO>` annotation (never "not found").

**Estimate**: S · **Status**: pending

---

### T-009 — Consolidation / merge semantics

**Scope**: Implement the `mergeFacts(idA, idB) → newC` operation from design §3.4. Used by the weekly curator (T-029) and by manual `cmk merge` invocation. Computes new ID, writes `merged_from: [A, B]` on C's frontmatter, moves A and B to `archive/superseded/` with `superseded_by: C` added.

**Implements**: FR-14; design §3.4.

**Depends on**: T-006, T-008.

**Done when**:

- [ ] Merging two fact files produces a new file whose ID is `generateId(tier, canonicalize(merged_body))` and whose frontmatter contains `merged_from: [idA, idB]`.
- [ ] The original A.md and B.md are moved to `<tier>/memory/archive/superseded/` with `superseded_by: <newC.id>` added to each.
- [ ] `mk_get(idA)` after merge returns A's body plus an explicit `merged_into: <newC.id>` annotation.

**Estimate**: M · **Status**: pending

---

## Layer 3 — Scratchpads

### T-010 — Bounded scratchpad writer + cap enforcement

**Scope**: Implement the scratchpad write+cap-enforcement workflow from design §2.1. Counts bytes via `wc -c`; when a write would push the file >95% of cap, runs the consolidation step (merge similar bullets, drop entries >14 days old with no recent reference) before applying the new write. Caps are read from `<repo>/context/settings.json` (project tier) and `~/.claude-memory-kit/settings.json` (user tier), with hardcoded defaults as fallback.

**Implements**: FR-3; design §2.1.

**Depends on**: T-005.

**Done when**:

- [ ] A write that would push the file over cap triggers the consolidation pass first, then writes.
- [ ] Consolidation preserves all bullets newer than 14 days OR carrying `trust: high` regardless of age.
- [ ] If post-consolidation the file is still over cap after the write, the new write is rejected with `error_category: "cap_exceeded"` (no silent truncation).
- [ ] Per-scratchpad cap overrides in `settings.json` take effect (verified by setting `MEMORY.md.max_chars: 4000` and confirming the writer enforces 4000, not the default).

**Estimate**: M · **Status**: pending

---

### T-011 — Provenance frontmatter writer (HTML-comment form)

**Scope**: Implement the inline HTML-comment provenance line emitted directly below each scratchpad bullet (design §4). Writer takes a bullet + the 7 required fields and produces the `<!-- source:..., sha1:..., write:..., trust:..., at:... -->` line. Consumer-side parser also lives here for read-back.

**Implements**: FR-29; design §4.

**Depends on**: T-005, T-010.

**Done when**:

- [ ] `writeBullet(...)` emits the bullet text on one line followed by the provenance HTML comment on the next.
- [ ] Any missing required field rejects the write with `error_category: "schema"`.
- [ ] The SessionStart hook reads scratchpad files and parses the HTML-comment provenance back into structured form for tier-merging (per §7.1).

**Estimate**: S · **Status**: pending

---

### T-012 — Seed scratchpad templates (USER/SOUL/MEMORY/HABITS/LESSONS)

**Scope**: Create the seed template files copied by `cmk install` into the project tier and `cmk init-user-tier` into the user tier. Each has a header comment with cap+last-distilled, three fixed sections, and a one-line placeholder explaining what belongs in it.

**Implements**: FR-3; design §2.1.

**Depends on**: T-010, T-011.

**Done when**:

- [ ] After `cmk install`, the project tier contains `context/SOUL.md`, `context/MEMORY.md`, `context.local/{machine-paths,overrides}.md` populated from the seed templates.
- [ ] After `cmk init-user-tier`, the user tier contains `~/.claude-memory-kit/{USER,HABITS,LESSONS}.md` (or `$MEMORY_KIT_USER_DIR/...`) plus `fragments/INDEX.md`.
- [ ] Every seed template includes the documented header comment (cap, last-distilled, last-health-check) and the three fixed section headings.

**Estimate**: S · **Status**: pending

---

### T-013 — `cmk trust <id> <level>` override

**Scope**: Implement manual trust override CLI. Resolves the ID (scratchpad bullet OR fact file), updates the `trust:` field in provenance/frontmatter, logs the change to `audit.log`.

**Implements**: FR-29; design §4, §6.2.

**Depends on**: T-006, T-010, T-011.

**Done when**:

- [ ] `cmk trust P-A8FN3MQ2 high` updates the `trust:` field of the matching observation and writes an `audit.log` entry with prior value, new value, and timestamp.
- [ ] An unresolvable ID exits with code 2 and the error "ID not found: P-A8FN3MQ2".
- [ ] A trust level outside `{low, medium, high}` exits with code 2 and a validation error.

**Estimate**: S · **Status**: pending

---

## Layer 4 — Hooks + skill + auto-extract

### T-014 — `hooks.json` + 6-hook scaffold

**Scope**: Ship the `plugin/.claude-plugin/hooks/hooks.json` from design §5.1 plus the `bin/cmk-<verb>` script stubs (each prints "not yet implemented" and exits 0 with valid hook output JSON). Enables registration without runtime behavior — unblocks T-015 through T-019.

**Implements**: FR-9; design §5.1.

**Depends on**: T-003.

**Done when**:

- [ ] Installing the kit as a Claude Code plugin and starting a session registers all 6 hooks (Setup, SessionStart, UserPromptSubmit, PostToolUse, Stop, SessionEnd) without parse errors in Claude Code's hook loader.
- [ ] Each `cmk-<verb>` stub, when invoked by Claude Code, exits 0 and emits valid hook output JSON (`{"continue": true}` minimum) so the session does not block.

**Estimate**: S · **Status**: pending

---

### T-015 — `cmk-inject-context` (SessionStart hook)

**Scope**: Implement the SessionStart hook handler from design §1.4 + §5.2 + §7.1. Resolves 3-tier paths, reads the relevant files in priority order, concatenates into a ≤10 KB snapshot, emits as `additionalContext` JSON. Excludes facts marked `private: true` from the digest.

**Implements**: FR-7, FR-9; design §1.4, §5.2, §7.1.

**Depends on**: T-014, T-012.

**Done when**:

- [ ] The hook assembles the Context_Payload from 3 tiers and emits valid `additionalContext` JSON within 500 ms (NFR-1).
- [ ] Duplicate IDs across tiers: most-specific tier wins; shadowed copies are appended to `context/.locks/shadowed_by.log`.
- [ ] Snapshot >10 KB triggers documented-priority truncation (drop lowest-tier oldest bullets first) and logs the truncation event.
- [ ] Facts with `private: true` in their frontmatter are excluded from the digest (verified: a fact marked private with a unique sentinel string never appears in the emitted `additionalContext`).

**Estimate**: M · **Status**: pending

---

### T-016 — `cmk-capture-prompt` (UserPromptSubmit hook)

**Scope**: Implement the UserPromptSubmit hook handler. Strips `<private>...</private>` blocks (replaces with `[private content redacted]`), preserves `<retain>` tags for the Stop-hook downstream, appends the cleaned prompt to `context/transcripts/{YYYY-MM-DD}.md` with a timestamp + role marker.

**Implements**: FR-15; design §5.2, §6.6.

**Depends on**: T-014.

**Done when**:

- [ ] A prompt containing `<private>secret</private>` results in `[private content redacted]` written to the transcript; the literal "secret" content NEVER appears on disk in any form (verified by grep).
- [ ] A prompt containing `<retain>important note</retain>` preserves the tag boundaries in the transcript so the Stop-hook downstream can force-keep it.
- [ ] The hook returns `{"continue": true}` and exits within 100 ms (NFR-1).

**Estimate**: S · **Status**: pending

---

### T-017 — `cmk-observe-edit` (PostToolUse hook on Write|Edit|MultiEdit)

**Scope**: Implement the PostToolUse hook handler. Triggers only on `Write`, `Edit`, `MultiEdit` matchers (per design §5.1 `matcher` field). If tool output exceeds 50 lines, appends a one-line summary to `context/sessions/now.md`. Runs detached (fire-and-forget) per claude-remember pattern.

**Implements**: FR-9; design §5.2 (PostToolUse row), §1.4 "During each turn".

**Depends on**: T-014.

**Done when**:

- [ ] A `Write` / `Edit` / `MultiEdit` tool call with >50 lines of output appends a summary line to `sessions/now.md` within the hook's 120 s timeout budget.
- [ ] Other tools firing PostToolUse are not processed (the matcher in `hooks.json` blocks before invocation).
- [ ] The hook spawns its work detached and returns `{"continue": true}` within 50 ms (NFR-1).

**Estimate**: S · **Status**: pending

---

### T-018 — `cmk-capture-turn` (Stop hook + `stop_hook_active` guard + spawn auto-extract)

**Scope**: Implement the Stop hook handler. Includes the `stop_hook_active` recursion guard from design §5.2.1 (short-circuits when re-invoked from a prior block decision). Appends the assistant turn to `transcripts/{date}.md` (stripping `<private>`, force-keeping `<retain>`). Spawns the detached auto-extract subprocess via the platform-appropriate detach method (Unix: `</dev/null >/dev/null 2>&1 & disown`; Windows: equivalent via Node `child_process.spawn` with `detached: true, stdio: 'ignore'`).

**Implements**: FR-9, FR-10, FR-15; design §5.2, §5.2.1, §6.6.

**Depends on**: T-014, T-016.

**Done when**:

- [ ] A Stop hook payload with `stop_hook_active: true` exits immediately with `{"continue": true}` and does NOT spawn the auto-extract subprocess.
- [ ] A Stop hook firing with `stop_hook_active: false` (or absent) appends the turn to the day's transcript and spawns the detached auto-extract subprocess within 50 ms before returning (NFR-1).
- [ ] When the parent shell or Claude Code process exits before the auto-extract subprocess finishes, the subprocess continues to completion (verified via integration test that watches log file mtime).

**Estimate**: M · **Status**: pending

---

### T-019 — `cmk-compress-session` (SessionEnd hook)

**Scope**: Implement the SessionEnd hook handler. Invokes the CompressorBackend (§8.3, T-020 ships the Haiku impl) on `sessions/now.md` → produces `sessions/today-{YYYY-MM-DD}.md`. Truncates `now.md` after successful compression. Logs to `compress.log`.

**Implements**: FR-19, FR-20; design §1.4 "At session end", §8.1, §8.3.

**Depends on**: T-014, T-020.

**Done when**:

- [ ] On SessionEnd with non-empty `now.md`, the contents are compressed via Haiku and written to `today-{YYYY-MM-DD}.md` (creating it if absent, appending if it exists for the same day).
- [ ] On successful compression, `now.md` is truncated to zero bytes.
- [ ] On compression failure (network error, Haiku timeout, etc.), `now.md` is left intact, the error is logged to `compress.log`, and the hook exits 0 (non-fatal — next session retries).
- [ ] If the 120 s cooldown from §8.2 has not elapsed since the last Haiku call, compression is skipped for this session-end and logged as `skipped: cooldown`.

**Estimate**: M · **Status**: pending

---

### T-020 — Auto-extract subagent + CompressorBackend Haiku impl

**Scope**: Implement the detached auto-extract subprocess script (per design §6.1) plus the `HaikuViaAnthropicApi` CompressorBackend (per §8.3). Calls `claude --print --model claude-haiku-4-5-20251001 --allowed-tools "Read" --mcp-config '{...}' --strict-mcp-config --max-turns 1`. Routes the sub-Claude's extraction output through the `memory-write` skill or the review queue per §6.2 routing.

**Implements**: FR-10, FR-12, FR-13; design §6.1, §6.2, §8.3.

**Depends on**: T-005, T-006, T-010, T-011.

**Done when**:

- [ ] When auto-extract returns ≥1 durable-fact candidate, each is routed by trust: `high` → `memory-write` (canonical), `medium` → `queues/review.md`, `low` → discarded with `skip: nothing durable` logged.
- [ ] When auto-extract is already running (lock file at `context/.locks/auto-extract.lock` present), the subsequent invocation exits immediately without spawning a duplicate run.
- [ ] On completion, exactly one NDJSON line is written to `sessions/{date}.extract.log` matching the schema in design §6.1.
- [ ] When `claude --print` returns non-zero, `success: false` + captured `error_category` is logged and the script exits 0 (non-fatal — session is not blocked).

**Estimate**: L · **Status**: pending

---

### T-021 — `memory-write` skill (add / replace / remove) + Poison_Guard

**Scope**: Implement the auto-triggered `memory-write` skill from design §6.3. Three actions (`add` / `replace` / `remove`), each gated through the Poison_Guard regex filter from §6.7 before any write reaches disk. Auto-triggers on natural-language phrases ("remember this", "update memory", "forget about X") per FR-11.

**Implements**: FR-10, FR-11, FR-29; design §6.3, §6.5 (remove → tombstone), §6.7.

**Depends on**: T-006, T-008, T-010, T-011.

**Done when**:

- [ ] A user prompt containing a memory trigger phrase from the documented set auto-invokes `memory-write` with the inferred action (`add` / `replace` / `remove`).
- [ ] An `add` whose candidate text matches ANY Poison_Guard pattern from §6.7 rejects the write with `error_category: "poison_guard"`, logs a redacted entry to `.locks/poison-guard.log`, and emits a user-visible message identifying which pattern category matched (without echoing the matched text).
- [ ] A `remove` runs the tombstone flow from T-008 (NEVER silently deletes) and requires explicit user confirmation before proceeding.
- [ ] A `replace` finds the matching observation by substring on canonical text, computes the new ID, and marks the old observation `superseded_by: <new.id>` rather than deleting.

**Estimate**: L · **Status**: pending

---

### T-022 — Conflict queue + `cmk queue conflicts` resolver

**Scope**: Implement the conflict detection + queuing from design §6.8. On every `memory-write` add, run a similarity check against existing observations on the same heading_path; if similarity > 0.85 AND content differs AND new.trust < existing.trust → route to `queues/conflicts.md`. The interactive `cmk queue conflicts` command walks pending conflicts and accepts `keep-old` / `keep-new` / `merge-both`.

**Implements**: FR-10, FR-29; design §6.8.

**Depends on**: T-021. Optional dependency: T-024 (FTS5 for semantic similarity); fallback is substring-match if Layer 5 not installed.

**Done when**:

- [ ] A `memory-write add` that produces an observation conflicting with an existing one (per §6.8 conditions) appends a pending entry to `context/queues/conflicts.md` and does NOT write the new observation to canonical memory.
- [ ] When Layer 5 (T-024) is not installed, conflict detection falls back to substring match on the heading_path's content (degraded but functional) and logs `similarity_backend: "substring"` in `audit.log` for each detection.
- [ ] `cmk queue conflicts` displays pending conflicts one at a time, accepts `keep-old` / `keep-new` / `merge-both` / `skip`, and applies the chosen resolution atomically.
- [ ] `merge-both` invokes the T-009 merge path to produce a new canonical observation citing both originals.

**Estimate**: M · **Status**: pending

---

### T-023 — Review queue + `cmk queue review` resolver

**Scope**: Implement the medium-trust review queue from design §6.2. Auto-extract routes `medium` trust candidates to `context/queues/review.md`. The interactive `cmk queue review` command walks pending entries and accepts `promote` (move to canonical) / `discard` / `skip`.

**Implements**: FR-10, FR-29; design §6.2.

**Depends on**: T-020, T-021.

**Done when**:

- [ ] A `medium` trust candidate from auto-extract appends to `queues/review.md` (with full provenance frontmatter) and does NOT touch canonical MEMORY.md.
- [ ] `cmk queue review` displays pending entries one at a time and accepts `promote` / `discard` / `skip`.
- [ ] `promote` invokes `memory-write add` with `trust: high` and removes the entry from `review.md`.
- [ ] `discard` removes the entry from `review.md` and logs the discard to `audit.log`.

**Estimate**: M · **Status**: pending

---

## Layer 5 — Search (OPTIONAL)

> Not required for v0.1.0 release. If deferred, T-022 falls back to substring-match for conflict detection and `cmk search` is unavailable (users use `grep` / `rg`).

### T-024 — SQLite + FTS5 schema + WAL configuration

**Scope**: Ship the SQLite schema from design §9.1 (observations table + FTS5 virtual table + sync triggers + files checkpoint table). Configures WAL mode + synchronous=NORMAL pragmas.

**Implements**: FR-16; design §9.1.

**Depends on**: T-002.

**Done when**:

- [ ] `cmk reindex --boot` on a fresh project creates `context/.index/memory.db` with all tables, indexes, FTS5 virtual table, and sync triggers from design §9.1.
- [ ] The database is created with `journal_mode = WAL` and `synchronous = NORMAL`, both verified via `PRAGMA` reads.
- [ ] Observation inserts, updates, and deletes maintain the FTS5 mirror automatically via triggers (no manual sync calls).

**Estimate**: M · **Status**: pending

---

### T-025 — Reindex strategy (boot / runtime / recovery)

**Scope**: Implement the three reindex modes from design §9.2. `cmk reindex --boot` walks markdown + diffs mtime/sha1 vs `files` table; `cmk reindex --full` drops the DB and rebuilds; runtime mode (file-watcher) uses `chokidar` with 500 ms debounce.

**Implements**: FR-16; design §9.2.

**Depends on**: T-024.

**Done when**:

- [ ] `cmk reindex --boot` with no markdown changes since last index re-indexes zero files and completes in <200 ms (NFR-1).
- [ ] Editing a markdown file with the runtime watcher active triggers a re-index of that file within 1 s of the change (debounce + 500 ms budget).
- [ ] `cmk reindex --full` drops and recreates the database; the row count matches the markdown-side observation count.

**Estimate**: M · **Status**: pending

---

### T-026 — `cmk search` hybrid CLI

**Scope**: Implement the `cmk search` command from design §9.3. Supports `--mode keyword|semantic|hybrid`, `--min-trust`, `--tier`, `--since`, `--limit`, `--include-tombstoned` flags. Keyword backend always available (FTS5 BM25). Semantic backend gated on memsearch+Milvus install (HC-7).

**Implements**: FR-16, FR-17, FR-18, FR-30; design §9.3.

**Depends on**: T-024, T-025.

**Done when**:

- [ ] `cmk search "query"` in keyword mode against 10k observations returns ranked results within 100 ms (NFR-1).
- [ ] `--mode semantic` when Layer 5b (memsearch + Milvus) is not installed prints a clear error and exits 2 (no silent fallback to keyword).
- [ ] `--mode hybrid` with both backends available fuses keyword + semantic results via reciprocal-rank fusion (0.5 / 0.5).
- [ ] Without `--include-tombstoned`, results exclude observations with non-null `deleted_at`.

**Estimate**: M · **Status**: pending

---

### T-027 — MCP server with 6 tools (stdio transport)

**Scope**: Implement the MCP server from design §10. Stdio transport per the MCP spec (no port, no host). Six tools: `mk_search`, `mk_get`, `mk_timeline`, `mk_cite`, `mk_remember`, `mk_recent_activity`. Path-traversal validation on every read/write. Built on `@modelcontextprotocol/sdk` Node library (or hand-rolled JSON-RPC if v0.2 swaps it).

**Implements**: FR-26, NFR-6; design §10.

**Depends on**: T-024, T-025, T-026.

**Done when**:

- [ ] `cmk mcp serve` reads JSON-RPC from stdin and writes responses to stdout per the MCP 2025-06-18 stdio transport spec (newline-delimited, no embedded newlines).
- [ ] `stdout` contains ONLY valid MCP JSON-RPC; all logging goes to stderr (verified by routing `2>` to a file and confirming stdout parses as JSON-RPC only).
- [ ] Any MCP tool argument containing `..`, URL-encoded traversal (`%2e%2e`), or any prefix outside `<repo>/context/`, `<repo>/context.local/`, or `~/.claude-memory-kit/` is rejected with an error.
- [ ] Each of the 6 tools (`mk_search`, `mk_get`, `mk_timeline`, `mk_cite`, `mk_remember`, `mk_recent_activity`) returns the documented response shape from design §10 when invoked with valid arguments.

**Estimate**: L · **Status**: pending

---

## Layer 6 — Cron compression (OPTIONAL)

> Not required for v0.1.0 release. If deferred, T-030 (lazy compression fallback) covers the gap — daily/weekly rollups happen on SessionStart instead of cron.

### T-028 — Daily distill cron (`today-*.md` → `recent.md`)

**Scope**: Implement `scripts/run-daily-distill.sh` and the cron registration logic. Compresses the last 7 days of `today-*.md` into a fresh `sessions/recent.md`. Honors the 120 s Haiku cooldown.

**Implements**: FR-19; design §1.4 "Asynchronous (cron)", §8.1.

**Depends on**: T-020 (CompressorBackend), T-019.

**Done when**:

- [ ] The daily cron at 23:00 reads all `today-*.md` from the last 7 days and writes a fresh `recent.md` containing their compressed consolidation.
- [ ] Cron registration via `python scripts/register-crons.py` is idempotent (re-running adds no duplicate entries; verified on macOS/Linux launchd/cron and Windows Task Scheduler).
- [ ] When the Haiku 120 s cooldown is still in effect from a recent call, the cron defers and retries on the next fire.

**Estimate**: M · **Status**: pending

---

### T-029 — Weekly curate cron (`>7d today-*.md` → `archive.md` + recent.md rebuild)

**Scope**: Implement `scripts/run-weekly-curate.sh`. Moves `today-*.md` files older than 7 days into `archive.md` (appended). Rebuilds `recent.md` from the current week's files. Optionally merges similar bullets across days (uses T-009 mergeFacts).

**Implements**: FR-19, FR-21; design §1.4 "Asynchronous (cron)", §8.1.

**Depends on**: T-009, T-028.

**Done when**:

- [ ] The weekly cron at Sunday 09:00 moves all `today-*.md` >7 days old into `archive.md` (appended in chronological order) and deletes the originals.
- [ ] Bullets across rolled-up days with high similarity (>0.85) are merged via T-009 and recorded with correct `merged_from`.
- [ ] On completion, `recent.md` is rebuilt from the new week's `today-*.md` files.

**Estimate**: M · **Status**: pending

---

### T-030 — Lazy compression fallback (no-cron environments)

**Scope**: Implement the SessionStart-triggered lazy compression fallback from design §8.2.1. Detects missing/stale compression outputs via mtime checks; spawns a detached `cmk compress --lazy` subprocess that does the daily/weekly rollup work cron would have done.

**Implements**: FR-19; design §8.2.1.

**Depends on**: T-015, T-020. Independent of T-028/T-029 (it's the fallback path).

**Done when**:

- [ ] When SessionStart detects `today-{yesterday}.md` exists but `recent.md` is missing or >7 days stale, it spawns `cmk compress --lazy` detached and continues with snapshot assembly without blocking (NFR-1 500 ms budget preserved).
- [ ] `cmk compress --lazy` performs exactly the work T-028 (daily) or T-029 (weekly) would have, logging to `.locks/lazy-compress.log`.
- [ ] When cron is detected as registered (T-028/T-029 active), the lazy detector still registers but skips the work and logs `skipped: cron-active`.

**Estimate**: S · **Status**: pending

---

## Cross-cutting

### T-031 — `cmk doctor` health checks (HC-1 .. HC-8)

**Scope**: Implement the 8 health checks from design §14. Each check has a yes/no result and a documented self-repair path. HC-8 is the native Anthropic Auto Memory detector.

**Implements**: FR-22; design §14.

**Depends on**: T-003.

**Done when**:

- [ ] `cmk doctor` executes all 8 health checks and prints a structured report (pass/fail/skipped per check) within 5 s on a project with ≤10k observations (NFR-1).
- [ ] A failed check includes the documented self-repair command in the output (e.g., `cmk repair --hooks`).
- [ ] HC-8 inspects `~/.claude/projects/<slug>/memory/` and writes a status entry to `context/.locks/native-memory-status.log` regardless of whether Anthropic's auto-memory is active.
- [ ] Any health check that requires `pip install` or `npm install` prompts the user for explicit consent before invoking (NFR-9).

**Estimate**: M · **Status**: pending

---

### T-032 — `cmk import-anthropic-memory` bridge

**Scope**: Implement the explicit bridge command from design §11.2. Reads `~/.claude/projects/<slug>/memory/MEMORY.md`, computes canonical IDs via T-005, dedups against our existing `context/MEMORY.md`, proposes additions with `write_source: imported`, `trust: medium`.

**Implements**: FR-25 (or wherever import is specified); design §11.2.

**Depends on**: T-005, T-021.

**Done when**:

- [ ] `cmk import-anthropic-memory --dry-run` prints the proposed additions without modifying any file.
- [ ] `cmk import-anthropic-memory` (no dry-run) prompts the user to confirm each proposed addition (or accept-all/decline-all) before applying.
- [ ] A candidate whose canonical ID matches an existing observation in our MEMORY.md is skipped (dedup) and logged as `skipped: duplicate`.

**Estimate**: S · **Status**: pending

---

### T-033 — `cmk repair` idempotent self-repair + `cmk roll` manual roller

**Scope**: Implement two related CLI verbs. `cmk repair` and its subflags (`--hooks` re-registers hooks; `--locks` resets stale lock files; `--index` calls T-025's `--full`) — idempotent across all subflags. `cmk roll [--scope now|today|recent]` invokes the same compression internals as SessionEnd/cron but on user demand.

**Implements**: FR-19, FR-22; design §8, §14.

**Depends on**: T-014, T-024 (for `--index`), T-019/T-028 (for `roll`).

**Done when**:

- [ ] `cmk repair` invoked multiple times in a row produces identical end-state on each invocation (idempotency).
- [ ] `cmk repair --locks` removes only lock files older than 1 hour (live locks from running processes are preserved).
- [ ] Any repair sub-action that requires system-level install prompts the user before invoking (NFR-9).
- [ ] `cmk roll --scope today` invokes the daily-distill pipeline (T-028 internals) without waiting for the cron fire, and is idempotent if no work is pending.
- [ ] `cmk roll` with no `--scope` defaults to `now` (SessionEnd-equivalent: compress `now.md` → `today-{date}.md`).

**Estimate**: M · **Status**: pending

---

### T-034 — Cross-OS install CI matrix

**Scope**: Wire GitHub Actions to run `cmk install` + `cmk doctor` on Windows 10/11, macOS 14+, Ubuntu 22.04+ on every PR. Asserts byte-identical scaffolded state across OSes (per NFR-3) and that all required health checks pass.

**Implements**: NFR-3; design §13.

**Depends on**: T-003, T-031.

**Done when**:

- [ ] Every PR triggers the install + doctor matrix on all three OSes via GitHub Actions.
- [ ] The PR check fails if any OS produces different scaffolded directory contents (verified by checksum comparison).
- [ ] The PR check fails if any OS's `cmk doctor` reports a failed required check.

**Estimate**: M · **Status**: pending

---

### T-035 — Documentation: README + INSTALL guides + quickstart

**Scope**: Write the user-facing docs: top-level `README.md`, `INSTALL-{windows,macos,linux}.md` per design §13, and a `QUICKSTART.md` walking through `cmk install` → first memory write → `cmk doctor` → first session.

**Implements**: FR-22, FR-23, FR-24; design §13.

**Depends on**: T-003 .. T-031 (most user-facing surface exists).

**Done when**:

- [ ] A new user reading `QUICKSTART.md` can produce a working installation in under 5 minutes (manual test by 2+ users before release).
- [ ] Every documented command in QUICKSTART.md produces the documented output (verified by `scripts/test-quickstart.sh` running against the doc verbatim).
- [ ] Each `INSTALL-<os>.md` path completes successfully on its target OS without requiring any step not in the document.

**Estimate**: M · **Status**: pending

---

### T-036 — v0.1.0 release: version, CHANGELOG, npm publish, GitHub release

**Scope**: Bump `package.json` to `0.1.0`, write CHANGELOG entry summarizing all changes since v0.0.1, tag `v0.1.0`, publish `@claude-memory-kit/cli@0.1.0` to npm, publish GitHub Release with tag, attach release notes derived from CHANGELOG.

**Implements**: NFR-2 (releaseability); none of the design — pure operational.

**Depends on**: ALL prior tasks (T-001 .. T-035).

**Done when**:

- [ ] Pushing the v0.1.0 tag produces a GitHub Release with attached CHANGELOG-derived release notes.
- [ ] `npm install -g @claude-memory-kit/cli@0.1.0` on a fresh machine installs and registers `cmk` on PATH with no errors.
- [ ] `cmk version` after install prints exactly `0.1.0` (matching the git tag).

**Estimate**: S · **Status**: pending

---

## Summary

| Layer | Tasks | Est. effort (S/M/L) | Required? |
| --- | --- | --- | --- |
| Layer 1 — Foundation | 5 (T-001..T-005) | S + M + M + S + M = ~7 days | Yes |
| Layer 2 — Granular archive | 4 (T-006..T-009) | M + S + S + M = ~6 days | Yes |
| Layer 3 — Scratchpads | 4 (T-010..T-013) | M + S + S + S = ~5 days | Yes |
| Layer 4 — Hooks + skill + auto-extract | 10 (T-014..T-023) | S + M + S + S + M + M + L + L + M + M = ~22 days | Yes |
| Layer 5 — Search | 4 (T-024..T-027) | M + M + M + L = ~12 days | Optional |
| Layer 6 — Cron compression | 3 (T-028..T-030) | M + M + S = ~6 days | Optional |
| Cross-cutting | 6 (T-031..T-036) | M + S + M + M + M + S = ~11 days | Yes |

**Required-only total (Layers 1-4 + cross-cutting)**: ~51 working days for a single dev. Optional layers 5+6 add another ~18 days.

**Critical path** (must ship for v0.1.0 to be usable): T-001 → T-005 → T-006 → T-010 → T-011 → T-014 → T-015 → T-018 → T-020 → T-021 → T-023 → T-031 → T-036.

## What's deliberately not in tasks.md (for the audit trail)

- **MCP authentication token** (declined 2026-05-23 as overengineering for v0.1).
- **`@modelcontextprotocol/sdk` library name** named in T-027's implementation, not in design.md (per user decision).
- **§4.1 trust hierarchy** as a separate subsection (inline §4 default mapping suffices).
- **Companion skills beyond `memory-write` + `bootstrap`** (`make-plan`, `pathfinder`, `weekly-digests`, `learn-codebase`) — deferred to v0.3+ per ADR-roadmap.
- **`<ephemeral>` privacy tag** — v0.1.x patch candidate per design §16.7.
- **Plugin slots for external memory providers** (Honcho/Mem0/Hindsight) — v0.2 per ADR-0008 and user-locked Q1 answer (2026-05-22).
- **Web viewer rich UI** (search timeline, observation graph, edit-in-place) — v0.2 per design §16.4.
- **IDE adapters** (Cursor / Windsurf / Codex) — v0.2 per design §16.6.
- **Cross-project search (`cmk search --all-projects`)** — v0.2 per design §16.3; v0.1 interim is `~/.claude-memory-kit/LESSONS.md` + `cmk lessons promote`.

## End of tasks.md v0.1.0

Total: 36 tasks across 6 layers + cross-cutting. Required-only path: ~51 dev-days; full surface incl. optional: ~69 dev-days. Cross-references: requirements.md `FR-*` and design.md `§*` throughout.

Next per Kiro flow: per-task implementation begins. Each task should ship as a separate PR titled `T-NNN: <title>` against `main`, with the task's "Done when" checklist checked off in the PR description.
