# Tasks — claude-memory-kit v0.1.0

**Status**: Draft · **Author**: Claude (Opus 4.7) + Lior Hollander · **Date started**: 2026-05-23

This document specifies **WHAT to build, in what ORDER, with HOW-DONE criteria, and WHICH TESTS prove it**. It is the bridge between [`requirements.md`](requirements.md) (WHAT v0.1.0 must do), [`design.md`](design.md) (HOW v0.1.0 is built), and [`glossary.md`](glossary.md) (what each domain term means).

**Domain terms used below are defined in [`glossary.md`](glossary.md).** When a task uses a term like [[Tier]] or [[Citation ID]], look there for the canonical definition.

## How to read this file

Each task is a **PR-sized unit of work** (~1–3 days for a single developer). For each:

- **ID**: stable identifier `T-NNN`.
- **Scope**: one-paragraph what gets built.
- **Implements**: which FRs (requirements.md) and which §sections (design.md) it covers.
- **Depends on**: prior tasks that must be done first.
- **Done when**: a checklist of observable conditions that must all be true before the task can be marked done.
- **Tests (TDD)**: the test sub-task — **written first**, run by the agent, must be green before the task is done.
- **Estimate**: S (≤1 day) / M (1–3 days) / L (3–5 days).
- **Status**: `pending` / `in-progress` / `done`.

The day-to-day **user** runs `cmk install` once and then just chats with Claude — memory writes/reads happen automatically via the hooks. The "Done when" + "Tests" sections are for the **future implementer** (us, when we build).

## Engineering discipline (read once, apply throughout)

This v0.1.0 implementation follows three rules:

1. **Test-driven development**: Write the test first, let the agent implement, verify, repeat. Small cycles, high confidence. _Tests are run by the agent (Claude), not by a human._
2. **Boundary testing** (per Ousterhout, _A Philosophy of Software Design_): Test the public interface of each module, not its internal helpers. Test the contract that survives refactors, not the implementation that doesn't. See [[Boundary testing]] in glossary.
3. **Deep modules with simple interfaces**: When implementing, wrap related code into broad modules that expose narrow surfaces. Don't fragment cohesive logic across many small helpers — that creates shallow modules with verbose call sites.

**Checkpoint tasks** (between layers): the agent runs the full test suite and confirms zero failures before moving to the next layer.

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

Optional tasks ship if time permits; otherwise they roll forward into v0.1.x patches.

---

## Layer 1 — Foundation

### T-001 — Repo scaffolding + `template/` skeleton

**Scope**: Create the `template/` directory containing the canonical per-project file tree the installer copies into target projects. Includes empty `context/`, `context/memory/`, `context/sessions/`, `context/transcripts/`, `context/queues/`, `context/.index/.gitkeep`, plus seed files (CLAUDE.md block, README.md placeholders, `.gitignore` rules).

**Implements**: FR-1, FR-4, FR-5; design §1.1, §13.

**Depends on**: —

**Done when**:

- [ ] `template/` exists and contains the canonical 3-tier file tree.
- [ ] `scripts/validate-template.sh` passes — asserts required files exist and have non-empty content.

**Tests (TDD)**:

- [ ]* T-001.tests Write unit tests for `template/` scaffolding
  - Test every required file in `template/` exists (manifest-driven, fixture list).
  - Test every required file is non-empty (`size > 0`).
  - Test `scripts/validate-template.sh` exits 0 against the canonical `template/` tree.
  - Test `scripts/validate-template.sh` exits non-zero when a required file is deleted (simulated via tempdir copy + targeted deletion).
  - _Implements: FR-1, FR-4, FR-5; design §1.1, §13_

**Estimate**: S · **Status**: pending

---

### T-002 — `cmk` Node CLI scaffold

**Scope**: Create the `@claude-memory-kit/cli` npm package as a Node binary entry point with the subcommand table from design §12 wired as stubs (each prints "not yet implemented" and exits 0). Use `commander` or `cac` for arg parsing.

**Implements**: FR-22, FR-23; design §12.

**Depends on**: T-001.

**Done when**:

- [ ] `cmk --help` lists every subcommand in design §12 with a one-line description.
- [ ] Every subcommand stub exits 0 with a clear "not yet implemented" message.
- [ ] `npm install -g @claude-memory-kit/cli` registers `cmk` on PATH (macOS, Linux, Windows).

**Tests (TDD)**:

- [ ]* T-002.tests Write unit tests for `cmk` CLI scaffold
  - Test `cmk --help` output contains every subcommand listed in design §12 (parsed from help text vs. an expected manifest).
  - Test every subcommand stub exits 0 (snapshot the exit codes for `cmk search`, `cmk get`, etc.).
  - Test stub error message includes the literal "not yet implemented" string.
  - Test `npm install -g` smoke (CI-only): `cmk version` runs from a clean shell session after global install.
  - _Implements: FR-22, FR-23; design §12_

**Estimate**: M · **Status**: pending

---

### T-003 — `cmk install` cross-OS implementation

**Scope**: Implement the install path (Node-driven). Creates 3-tier directory structure, copies `template/*` into target, injects gitignore entries for `context.local/`, `context/.index/`, `context/.locks/`, and creates `~/.claude-memory-kit/` if missing. Never overwrites existing user files. Honors `MEMORY_KIT_USER_DIR` env var for the user-tier path.

**Implements**: FR-22, FR-23, FR-24; design §1.1, §13.

**Depends on**: T-001, T-002.

**Done when**:

- [ ] Running `cmk install` in a fresh directory creates the full project-tier scaffold and exits 0.
- [ ] Re-running leaves existing files unchanged; refreshes only kit-managed files; exits 0.
- [ ] `MEMORY_KIT_USER_DIR=/custom/path cmk install` uses the override path.
- [ ] Output is byte-identical across Windows 10/11, macOS 14+, Ubuntu 22.04+ (CI matrix in T-034).

**Tests (TDD)**:

- [ ]* T-003.tests Write unit tests for `cmk install`
  - Test install in fresh tempdir produces the expected file tree (compare to manifest).
  - Test re-install with a hand-edited `MEMORY.md` preserves the user's content (mtime + sha1 unchanged on user-edited files).
  - Test re-install refreshes kit-managed gitignore lines while preserving unrelated `.gitignore` entries.
  - Test `MEMORY_KIT_USER_DIR=/tmp/xxx cmk install` writes user-tier files to `/tmp/xxx/`, not to `~/.claude-memory-kit/`.
  - Test idempotency: two consecutive `cmk install` runs produce the same on-disk state.
  - _Implements: FR-22, FR-23, FR-24; design §1.1, §13_

**Estimate**: M · **Status**: pending

---

### T-004 — CLAUDE.md loader block with versioned delimiters

**Scope**: Implement the idempotent CLAUDE.md injection from design §13.1. Includes the `<!-- claude-memory-kit:start vX.Y.Z -->` / `:end` delimiters, in-place replacement on re-install, downgrade-guard, and `cmk uninstall` clean removal.

**Implements**: FR-22; design §13.1.

**Depends on**: T-003.

**Done when**:

- [ ] Installing against a CLAUDE.md without delimiters appends the versioned block at EOF; prior content unchanged.
- [ ] Re-installing against a same-or-older-version block replaces only the block contents.
- [ ] Installing against a newer-version block prints warning, no-op, exit 0 (unless `--force`).
- [ ] `cmk uninstall` strips the delimited block exactly; preserves everything else byte-for-byte.

**Tests (TDD)**:

- [ ]* T-004.tests Write unit tests for CLAUDE.md loader block
  - Test fresh install (no CLAUDE.md): file created with delimited block, nothing else.
  - Test install against CLAUDE.md with prior user content above the block: block appended at EOF; prior content byte-identical (diff = 0 outside block).
  - Test re-install with same version: block contents replaced, surrounding content unchanged.
  - Test re-install with older version in file: block contents upgraded; non-block content unchanged.
  - Test re-install with newer version in file (no `--force`): exit 0, file unchanged, warning to stderr.
  - Test `cmk uninstall`: block + delimiters removed; surrounding content byte-identical via `diff`.
  - _Implements: FR-22; design §13.1_

**Estimate**: S · **Status**: pending

---

### T-005 — `canonicalize()` + ID generation (Node + Python parity)

**Scope**: Implement [[Canonical text]] normalization (design §3.2) and `generateId()` (design §3.3) as a shared library in **both** Node (`@cmk/canonicalize` package) and Python (for cron + auto-extract scripts). Ship a shared test vector file (`fixtures/canonicalize-vectors.json`); both implementations run against it in CI.

**Implements**: FR-14; design §3.

**Depends on**: T-002.

**Done when**:

- [ ] Every string in `fixtures/canonicalize-vectors.json` produces byte-identical results in Node and Python.
- [ ] Same bullet text hashed twice on different machines produces the same 8-char base32 ID.
- [ ] Pre-existing `(P-XXXXXXXX)` backrefs in input are stripped before hashing.
- [ ] Base32 alphabet excludes ambiguous chars `0`, `O`, `1`, `l`, `I`, `8`.

**Tests (TDD)**:

- [ ]* T-005.tests Write unit tests for canonicalize + ID generation (Node + Python parity)
  - Build `fixtures/canonicalize-vectors.json` with ≥30 representative inputs covering: whitespace collapse, lowercase, backref strip, punctuation strip, HTML comment strip, non-ASCII passthrough.
  - Test each fixture produces the documented expected canonical form (both implementations).
  - Test Node and Python implementations produce byte-identical output on every fixture (parity matrix).
  - Test SHA-256 → base32 → first-8-chars produces the documented expected ID on every fixture.
  - Test adding a `(P-XXXXXXXX)` backref to canonical input produces the same ID as without backref (idempotency).
  - Test base32 alphabet check: encode 1000 random hashes, assert no output contains `0`, `O`, `1`, `l`, `I`, `8`.
  - _Implements: FR-14; design §3_

**Estimate**: M · **Status**: pending

---

- [ ] **Checkpoint 1 — Layer 1 (Foundation) complete**: Agent runs the full test suite for T-001..T-005; zero failures. `cmk install` works end-to-end on a fresh repo. Agent confirms green before starting Layer 2.

---

## Layer 2 — Granular archive

### T-006 — Per-fact file format + writer

**Scope**: Implement the YAML-frontmatter [[Fact file]] format (design §2.2). Includes `writeFact(tier, type, slug, body, provenance)` used by the [[Memory-write skill]] and `cmk` import paths. Validates required frontmatter fields, computes [[Citation ID]] via T-005, writes the markdown body.

**Implements**: FR-1, FR-29; design §2.2.

**Depends on**: T-005.

**Done when**:

- [ ] `writeFact(...)` with valid args creates `<tier_dir>/<type>_<slug>.md` with all 9 required frontmatter fields.
- [ ] `writeFact(...)` with any required field missing rejects with `error_category: "schema"` and creates no file.
- [ ] Duplicate canonical ID: second write is detected, logged, skipped (no overwrite, no error).

**Tests (TDD)**:

- [ ]* T-006.tests Write unit tests for `writeFact()` (boundary test — public interface only)
  - Test valid call creates file at expected path with all 9 frontmatter fields present.
  - Test each of the 9 required fields, when omitted, produces `error_category: "schema"` and no file.
  - Test ID is computed via `canonicalize()` + `generateId()` (mock the canonicalize call and assert it was invoked with the body).
  - Test second call with identical canonical body returns the same ID, does not create a second file, logs `skipped: duplicate`.
  - Test optional fields (`merged_from`, `superseded_by`, `private`) are written when supplied, absent when not.
  - _Implements: FR-1, FR-29; design §2.2_

**Estimate**: M · **Status**: pending

---

### T-007 — INDEX.md generation + maintenance

**Scope**: Implement `cmk reindex` (markdown-side; SQLite reindex is T-025). Walks `<tier>/memory/*.md`, reads frontmatter, regenerates [[INDEX]] in the documented format.

**Implements**: FR-1, FR-7; design §2.3.

**Depends on**: T-006.

**Done when**:

- [ ] `cmk reindex` produces INDEX.md with one line per non-tombstoned `.md` file in the documented format.
- [ ] Adding/removing/retitling a fact updates INDEX correctly on next reindex.
- [ ] INDEX.md > 25 KB produces a warning, but still writes.

**Tests (TDD)**:

- [ ]* T-007.tests Write unit tests for INDEX.md regeneration
  - Test reindex with 0 facts produces a header-only INDEX.md.
  - Test reindex with N facts produces exactly N body lines in the documented `- ({id}) [type] [title](filename.md) — <hook>` format.
  - Test adding a new fact + reindex: new line appears at the documented sort position.
  - Test removing a fact (file deleted) + reindex: line disappears.
  - Test retitling a fact (frontmatter `title:` changed) + reindex: line shows new title.
  - Test 26 KB INDEX scenario: warning emitted on stderr, file still written.
  - Test tombstoned facts (with `deleted_at`) are excluded from INDEX.
  - _Implements: FR-1, FR-7; design §2.3_

**Estimate**: S · **Status**: pending

---

### T-008 — Tombstone discipline

**Scope**: Implement the [[Tombstone]] flow from design §6.5: `cmk forget <id-or-query>` moves the matched [[Fact file]] to `<tier>/memory/archive/tombstones/<id>.md`, adds `deleted_at` + `deleted_reason` + `deleted_by`, removes matching [[Bullet]]s from scratchpads, marks SQLite row as `deleted_at` (when Layer 5 installed).

**Implements**: FR-29; design §6.5.

**Depends on**: T-006.

**Done when**:

- [ ] `cmk forget P-XXX` prompts for confirmation; on confirm, moves file to `archive/tombstones/<id>.md` with deletion frontmatter.
- [ ] Matching bullet (matched by ID) is removed from any scratchpad that contained it.
- [ ] `mk_get(tombstoned_id)` returns the tombstoned content with `deleted_on: <ISO>` annotation.

**Tests (TDD)**:

- [ ]* T-008.tests Write unit tests for tombstone flow
  - Test `cmk forget P-XXX --yes` (skip prompt for tests) moves file to `archive/tombstones/<id>.md`.
  - Test deletion frontmatter fields are present: `deleted_at` (valid ISO 8601), `deleted_reason` (string), `deleted_by` (one of `user-explicit` / `user-via-skill` / `audit`).
  - Test scratchpad bullet with matching ID is removed (the corresponding HTML comment provenance line removed too).
  - Test `mk_get(tombstoned_id)` returns body + `deleted_on:` annotation, NOT 404.
  - Test `cmk forget <nonexistent_id>` exits 2 with "ID not found".
  - _Implements: FR-29; design §6.5_

**Estimate**: S · **Status**: pending

---

### T-009 — Consolidation / merge semantics

**Scope**: Implement `mergeFacts(idA, idB) → newC` from design §3.4. Used by the weekly curator (T-029) and by manual `cmk merge`. Computes new ID, writes `merged_from: [A, B]` on C, moves A + B to `archive/superseded/` with `superseded_by: C` added.

**Implements**: FR-14; design §3.4.

**Depends on**: T-006, T-008.

**Done when**:

- [ ] Merging two [[Fact file]]s produces a new file with ID = `generateId(tier, canonicalize(merged_body))` and `merged_from: [idA, idB]`.
- [ ] Originals are moved to `<tier>/memory/archive/superseded/` with `superseded_by: <newC.id>` added.
- [ ] `mk_get(idA)` post-merge returns A's content + `merged_into: <newC.id>` annotation.

**Tests (TDD)**:

- [ ]* T-009.tests Write unit tests for merge semantics
  - Test merging A + B with combined body "X. Y." produces C with id = generateId(canonical("x. y.")).
  - Test C's frontmatter contains `merged_from: [idA, idB]` (order preserved).
  - Test A.md is moved to `archive/superseded/` with `superseded_by: <C.id>` added; same for B.
  - Test `mk_get(idA)` returns A's body + `merged_into: <C.id>` annotation.
  - Test merging three-way: `mergeFacts(mergeFacts(A, B), C)` produces final ID = `generateId(canonical(combined_body))` and traces merged_from correctly.
  - _Implements: FR-14; design §3.4_

**Estimate**: M · **Status**: pending

---

- [ ] **Checkpoint 2 — Layer 2 (Granular archive) complete**: Agent runs T-001..T-009 test suite; zero failures. Round-trip works: write fact → reindex → query INDEX → forget → confirm tombstone. Agent confirms green before starting Layer 3.

---

## Layer 3 — Scratchpads

### T-010 — Bounded [[Scratchpad]] writer + cap enforcement

**Scope**: Implement the cap-enforcement workflow from design §2.1. Counts bytes via `wc -c`; >95% of cap triggers [[Consolidation]] (merge similar bullets, drop entries >14 days old with no current reference) before applying the new write. Caps read from `<repo>/context/settings.json` (project) and `~/.claude-memory-kit/settings.json` (user); hardcoded defaults as fallback.

**Implements**: FR-3; design §2.1.

**Depends on**: T-005.

**Done when**:

- [ ] A write that would exceed cap triggers consolidation first, then writes.
- [ ] Consolidation preserves bullets <14 days OR with `trust: high` regardless of age.
- [ ] Post-consolidation still-over-cap write is rejected with `error_category: "cap_exceeded"` (no silent truncation).
- [ ] `settings.json` overrides take effect.

**Tests (TDD)**:

- [ ]* T-010.tests Write unit tests for scratchpad writer + cap enforcement
  - Test write to file at 50% of cap: write succeeds; no consolidation invoked (mock consolidator and assert not-called).
  - Test write that would push to 96% of cap: consolidator invoked before write.
  - Test consolidation: bullets <14 days kept; bullets >14 days without `trust: high` dropped; bullets >14 days with `trust: high` kept.
  - Test write that would still exceed cap after consolidation: rejected with `error_category: "cap_exceeded"`, file unchanged.
  - Test `settings.json` override (`MEMORY.md.max_chars: 4000`) is read and enforced (write at 4001 bytes rejected even if default is higher).
  - _Implements: FR-3; design §2.1_

**Estimate**: M · **Status**: pending

---

### T-011 — [[Provenance frontmatter]] writer (HTML-comment form)

**Scope**: Implement the inline HTML-comment provenance line emitted directly below each [[Bullet]] (design §4). Writer takes a bullet + 7 required fields; produces the `<!-- source:..., sha1:..., write:..., trust:..., at:... -->` line. Consumer parser also lives here for read-back.

**Implements**: FR-29; design §4.

**Depends on**: T-005, T-010.

**Done when**:

- [ ] `writeBullet(...)` emits bullet text + provenance HTML comment.
- [ ] Missing required field rejects with `error_category: "schema"`.
- [ ] SessionStart hook reads scratchpads and parses provenance HTML comment back into structured form.

**Tests (TDD)**:

- [ ]* T-011.tests Write unit tests for provenance frontmatter (write + parse)
  - Test `writeBullet({text, provenance: {7 fields}})` produces two-line output: bullet, then HTML comment with 7 fields.
  - Test each of the 7 required fields, when omitted: write rejected with `error_category: "schema"`.
  - Test reader parses the HTML comment back into a struct with all 7 fields populated.
  - Test reader skips lines not matching the provenance comment shape (graceful on freeform markdown).
  - Test round-trip: write → read → write again produces byte-identical output.
  - _Implements: FR-29; design §4_

**Estimate**: S · **Status**: pending

---

### T-012 — Seed scratchpad templates (USER/SOUL/MEMORY/HABITS/LESSONS)

**Scope**: Create seed template files copied by `cmk install` (project tier) and `cmk init-user-tier` (user tier). Each has the header comment with cap+last-distilled, three fixed sections, and a one-line placeholder.

**Implements**: FR-3; design §2.1.

**Depends on**: T-010, T-011.

**Done when**:

- [ ] After `cmk install`: `context/SOUL.md`, `context/MEMORY.md`, `context.local/{machine-paths,overrides}.md` populated from seeds.
- [ ] After `cmk init-user-tier`: `~/.claude-memory-kit/{USER,HABITS,LESSONS}.md` + `fragments/INDEX.md` populated. (Honors `$MEMORY_KIT_USER_DIR`.)
- [ ] Every seed has the header comment + three fixed section headings.

**Tests (TDD)**:

- [ ]* T-012.tests Write unit tests for seed templates
  - Test `cmk install` produces every required project-tier file (manifest list).
  - Test `cmk init-user-tier` with `MEMORY_KIT_USER_DIR=/tmp/xxx` produces user-tier files at `/tmp/xxx/`, not `~/.claude-memory-kit/`.
  - Test each seed file's first 100 chars contain the header comment markers (`Cap:`, `Last distilled:`, `Last health check:`).
  - Test each seed file contains its three documented section headings (e.g., MEMORY.md has `## Active Threads`, `## Environment Notes`, `## Pending Decisions`).
  - _Implements: FR-3; design §2.1_

**Estimate**: S · **Status**: pending

---

### T-013 — `cmk trust <id> <level>` override

**Scope**: Manual [[Trust]] override CLI. Resolves the ID (scratchpad bullet OR fact file), updates the `trust:` field, logs the change to `audit.log`.

**Implements**: FR-29; design §4, §6.2.

**Depends on**: T-006, T-010, T-011.

**Done when**:

- [ ] `cmk trust P-XXX high` updates the `trust:` field and appends an `audit.log` entry with prior value, new value, timestamp.
- [ ] Unresolvable ID exits 2 with "ID not found".
- [ ] Invalid level exits 2 with validation error.

**Tests (TDD)**:

- [ ]* T-013.tests Write unit tests for `cmk trust`
  - Test `cmk trust <existing_id> high` updates the frontmatter field and writes one audit.log line with `{ts, actor, action: "trust_change", id, prior_trust, new_trust}`.
  - Test trust change for a scratchpad bullet (HTML comment provenance) updates the comment.
  - Test trust change for a fact file (YAML frontmatter) updates the YAML.
  - Test `cmk trust <nonexistent_id> high` exits 2 with "ID not found" stderr.
  - Test `cmk trust <id> bogus_level` exits 2 with validation error stderr.
  - _Implements: FR-29; design §4, §6.2_

**Estimate**: S · **Status**: pending

---

- [ ] **Checkpoint 3 — Layer 3 (Scratchpads) complete**: Agent runs T-001..T-013 test suite; zero failures. End-to-end: install → write scratchpad bullet → consolidate at cap → override trust → audit log records all events. Agent confirms green before starting Layer 4.

---

## Layer 4 — Hooks + skill + auto-extract

### T-014 — `hooks.json` + 6-hook scaffold

**Scope**: Ship `plugin/.claude-plugin/hooks/hooks.json` from design §5.1 plus `bin/cmk-<verb>` script stubs (each prints "not yet implemented" and exits 0 with valid hook output JSON). Enables registration without runtime behavior; unblocks T-015..T-019.

**Implements**: FR-9; design §5.1.

**Depends on**: T-003.

**Done when**:

- [ ] Installing as a Claude Code plugin and starting a session registers all 6 hooks (no parse errors).
- [ ] Each `cmk-<verb>` stub exits 0 and emits valid `{"continue": true}` JSON.

**Tests (TDD)**:

- [ ]* T-014.tests Write unit tests for hooks.json + stub handlers
  - Test `hooks.json` parses as valid JSON.
  - Test all 6 hook events are registered (`Setup`, `SessionStart`, `UserPromptSubmit`, `PostToolUse`, `Stop`, `SessionEnd`).
  - Test PostToolUse has matcher `"Write|Edit|MultiEdit"`.
  - Test each `cmk-<verb>` stub script exists, is executable, exits 0 when invoked with a dummy stdin payload.
  - Test each stub's stdout parses as valid JSON containing `"continue": true`.
  - _Implements: FR-9; design §5.1_

**Estimate**: S · **Status**: pending

---

### T-015 — `cmk-inject-context` ([[SessionStart hook]])

**Scope**: Implement SessionStart from design §1.4 + §5.2 + §7.1. Resolves 3-tier paths, reads files in priority order, concatenates into ≤10 KB [[Frozen snapshot]], emits as [[additionalContext]] JSON. Excludes facts with `private: true`.

**Implements**: FR-7, FR-9; design §1.4, §5.2, §7.1.

**Depends on**: T-014, T-012.

**Done when**:

- [ ] Hook assembles [[Context_Payload]] from 3 tiers and emits valid additionalContext JSON within 500 ms.
- [ ] Duplicate IDs across tiers: most-specific wins; shadowed copies → `shadowed_by.log`.
- [ ] Snapshot >10 KB triggers priority-ordered truncation + logs the event.
- [ ] Facts with `private: true` never appear in the emitted additionalContext.

**Tests (TDD)**:

- [ ]* T-015.tests Write unit tests for SessionStart hook
  - Test on a fixture project (with all 3 tiers seeded), hook output is valid JSON with `hookSpecificOutput.hookEventName: "SessionStart"` and an `additionalContext` field.
  - Test the assembled snapshot is ≤10 KB on the fixture.
  - Test hook completes within 500 ms (timer assertion).
  - Test duplicate ID `P-XXX` present in both project and user tier: emitted snapshot contains the project version; `shadowed_by.log` has a new line with the user-tier shadowing.
  - Test snapshot > 10 KB scenario (oversized fixture): output is truncated, lowest-tier-oldest dropped first, truncation event logged to `.locks/truncation.log`.
  - Test fact file with `private: true` containing sentinel string `__PRIVATE_FACT_SENTINEL__`: that string does NOT appear in the emitted additionalContext (grep).
  - _Implements: FR-7, FR-9; design §1.4, §5.2, §7.1_

**Estimate**: M · **Status**: pending

---

### T-016 — `cmk-capture-prompt` (UserPromptSubmit hook)

**Scope**: Implement UserPromptSubmit. Strips `<private>...</private>` (replaces with `[private content redacted]`), preserves `<retain>` tags for the Stop-hook downstream, appends cleaned prompt to `context/transcripts/{YYYY-MM-DD}.md`.

**Implements**: FR-15; design §5.2, §6.6.

**Depends on**: T-014.

**Done when**:

- [ ] `<private>secret</private>` → `[private content redacted]`; "secret" never on disk.
- [ ] `<retain>note</retain>` preserves tag boundaries in the transcript.
- [ ] Hook returns within 100 ms.

**Tests (TDD)**:

- [ ]* T-016.tests Write unit tests for UserPromptSubmit hook
  - Test prompt containing `<private>SENTINEL_STRING</private>`: transcript file contains `[private content redacted]`; grep for SENTINEL_STRING across all files in `context/` returns 0 hits.
  - Test prompt containing `<retain>important</retain>`: transcript preserves the `<retain>` tags verbatim for downstream Stop hook to find.
  - Test prompt with no privacy tags: transcript contains the prompt verbatim with timestamp + role marker.
  - Test hook returns within 100 ms (timer assertion).
  - Test invalid stdin (malformed JSON): hook exits 0 with `{"continue": true}` and logs error to stderr.
  - _Implements: FR-15; design §5.2, §6.6_

**Estimate**: S · **Status**: pending

---

### T-017 — `cmk-observe-edit` (PostToolUse hook on Write|Edit|MultiEdit)

**Scope**: Implement PostToolUse handler. Triggers only on `Write`, `Edit`, `MultiEdit` matchers. If tool output >50 lines, appends a one-line summary to `sessions/now.md`. Runs detached.

**Implements**: FR-9; design §5.2 (PostToolUse row), §1.4 "During each turn".

**Depends on**: T-014.

**Done when**:

- [ ] Write/Edit/MultiEdit with >50 lines triggers `now.md` append within 120 s timeout.
- [ ] Other tools do NOT trigger (matcher blocks before invocation).
- [ ] Hook spawns detached and returns within 50 ms.

**Tests (TDD)**:

- [ ]* T-017.tests Write unit tests for PostToolUse hook
  - Test invocation with 51-line Write output: `sessions/now.md` gets one summary line appended.
  - Test invocation with 49-line Write output: `now.md` unchanged (below threshold).
  - Test invocation with `tool_name: "Read"` (not in matcher): matcher blocks at hooks.json level; handler is not invoked (verified by integration test with stub handler that crashes-on-invocation).
  - Test handler spawns the append work detached and returns `{"continue": true}` within 50 ms (timer assertion).
  - Test parent termination: kill the parent shell mid-append; assert the summary line still lands in `now.md` (mtime watch).
  - _Implements: FR-9; design §5.2, §1.4_

**Estimate**: S · **Status**: pending

---

### T-018 — `cmk-capture-turn` ([[Stop hook]] + [[stop_hook_active guard]] + spawn auto-extract)

**Scope**: Implement Stop hook. Includes the [[stop_hook_active guard]] (design §5.2.1). Appends turn to `transcripts/{date}.md` (stripping `<private>`, force-keeping `<retain>`). Spawns the detached [[Auto-extract subagent]] via platform-appropriate detach method.

**Implements**: FR-9, FR-10, FR-15; design §5.2, §5.2.1, §6.6.

**Depends on**: T-014, T-016.

**Done when**:

- [ ] Stop payload with `stop_hook_active: true` exits immediately, no subagent spawn.
- [ ] Stop with `stop_hook_active: false` (or absent) appends transcript + spawns subagent within 50 ms.
- [ ] Parent termination: subagent continues to completion.

**Tests (TDD)**:

- [ ]* T-018.tests Write unit tests for Stop hook + guard + spawn
  - Test stdin payload with `stop_hook_active: true`: hook exits 0 with `{"continue": true}`, lock file at `.locks/auto-extract.lock` is NOT created (proves no spawn).
  - Test stdin with `stop_hook_active: false`: lock file created, transcript appended.
  - Test stdin with `stop_hook_active` absent: same as false (default behavior).
  - Test hook returns within 50 ms (timer assertion) even when the spawned subagent is slow.
  - Test transcript captures `<retain>important</retain>` content verbatim; `<private>secret</private>` replaced with `[private content redacted]`.
  - Test parent kill: spawn a stub subagent that writes to a sentinel file after 2 s; kill parent shell at 100 ms; assert sentinel file appears after 2 s anyway (detach proof).
  - _Implements: FR-9, FR-10, FR-15; design §5.2, §5.2.1, §6.6_

**Estimate**: M · **Status**: pending

---

### T-019 — `cmk-compress-session` (SessionEnd hook)

**Scope**: Implement SessionEnd. Invokes [[CompressorBackend]] (Haiku, T-020) on `sessions/now.md` → produces `today-{YYYY-MM-DD}.md`. Truncates `now.md` on success. Logs to `compress.log`.

**Implements**: FR-19, FR-20; design §1.4 "At session end", §8.1, §8.3.

**Depends on**: T-014, T-020.

**Done when**:

- [ ] Non-empty `now.md` → compressed to `today-{date}.md` (creating or appending if same-day file exists).
- [ ] On success, `now.md` truncated to 0 bytes.
- [ ] On failure (network/timeout), `now.md` untouched; error logged; exit 0.
- [ ] 120 s cooldown active → skip + log.

**Tests (TDD)**:

- [ ]* T-019.tests Write unit tests for SessionEnd compression
  - Test non-empty `now.md` invokes the CompressorBackend (mock backend); output written to `today-{date}.md`.
  - Test empty `now.md`: backend NOT invoked; hook exits 0.
  - Test existing same-day `today-{date}.md`: new compression appended (not overwriting).
  - Test successful compression: `now.md` truncated to 0 bytes.
  - Test backend throws error: `now.md` untouched; error logged to `compress.log` with category; exit 0.
  - Test 120 s cooldown active (last-haiku-call.ts mtime within window): backend NOT invoked; `skipped: cooldown` logged.
  - _Implements: FR-19, FR-20; design §1.4, §8.1, §8.3_

**Estimate**: M · **Status**: pending

---

### T-020 — [[Auto-extract subagent]] + CompressorBackend Haiku impl

**Scope**: Implement the detached auto-extract subprocess script (design §6.1) plus `HaikuViaAnthropicApi` CompressorBackend (§8.3). Calls `claude --print --model haiku-4.5 --allowed-tools "Read" --strict-mcp-config --max-turns 1`. Routes results through [[Memory-write skill]] or [[Review queue]] per design §6.2.

**Implements**: FR-10, FR-12, FR-13; design §6.1, §6.2, §8.3.

**Depends on**: T-005, T-006, T-010, T-011.

**Done when**:

- [ ] ≥1 durable-fact candidate routes by [[Trust]]: high → memory-write canonical; medium → review.md; low → discard + log.
- [ ] Lock file present → subagent exits without spawn.
- [ ] One NDJSON line written to `sessions/{date}.extract.log` per invocation.
- [ ] `claude --print` non-zero → `success: false` logged + exit 0.

**Tests (TDD)**:

- [ ]* T-020.tests Write unit tests for auto-extract + Haiku backend
  - Test with mocked Haiku returning 1 high-trust candidate: candidate is written to canonical MEMORY.md via memory-write skill.
  - Test with mocked Haiku returning 1 medium-trust candidate: candidate appears in `queues/review.md`; canonical MEMORY.md unchanged.
  - Test with mocked Haiku returning 1 low-trust candidate: candidate is discarded; extract.log has `skipped: nothing_durable`.
  - Test lock file at `.locks/auto-extract.lock` exists: second invocation exits 0 with `error_category: "concurrent_run"` and no spawn.
  - Test mocked Haiku non-zero exit: extract.log line has `success: false`, `error_category` populated; hook exits 0.
  - Test NDJSON line format matches design §6.1 schema (ts, success, error_category, observation_count, skipped_reason, duration_ms).
  - _Implements: FR-10, FR-12, FR-13; design §6.1, §6.2, §8.3_

**Estimate**: L · **Status**: pending

---

### T-021 — [[Memory-write skill]] (add / replace / remove) + [[Poison_Guard]]

**Scope**: Implement the auto-triggered memory-write skill from design §6.3. Three actions (`add`/`replace`/`remove`), each gated through Poison_Guard regex (§6.7) before any write reaches disk. Auto-triggers on [[Trigger phrase]]s per FR-11.

**Implements**: FR-10, FR-11, FR-29; design §6.3, §6.5 (remove → tombstone), §6.7.

**Depends on**: T-006, T-008, T-010, T-011.

**Done when**:

- [ ] Trigger phrases auto-invoke skill with inferred action.
- [ ] `add` matching any Poison_Guard pattern: reject with `error_category: "poison_guard"` + redacted log + user-visible message.
- [ ] `remove` runs tombstone flow + requires confirmation.
- [ ] `replace` finds substring match, computes new ID, marks old `superseded_by`.

**Tests (TDD)**:

- [ ]* T-021.tests Write unit tests for memory-write skill + Poison_Guard
  - Test each [[Trigger phrase]] in design §6.3 invokes the skill with the documented action.
  - Test `add` with each Poison_Guard pattern from design §6.7 (sample secrets + sample injection phrases): rejected with `error_category: "poison_guard"`; `.locks/poison-guard.log` has new line with redacted excerpt (matched text replaced with `***`).
  - Test `add` with clean text: write succeeds; bullet appears in MEMORY.md with provenance.
  - Test `remove` flow: matches existing bullet; prompts (mock auto-yes); invokes T-008 tombstone path.
  - Test `replace` flow: substring match → new ID computed → old observation gets `superseded_by` field → both old + new appear in archive.
  - Test user-visible rejection message identifies which pattern category matched (e.g., "secret") without echoing the matched text.
  - _Implements: FR-10, FR-11, FR-29; design §6.3, §6.5, §6.7_

**Estimate**: L · **Status**: pending

---

### T-022 — [[Conflict queue]] + `cmk queue conflicts` resolver

**Scope**: Implement conflict detection + queuing from design §6.8. On every memory-write `add`, run similarity check vs. existing observations on the same heading_path; if similarity > 0.85 AND content differs AND new.trust < existing.trust → route to `queues/conflicts.md`. `cmk queue conflicts` walks pending; accepts `keep-old` / `keep-new` / `merge-both`.

**Implements**: FR-10, FR-29; design §6.8.

**Depends on**: T-021. Optional dep: T-024 (FTS5); fallback is substring match.

**Done when**:

- [ ] Conflicting add (per §6.8) appends pending entry to `conflicts.md`; canonical unchanged.
- [ ] Layer 5 not installed: substring-match fallback; logs `similarity_backend: "substring"`.
- [ ] `cmk queue conflicts` shows pending; accepts keep-old/keep-new/merge-both/skip; applies atomically.
- [ ] `merge-both` invokes T-009 merge.

**Tests (TDD)**:

- [ ]* T-022.tests Write unit tests for conflict queue
  - Test add with similarity > 0.85 + content differs + new.trust < existing.trust: routed to `queues/conflicts.md`; canonical unchanged.
  - Test add with similarity > 0.85 + new.trust >= existing.trust: canonical updated; existing marked `superseded_by`.
  - Test add with similarity < 0.85: no conflict detected; routed to canonical normally.
  - Test fallback path: Layer 5 not installed → substring-match used; `audit.log` records `similarity_backend: "substring"`.
  - Test `cmk queue conflicts` displays pending in chronological order; accepts `keep-old` / `keep-new` / `merge-both` / `skip`.
  - Test `merge-both` invokes T-009 merge and produces a single canonical observation citing both originals.
  - _Implements: FR-10, FR-29; design §6.8_

**Estimate**: M · **Status**: pending

---

### T-023 — [[Review queue]] + `cmk queue review` resolver

**Scope**: Implement medium-[[Trust]] review queue from design §6.2. Auto-extract routes medium-trust candidates to `queues/review.md`. `cmk queue review` walks pending; accepts `promote` (→ canonical) / `discard` / `skip`.

**Implements**: FR-10, FR-29; design §6.2.

**Depends on**: T-020, T-021.

**Done when**:

- [ ] Medium-trust candidate from auto-extract appends to `review.md` with full provenance; canonical untouched.
- [ ] `cmk queue review` shows pending; accepts promote/discard/skip.
- [ ] `promote` invokes memory-write add (trust: high) + removes from review.md.
- [ ] `discard` removes from review.md + logs to audit.log.

**Tests (TDD)**:

- [ ]* T-023.tests Write unit tests for review queue
  - Test medium-trust auto-extract output: candidate appears in `queues/review.md` with provenance; canonical MEMORY.md unchanged.
  - Test `cmk queue review` walks pending entries one-at-a-time.
  - Test `promote` action: candidate written to canonical MEMORY.md with `trust: high`; removed from review.md.
  - Test `discard` action: candidate removed from review.md; `audit.log` has `action: "review_discard"` line.
  - Test `skip` action: candidate remains in review.md; no audit log entry.
  - _Implements: FR-10, FR-29; design §6.2_

**Estimate**: M · **Status**: pending

---

- [ ] **Checkpoint 4 — Layer 4 (Hooks + auto-extract + skill) complete**: Agent runs T-001..T-023 test suite; zero failures. End-to-end: session starts → hook injects snapshot → user prompts → trigger phrase auto-invokes memory-write → Poison_Guard catches a fake API key → review queue surfaces medium-trust auto-extract → conflict detected and routed. Agent confirms green before starting Layer 5 (or skipping to cross-cutting if Layer 5 deferred).

---

## Layer 5 — Search (OPTIONAL)

> Not required for v0.1.0 release. If deferred, T-022 falls back to substring-match for conflict detection and `cmk search` is unavailable (users use `grep` / `rg`).

### T-024 — SQLite + FTS5 schema + WAL configuration

**Scope**: Ship the SQLite schema from design §9.1 (observations table + FTS5 virtual table + sync triggers + files checkpoint table). Configures WAL mode + synchronous=NORMAL.

**Implements**: FR-16; design §9.1.

**Depends on**: T-002.

**Done when**:

- [ ] `cmk reindex --boot` on a fresh project creates `context/.index/memory.db` with all tables, indexes, FTS5 virtual table, and sync triggers from §9.1.
- [ ] Database created with `journal_mode = WAL`, `synchronous = NORMAL` (PRAGMA-verified).
- [ ] Observation inserts/updates/deletes maintain FTS5 mirror via triggers automatically.

**Tests (TDD)**:

- [ ]* T-024.tests Write unit tests for SQLite schema
  - Test `cmk reindex --boot` creates `memory.db` with all documented tables and indexes (introspect via `sqlite_master`).
  - Test FTS5 virtual table exists with the documented columns.
  - Test PRAGMA `journal_mode` returns `wal`; `synchronous` returns `NORMAL`.
  - Test insert into `observations`: FTS5 mirror row created via trigger.
  - Test update on `observations.body`: FTS5 mirror updated via trigger.
  - Test delete from `observations`: FTS5 mirror row deleted via trigger.
  - _Implements: FR-16; design §9.1_

**Estimate**: M · **Status**: pending

---

### T-025 — Reindex strategy (boot / runtime / recovery)

**Scope**: Implement the three reindex modes from design §9.2. `cmk reindex --boot` walks markdown + diffs mtime/sha1 vs `files` table; `cmk reindex --full` drops the DB and rebuilds; runtime mode uses `chokidar` with 500 ms debounce.

**Implements**: FR-16; design §9.2.

**Depends on**: T-024.

**Done when**:

- [ ] `cmk reindex --boot` with no markdown changes re-indexes 0 files in <200 ms.
- [ ] Runtime watcher reindexes within 1 s of file edit.
- [ ] `cmk reindex --full` drops + recreates DB; row count matches markdown observation count.

**Tests (TDD)**:

- [ ]* T-025.tests Write unit tests for reindex strategy
  - Test `--boot` with no changes: 0 files re-indexed; timer assertion <200 ms.
  - Test `--boot` after editing one fact file: only that file re-indexed (verified via files table mtime check).
  - Test runtime watcher: touch a file; assert FTS5 reflects the change within 1 s.
  - Test `--full`: drops DB, walks all markdown, observation row count == markdown fact count.
  - Test concurrent writers (one process running `--boot`, another running runtime watcher): no errors, no duplicate rows.
  - _Implements: FR-16; design §9.2_

**Estimate**: M · **Status**: pending

---

### T-026 — `cmk search` hybrid CLI

**Scope**: Implement `cmk search` from design §9.3. Flags: `--mode keyword|semantic|hybrid`, `--min-trust`, `--tier`, `--since`, `--limit`, `--include-tombstoned`. Keyword always available (FTS5 BM25). Semantic gated on memsearch+Milvus install (HC-7).

**Implements**: FR-16, FR-17, FR-18, FR-30; design §9.3.

**Depends on**: T-024, T-025.

**Done when**:

- [ ] Keyword mode on 10k observations returns ranked results <100 ms.
- [ ] `--mode semantic` without Layer 5b: clear error, exit 2 (no silent fallback).
- [ ] `--mode hybrid` with both backends: reciprocal-rank fusion (0.5/0.5).
- [ ] No `--include-tombstoned`: excludes deleted_at != null.

**Tests (TDD)**:

- [ ]* T-026.tests Write unit tests for `cmk search`
  - Test keyword mode on a 10k-observation fixture: query returns results in <100 ms.
  - Test `--mode semantic` without Layer 5b installed: exit code 2, stderr contains "memsearch not installed".
  - Test `--mode hybrid` with both backends mocked: results merged via reciprocal-rank fusion (0.5/0.5 weights).
  - Test `--min-trust medium` excludes low-trust results.
  - Test `--tier P` excludes user/local results.
  - Test `--since 2026-05-01` excludes older observations.
  - Test tombstoned observations excluded by default; included with `--include-tombstoned`.
  - _Implements: FR-16, FR-17, FR-18, FR-30; design §9.3_

**Estimate**: M · **Status**: pending

---

### T-027 — [[MCP server]] with 6 tools (stdio transport)

**Scope**: Implement the MCP server from design §10. Stdio transport per MCP spec (no port, no host). Six tools: `mk_search`, `mk_get`, `mk_timeline`, `mk_cite`, `mk_remember`, `mk_recent_activity`. Path-traversal validation on every read/write. Built on `@modelcontextprotocol/sdk` Node library.

**Implements**: FR-26, NFR-6; design §10.

**Depends on**: T-024, T-025, T-026.

**Done when**:

- [ ] `cmk mcp serve` reads JSON-RPC from stdin, writes responses to stdout (newline-delimited, no embedded newlines).
- [ ] stdout contains ONLY MCP JSON-RPC; all logs go to stderr.
- [ ] Path traversal (`..`, `%2e%2e`, prefixes outside expected dirs) rejected.
- [ ] All 6 tools return documented response shape.

**Tests (TDD)**:

- [ ]* T-027.tests Write unit tests for MCP server (stdio transport, 6 tools)
  - Test `cmk mcp serve` reads a valid JSON-RPC `initialize` request from stdin and responds with a valid `InitializeResult` on stdout.
  - Test stdout-purity: send 10 requests; assert stdout contains exactly 10 JSON-RPC lines, no other content (logging diverted to stderr).
  - Test newline-delimited: assert no embedded newlines in any single response (split-on-newline yields valid JSON per line).
  - Test path traversal: `mk_get` arg containing `..`, `%2e%2e`, or `/etc/passwd` → response is JSON-RPC error with `code: -32602`.
  - Test each of the 6 tools (`mk_search`, `mk_get`, `mk_timeline`, `mk_cite`, `mk_remember`, `mk_recent_activity`) returns the documented response shape on a valid input.
  - Test malformed JSON-RPC input → JSON-RPC parse error response (`code: -32700`), server keeps running.
  - _Implements: FR-26, NFR-6; design §10_

**Estimate**: L · **Status**: pending

---

- [ ] **Checkpoint 5 — Layer 5 (Search) complete** _(skip if Layer 5 deferred)_: Agent runs T-024..T-027 tests; zero failures. End-to-end: index built → `cmk search` returns ranked hits → MCP server handles all 6 tools via stdio. Agent confirms green before starting Layer 6 (or skipping to cross-cutting).

---

## Layer 6 — Cron compression (OPTIONAL)

> Not required for v0.1.0 release. If deferred, T-030 (lazy compression fallback) covers the gap.

### T-028 — Daily distill cron (`today-*.md` → `recent.md`)

**Scope**: Implement `scripts/run-daily-distill.sh` and cron registration. Compresses last 7 days of `today-*.md` into a fresh `sessions/recent.md`. Honors 120 s Haiku cooldown.

**Implements**: FR-19; design §1.4 "Asynchronous (cron)", §8.1.

**Depends on**: T-020, T-019.

**Done when**:

- [ ] Daily cron at 23:00: reads last 7 days of `today-*.md`, writes compressed `recent.md`.
- [ ] `register-crons.py` is idempotent across launchd/cron/Task Scheduler.
- [ ] Cooldown active: defer + retry next fire.

**Tests (TDD)**:

- [ ]* T-028.tests Write unit tests for daily distill cron
  - Test on fixture: 7 days of `today-*.md` exist → script produces a single `recent.md` containing compressed consolidation.
  - Test `register-crons.py` idempotency: run twice, assert no duplicate entries in the host scheduler (cron / launchd / Task Scheduler — platform-specific test).
  - Test cooldown active: script exits with `skipped: cooldown` and writes no output.
  - Test 0 `today-*.md` files: script exits 0 cleanly with `recent.md` unchanged.
  - _Implements: FR-19; design §1.4, §8.1_

**Estimate**: M · **Status**: pending

---

### T-029 — Weekly curate cron (`>7d today-*.md` → `archive.md` + recent.md rebuild)

**Scope**: Implement `scripts/run-weekly-curate.sh`. Moves `today-*.md` files >7 days into `archive.md` (appended). Rebuilds `recent.md` from current week's files. Merges similar bullets across days via T-009.

**Implements**: FR-19, FR-21; design §1.4 "Asynchronous (cron)", §8.1.

**Depends on**: T-009, T-028.

**Done when**:

- [ ] Sunday 09:00: `today-*.md` >7d moved to `archive.md` chronologically; originals deleted.
- [ ] High-similarity bullets across days merged via T-009 (`merged_from` correct).
- [ ] `recent.md` rebuilt from current week.

**Tests (TDD)**:

- [ ]* T-029.tests Write unit tests for weekly curate cron
  - Test fixture: 14 days of `today-*.md` files. Run script. Assert first 7 days moved to `archive.md` in chronological order; original files deleted; recent week's files untouched.
  - Test bullets across two days with similarity > 0.85: merged via T-009; `merged_from` field populated correctly.
  - Test `recent.md` rebuilt from current 7 days of `today-*.md`.
  - Test idempotency: run twice; second run is no-op (archive doesn't grow further).
  - _Implements: FR-19, FR-21; design §1.4, §8.1_

**Estimate**: M · **Status**: pending

---

### T-030 — [[Lazy compression]] fallback (no-cron environments)

**Scope**: Implement SessionStart-triggered lazy compression from design §8.2.1. Detects missing/stale compression via mtime; spawns detached `cmk compress --lazy`.

**Implements**: FR-19; design §8.2.1.

**Depends on**: T-015, T-020. Independent of T-028/T-029 (fallback path).

**Done when**:

- [ ] Stale `recent.md` (>7d) or missing → SessionStart spawns `cmk compress --lazy` detached; 500 ms budget preserved.
- [ ] `cmk compress --lazy` performs T-028 or T-029 work; logs to `lazy-compress.log`.
- [ ] Cron registered → lazy detector registers but skips work; logs `skipped: cron-active`.

**Tests (TDD)**:

- [ ]* T-030.tests Write unit tests for lazy compression fallback
  - Test SessionStart with stale `recent.md` (mtime 8 days old): `cmk compress --lazy` spawned detached; SessionStart hook still returns within 500 ms (timer assertion).
  - Test SessionStart with fresh `recent.md` (mtime <7d): no spawn.
  - Test `cmk compress --lazy` does the daily-distill work when only daily is stale, and the weekly-curate work when weekly is stale.
  - Test with cron registered (sentinel file at `.locks/cron-registered`): lazy detector exits with `skipped: cron-active`.
  - _Implements: FR-19; design §8.2.1_

**Estimate**: S · **Status**: pending

---

- [ ] **Checkpoint 6 — Layer 6 (Cron + Lazy) complete** _(skip if Layer 6 deferred)_: Agent runs T-028..T-030 tests; zero failures. Confirms cron registration is idempotent on all 3 OSes. Agent confirms green before starting cross-cutting layer.

---

## Cross-cutting

### T-031 — `cmk doctor` health checks (HC-1..HC-8)

**Scope**: Implement 8 [[Health check]]s from design §14. Each yields yes/no with documented self-repair. HC-8 is the [[Native Auto Memory]] detector.

**Implements**: FR-22; design §14.

**Depends on**: T-003.

**Done when**:

- [ ] `cmk doctor` runs all 8 checks + prints structured report within 5 s on ≤10k observations.
- [ ] Failed check includes documented repair command.
- [ ] HC-8 inspects `~/.claude/projects/<slug>/memory/` + writes status to `.locks/native-memory-status.log`.
- [ ] Install-requiring check prompts user before invoking.

**Tests (TDD)**:

- [ ]* T-031.tests Write unit tests for `cmk doctor`
  - Test all 8 HCs execute in order; structured report printed to stdout with one line per check (`PASS` / `FAIL` / `SKIP`).
  - Test full run completes within 5 s on a 10k-observation fixture.
  - Test failed HC (e.g., HC-2 missing hook): repair command suggestion appears in stderr.
  - Test HC-8: with `~/.claude/projects/<slug>/memory/` populated, log entry shows `active: true` + file count + last_modified.
  - Test HC-8: with auto-memory dir empty, log entry shows `active: false`.
  - Test install-requiring repair: stub the prompt; assert prompt was shown before any install command was invoked.
  - _Implements: FR-22; design §14_

**Estimate**: M · **Status**: pending

---

### T-032 — `cmk import-anthropic-memory` bridge

**Scope**: Implement the bridge from design §11.2. Reads `~/.claude/projects/<slug>/memory/MEMORY.md`, computes canonical IDs via T-005, dedups against `context/MEMORY.md`, proposes additions with `write_source: imported`, `trust: medium`.

**Implements**: FR-25; design §11.2.

**Depends on**: T-005, T-021.

**Done when**:

- [ ] `--dry-run` prints proposals, modifies no file.
- [ ] No-dry-run prompts per addition (or accept-all / decline-all).
- [ ] Duplicate canonical ID: skip + log `skipped: duplicate`.

**Tests (TDD)**:

- [ ]* T-032.tests Write unit tests for `cmk import-anthropic-memory`
  - Test `--dry-run` prints proposed additions to stdout; assert no file in `context/` is modified (mtime check).
  - Test no-dry-run with mocked accept-all: every proposal applied to MEMORY.md with `write_source: imported`, `trust: medium`.
  - Test duplicate detection: candidate with canonical ID matching an existing bullet → skipped; `audit.log` records `skipped: duplicate`.
  - Test missing source file (`~/.claude/projects/<slug>/memory/MEMORY.md` not present): exit 0 cleanly with "no Anthropic auto-memory found".
  - _Implements: FR-25; design §11.2_

**Estimate**: S · **Status**: pending

---

### T-033 — `cmk repair` idempotent self-repair + `cmk roll` manual roller

**Scope**: Two CLI verbs. `cmk repair` (`--hooks`, `--locks`, `--index`) idempotent across all subflags. `cmk roll [--scope now|today|recent]` invokes the same compression internals as SessionEnd/cron but on demand.

**Implements**: FR-19, FR-22; design §8, §14.

**Depends on**: T-014, T-024 (for `--index`), T-019/T-028 (for `roll`).

**Done when**:

- [ ] `cmk repair` multiple runs produce identical end-state.
- [ ] `--locks` removes only locks >1 h old (live preserved).
- [ ] Install-requiring sub-action prompts user.
- [ ] `cmk roll --scope today` invokes T-028 internals.
- [ ] `cmk roll` default = now (SessionEnd-equivalent).

**Tests (TDD)**:

- [ ]* T-033.tests Write unit tests for `cmk repair` + `cmk roll`
  - Test `cmk repair` twice in a row: second run produces no file changes (mtime check across all touched files).
  - Test `--locks` with a fresh lock (mtime 30 min): NOT removed. With a stale lock (mtime 2 h): removed.
  - Test `--hooks` re-registers all 6 hooks from `hooks.json` template; subsequent run is no-op (already registered).
  - Test `--index` invokes `cmk reindex --full` and verifies row count parity.
  - Test `cmk roll --scope today` invokes the T-028 daily-distill path (assert via stub).
  - Test `cmk roll --scope recent` invokes T-029 weekly-curate path.
  - Test `cmk roll` with no flag defaults to `--scope now` (T-019 compress path).
  - _Implements: FR-19, FR-22; design §8, §14_

**Estimate**: M · **Status**: pending

---

### T-034 — Cross-OS install CI matrix

**Scope**: Wire GitHub Actions to run `cmk install` + `cmk doctor` on Windows 10/11, macOS 14+, Ubuntu 22.04+ per PR. Asserts byte-identical scaffolded state across OSes (NFR-3) and all required health checks pass.

**Implements**: NFR-3; design §13.

**Depends on**: T-003, T-031.

**Done when**:

- [ ] Every PR triggers the install + doctor matrix on all 3 OSes.
- [ ] PR fails on checksum mismatch between OSes.
- [ ] PR fails on any OS doctor failure.

**Tests (TDD)**:

- [ ]* T-034.tests Write CI workflow + matrix tests
  - Test workflow YAML (`.github/workflows/install-matrix.yml`) parses and triggers on `pull_request`.
  - Test job matrix includes `windows-2022`, `macos-14`, `ubuntu-22.04`.
  - Test each OS job runs `cmk install` in a fresh tempdir, then `cmk doctor`.
  - Test checksums of the scaffolded directory tree match across all 3 OSes (post-job artifact compare).
  - Test the workflow fails the PR check if ANY OS produces a different checksum.
  - Test the workflow fails the PR check if ANY OS's doctor reports a failed required check.
  - _Implements: NFR-3; design §13_

**Estimate**: M · **Status**: pending

---

### T-035 — Documentation: README + INSTALL guides + quickstart

**Scope**: Write user-facing docs: top-level `README.md`, `INSTALL-{windows,macos,linux}.md` per design §13, and a `QUICKSTART.md` walking through install → first memory write → doctor → first session.

**Implements**: FR-22, FR-23, FR-24; design §13.

**Depends on**: T-003 .. T-031.

**Done when**:

- [ ] New user can produce a working installation via QUICKSTART.md in <5 min (manual test by 2+ users).
- [ ] Every documented command produces the documented output (`scripts/test-quickstart.sh` runs against doc verbatim).
- [ ] Each `INSTALL-<os>.md` path completes on its target OS without extra steps.

**Tests (TDD)**:

- [ ]* T-035.tests Write docs verification tests
  - Test `scripts/test-quickstart.sh`: parses QUICKSTART.md, extracts every fenced `bash` command, runs them in sequence in a tempdir, asserts each produces the documented output.
  - Test each `INSTALL-<os>.md` against a CI runner of the matching OS (lint that commands work end-to-end; reuses T-034 matrix infrastructure).
  - Test README.md links: all relative links resolve to existing files; all external URLs return HTTP 200 (smoke).
  - Test manual user test: log 2+ user dry-runs in `docs/quickstart-test-log.md` before release (procedural, not automated).
  - _Implements: FR-22, FR-23, FR-24; design §13_

**Estimate**: M · **Status**: pending

---

- [ ] **Checkpoint 7 — Cross-cutting (excluding release) complete**: Agent runs T-001..T-035 test suite; zero failures. CI matrix green on all 3 OSes. `cmk doctor` reports green on fresh installs. Docs verified end-to-end. Agent confirms green before T-036 release.

---

### T-036 — v0.1.0 release: version, CHANGELOG, npm publish, GitHub release

**Scope**: Bump `package.json` to `0.1.0`, write CHANGELOG entry summarizing all changes since v0.0.1, tag `v0.1.0`, publish `@claude-memory-kit/cli@0.1.0` to npm, publish GitHub Release with tag.

**Implements**: NFR-2 (releaseability); operational only.

**Depends on**: ALL prior tasks (T-001 .. T-035) **and** Checkpoint 7 green.

**Done when**:

- [ ] Pushing the v0.1.0 tag produces a GitHub Release with CHANGELOG-derived notes.
- [ ] `npm install -g @claude-memory-kit/cli@0.1.0` on a fresh machine succeeds.
- [ ] `cmk version` prints `0.1.0` matching the tag.

**Tests (TDD)**:

- [ ]* T-036.tests Write release verification tests
  - Test `package.json` version equals `0.1.0` and matches the latest git tag.
  - Test CHANGELOG.md has a section heading for `## [0.1.0] — YYYY-MM-DD` with non-empty body.
  - Test GitHub Release exists for tag `v0.1.0` with body derived from CHANGELOG.
  - Test on a fresh CI runner: `npm install -g @claude-memory-kit/cli@0.1.0` exits 0; `cmk version` outputs `0.1.0`.
  - _Implements: NFR-2_

**Estimate**: S · **Status**: pending

---

- [ ] **Checkpoint 8 — v0.1.0 released**: Final test suite green; release on npm + GitHub; install works on all 3 OSes from clean state. v0.1.0 is shipped.

---

## Summary

| Layer | Tasks | Tests sub-tasks | Checkpoints | Est. effort | Required? |
| --- | --- | --- | --- | --- | --- |
| Layer 1 — Foundation | 5 | 5 | 1 (after T-005) | ~7 days | Yes |
| Layer 2 — Granular archive | 4 | 4 | 1 (after T-009) | ~6 days | Yes |
| Layer 3 — Scratchpads | 4 | 4 | 1 (after T-013) | ~5 days | Yes |
| Layer 4 — Hooks + auto-extract | 10 | 10 | 1 (after T-023) | ~22 days | Yes |
| Layer 5 — Search | 4 | 4 | 1 (after T-027) | ~12 days | Optional |
| Layer 6 — Cron compression | 3 | 3 | 1 (after T-030) | ~6 days | Optional |
| Cross-cutting | 6 | 6 | 2 (after T-035 + after T-036) | ~11 days | Yes |

**36 tasks, 36 Tests sub-tasks, 8 Checkpoints.** Required-only path (no Layer 5+6): ~51 dev-days. Full surface: ~69 dev-days.

**Critical path**: T-001 → T-005 → Checkpoint 1 → T-006 → T-010 → T-011 → Checkpoint 2/3 → T-014 → T-015 → T-018 → T-020 → T-021 → T-023 → Checkpoint 4 → T-031 → T-035 → Checkpoint 7 → T-036 → Checkpoint 8.

## What's deliberately not in tasks.md (audit trail)

- **MCP authentication token** (declined 2026-05-23 as overengineering for v0.1).
- **`@modelcontextprotocol/sdk` library name** specified inside T-027's implementation, not in design.md.
- **§4.1 trust hierarchy** as a separate subsection (inline §4 default mapping suffices).
- **Companion skills beyond `memory-write` + `bootstrap`** (`make-plan`, `pathfinder`, `weekly-digests`, `learn-codebase`) — deferred to v0.3+ per ADR-roadmap.
- **`<ephemeral>` privacy tag** — v0.1.x patch candidate.
- **External memory provider plugin slots** (Honcho/Mem0/Hindsight) — v0.2.
- **Web viewer rich UI** — v0.2.
- **IDE adapters** (Cursor / Windsurf / Codex) — v0.2.
- **Cross-project search (`cmk search --all-projects`)** — v0.2.

## End of tasks.md v0.1.0

36 tasks × Tests + 8 Checkpoints + boundary-test discipline + glossary reference. TDD all the way down.

Next per Kiro flow: per-task implementation begins. Each task ships as a PR titled `T-NNN: <title>` with the task's "Done when" + "Tests (TDD)" checkboxes checked in the PR description.
