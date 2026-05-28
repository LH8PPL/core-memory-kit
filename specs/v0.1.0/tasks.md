# Tasks — claude-memory-kit v0.1.0

**Status**: Draft · **Author**: Claude (Opus 4.7) + Lior Hollander · **Date started**: 2026-05-23

This is the **actionable implementation plan**. A numbered, hierarchical checklist of concrete coding steps that build incrementally from an empty repo to a working v0.1.0 release. The bridge between [`requirements.md`](requirements.md) (WHAT v0.1.0 must do), [`design.md`](design.md) (HOW v0.1.0 is built), and [`glossary.md`](glossary.md) (canonical definitions for every domain term).

## How to read this file

Tasks follow Kiro convention:

- **`- [ ] N.` parent tasks** group related work (one focused area, ~1–3 PR-days each).
- **`- [ ] N.M` sub-tasks** are concrete, actionable implementation steps. Max two levels of nesting.
- **`- [ ]* N.last` (asterisk)** marks the test sub-task. Optional for MVP-only paths; required otherwise. _All tests are run by the agent (Claude), not by a human._
- **`_Requirements: FR-X; design §Y_`** on the test sub-task traces back to the spec.
- Plain bullets under any task line are implementation notes / context.
- **`- [ ] N. Checkpoint — ...`** standalone numbered items between layers gate progress. Agent runs the full test suite and confirms zero failures before moving on.

Domain terms used below (Tier, Citation ID, Frozen snapshot, Poison_Guard, etc.) are defined in [`glossary.md`](glossary.md).

## Engineering discipline

1. **Test-driven**: Write the test first, let the agent implement, verify, repeat. Small cycles, high confidence.
2. **Boundary testing** (per Ousterhout, _A Philosophy of Software Design_): Test the public interface of each module, not its internal helpers. Test the contract that survives refactors.
3. **Deep modules with simple interfaces**: When implementing, wrap related code into broad modules that expose narrow surfaces. Don't fragment cohesive logic into many shallow helpers.
4. **Incremental build**: Each task produces working, integrated code. No orphaned code. After any sub-task, you can run what exists and verify it works.
5. **Code review at strategic boundaries** (not per-PR): tests are catching unit-level bugs; reviews target what tests miss. Three layer-wide reviews at Checkpoints 11, 27, 42 via the `code-review-excellence` skill. Plus individual PR reviews on Tasks 23 (auto-extract), 24 (memory-write + Poison_Guard), 31 (MCP server) — high-risk surface. See those entries for specifics. For all other tasks, just build them normally — no per-PR review step.

## Scope of v0.1.0

| Layer | Tasks (parent numbers) | Required for v0.1.0? |
| --- | --- | --- |
| Layer 1 — Foundation | 1 – 5 | **Yes** |
| Layer 2 — Granular archive | 7 – 10 | **Yes** |
| Layer 3 — Scratchpads | 12 – 15 | **Yes** |
| Layer 4 — Hooks + skill + auto-extract | 17 – 26 | **Yes** |
| Layer 5 — Search | 28 – 31 | **Optional** (deferrable to v0.1.x) |
| Layer 6 — Cron compression | 33 – 35 | **Optional** (deferrable to v0.1.x) |
| Cross-cutting | 37 – 43 | **Yes** |
| Checkpoints | 6, 11, 16, 27, 32, 36, 42, 44 | **Yes** at the gate points that apply |

Optional layers ship if time permits; otherwise they roll forward into v0.1.x patches.

---

## Layer 1 — Foundation

- [x] 1. Repo scaffolding + `template/` skeleton (T-001) — _shipped 2026-05-23, PR #1_
  - Estimate: S · Depends: —
- [x] 1.1 Create canonical `template/` directory tree
  - Includes `context/`, `context/memory/`, `context/sessions/`, `context/transcripts/`, `context/queues/`, `context/.index/.gitkeep`
- [x] 1.2 Add seed files into `template/`
  - CLAUDE.md loader block with versioned delimiters
  - README.md placeholder
  - `.gitignore` rules for `context.local/`, `context/.index/`, `context/.locks/`
- [x] 1.3 Add `scripts/validate-template.sh` lint script
  - Asserts every required file exists
  - Asserts every required file has non-empty content
- [x]* 1.4 Write unit tests for template scaffolding
  - Test every required file in `template/` exists (manifest-driven)
  - Test every required file is non-empty (`size > 0`)
  - Test `validate-template.sh` exits 0 against canonical `template/`
  - Test `validate-template.sh` exits non-zero when a required file is deleted (tempdir copy + targeted deletion)
  - _Requirements: FR-1, FR-4, FR-5; design §1.1, §13_

- [x] 2. `cmk` Node CLI scaffold (T-002) — _shipped 2026-05-23, PR #2_
  - Estimate: M · Depends: 1
- [x] 2.1 Create `@claude-memory-kit/cli` npm package skeleton
  - `package.json`, `bin/cmk`, basic Node entry point
- [x] 2.2 Wire `commander` or `cac` for arg parsing
  - One option chosen and locked in for v0.1
- [x] 2.3 Add stubs for every subcommand from design §12
  - `install`, `init-user-tier`, `search`, `reindex`, `doctor`, `config`, `view`, `import-anthropic-memory`, `trust`, `lessons promote`, `queue review`, `queue conflicts`, `forget`, `purge --hard`, `roll`, `repair`, `version`
  - Each prints "not yet implemented in v0.1.0 milestone N" and exits 0
- [x]* 2.4 Write unit tests for CLI scaffold
  - Test `cmk --help` output contains every documented subcommand
  - Test every subcommand stub exits 0
  - Test stub message includes the literal "not yet implemented" string
  - Test `npm install -g` smoke (CI): `cmk version` runs from a clean shell after global install
  - _Requirements: FR-22, FR-23; design §12_

- [x] 3. `cmk install` cross-OS implementation (T-003) — _shipped 2026-05-23, PR #3_
  - Estimate: M · Depends: 1, 2
- [x] 3.1 Implement 3-tier directory creation
  - Project tier (`<repo>/context/`), local tier (`<repo>/context.local/`), user tier (`~/.claude-memory-kit/`)
- [x] 3.2 Copy `template/*` into project tier without overwriting existing files
  - Skip + log when a target file already exists; user content preserved
- [x] 3.3 Inject `.gitignore` entries for `context.local/`, `context/.index/`, `context/.locks/`
  - Idempotent: re-runs don't duplicate lines
- [x] 3.4 Honor `MEMORY_KIT_USER_DIR` env var for the user-tier path
  - Default `~/.claude-memory-kit/`; override creates the named path
- [x]* 3.5 Write unit tests for `cmk install`
  - Test install in fresh tempdir produces expected file tree (manifest compare)
  - Test re-install preserves a hand-edited `MEMORY.md` (mtime + sha1 unchanged)
  - Test re-install refreshes kit-managed `.gitignore` lines while preserving unrelated entries
  - Test `MEMORY_KIT_USER_DIR=/tmp/xxx cmk install` writes user-tier to `/tmp/xxx/`
  - Test idempotency: two consecutive `cmk install` runs produce identical on-disk state
  - _Requirements: FR-22, FR-23, FR-24; design §1.1, §13_

- [x] 4. CLAUDE.md loader block with versioned delimiters (T-004) — _shipped 2026-05-23, PR #4_
  - Estimate: S · Depends: 3
- [x] 4.1 Implement append-on-first-install path
  - When `CLAUDE.md` has no `<!-- claude-memory-kit:start vX.Y.Z -->` delimiter, append the block at end-of-file; preserve prior content verbatim
- [x] 4.2 Implement in-place replace for same/older version
  - Replace block contents; everything outside delimiters unchanged
- [x] 4.3 Implement downgrade-guard for newer-version block
  - On re-install against a block declaring a newer version: warn + no-op + exit 0 unless `--force`
- [x] 4.4 Implement `cmk uninstall` clean removal
  - Strip block + delimiters exactly; preserve everything else byte-for-byte
- [x]* 4.5 Write unit tests for CLAUDE.md loader
  - Test fresh install (no CLAUDE.md): file created with delimited block, nothing else
  - Test install against CLAUDE.md with prior user content: block appended at EOF; prior content byte-identical (diff = 0 outside block)
  - Test re-install with same version: block contents replaced; surrounding content unchanged
  - Test re-install with older version: block contents upgraded; non-block content unchanged
  - Test re-install with newer version (no `--force`): exit 0, file unchanged, warning to stderr
  - Test `cmk uninstall`: block + delimiters removed; surrounding content byte-identical via `diff`
  - _Requirements: FR-22; design §13.1_

- [x] 5. `canonicalize()` + ID generation (Node + Python parity) (T-005) — _shipped 2026-05-24, PR #5_
  - Estimate: M · Depends: 2
- [x] 5.1 Define `fixtures/canonicalize-vectors.json`
  - ≥30 representative inputs covering whitespace collapse, lowercase, backref strip, punctuation strip, HTML-comment strip, non-ASCII passthrough
- [x] 5.2 Implement Node `@cmk/canonicalize` package
  - `canonicalize()` + `generateId(tier, text)`
- [x] 5.3 Implement Python parallel implementation (for cron + auto-extract scripts)
  - Same function signatures; same outputs
- [x] 5.4 Implement base32 alphabet excluding ambiguous chars (`0`, `O`, `1`, `l`, `I`, `8`)
  - RFC 4648 alphabet minus the six ambiguous chars; documented in code
- [x] 5.5 Wire CI parity job that runs both implementations against the fixture and asserts byte-identical output
- [x]* 5.6 Write unit tests for canonicalize + ID generation
  - Test each fixture produces the documented expected canonical form (both implementations)
  - Test Node and Python produce byte-identical output on every fixture (parity matrix)
  - Test SHA-256 → base32 → first-8-chars produces the documented expected ID
  - Test adding a `(P-XXXXXXXX)` backref to canonical input produces the same ID as without backref (idempotency)
  - Test base32 alphabet: encode 1000 random hashes; assert no output contains any of `0`, `O`, `1`, `l`, `I`, `8`
  - _Requirements: FR-14; design §3_

- [x] 6. Checkpoint — Layer 1 (Foundation) complete — _passed 2026-05-24_
  - All tests for tasks 1–5 green (218 Node + 140 Python + 38-vector parity)
  - `cmk install` works end-to-end on a fresh repo
  - `cmk --help` lists every documented subcommand
  - Agent runs the full suite and confirms zero failures before starting Layer 2

---

## Layer 2 — Granular archive

- [x] 7. Per-fact file format + writer (T-006) — _shipped 2026-05-24, GitHub PR #6_
  - Estimate: M · Depends: 5
- [x] 7.1 Implement `writeFact(tier, type, slug, body, provenance)` boundary
  - Public interface; internal helpers stay private
- [x] 7.2 Validate 9 required YAML frontmatter fields
  - `id`, `type`, `title`, `created_at`, `write_source`, `trust`, `source_file`, `source_line`, `source_sha1`; missing field → `error_category: "schema"`
- [x] 7.3 Compute citation ID via `canonicalize()` + `generateId()` (task 5)
- [x] 7.4 Implement dedup-via-canonical-ID check
  - Identical canonical text → same ID → second write is logged + skipped (no overwrite, no error)
- [x]* 7.5 Write unit tests for `writeFact()`
  - Test valid call creates file at expected path with all 9 frontmatter fields
  - Test each of the 9 required fields, when omitted, produces `error_category: "schema"` and no file
  - Test ID computation calls `canonicalize()` with the body (mock + assertion)
  - Test second call with identical canonical body → same ID, no second file, log entry `skipped: duplicate`
  - Test optional fields (`merged_from`, `superseded_by`, `private`) written when supplied, absent when not
  - _Requirements: FR-1, FR-29; design §2.2_

- [x] 8. INDEX.md generation + maintenance (T-007) — _shipped 2026-05-24, GitHub PR #7_
  - Estimate: S · Depends: 7
- [x] 8.1 Implement `cmk reindex` markdown-side walker
  - Walks `<tier>/memory/*.md`, reads frontmatter
- [x] 8.2 Generate INDEX.md in documented format
  - One line per non-tombstoned fact: `- ({id}) [type] [title](filename.md) — <hook>`
- [x] 8.3 Emit warning on INDEX.md > 25 KB but still write
  - No hard cap; warning suggests consolidation
- [x]* 8.4 Write unit tests for INDEX generation
  - Test reindex with 0 facts produces header-only INDEX.md
  - Test reindex with N facts produces exactly N body lines in the documented format
  - Test adding a new fact + reindex: new line appears at the documented sort position
  - Test removing a fact + reindex: line disappears
  - Test retitling a fact (frontmatter `title:` change) + reindex: line shows new title
  - Test 26 KB INDEX scenario: warning to stderr, file still written
  - Test tombstoned facts (`deleted_at`) excluded from INDEX
  - _Requirements: FR-1, FR-7; design §2.3_

- [x] 9. Tombstone discipline (T-008) — _shipped 2026-05-24, GitHub PR #8_
  - Estimate: S · Depends: 7
- [x] 9.1 Implement `cmk forget <id-or-query>` resolver
  - ID match exact; query match by substring on canonical text
- [x] 9.2 Implement confirmation prompt (with `--yes` skip for tests)
  - User must explicitly confirm; never silently delete
- [x] 9.3 Move matched file to `<tier>/memory/archive/tombstones/<id>.md` + add deletion frontmatter
  - `deleted_at`, `deleted_reason`, `deleted_by`
- [x] 9.4 Remove matching bullet (matched by ID) from any scratchpad
  - Removes the bullet line + its provenance HTML-comment line
- [x]* 9.5 Write unit tests for tombstone flow
  - Test `cmk forget P-XXX --yes` moves file to `archive/tombstones/<id>.md`
  - Test deletion frontmatter fields all present (valid ISO timestamp, string reason, enum `deleted_by`)
  - Test scratchpad bullet with matching ID is removed (bullet + provenance comment)
  - Test `mk_get(tombstoned_id)` returns body + `deleted_on:` annotation (NOT 404)
  - Test `cmk forget <nonexistent_id>` exits 2 with "ID not found" stderr
  - _Requirements: FR-29; design §6.5_

- [x] 10. Consolidation / merge semantics (T-009) — _shipped 2026-05-24, GitHub PR #9 + cleanup PRs #10 + #11 (Checkpoint-11 review fixes)_
  - Estimate: M · Depends: 7, 9
- [x] 10.1 Implement `mergeFacts(idA, idB) → newC` boundary
  - Public interface only; internal merge logic is one deep module
- [x] 10.2 Compute new ID for merged body via canonicalize + generateId
  - `newC.id = generateId(tier, canonicalize(merged_body))`
- [x] 10.3 Move A.md and B.md to `<tier>/memory/archive/superseded/`
  - Add `superseded_by: <newC.id>` to each
- [x] 10.4 Expose `mk_get(idA)` post-merge to return A's content + `merged_into: <newC.id>` annotation
  - Old IDs never die; they resolve to the new one
- [x]* 10.5 Write unit tests for merge semantics
  - Test merging A + B with body "X. Y." produces C with `id = generateId(canonical("x. y."))`
  - Test C's frontmatter contains `merged_from: [idA, idB]` (order preserved)
  - Test A.md and B.md moved to `archive/superseded/` with `superseded_by: <C.id>`
  - Test `mk_get(idA)` returns A's body + `merged_into: <C.id>` annotation
  - Test three-way merge: `mergeFacts(mergeFacts(A, B), C)` produces final ID = `generateId(canonical(combined_body))`; merged_from traced correctly
  - _Requirements: FR-14; design §3.4_

- [x] 11. Checkpoint — Layer 2 (Granular archive) complete — _passed 2026-05-24 after PRs #10 (B1+B2 blockers) + #11 (cross-module cleanup)_
  - All tests for tasks 1–10 green (335 Node + 140 Python + 38-vector parity, re-run from main after PR #11 merge)
  - Round-trip works: write fact → reindex → query INDEX → forget → tombstone resolves on `resolveFact` (G1 integration tests in `tests/layer-2-roundtrip.test.js` cover this end-to-end)
  - **Layer-wide code review pass** via the `code-review-excellence` skill across Tasks 7, 8, 9, 10. Found: 2 blockers (B1 collision in mergeFacts; B2 frontmatter injection) → PR #10. 4 important (I1-I4 cross-module drift; helpers, frontmatter parser, errorCategory enum, audit-log schema) → PR #11. 6 minors (subset folded into PR #11; M4/M6 + S2 deferred to v0.1.x; Q2 audit-log rotation added to design §16.13).
  - Agent confirmed zero failures + zero blocking review issues. Shared helpers now live in [`packages/cli/src/{tier-paths,audit-log,frontmatter,result-shapes}.mjs`](../../packages/cli/src/) — Layer 3 modules import these per [CLAUDE.md](../../CLAUDE.md) "Shared modules" rule.

---

## Layer 3 — Scratchpads

- [x] 12. Bounded scratchpad writer + cap enforcement (T-010) — _shipped 2026-05-24, GitHub PR #12_
  - Estimate: M · Depends: 5
  - Uses shared modules from `packages/cli/src/{tier-paths,audit-log,frontmatter,result-shapes}.mjs` — see CLAUDE.md "Shared modules" rule
- [x] 12.1 Implement scratchpad writer boundary (public interface)
  - One module; one entry point per scratchpad operation
- [x] 12.2 Implement cap counting via `wc -c` (counts everything including frontmatter/comments)
- [x] 12.3 Implement consolidation trigger at >95% of cap
  - Merge similar bullets _(deferred to v0.1.x / Task 34)_; drop entries >14 days old without `trust: high`; preserve `trust: high` regardless of age
- [x] 12.4 Read caps from `<repo>/context/settings.json` and `~/.claude-memory-kit/settings.json`
  - Project tier overrides; user tier fallback; hardcoded defaults as last resort
- [x] 12.5 Reject still-over-cap writes after consolidation
  - `error_category: "cap_exceeded"`; no silent truncation
- [x]* 12.6 Write unit tests for scratchpad writer
  - Test write at 50% of cap: write succeeds; consolidator not invoked (mock + assert not-called)
  - Test write at 96% of cap: consolidator invoked before write
  - Test consolidation: bullets <14 days kept; >14 days without `trust: high` dropped; >14 days with `trust: high` kept
  - Test write that still exceeds cap after consolidation: rejected with `error_category: "cap_exceeded"`, file unchanged
  - Test `settings.json` override (`MEMORY.md.max_chars: 4000`) enforced even if default is higher
  - _Requirements: FR-3; design §2.1_

- [x] 13. Provenance frontmatter writer + reader (T-011) — _shipped 2026-05-24, GitHub PR #13 (+ review-fix commits for B3 comma-injection + design.md example-id replacement)_
  - Estimate: S · Depends: 5, 12
  - Uses shared modules from `packages/cli/src/{tier-paths,audit-log,frontmatter,result-shapes}.mjs` — see CLAUDE.md "Shared modules" rule
- [x] 13.1 Implement `writeBullet(text, provenance)` boundary
  - Emits bullet on one line + HTML-comment provenance on the next
- [x] 13.2 Validate 7 required provenance fields
  - `source`, `source_line` (separate field, not inline in source — see design §2.1 update), `sha1`, `write`, `trust`, `at`, plus per-bullet `id`
- [x] 13.3 Implement reader that parses HTML-comment provenance back into struct
  - Used by SessionStart hook (task 18) for tier-merging. Tolerant: returns `null` on non-bullet lines so callers can iterate freeform markdown without crashing
- [x]* 13.4 Write unit tests for provenance writer + reader
  - Test `writeBullet({text, provenance})` produces two-line output: bullet, then HTML comment with all required fields
  - Test each required field, when omitted: rejected with `error_category: "schema"`
  - Test reader parses comment back into struct with all fields populated
  - Test reader skips lines not matching the comment shape (graceful on freeform markdown)
  - Test round-trip: write → read → write produces byte-identical output
  - _Requirements: FR-29; design §4_

- [x] 14. Seed scratchpad templates (T-012) — _shipped 2026-05-24, GitHub PR #14 (+ three review-fix commits: trust+at fix, cap raise to 1500, (example)-prefix polish)_
  - Estimate: S · Depends: 12, 13
  - Uses shared modules from `packages/cli/src/{tier-paths,audit-log,frontmatter,result-shapes}.mjs` — see CLAUDE.md "Shared modules" rule
- [x] 14.1 Author project-tier seeds in `template/context/`
  - SOUL.md, MEMORY.md, context.local/{machine-paths,overrides}.md
- [x] 14.2 Author user-tier seeds for `cmk init-user-tier`
  - USER.md, HABITS.md, LESSONS.md, fragments/INDEX.md
- [x] 14.3 Include canonical header comment + three section headings in every seed
  - Header: `Cap: N chars · Last distilled: ISO · Last health check: ISO`
  - 3 documented sections per scratchpad locked in `SCRATCHPAD_DOCUMENTED_SECTIONS` (tier-paths.mjs). Each section ships with a real-generated-id seed bullet at `trust: medium` + `at: 2020-01-01T00:00:00Z` (auto-drops on first cap-pressure write per Task 12 consolidator).
- [x]* 14.4 Write unit tests for seed templates
  - Test `cmk install` produces every required project-tier file (manifest list)
  - Test `cmk init-user-tier` with `MEMORY_KIT_USER_DIR=/tmp/xxx` puts user-tier files at `/tmp/xxx/`
  - Test each seed's first 100 chars contain header markers (`Cap:`, `Last distilled:`, `Last health check:`)
  - Test each seed contains its three documented section headings
  - _Requirements: FR-3; design §2.1_

- [x] 15. `cmk trust <id> <level>` override (T-013) _shipped 2026-05-25, PR #15_
  - Estimate: S · Depends: 7, 12, 13
  - Uses shared modules from `packages/cli/src/{tier-paths,audit-log,frontmatter,result-shapes}.mjs` — see CLAUDE.md "Shared modules" rule
- [x] 15.1 Implement ID resolver for both scratchpad bullets and fact files
- [x] 15.2 Update `trust:` field in the matched provenance/frontmatter
- [x] 15.3 Append one audit.log line per trust change
  - Schema: `{ts, actor, action: "trust_change", id, prior_trust, new_trust}`
- [x]* 15.4 Write unit tests for `cmk trust`
  - Test `cmk trust <existing_id> high` updates the field + writes one audit.log line with the documented schema
  - Test trust change for a scratchpad bullet (HTML-comment provenance) updates the comment
  - Test trust change for a fact file (YAML frontmatter) updates the YAML
  - Test `cmk trust <nonexistent_id> high` exits 2 with "ID not found"
  - Test `cmk trust <id> bogus_level` exits 2 with validation error
  - _Requirements: FR-29; design §4, §6.2_

- [x] 16. Checkpoint — Layer 3 (Scratchpads) complete — _passed 2026-05-25_
  - All tests for tasks 1–15 green (473/473 Node + 140/140 Python + 38-vector parity; validate-test-ids pre-test lint clean)
  - End-to-end smoke verified: `install({projectRoot, userTier})` (9 files, MEMORY.md 1916 bytes) → `appendScratchpadBullet` at `MEMORY.md / Active Threads` (action=appended, 1916→2149 bytes, consolidator: dropped 0 at sub-cap) → `overrideTrust(id, 'low')` (action=trust-updated) → audit.log captured both events with matching ids + correct reasonCodes (`scratchpad-append`, `trust-change`). Cap-pressure consolidator path is covered by [`tests/cli-scratchpad.test.js`](../../tests/cli-scratchpad.test.js) (24 tests).
  - Agent confirmed zero failures. No layer-wide review at this checkpoint by design — the review-schedule decision (Checkpoints 11, 27, 42 only) allocates review budget to the largest-surface layers; Layer 3's smaller cross-module surface didn't warrant a fourth review pass.

---

## Layer 4 — Hooks + skill + auto-extract

- [x] 17. `hooks.json` + 6-hook scaffold (T-014) _shipped 2026-05-25, PR #16_
  - Estimate: S · Depends: 3
- [x] 17.1 Ship `plugin/.claude-plugin/hooks/hooks.json` per design §5.1
  - All 6 hooks registered with documented matchers + timeouts
- [x] 17.2 Ship `bin/cmk-<verb>` script stubs for each hook
  - Each prints "not yet implemented" and exits 0 with `{"continue": true}` JSON
- [x]* 17.3 Write unit tests for hooks.json + stubs
  - Test `hooks.json` parses as valid JSON
  - Test all 6 hook events registered: `Setup`, `SessionStart`, `UserPromptSubmit`, `PostToolUse`, `Stop`, `SessionEnd`
  - Test PostToolUse has matcher `"Write|Edit|MultiEdit"`
  - Test each stub exists, is executable, exits 0 on dummy stdin
  - Test each stub's stdout parses as valid JSON containing `"continue": true`
  - _Requirements: FR-9; design §5.1_

- [x] 18. `cmk-inject-context` — SessionStart hook (T-015) _shipped 2026-05-25, PR #17_
  - Estimate: M · Depends: 14, 17
- [x] 18.1 Implement 3-tier path discovery
  - Walks up from cwd to find project tier; resolves user tier via `$MEMORY_KIT_USER_DIR` or default
- [x] 18.2 Read tiers in priority order (local → project → user)
  - Reads SOUL/USER/MEMORY/HABITS/LESSONS + INDEX files + latest today-*.md
- [x] 18.3 Resolve duplicate IDs across tiers; log shadowed copies
  - Most-specific wins; shadowed → `context/.locks/shadowed_by.log` (NDJSON)
- [x] 18.4 Exclude facts marked `private: true` from the emitted snapshot
- [x] 18.5 Concatenate into ≤10 KB Frozen snapshot; truncate per documented priority on overflow
  - Drop lowest-tier-oldest first; log truncation events
- [x] 18.6 Emit `additionalContext` JSON per hook protocol
  - `{"hookSpecificOutput": {"hookEventName": "SessionStart", "additionalContext": "..."}}`
- [x]* 18.7 Write unit tests for SessionStart hook
  - Test on a 3-tier fixture project: output is valid JSON with the documented shape
  - Test assembled snapshot is ≤10 KB on the fixture
  - Test hook completes within 500 ms (timer assertion)
  - Test duplicate ID across project + user tier: project version wins; `shadowed_by.log` has the user-tier shadowing
  - Test oversized snapshot scenario: output truncated; lowest-tier-oldest dropped first; truncation event logged
  - Test fact with `private: true` containing sentinel `__PRIVATE_FACT_SENTINEL__`: sentinel does NOT appear in emitted additionalContext (grep)
  - _Requirements: FR-7, FR-9; design §1.4, §5.2, §7.1_

- [x] 19. `cmk-capture-prompt` — UserPromptSubmit hook (T-016) _shipped 2026-05-25, PR #18_
  - Estimate: S · Depends: 17
- [x] 19.1 Strip `<private>...</private>` blocks before any disk write
  - Replace with `[private content redacted]`; literal "private content" NEVER on disk
- [x] 19.2 Preserve `<retain>...</retain>` tags for the Stop-hook downstream
- [x] 19.3 Append cleaned prompt to `context/transcripts/{YYYY-MM-DD}.md`
  - Timestamp + role marker per documented format
- [x]* 19.4 Write unit tests for UserPromptSubmit hook
  - Test prompt with `<private>SENTINEL_STRING</private>`: transcript has `[private content redacted]`; grep for SENTINEL_STRING in `context/` returns 0 hits
  - Test prompt with `<retain>important</retain>`: transcript preserves the `<retain>` tags verbatim
  - Test prompt without privacy tags: transcript contains prompt verbatim with timestamp + role marker
  - Test hook returns `{"continue": true}` within 100 ms (timer assertion)
  - Test malformed stdin JSON: hook exits 0, logs error to stderr
  - _Requirements: FR-15; design §5.2, §6.6_

- [x] 20. `cmk-observe-edit` — PostToolUse hook (T-017) _shipped 2026-05-25, PR #19_
  - Estimate: S · Depends: 17
- [x] 20.1 Filter to only Write/Edit/MultiEdit (matcher already in hooks.json)
  - Handler defensive-checks tool_name even though matcher should block first
- [x] 20.2 Threshold check on output line count (>50 lines)
  - Below threshold: hook exits with no-op
- [x] 20.3 Append one-line summary to `sessions/now.md` (detached fire-and-forget)
  - Returns within 50 ms; the append work runs in the spawned subprocess
- [x]* 20.4 Write unit tests for PostToolUse hook
  - Test invocation with 51-line Write output: `sessions/now.md` gets one summary line
  - Test invocation with 49-line Write output: `now.md` unchanged
  - Test invocation with `tool_name: "Read"`: matcher blocks at hooks.json level (integration test with stub that crashes-on-invocation)
  - Test handler returns `{"continue": true}` within 50 ms
  - Test parent termination: kill parent mid-append; summary line still lands in `now.md` (mtime watch)
  - _Requirements: FR-9; design §5.2, §1.4_

- [x] 21. `cmk-capture-turn` — Stop hook + `stop_hook_active` guard + spawn auto-extract (T-018) _shipped 2026-05-25, PR #20_
  - Estimate: M · Depends: 17, 19
- [x] 21.1 Implement `stop_hook_active` guard at handler top
  - Payload with `stop_hook_active: true` → exit immediately with `{"continue": true}`; no spawn
- [x] 21.2 Append assistant turn to `transcripts/{date}.md`
  - Strip `<private>`, preserve `<retain>` (parallel to task 19)
- [x] 21.3 Spawn detached auto-extract subprocess (Unix)
  - `</dev/null >/dev/null 2>&1 & disown` pattern per claude-remember
- [x] 21.4 Spawn detached auto-extract subprocess (Windows)
  - Node `child_process.spawn(..., {detached: true, stdio: 'ignore'})`; unref()
- [x] 21.5 Return `{"continue": true}` within 50 ms after spawn
- [x]* 21.6 Write unit tests for Stop hook
  - Test payload with `stop_hook_active: true`: hook exits 0; auto-extract lock file NOT created (proves no spawn)
  - Test `stop_hook_active: false`: lock file created; transcript appended
  - Test `stop_hook_active` absent: same as false
  - Test hook returns within 50 ms even when spawned subagent is slow
  - Test transcript captures `<retain>important</retain>` verbatim; `<private>secret</private>` replaced
  - Test parent kill: spawn stub subagent that writes sentinel after 2 s; kill parent at 100 ms; assert sentinel appears after 2 s (detach proof)
  - _Requirements: FR-9, FR-10, FR-15; design §5.2, §5.2.1, §6.6_

- [x] 22. `cmk-compress-session` — SessionEnd hook (T-019) _shipped 2026-05-25, PR #28 (+ #29 follow-up flake-class audit)_
  - Estimate: M · Depends: 17, 23
- [x] 22.1 Read `sessions/now.md`; no-op if empty
- [x] 22.2 Invoke CompressorBackend (task 23 ships Haiku impl)
  - Result written to `sessions/today-{YYYY-MM-DD}.md` (create or append for same day)
- [x] 22.3 Truncate `now.md` to 0 bytes on success
- [x] 22.4 Honor 120 s Haiku cooldown
  - If `last-haiku-call.ts` mtime within cooldown: skip + log `skipped: cooldown`
- [x] 22.5 On compression failure: leave `now.md` intact, log error, exit 0 (non-fatal)
- [x]* 22.6 Write unit tests for SessionEnd hook
  - Test non-empty `now.md` invokes mocked backend; output written to `today-{date}.md`
  - Test empty `now.md`: backend NOT invoked; hook exits 0
  - Test existing same-day `today-{date}.md`: new content appended (not overwriting)
  - Test successful compression: `now.md` truncated to 0 bytes
  - Test backend error: `now.md` untouched; error logged with category; exit 0
  - Test cooldown active: backend NOT invoked; `skipped: cooldown` logged
  - _Requirements: FR-19, FR-20; design §1.4, §8.1, §8.3_

- [x] 23. Auto-extract subagent + CompressorBackend Haiku impl (T-020) _shipped 2026-05-25, PR #21_
  - Estimate: L · Depends: 5, 7, 12, 13
  - **High-risk surface — individual PR review required** via the `code-review-excellence` skill. This task spawns external subprocesses, holds lock files, writes NDJSON logs to disk, and routes facts by trust level. Lots of edge cases. Review before merge, not deferred to the Layer 4 checkpoint review at #27 — _review pass completed; 5 findings (1 blocking / 3 important / 1 minor); 4 fixed in-PR, 1 accepted with disclosure (Poison_Guard bypass closes with Task 24)_
  - **Pre-implementation: read [`docs/research/2026-05-25-claude-remember-code-dive.md`](../../docs/research/2026-05-25-claude-remember-code-dive.md)** for absorbed patterns — Haiku sandbox flags (`cd /tmp` + `env -u CLAUDECODE` + `--allowedTools ""` + `--max-turns 1` + empty MCP config + stdin-from-temp-file), position tracking via `last-save.json {session, line}`, tool-use compaction (`[TOOL: <name> <basename>]`), noise-tag stripping (`<system-reminder>` etc.), dedup context (feed last `##`-prefixed entry to Haiku), `noclobber` lock + `kill -0` stale recovery, 120s cooldown + 3-msg threshold. **License caveat:** claude-remember ships under a Community License with a no-competing-use clause — absorb ideas/values, NOT code or prompts. Write our own from scratch with attribution per SOURCES.md.
- [x] 23.1 Implement `auto-extract-memory.sh` (Unix) and Node equivalent (Windows)
  - Reads just-captured turn from a temp file; spawns `claude --print` with documented flags
- [x] 23.2 Implement extraction prompt for sub-Claude
  - Six writing triggers per design §6.4; output schema constrained
- [x] 23.3 Implement trust-routing of sub-Claude output
  - `high` → memory-write (canonical), `medium` → `queues/review.md`, `low` → discard + log
- [x] 23.4 Implement lock-file guard at `context/.locks/auto-extract.lock`
  - `set -o noclobber` pattern per claude-remember; second invocation exits without spawn
- [x] 23.5 Implement NDJSON logging to `sessions/{date}.extract.log`
  - One line per invocation per design §6.1 schema
- [x] 23.6 Implement `HaikuViaAnthropicApi` CompressorBackend
  - Conforms to CompressorBackend interface from design §8.3; used by task 22 + Layer 6
- [x]* 23.7 Write unit tests for auto-extract + Haiku backend
  - Test with mocked Haiku returning 1 high-trust candidate: written to canonical MEMORY.md via memory-write
  - Test with mocked Haiku returning 1 medium-trust candidate: in `queues/review.md`; canonical unchanged
  - Test with low-trust candidate: discarded; extract.log has `skipped: nothing_durable`
  - Test lock file present: second invocation exits with `error_category: "concurrent_run"`, no spawn
  - Test mocked Haiku non-zero exit: extract.log has `success: false`, `error_category` populated; hook exits 0
  - Test NDJSON line matches design §6.1 schema (ts, success, error_category, observation_count, skipped_reason, duration_ms)
  - _Requirements: FR-10, FR-12, FR-13; design §6.1, §6.2, §8.3_
- [x]* 23.8 Spawn-smoke test for `HaikuViaAnthropicApi` per design §17 _shipped 2026-05-25, PR #26 (PR-A)_
  - Retroactively added 2026-05-26. The Task 23 unit tests used an injected `spawnFn` mock; that pinned the cmd/args shape but never invoked real `child_process.spawn` against the real `claude` binary. Live test surfaced 3 spawn-layer issues on Windows (ENOENT on .cmd shim; CVE-2024-27980 hardening; cmd.exe quote-stripping). See [`docs/journey/2026-05-26-live-test-findings.md`](../../docs/journey/2026-05-26-live-test-findings.md) "Bonus finding".
  - Implementation: [`tests/spawn-smoke-haiku.test.js`](../../tests/spawn-smoke-haiku.test.js)
  - Real `claude` spawn against `HaikuViaAnthropicApi.compress()` with a minimal prompt
  - Asserts: spawn does not throw ENOENT/EINVAL; exit 0; stderr does not contain `unrecognized`/`invalid` (catches flag renames); `outputText` non-empty
  - Skips gracefully if `CMK_SKIP_LIVE_HAIKU=1` env OR `claude` binary not in PATH
  - _Requirements: addresses live-test finding; design §17_
- [x] 23.9 Subprocess timeout + cleanup contract for HaikuViaAnthropicApi (per design §8.5)
  - Retroactively added 2026-05-26 (post-PR-31 audit campaign Part 1/4). The post-PR-31 timeout investigation surfaced that `HaikuViaAnthropicApi.compress()` had NO inner timeout — relying entirely on Claude Code's outer hook ceiling (30s Stop / 60s SessionEnd) to kill hung subprocesses. Outer-kill ran with no cleanup: auto-extract.lock file leaked, no NDJSON log entry written, cooldown marker untouched. The composition-verification rule from CLAUDE.md (inner + outer bounds must compose) caught this once the class-1 spawn audit was applied across the codebase.
- [x] 23.9.1 Add explicit `timeoutMs` option to `CompressorBackend.compress` interface (design §8.3)
- [x] 23.9.2 Caller-driven timeouts: auto-extract 25_000ms (under 30s Stop), compress-session 50_000ms (under 60s SessionEnd); headroom for catch + finally + NDJSON log-write
- [x] 23.9.3 Cleanup contract: SIGTERM → grace window (default 2s) → SIGKILL; exposed as `terminateSubprocess(child, {killGraceMs})` for independent testability
- [x] 23.9.4 New `ERROR_CATEGORIES.HAIKU_TIMEOUT` (disambiguates from `HAIKU_FAILED` non-zero exit / spawn ENOENT); callers route on `err instanceof HaikuTimeoutError` (type-anchored per PR-A code-review pass — string-comparison contract was structurally fragile)
- [x]* 23.9.5 Tests: unit (mocked spawn that never closes; assert kill chain + reject with `HaikuTimeoutError` carrying `category: 'haiku_timeout'`) + real-binary spawn-smoke (against `tests/fixtures/hang-forever.mjs` fixture, pins the OS-level kill primitives work on Windows TerminateProcess path)
  - Implementation: [`packages/cli/src/compressor.mjs`](../../packages/cli/src/compressor.mjs), [`tests/cli-compressor-timeout.test.js`](../../tests/cli-compressor-timeout.test.js), [`tests/spawn-smoke-kill-chain.test.js`](../../tests/spawn-smoke-kill-chain.test.js)
  - _Requirements: addresses post-PR-31 finding; design §8.5_
- [x] 23.10 Lock-file discipline + HC-9 stale-lock detection (per design §6.9)
  - Retroactively added 2026-05-26 (post-PR-31 audit campaign Part 2/4). Class-2 audit surfaced one production lock (`auto-extract.lock`) — try/finally cleanup works for normal cases + PR-A's timeout path, but vulnerable to residual cases (external SIGKILL, OS OOM, hardware failure, parent uncaught exception) with no user-visible recovery path. PR-A closed the dominant leak window (hook-ceiling-kill mid-Haiku); PR-B adds the safety net for the residual cases.
- [x] 23.10.1 Extract `pidIsAlive(pid)` + new `detectStaleLocks(projectRoot, {userDir})` into shared module `packages/cli/src/lock-discipline.mjs`
- [x] 23.10.2 `auto-extract.mjs` imports `pidIsAlive` from the shared module (eliminates drift; same probe powers HC-9 + the in-band stale-recovery in `acquireLock`)
- [x] 23.10.3 Library skips non-`*.lock` files (`.locks/audit.log`, `last-haiku-call.ts`, etc.) — only true mutex locks are scanned
- [x] 23.10.4 LockReport shape: `{path, pid, holderAlive, stale, reason?, recoveryCommand?}` — `recoveryCommand` is a copy-paste `rm` command users can run immediately
- [x] 23.10.5 PID-reuse limitation documented in design §6.9 (deferred to v0.1.x; per-OS process-start-time APIs make the fix substantial)
- [x]* 23.10.6 Tests: unit (mock filesystem with held / stale / corrupted / mixed-with-non-lock files; assert correct categorization + `recoveryCommand` for staleness)
  - Implementation: [`packages/cli/src/lock-discipline.mjs`](../../packages/cli/src/lock-discipline.mjs), [`tests/cli-lock-discipline.test.js`](../../tests/cli-lock-discipline.test.js)
  - _Requirements: addresses post-PR-31 finding; design §6.9; HC-9 logic ready for Task 37 to consume_
- [x] 23.11 Cross-reference rot audit + missing-ADR backfill from research base (post-PR-31 audit campaign Part 3/4)
  - Retroactively added 2026-05-26. Exhaustive grep across the spec stack (~1087 cross-references). Findings: 2 reserved-but-never-written ADRs (0009 provenance + 0010 raw-transcripts — both decisions shipped 2026-05-22, files never created); 1 cite-vs-status drift on FR-28/29/30 + NFR-9 (defined in `requirements-revisions-proposed.md` whose status header said "Proposed, awaiting user approval" while design.md cited as approved); 1 self-correction (my PR-A claim that ADR-0008 was mis-cited was wrong — the ADR title compounds bank-airgap + pluggable-compressor; the citations were correct).
- [x] 23.11.1 Backfill ADR-0009 from research-base evidence (provenance frontmatter — FR-29 + design §6.6 + `provenance.mjs`; evidence in `requirements-revisions-proposed.md` + `basic-memory-deep-dive.md`)
- [x] 23.11.2 Backfill ADR-0010 from research-base evidence (raw transcripts preserved indefinitely — FR-28 + design §6.5; evidence in `requirements-revisions-proposed.md` + `SOURCES.md` Storage-Is-Not-Memory paper)
- [x] 23.11.3 Update `requirements-revisions-proposed.md` status header to reflect approval state; add cross-pointer from `requirements.md` head so readers know where FR-28+ live
- [x] 23.11.4 Update `docs/adr/README.md` index with 0009/0010/0011 rows + meta-note explaining the "reserved + shipped" backfill case
- [x] 23.11.5 CLAUDE.md "primary-source verification" rule extended: internal cross-references (ADR-X / §X.Y / FR-N / Task NN) subject to same primary-source check as external citations
- _Requirements: addresses post-PR-31 finding; campaign §"Audit findings" in journey log; PR-D's `validate-references.mjs` will enforce structurally_

- [x] 23.12 Enforcement validators 1/2 — `validate-exit-doors.mjs` + `validate-references.mjs` (post-PR-31 audit campaign Part 4/7) _shipped 2026-05-26, PR #35, commit 059b2e1_
  - PR-D originally one PR ("Part 4 of 5"); split mid-flight 2026-05-26 into D1 (this work) + D2 after the in-session scope audit surfaced realistic-session-budget as an unanticipated category — second firing of the campaign-rule "open another PR rather than bundle if audit surfaces an unanticipated category". Documentation: journey log §"PR-D mid-flight split" subsection.
- [x] 23.12.1 `scripts/validate-exit-doors.mjs` NEW — enforces design §17.1 `@doors:` annotation discipline (header presence + silent-omission check). Warning mode by default; `CMK_DOORS_STRICT=1` promotes to errors. PR-D2b flips the default to strict.
- [x] 23.12.2 `scripts/validate-references.mjs` NEW — internal-reference rot scanner. Resolves `[label](path)`, `ADR-NNNN`, `§N.N` (within design.md), `FR-N`, `NFR-N`, `Task N`. Skips fenced code blocks + inline-code spans + `docs/research/` + `docs/sources/` + `docs/conversation-log/`. Strict mode.
- [x] 23.12.3 4 real link-rot fixes the references validator surfaced on first run: `docs/journey/v0.1.0-build-log.md` × 2 (`../../SOURCES.md` → `../SOURCES.md`), `docs/SOURCES.md` (`specs/v0.1.0/design.md` → `../specs/v0.1.0/design.md`), `specs/v0.1.0/design.md` × 2 (Cursor's external `FR-013` / `FR-052` wrapped in backticks since validator skips inline-code spans).
- [x] 23.12.4 `package.json` — `npm test` prerun extended (after `validate-test-ids` + `validate-template`, before `vitest run`); standalone scripts `lint:exit-doors` + `lint:references`.
- [x] 23.12.5 `CLAUDE.md` "Prose rules vs enforcement (binding)" section NEW — formalizes structural-rule-gets-validator vs judgment-rule-stays-prose split; inventories existing + planned validators; includes Adoption-verification sub-rule (audit-note template).
- [x] 23.12.6 `design.md` §17.7 "Enforcement validators for §17 disciplines" NEW — source-of-truth table mapping each §17 discipline to its validator (or "judgment rule, stays prose").
- [x] 23.12.7 Skill-experiment audit notes (Adoption-verification template applied): `lint-and-validate` not helpful (mismatch with kit's stack); `javascript-testing-patterns` neutral (existing test patterns stronger than defaults). Documented in PR-D1 journey log entry.
- [x] 23.12.8 PR-D1 journey log entry + PR-D mid-flight split subsection + 10th cross-trigger-question instance + campaign-rule-fires-twice subdiscipline + stress-gate sub-rule for live-Haiku jitter class. Durability follow-up commit `72d6d19` on the PR-D1 branch (meta-documentation extracted after the main commit).
- _Requirements: design §17.1, §17.7; CLAUDE.md "Internal cross-references" rule (10th verification rule from PR-C); CLAUDE.md "Prose rules vs enforcement" section_

- [x] 23.13 Enforcement validators 2/2 — spawn-discipline + numbering-gaps + composition + validator-self-tests + D1 deferrals + §17.7 update (post-PR-31 audit campaign Part 5/7) _shipped 2026-05-27, PR #36, commit `0602af5`_
  - PR-D2 split proactively 2026-05-27 into D2a (this task; validator code) + D2b (rollout) — third firing of the campaign-rule and first PROACTIVE one (pre-launch scope audit, not mid-flight crisis). Documentation: journey log §"PR-D2 proactive split" subsection. **What shipped in PR-D2a**: 3 new validators + 38 fixture-driven self-tests (covers all 7 validators including pre-existing) + 7 D1 deferrals + 2 IMPs caught by holistic code-review + CLAUDE.md composition-rule addressing-artifact fixes caught by `validate-composition.mjs` on its first run + `CMK_VALIDATOR_ROOT` env override for sandbox testability. Suite grew 775 → 814 tests, 30 → 37 test files. Stress gate met 5/5 first run.
- [x] 23.13.1 `scripts/validate-spawn-discipline.mjs` NEW — every spawn site in `packages/cli/src/` + `plugin/bin/` either passes `timeout:` in options, OR has `// spawn-discipline: caller-managed <ref>` marker, OR has `// spawn-discipline: ignore <reason>` marker. Wrapper convention (`this._spawn(...)`) is detected; regex.exec / array.exec false-positives are excluded via negative-lookbehind. Both kit production spawn sites now annotated: `compressor.mjs:212` `caller-managed terminateSubprocess + setTimeout`; `capture-turn.mjs:140` `ignore detached-fire-and-forget`. Source rule: composition-verification instance #4 (PR-A subprocess timeout). Strict mode.
- [x] 23.13.2 `scripts/validate-numbering-gaps.mjs` NEW — ADR / FR / NFR / Task ID sequences either have no gaps OR have an explicit `reserved` / `TODO` / `placeholder` / `not-yet` / `tail-appended` marker in the relevant file. Markers parsed case-insensitively, in both directions. Source rule: backfilled from PR-C's missing-ADR finding. Strict mode.
- [x] 23.13.3 `scripts/validate-composition.mjs` NEW — every documented composition-verification instance in CLAUDE.md's "Composition verification" rule references at least one addressing artifact (test file, design section, or reserved/v0.1.x marker). **Real finding caught on first run**: PR-14, PR-22, PR-25 instances lacked addressing-artifact references in CLAUDE.md (only PR-A had a design §8.5 pointer). Fixed by adding `addressed by tests/X.test.js + design §Y` clauses to each of the 4 instances. Source rule: composition-verification 4-instance pattern (PR-14 / PR-22 / PR-25 / PR-A). Strict mode.
- [x] 23.13.4 Validator-self-tests: `tests/scripts-validate-test-ids.test.js` (4 cases) + `tests/scripts-validate-template.test.js` (1 smoke test) + `tests/scripts-validate-exit-doors.test.js` (6 cases) + `tests/scripts-validate-references.test.js` (7 cases) + `tests/scripts-validate-spawn-discipline.test.js` (8 cases) + `tests/scripts-validate-numbering-gaps.test.js` (6 cases) + `tests/scripts-validate-composition.test.js` (6 cases). **Total: 38 fixture-driven self-tests, all passing.** Added `CMK_VALIDATOR_ROOT` env override to 3 validators (validate-numbering-gaps + validate-references + validate-composition) for sandboxed testability — defaults to `scripts/`'s parent when unset.
- [x] 23.13.5 7 D1 deferrals (from PR #35 holistic code-review pass; labels addressable):
  - [x] **D1-IMP-A**: `validate-references.mjs` fenced-code-block tracking → handle multi-length fences (length-tracked: opener of length N closes only on fence of length >= N; nested shorter fences are example content). Shipped with the same-character constraint (a longer fence-character variant could be added if v0.1.x needs it).
  - [x] **D1-IMP-B**: `validate-references.mjs` heading-anchor check → on undefined slugs (target outside `mdFiles`), emit one-line debug note when an anchor is present so silent skip is auditable. Gated behind `CMK_REFS_DEBUG=1` (quiet by default; surfaceable when needed).
  - [x] **D1-MIN-A**: `validate-references.mjs:51` stripped unused `posix` import.
  - [x] **D1-MIN-B**: `validate-references.mjs:64` dropped dead `|| skip.has(entry.name)` branch.
  - [x] **D1-MIN-C**: `validate-exit-doors.mjs:83` bare-line `@doors:` regex constraint documented in header docblock.
  - [x] **D1-MIN-D**: `validate-exit-doors.mjs:130` `@doors-ignore`-literal-in-prose false-suppress risk documented.
  - [x] **D1-MIN-E**: `validate-references.mjs` FR/NFR indexer leading-zero expectation documented; normalization deliberately rejected (would coerce Cursor's `FR-052` → kit `FR-52`).
- [x] 23.13.6 `design.md` §17.7 updated — the section was rewritten in PR-D2a (not just a footnote): the table now reflects the current state with `validate-spawn-discipline.mjs` / `validate-numbering-gaps.mjs` / `validate-composition.mjs` all marked Strict, and `validate-exit-doors.mjs` mode-row updated to reference "PR-D2b annotation pass" rather than the stale "PR-D" naming. No "not yet shipped" footnote needed because the table is now self-documenting.
- _Requirements: PR-D1 deferrals labels; design §17.1, §17.7; composition-verification 4-instance pattern; CLAUDE.md "Prose rules vs enforcement"_

- [x] 23.14 Annotation rollout + class-5 audit + capture-turn observability + strict-mode flip + campaign wrap-up (post-PR-31 audit campaign Part 6/7) _shipped 2026-05-27, PR #37, commit `2e72730`_
  - PR-D2b coheres around "rollout + final discipline pass". **What shipped**: 27 test files annotated (all 37 kit test files now carry `@doors:` headers); class-5 audit confirmed door coverage was already adequate; `capture-turn.mjs` spawn-failed observability fix closes PR-A's class-1 deferral via `phase: 'spawn'` discriminator in `extract.log` + 3 new test cases pinning all 3 failure paths + 1 negative case; `validate-exit-doors` strict mode is the default (`CMK_DOORS_STRICT` env var retired; `@doors-ignore` per-file marker is the escape valve); `auto-extract.mjs` sets `phase: 'extract'` explicitly for schema symmetry; campaign wrap-up journey-log entry covers both PR-D2a + PR-D2b. Suite grew 814 → 817 tests; stress 5/5 first run. Only PR-E (Part 7/7) remains.
- [x] 23.14.1 `// @doors:` annotation pass on all 27 currently-unannotated test files. Each file got a per-door declared/N-A reasoning block matching design §17.1's format. All 37 kit test files now annotated (30 production + 7 PR-D2a validator self-tests). Classification done file-by-file based on actual door surface (Door 1 always present; Door 2 where the test asserts on disk state; Door 3 where the test pins subprocess invocation args or runs a real-binary spawn; Door 4 only on auto-extract / capture-turn IPC boundary; Door 5 where the test asserts on NDJSON log entries).
- [x] 23.14.2 Class-5 exit-doors audit. Per the annotation pass, Door 4 applies only to `cli-auto-extract.test.js` + `cli-capture-turn.test.js` (the auto-extract temp-file IPC boundary). Door 5 applies to the tests that exercise NDJSON-log writes: `cli-forget`, `cli-trust`, `cli-memory-write`, `cli-poison-guard-log`, `cli-inject-context`, `cli-compress-session`, AND `cli-capture-turn` (newly applicable post-23.14.3 below). All annotations include explicit N/A reasoning where doors don't apply. No latent missing-assertion gaps surfaced — door coverage was already adequate where the rule-shape applied; the annotation pass formalized the coverage map.
- [x] 23.14.3 `capture-turn.mjs` spawn-failed observability fix (closes PR-A class-1 audit deferral). Design decision: `phase: 'spawn'` discriminator in `extract.log` (auto-extract's existing log surface, no new file). New helper `writeSpawnLogEntry({projectRoot, ts, reason, error})` appends an NDJSON entry to `<projectRoot>/context/sessions/{date}.extract.log` with shape `{ts, phase: 'spawn', success: false, error_category: 'spawn_failed', reason, error?}`. Wired into `captureTurn()` between spawn-attempt and return — fires only on `spawned: false` (no path / missing path / spawn throw). Logging failure itself surfaces to stderr and does not crash the hook. 3 new test cases in `cli-capture-turn.test.js` "spawn-failed observability (Task 23.14.3)" describe block pin all 3 failure paths + the negative case (no log when spawn succeeds).
- [x] 23.14.4 `validate-exit-doors` strict mode is now the default. Removed the `STRICT` const + the `process.env.CMK_DOORS_STRICT === '1'` opt-in + the warning-mode code paths. The per-file `// @doors-ignore` marker is the only escape valve (none used in the current kit corpus). `design §17.7` table row updated to reflect the new default. Self-test `tests/scripts-validate-exit-doors.test.js` updated — replaced the warn-vs-strict-mode case pair with a single "FAILS when @doors header is missing" case + a new "FAILS on silent omission" case covering doors 3/4/5 omission paths.
- [x] 23.14.5 Campaign wrap-up journey-log entry written. Single entry "Post-PR-31 audit campaign Part 5/7 + 6/7 (2026-05-27, PR-D2a + PR-D2b)" covers both PRs (D2a's commit `0602af5` didn't touch the journey log — this entry covers D2a retroactively as part of D2b's wrap-up). Includes meta-observations on the campaign as a whole (campaign-rule-fires-N-times pattern; methodology refactor mid-campaign). PR-E appends its own platform-discipline post-mortem on top in Part 7/7.
- _Requirements: design §17.1; PR-A's structural deferral on capture-turn observability; campaign §"Resume criteria for Task 25"_

- [x] 23.15 Cross-platform discipline sweep (post-PR-31 audit campaign Part 7/7; **v0.1.0 release blocker**) _shipped 2026-05-27, PR #38, commit `d74d5e0`_
  - PR-E. Full scope inlined in journey-log §"PR-E §full-scope" subsection. Surfaced by PR-B's `recoveryCommand` finding — first firing of the campaign-rule. **What shipped**: `platform-commands.mjs` 3-primitive helper + `validate-platform-commands.mjs` strict-mode validator + 15 new tests (8 unit + 7 self-test) + `lock-discipline.mjs` refactored to delegate (PR-B's inline switch removed) + CLAUDE.md 10th binding meta-rule + design §18 (6 sub-sections) + HC-10 in HEALTH-CHECKS.md + design §14 "Nine→Ten" updated + campaign close retrospective in journey log. Suite grew 817 → 832 tests across 37 → 39 files. Stress 5/5 first run. **Campaign closed (7/7 PRs); Task 25 now unblocked.**
- [x] 23.15.1 `scripts/validate-platform-commands.mjs` NEW — scans `packages/cli/src/` + `plugin/bin/` for hardcoded POSIX-command tokens (`rm "..."`, `mkdir "..."`, `ls "..."`, etc. — 8 patterns). Three pass conditions per match: file imports from `./platform-commands.mjs` (helper-in-scope), per-line `// platform-commands: ignore <reason>` marker, or no match. Strict mode. 7 fixture-driven self-test cases pin the validator's heuristic against intentional violations + suppression paths + Node-API false-positives (e.g., `mkdirSync`) + comment-only mentions.
- [x] 23.15.2 `packages/cli/src/platform-commands.mjs` NEW — shared helper with 3 primitives (`removeFile`, `removeDir`, `listDir`) returning copy-paste-ready commands in the user's native shell. `PLATFORM` constant exported. 8 unit-test cases pin both branches (Windows: `Remove-Item / Remove-Item -Recurse -Force / Get-ChildItem`; POSIX: `rm / rm -rf / ls`) + shape invariants (non-empty, quoted path). `lock-discipline.mjs`'s `recoveryCommandFor` refactored to delegate to `removeFile` — eliminates the inline `process.platform === 'win32'` switch PR-B established.
- [x] 23.15.3 CLAUDE.md 10th binding meta-rule "Cross-platform command discipline (binding)" added — names the failure mode (Windows user on cmd.exe + POSIX command = "command not found"), the discipline (programmatic → helper or marker; docs → reviewer discipline), the validator, and the campaign-rule-fires-third-time provenance (PR-B surfaced the class; PR-E generalized it).
- [x] 23.15.4 `design.md §18` NEW "Cross-platform command discipline" — full section covering the rule + the helper + the validator + doc-side emission policy + the `.sh` audit finding (§18.5) + the live-test plan (§18.6).
- [x] 23.15.5 Spot-check on Windows PowerShell (the development platform) — `removeFile / removeDir / listDir` emit documented PowerShell forms. **macOS + Linux verification deferred to install-time** (when a user installs on those platforms, the helper's POSIX branch is exercised on every `recoveryCommand` emission). v0.1.x candidate: GitHub Actions cross-OS matrix. Test coverage also includes the lock-discipline + platform-commands unit tests + validator self-test, all sandboxed.
- [x] 23.15.6 HC-10 added to `HEALTH-CHECKS.md` — platform-aware-emissions mismatch check. Non-fatal informational. Repair path documents running `node scripts/validate-platform-commands.mjs` to identify offending sites.
- [x] 23.15.7 `.sh → .mjs` migration audit — `plugin/bin/auto-extract-memory.sh` is confirmed legacy (Task 23 shipped `cmk-auto-extract.mjs`; no tests reference the .sh). However, ~14 doc references remain (README / ARCHITECTURE / plugin/README / plugin/skills/bootstrap/SKILL / plugin/context-template/SETUP / install.sh+ps1 / design.md / requirements.md / docs/adr/0011 / conversation-log). **v0.1.x cleanup** (not blocking v0.1.0): remove the .sh + update the doc references. Decision deferred from PR-E because the .sh is dead code (not a runtime hazard) and the cleanup is spread across 14 files — would dilute the cross-platform-discipline review surface. Documented in design §18.5.
- _Requirements: PR-B's `recoveryCommand` finding; design §17.7 entry "Planned: validate-platform-commands"; v0.1.0 release blocker per Lior runs all three OSes_

### Post-PR-31 audit campaign tracker (single source of truth)

| Part | Task | Status |
| --- | --- | --- |
| 1/7 | **23.9** (subprocess timeout) | **MERGED** (PR #32) |
| 2/7 | **23.10** (lock-file discipline) | **MERGED** (PR #33) |
| 3/7 | **23.11** (cross-reference rot + ADR backfill) | **MERGED** (PR #34) |
| 4/7 | **23.12** (validators 1/2 — exit-doors + references) | **MERGED** (PR #35) |
| 5/7 | **23.13** (validators 2/2 — spawn-discipline + numbering-gaps + composition + self-tests + D1 deferrals) | **MERGED** (PR #36) |
| 6/7 | **23.14** (annotation rollout + class-5 audit + capture-turn fix + strict-mode flip + wrap-up) | **MERGED** (PR #37) |
| 7/7 | **23.15** (cross-platform discipline sweep) | **MERGED** (PR #38); campaign closed |

**Campaign rules** (apply to any future multi-PR campaign): see CLAUDE.md "Engineering discipline" → campaign-rules section.

**Detailed narrative + per-PR retrospectives**: `docs/journey/v0.1.0-build-log.md` §"Post-PR-31 audit campaign tracker".

- [ ] 24. `memory-write` skill + Poison_Guard (T-021)
  - Estimate: L · Depends: 7, 9, 12, 13
  - **High-risk surface — individual PR review required** via the `code-review-excellence` skill. The Poison_Guard regex filter is the kit's last line of defense against secrets being committed to git via auto-extracted facts. False negatives = credentials in the repo. False positives = legitimate writes blocked. Pattern correctness has to be right. Review before merge
- [x] 24.1 Implement trigger-phrase auto-invocation
  - Phrases from design §6.3; inferred action (`add` / `replace` / `remove`). SKILL.md rewritten 2026-05-26 against Anthropic primary source — trigger phrases moved from `description` to `when_to_use` per the verified spec; body restructured for "state what to do" conciseness (62 lines → 30).
- [x] 24.2 Implement `add` action
  - Validates → Poison_Guard → consolidates if needed → writes bullet or fact
- [x] 24.3 Implement `replace` action
  - Substring-match against canonical text; new ID computed; old observation marked `superseded_by`
- [x] 24.4 Implement `remove` action
  - Delegates to tombstone flow (task 9); ALWAYS prompts for confirmation
- [x] 24.5 Implement Poison_Guard regex filter
  - Secret patterns + injection patterns per design §6.7; reject before any write reaches disk
- [x] 24.6 Implement Poison_Guard logging (redacted)
  - Append to `.locks/poison-guard.log` (NDJSON); match text masked with `***`; user-visible rejection identifies category without echoing text
- [x]* 24.7 Write unit tests for memory-write + Poison_Guard
  - Test each trigger phrase invokes skill with documented action
  - Test `add` with each Poison_Guard pattern category (secret samples + injection samples): rejected with `error_category: "poison_guard"`; log has redacted line
  - Test `add` with clean text: bullet appears in MEMORY.md with provenance
  - Test `remove` flow: matches existing → mocked auto-yes → invokes task 9 tombstone path
  - Test `replace` flow: substring match → new ID → old observation `superseded_by` → both in archive
  - Test user-visible rejection identifies category (e.g., "secret") without echoing matched text
  - _Requirements: FR-10, FR-11, FR-29; design §6.3, §6.5, §6.7_

- [x] 25. Conflict queue + `cmk queue conflicts` resolver (T-022) _shipped 2026-05-27, PR #39, commit `a0a5aa5`_
  - First post-campaign PR. All 6 sub-tasks delivered. One documented limitation: `merge-both` invokes `mergeFacts` which can't operate on the un-materialized proposed bullet (cross-layer Layer-2/Layer-3 gap — 5th composition-verification instance, surfaced in CLAUDE.md). Task 25b (scratchpad-level merger) addresses the gap with a Layer-3 merge primitive. Suite grew 832 → 855 tests across 39 → 40 files.
- [x] 25.1 Implemented similarity detection at write time — `detectConflicts({newText, newTrust, scratchpadPath, sectionTitle, similarityFn?, similarityThreshold?})` in `packages/cli/src/conflict-queue.mjs`. Walks existing bullets in the same scratchpad+section, finds the highest-similarity candidate, routes by trust comparison (queue if new.trust < existing.trust; supersede otherwise). Injectable `similarityFn` hook for v0.1.x FTS5 integration. Hooked into `memory-write.mjs` `doAdd` before `appendBulletGuarded`.
- [x] 25.2 Substring-match fallback — `tokenJaccardSimilarity(a, b)` (lowercase, split on punctuation+whitespace, Jaccard on token sets). Default threshold 0.5 for the substring backend (calibrated empirically; the Jaccard threshold differs from the semantic 0.85 because lexical similarity under-reports semantic similarity). Audit-log entry records `similarity_backend: 'substring' | 'custom'` so v0.1.x can compare backends.
- [x] 25.3 Conflict-routing implemented — `writeConflictEntry({...})` appends a structured entry to `<tierRoot>/queues/conflicts.md` with `conflicts_with` / `existing_text` / `existing_trust` / `new_trust` / `similarity` / `similarity_backend` / `detected_at` / `resolution: pending` fields. First write seeds the file with `# Conflicts queue` header. Per-write audit-log entry with `reasonCode: CONFLICT_QUEUED` (added to `audit-log.mjs` REASON_CODES).
- [x] 25.4 Interactive resolver — `resolveConflictQueue({tier, projectRoot, userDir, prompter, mergeFn})` walks pending entries one-at-a-time. Wired through `cmk queue conflicts` via `runQueueDispatch` in `subcommands.mjs` with a readline-based prompter that accepts `keep-old` / `keep-new` / `merge-both` / `skip`. Re-prompts on unknown answers. CLI scaffold test updated with `NON_STUB_CHILDREN` allowlist (the parent `queue` stays stubbed for `review` per Task 26).
- [x] 25.5 merge-both wired to `mergeFacts({tier, projectRoot, userDir, idA: existingId, idB: proposedId})` — invoked by the CLI's `mergeFn` callback on `merge-both` decisions. The module's `mergeFn` parameter is injectable for test stubbing.
- [x]* 25.6 Unit tests — `tests/cli-conflict-queue.test.js` (24 cases): Jaccard semantics (6) + `detectConflicts` (7 covering queue/supersede/no-conflict/injected-fn/error paths) + `writeConflictEntry` (3 covering first-write/append/audit-log) + `resolveConflictQueue` (8 covering empty/keep-old/keep-new/skip/merge-both/idempotency/audit-log/prompter-error). All passing.
  - _Requirements: FR-10, FR-29; design §6.8_

- [x] 25b. Scratchpad-level merger (closes Task 25's merge-both composition gap; 5th composition-verification instance) _shipped 2026-05-27, PR #40, commit `b3c28fa`_
  - Layer-3 `mergeScratchpadBullets` ships end-to-end merge-both UX. KNOWN LIMITATION block removed from `subcommands.mjs`. 5th composition-verification instance is now resolved-with-artifact. **Bonus**: caught + fixed Task 25's latent `generateId` named-args bug; added the missing memory-write→queue integration test that would have caught it originally. Suite grew 855 → 866 tests.
- [x] 25b.1 New export `mergeScratchpadBullets({tier, projectRoot, userDir, scratchpadPath, section?, idA, idB, separator?, now?})` in `packages/cli/src/conflict-queue.mjs`. Combines two bullet texts with `" | "` separator (identical texts collapse), generates a fresh canonical ID via `generateId(tier, combinedText)` (note: positional args; Task 25 had a latent bug with named-args usage in memory-write — fixed in this PR), writes the new bullet with provenance `source: merge-both, merged_from: [idA, idB], merged_at: <ISO>, trust: max(trustA, trustB)`. Section is auto-discovered from idA's location when caller doesn't pass it explicitly (the CLI resolver path doesn't store section in queue entries).
- [x] 25b.2 Both originals' provenance comments mutated via `injectSupersededBy(commentLine, newId)` — appends `, superseded_by: <newId>` to the existing provenance comment body, or replaces an existing `superseded_by:` if one is already present. Bullets stay in MEMORY.md (not tombstoned — supersede is lighter than `forget`).
- [x] 25b.3 `runQueueConflicts.mergeFn` in `subcommands.mjs` rewired to `mergeScratchpadBullets` with default scratchpad `<projectRoot>/context/MEMORY.md`. Section auto-discovered from the existing bullet's location. KNOWN LIMITATION comment block removed.
- [x] 25b.4 `design §6.8` updated with concrete `merge-both` semantics (7 numbered steps) + named "5th composition-verification instance, closed by Task 25b" tail.
- [x] 25b.5 CLAUDE.md 5th composition-verification instance closed — text updated from "v0.1.x followup" to "addressed by Task 25b's `mergeScratchpadBullets` Layer-3 merger".
- [x]* 25b.6 Unit tests — `tests/cli-conflict-queue.test.js` extended with 8 cases for `mergeScratchpadBullets` (combine + separator / supersede mutation on both / max-trust pick / audit-log shape / idA-not-found / scratchpad-missing / schema-error on missing fields / section auto-discovery). 32 total cases in the file; all passing.
  - **Bonus fix shipped in this PR**: Task 25's `memory-write.mjs` had a latent bug calling `generateId({text, tier})` as named-args when the canonicalize signature is positional `generateId(tier, text)`. Caught while implementing the merger; fixed in the same commit. The bug was dormant in tests because Task 25's conflict-queue tests called `writeConflictEntry` directly with hardcoded IDs rather than exercising the memory-write→queue route.
  - _Requirements: design §3.4 + §6.8; closes CLAUDE.md 5th composition-verification instance_

- [x] 26. Review queue + `cmk queue review` resolver (T-023) _shipped 2026-05-27, PR #42_
  - Estimate: M · Depends: 23, 24.
- [x] 26.1 Medium-trust routing in auto-extract output handler — **already shipped in Task 23's `routeMedium`** (`packages/cli/src/auto-extract.mjs:397`). Candidate appended to `<projectRoot>/context/queues/review.md` with `<!-- proposed_trust: medium, write: auto-extract, at: <ts> -->` provenance; canonical MEMORY.md untouched. Task 26 inherits this routing as-is; the new work is the resolver (26.2-26.4).
- [x] 26.2 `cmk queue review` interactive resolver — `resolveReviewQueue({tier, projectRoot, userDir, prompter, scratchpad?, section?})` in `packages/cli/src/review-queue.mjs`. Walks pending entries one-at-a-time; on each, the caller-supplied `prompter` returns `'promote'` / `'discard'` / `'skip'`. Wired through `cmk queue review` via `runQueueReview` in `subcommands.mjs` with a readline-based interactive prompter; re-prompts on unknown answers. CLI scaffold test updated with `queue/review` in `NON_STUB_CHILDREN`.
- [x] 26.3 `promote` path — delegates to `memoryWrite({action: 'add', trust: 'high', source: 'review-promote', text, ...})`. Removes the entry from review.md by rebuilding the file with `serializeReviewQueue` (kept-entries only). Audit-log entry with `reasonCode: REVIEW_PROMOTED`. If `memoryWrite` errors (e.g., Poison_Guard rejection), the entry is KEPT in the queue so the user can re-resolve; error is reported back through the `errors` array on the result.
- [x] 26.4 `discard` path — removes entry from review.md (same file-rebuild as promote). Audit-log entry with `reasonCode: REVIEW_DISCARDED`, `action: 'discarded'`, `extra: {decision: 'discard', from_queue: 'review', original_ts}`.
- [x]* 26.5 Unit tests — `tests/cli-review-queue.test.js` (13 cases): `parseReviewQueue` (4 covering empty/single/multiple/malformed) + `resolveReviewQueue` (8 covering empty-queue/promote/discard/skip/audit-log-shape/idempotency/mixed-decisions/prompter-error) + 1 supersede-contract lock (the rewritten IMP-1 test — pins v0.1.0 promote-into-high-trust-similar behavior: both bullets coexist in MEMORY.md, no conflict-queue intercept, no `rerouted_to` audit marker; defensive `rerouted_to` code in `review-queue.mjs` stays as future-compat for v0.1.x auto-supersede mutation). All passing.
  - _Requirements: FR-10, FR-29; design §6.2_

- [x] 27. Checkpoint — Layer 4 (Hooks + auto-extract + skill) complete _shipped 2026-05-27, PR #43_
  - [x] All tests for tasks 1–26 green (890 tests / 42 files / 8 validators)
  - [x] End-to-end integration shape verified via the layer-wide review + per-module tests (true E2E in a real Claude Code session is a v0.1.0-release smoke deferred to Lior's local install + walkthrough; not gated on this checkpoint)
  - [x] **Layer-wide code review pass** via `code-review-excellence` ONE holistic pass across Tasks 17–26 (subagent report 2026-05-27). Surfaced 2 blocking + 4 important + 5 minor findings. All addressed:
    - **Blocking** B1 (Poison_Guard error shape missing `errors` field → CLI crash) + B2 (auto-extract not touching cooldown marker → ~2x Haiku cost) — both fixed inline in PR #43
    - **Important** I1 (.extract-*.tmp leak) + I2 (routeHigh discriminator fragility) + I3 (capturePrompt→captureTurn integration test) — all fixed inline; I4 (PostToolUse vs SessionEnd race) deferred to design §16.27 with two new honesty tests pinning the benign-outcome contract
    - **Minor** M2 (REASON_CODES enum use) + M3 (misleading comment) + M4 (defensive guard) — fixed inline; M1 (BULLET_LINE_RE consolidation) → §16.29; M5 (Windows grandchild reaping) → §16.28 with audited honest description (no "OS reaps eventually" lazy framing)
    - **Test gaps** — 4 of 6 closed with new tests (I3 integration, B2 cooldown composition, §16.27 honesty pair); 2 deferred as §16.30 (cmk-auto-extract.mjs bin-wrapper real-spawn) + §16.31 (cross-platform recoveryCommand runtime)
  - [x] Agent confirms zero failures + zero blocking review issues. 890 tests green, stress 5/5 first invocation. Layer 5 is OPTIONAL per the build plan — next-task choice is Layer 5 (search) OR skip to cross-cutting (Tasks 37-43).

---

## Layer 5 — Search (OPTIONAL)

> If deferred, task 25 falls back to substring match for conflict detection; `cmk search` is unavailable.

- [x] 28. SQLite + FTS5 schema + WAL config (T-024) _shipped 2026-05-27, PR #44_
  - Estimate: M · Depends: 2
- [x] 28.1 Implement `observations` table + indexes per design §9.1
- [x] 28.2 Implement FTS5 virtual table + sync triggers (external-content sentinel pattern; design §9.1 schema bug fixed in this PR)
- [x] 28.3 Implement `files` checkpoint table
- [x] 28.4 Configure WAL mode + synchronous=NORMAL pragmas
- [x]* 28.5 Write unit tests for SQLite schema — `tests/cli-index-db.test.js` (11 cases). All six tasks.md asserts covered + over-mutation guard + reopen idempotency.
  - _Requirements: FR-16; design §9.1_

- [x] 29. Reindex strategy (boot / runtime / recovery) (T-025) _shipped 2026-05-27, PR #47_
  - Estimate: M · Depends: 28
- [x] 29.1 Implement `cmk reindex --boot` — walks markdown via `listObservationSources`; diffs mtime/sha1 vs `files` table; re-indexes changed only
- [x] 29.2 Implement runtime file-watcher — chokidar v5 directory-watch with 500ms `awaitWriteFinish` debounce; per-extension filter in handlers (v5 dropped glob support; caught at self-review)
- [x] 29.3 Implement `cmk reindex --full` — DROPs observations/observations_fts/files + re-applies schema + walks all
- [x]* 29.4 Write unit tests for reindex — `tests/cli-index-rebuild.test.js` (11 cases): all 5 tasks.md asserts + over-mutation guard + chokidar v5 glob-drop regression + per-fact ADD watcher test + sequential composition (renamed from "concurrent" per code-review I3 honesty)
  - _Requirements: FR-16; design §9.2_

- [x] 30. `cmk search` hybrid CLI (T-026) _shipped 2026-05-27, PR #48_
  - Estimate: M · Depends: 28, 29
- [x] 30.1 Implement keyword backend (FTS5 BM25) — trust-ordinal CASE, since-epoch-ms filter, tombstoned default-excluded, typed FTS5ParseError class for grammar-violation queries
- [x] 30.2 Implement semantic backend stub (gated on memsearch+Milvus install) — errors with `ERROR_CATEGORIES.SEMANTIC_UNAVAILABLE` + clear "memsearch not installed" hint; CLI exits 2 (verified via in-process AND spawnSync tests)
- [x] 30.3 Implement hybrid mode (reciprocal-rank fusion 0.5/0.5) — exported `reciprocalRankFusion()` as a pure function; k=60 RRF constant; docs-missing-from-one-backend contribute 0
- [x] 30.4 Implement filter flags: `--min-trust`, `--tier`, `--since`, `--limit`, `--include-tombstoned`
- [x]* 30.5 Write unit tests for `cmk search` — `tests/cli-search.test.js` (25 cases): 7 tasks.md acceptance criteria + FTS5 parse-error class (3) + CLI spawnSync exit-2 + reindex→search composition + RRF unit (2) + schema validation (6) + extras
  - _Requirements: FR-16, FR-17, FR-18, FR-30; design §9.3 (return shape clarified)_

- [x] 31. MCP server with 6 tools (stdio transport) (T-027) _shipped 2026-05-28, PR #49_
  - Estimate: L · Depends: 28, 29, 30
  - **High-risk surface — individual PR review required** via the `code-review-excellence` skill. Two-pass code-review caught B1 (mk_remember accepted:true on queue route — same composition class as Task 25→25b) + B2 (missing tasks.md 31.6 #2/#6 tests) + I1-I4 + M1-M2 — all fixed inline. §16.39-42 v0.1.x candidates documented.
- [x] 31.1 Implement stdio JSON-RPC transport per MCP 2025-06-18 spec — @modelcontextprotocol/sdk@1.29.0 handles framing; newline-delimited; stdout pure
- [x] 31.2 Implement path-traversal validation — `validatePath` helper rejects `..`, `%2e%2e`, `%2f`, absolute paths outside kit roots (defensive readiness — no v0.1.0 tool accepts user paths; §16.42 covers the JSON-RPC -32602 mapping for v0.1.x's first path-accepting tool)
- [x] 31.3 Implement `mk_search`, `mk_get`, `mk_timeline`, `mk_cite`
- [x] 31.4 Implement `mk_remember`, `mk_recent_activity` (mk_remember: v0.1.0 tier-P-only + cites-not-yet-supported guards per §16.39 + §16.40)
- [x] 31.5 Implement logging-to-stderr discipline — no console.log in mcp-server.mjs OR transitively-imported modules (verified by audit); §16.41 candidate for structural validator
- [x]* 31.6 Write unit tests for MCP server — `tests/cli-mcp-server.test.js` (29 cases): 5 of 6 acceptance criteria covered (path-traversal-JSON-RPC mapping deferred to §16.42 since no v0.1.0 tool accepts user paths); plus validatePath × 6, tool registration, each tool × 2-3, B1/I1/I2 contract locks
  - _Requirements: FR-26, NFR-6; design §10_

- [x] 32. Checkpoint — Layer 5 (Search) complete _shipped 2026-05-28, PR #50_
  - [x] All tests for tasks 1–31 green (963 / 46 / 8 validators)
  - [x] End-to-end shape verified — Task 30's reindexFull→search integration test (`cli-search.test.js:374-432`) + Task 31's MCP CLI integration tests (`cli-mcp-server.test.js:388-557`) jointly pin "index built → `cmk search` returns ranked hits → MCP server handles all 6 tools via stdio" per the checkpoint criterion
  - [x] **Layer-wide code review pass** via `code-review-excellence` skill across Tasks 28-31 (subagent report 2026-05-28). Zero blocking; one Important (L5-I1: validatePath shared-module drift — using inline `homedir() + '/.claude-memory-kit'` instead of `resolveTierRoot({tier:'U'})`) **fixed inline** in this PR. L5-I2 already tracked as §16.34. 4 Minor findings → all already-tracked v0.1.x candidates OR stylistic-only (none new).
  - [x] Agent confirms zero failures + zero blocking review issues. 963 tests / 46 files / 8 validators green; stress 5/5 first invocation. Layer 5 closed; next: Task 33 (Layer 6 — daily distill cron, OPTIONAL).

---

## Layer 6 — Cron compression (OPTIONAL)

> If deferred, task 35 (lazy compression fallback) covers no-cron environments.

- [x] 33. Daily distill cron (T-028) _shipped 2026-05-28, PR #51_
  - Estimate: M · Depends: 22, 23
  - **Pre-implementation: read [`docs/research/2026-05-25-claude-remember-code-dive.md`](../../docs/research/2026-05-25-claude-remember-code-dive.md)** for absorbed patterns — NDC compression structure (now.md → today-YYYY-MM-DD.md after 1h cooldown), 60-80% compression-target norm, background subshell with `set +e`, per-stage `noclobber` lock at `.locks/ndc.lock`, post-success truncation of `now.md`. **License caveat:** write our own prompt + code from scratch; the technique is absorbable but the implementation is under their Community License (see SOURCES.md).
- [x] 33.1 Implement `scripts/run-daily-distill.sh`
  - Reads last 7 days of `today-*.md`; writes fresh `sessions/recent.md`
  - Shipped as [`packages/cli/src/daily-distill.mjs`](../../packages/cli/src/daily-distill.mjs) (public `dailyDistill({projectRoot, backend, now, cooldownMs?, maxOutputBytes?})`) + [`packages/cli/bin/cmk-daily-distill.mjs`](../../packages/cli/bin/cmk-daily-distill.mjs) bin wrapper. Composes on `cooldown.mjs` (touch on success + error) + NDJSON `{date}.distill.log` per design §8.6.1.
- [x] 33.2 Implement `scripts/register-crons` (idempotent across platforms) — Linux cron + macOS launchd + Windows Task Scheduler
  - **Original plan (pre-2026-05-28)**: `python scripts/register-crons.py`. Python was the assumed language because the predecessor product (claude-remember) used a Python register script.
  - **Implementation pivot 2026-05-28 (Lior + Claude joint decision)**: `scripts/register-crons.mjs` in Node.js. Python option NOT removed from the spec history because the decision rationale matters and future contributors may need to understand WHY the language differs from claude-remember.
  - **Why Node, not Python**:
    1. **No new toolchain**. The kit is already Node-only. Adding Python means new install dep, new test infrastructure (pytest), new cross-platform concerns (Python install paths differ across Win/Mac/Linux), new validator surface.
    2. **Existing kit modules are Node**. `register-crons` shells out to the platform-native scheduler commands (crontab / launchctl / schtasks); the Node `child_process.spawnSync` handles this exactly the way the kit's other modules already do.
    3. **Tests fit existing surface**. vitest tests can spawn `node scripts/register-crons.mjs --dry-run` and assert output without bringing pytest.
    4. **Single-language deploy**. v0.1.0 ships as one npm package; users `npm install -g @claude-memory-kit/cli` and have everything. Adding Python would force users to also install Python (or the kit to bundle it — much larger).
  - **Cross-platform mapping**:
    - macOS: write `~/Library/LaunchAgents/com.cmk.daily-distill.plist` + `launchctl load`
    - Linux: `crontab -l | (grep -v cmk-daily ; echo "...") | crontab -` (pipe pattern for idempotency)
    - Windows: `schtasks /Create /TN cmk-daily-distill /SC DAILY /TR "..."` with `/F` flag for idempotent re-creates
  - **Option A confirmed 2026-05-28 (Lior)**: v0.1.0 ships full cross-platform (Linux + macOS + Windows). "I need it to work on Windows and Mac out of the box, so adding Linux is a small thing." Task 35 (lazy fallback) is still the documented escape hatch for no-cron environments; both ship.
  - Shipped as [`packages/cli/src/register-crons.mjs`](../../packages/cli/src/register-crons.mjs) with `registerCron` / `unregisterCron` / `detectPlatform` exports. Linux uses `crontab -l | grep -v ... | crontab -` pipe pattern, macOS uses `~/Library/LaunchAgents/com.cmk.cmk-daily-distill.plist` + `launchctl bootstrap`, Windows uses `schtasks /Create /F` (`/F` flag is the idempotency primitive). All `spawnSync` sites carry `timeout: 10_000` per spawn-discipline rule. B2 fix: Windows `/TR` injects with `command.replace(/"/g, '\\"')` to avoid malformed nested quotes on paths with spaces.
- [x] 33.3 Honor 120 s Haiku cooldown; defer + retry on next cron fire
  - Shipped via `cooldown.mjs` composition in `dailyDistill`: check at start (returns `skipped: cooldown` if active), touch on both success + error so a crashed Haiku call still rotates the cooldown marker.
- [x]* 33.4 Write unit tests for daily distill
  - Test fixture with 7 days of `today-*.md`: script produces single `recent.md` with compressed consolidation
  - Test `register-crons` idempotency: re-run adds no duplicate entries (platform-specific check via `--dry-run`)
  - Test cooldown active: script exits `skipped: cooldown`; no output
  - Test 0 `today-*.md` files: script exits 0 cleanly; recent.md unchanged
  - Shipped 21 tests across [`tests/cli-daily-distill.test.js`](../../tests/cli-daily-distill.test.js) (9 cases) + [`tests/cli-register-crons.test.js`](../../tests/cli-register-crons.test.js) (12 cases). Stress 5/5 first invocation on `task-33-daily-distill` branch.
  - _Requirements: FR-19; design §1.4, §8.1_

- [ ] 34. Weekly curate cron (T-029)
  - Estimate: M · Depends: 10, 33
  - **Pre-implementation: read [`docs/research/2026-05-25-claude-remember-code-dive.md`](../../docs/research/2026-05-25-claude-remember-code-dive.md)** for absorbed patterns — single-pass two-stage consolidation prompt (Step 1: each `today-*.md` → ONE entry in recent.md with 2-4-sentence body; Step 2: rotate entries older than 3 days into archive.md grouped by `## Week of YYYY-MM-DD` with 3-5 sentences/week), delimited response format (`===RECENT===` / `===ARCHIVE===`) with graceful-degradation fallback, token caps (600 recent / 400 archive), `.done.md` rename for processed staging files (audit retention, never delete), per-stage `noclobber` lock. **License caveat:** write our own prompt from scratch — claude-remember's prompt text is under Community License and is creative expression (the technique is absorbable, the text is not).
- [x] 34.1 Implement `scripts/run-weekly-curate.sh`
  - Moves `today-*.md` >7d into `archive.md` (appended); deletes originals
  - Shipped as [`packages/cli/src/weekly-curate.mjs`](../../packages/cli/src/weekly-curate.mjs) (public `weeklyCurate({projectRoot, backend, now, cooldownMs?, archiveMaxBytes?, recentMaxBytes?, skipRecentRebuild?})`) + [`packages/cli/bin/cmk-weekly-curate.mjs`](../../packages/cli/bin/cmk-weekly-curate.mjs) bin wrapper. Per design §8.7.1. Deletes (not `.done.md` rename) because the in-repo memory model commits today-*.md to git; `git log` is the audit trail.
- [x] 34.2 Merge high-similarity bullets across days via task 10
  - Records `merged_from` correctly
  - Shipped as the `dedupBullets()` pure-function pass in `weekly-curate.mjs` that runs after Haiku's output. Uses Task 5's `canonicalize` primitive (which Task 10's `mergeFacts` itself uses) to detect canonical-equal bullets across days; collapses duplicates with `<!-- merged_from: ['YYYY-MM-DD', ...] -->` comment lines. The v0.1.0 reading of "via task 10": today-*.md bullets have no per-bullet ids, so Task 10's fact-file `mergeFacts` API isn't the right tool; we reuse the dedup heuristic at the scratchpad bullet level. Looser semantic-similarity dedup remains Haiku's responsibility per the prompt.
- [x] 34.3 Rebuild `recent.md` from current week's files
  - Shipped via inline `dailyDistill({cooldownMs: 0, ...})` call from `weeklyCurate` after the archive step. Per design §8.7.2 composition (cooldownMs=0 override because both Haiku calls belong to a single curate cycle).
- [x]* 34.4 Write unit tests for weekly curate
  - Test fixture with 14 days of files: first 7 moved chronologically to `archive.md`; originals deleted; recent week untouched
  - Test bullets across days with similarity > 0.85: merged via task 10's canonicalize primitive; `merged_from` populated correctly
  - Test `recent.md` rebuilt from current 7 days
  - Test idempotency: second run is no-op (archive doesn't grow further)
  - Shipped 18 tests in [`tests/cli-weekly-curate.test.js`](../../tests/cli-weekly-curate.test.js): boundary (3) + skip paths (2) + #1 archive+delete (2) + #2 dedup (2) + #3 recent rebuild (2) + #4 idempotency (1) + Door-5 NDJSON observability (2) + dedupBullets pure-function unit tests (4).
  - _Requirements: FR-19, FR-21; design §1.4, §8.1, §8.7_

- [x] 35. Lazy compression fallback for no-cron envs (T-030) _shipped 2026-05-28, PR #53_
  - Estimate: S · Depends: 18, 23
- [x] 35.1 Implement SessionStart-side staleness detector
  - Checks `recent.md` mtime vs. cron schedule
  - Shipped as `detectStaleness({projectRoot, now, dailyTtlMs?, weeklyTtlMs?})` in [`packages/cli/src/lazy-compress.mjs`](../../packages/cli/src/lazy-compress.mjs). Cheap (<5ms) inline check: stat recent.md, check today-*.md ages by date stamp (not mtime — robust to fs touch drift). Returns `'fresh' | 'stale-daily' | 'stale-weekly' | 'cron-active' | 'no-context-dir'`. Per design §8.2.2.
- [x] 35.2 Implement `cmk compress --lazy` detached spawn
  - Runs T-028 or T-029 work depending on what's stale
  - Shipped as `runLazyCompress` in [`packages/cli/src/lazy-compress.mjs`](../../packages/cli/src/lazy-compress.mjs) (delegates to `dailyDistill` when only daily is stale, `weeklyCurate` when weekly is stale) + [`packages/cli/bin/cmk-compress-lazy.mjs`](../../packages/cli/bin/cmk-compress-lazy.mjs) bin wrapper + `cmk compress --lazy` subcommand in `subcommands.mjs`. Detached spawn fires from `inject-context.mjs` (SessionStart hook) via `spawn('cmk-compress-lazy', [], {detached: true, stdio: 'ignore', shell: true, unref()})` — same fire-and-forget posture as capture-turn's auto-extract spawn (Task 23). NFR-1 500ms budget held (staleness check ~5ms; spawn doesn't block the return).
- [x] 35.3 Implement cron-detection sentinel
  - If `.locks/cron-registered` exists: skip + log `skipped: cron-active`
  - Shipped as `markCronRegistered` / `unmarkCronRegistered` / `cronSentinelPath` helpers in [`packages/cli/src/lazy-compress.mjs`](../../packages/cli/src/lazy-compress.mjs). `runRegisterCrons` in subcommands.mjs writes the sentinel after at least one successful registration; `--unregister` removes it. `detectStaleness` checks sentinel as the first guard (cron-active takes precedence over all staleness verdicts). Sentinel skip is logged to `.locks/lazy-compress.log` NDJSON.
- [x]* 35.4 Write unit tests for lazy compression fallback
  - Test SessionStart with stale `recent.md` (mtime 8d): `cmk compress --lazy` spawned; SessionStart hook still returns within 500 ms
  - Test SessionStart with fresh `recent.md`: no spawn
  - Test `cmk compress --lazy` runs daily-distill work when only daily is stale, weekly-curate work when weekly is stale
  - Test with cron-registered sentinel: lazy detector exits `skipped: cron-active`
  - Shipped 22 tests in [`tests/cli-lazy-compress.test.js`](../../tests/cli-lazy-compress.test.js): detectStaleness branches (cron-active short-circuit / no-context-dir / weekly precedence / daily / fresh — 9 cases) + runLazyCompress (boundary / cron-active / daily delegation / weekly delegation / fresh / Door 5 NDJSON — 7 cases) + inject-context spawn integration via testSpawnLazy dependency injection (35.4 #1 + #2 + #4 — 3 cases) + duplicates for completeness.
  - _Requirements: FR-19; design §8.2.1, §8.2.2_

- [ ] 36. Checkpoint — Layer 6 (Cron + Lazy) complete _(skip if Layer 6 deferred)_
  - All tests for tasks 1–35 green
  - Cron registration idempotent on all 3 OSes
  - Agent confirms zero failures before cross-cutting layer

---

## Cross-cutting

- [ ] 37. `cmk doctor` health checks HC-1..HC-9 (T-031)
  - Estimate: M · Depends: 3
- [ ] 37.1 Implement HC-1..HC-7 from design §14
  - memsearch installed; hooks registered; distill freshness; transcripts firing; INDEX consistency; cron registered; memsearch backend reachable
- [ ] 37.2 Implement HC-8 — native Anthropic Auto Memory detector
  - Inspect `~/.claude/projects/<slug>/memory/`; log to `.locks/native-memory-status.log`
- [ ] 37.2a Implement HC-9 — stale lock file detection
  - Call `detectStaleLocks(projectRoot, {userDir})` from [`packages/cli/src/lock-discipline.mjs`](../../packages/cli/src/lock-discipline.mjs) (shipped in PR-B per design §6.9); for each entry with `stale: true` surface the `recoveryCommand` in the diagnostic report. Non-fatal — report-only.
- [ ] 37.3 Implement structured report output (per-check pass/fail/skip)
- [ ] 37.4 Wire repair-command suggestions on failure
- [ ] 37.5 Prompt user before invoking any install-requiring repair
- [ ]* 37.6 Write unit tests for `cmk doctor`
  - Test all 9 HCs run in order; report line per check (`PASS` / `FAIL` / `SKIP`)
  - Test full run completes within 5 s on 10k-observation fixture
  - Test failed HC (e.g., HC-2 missing hook): repair command in stderr
  - Test HC-8 with `~/.claude/projects/<slug>/memory/` populated: log shows `active: true` + file count + last_modified
  - Test HC-8 with empty auto-memory dir: log shows `active: false`
  - Test HC-9 with a stale lock present: report includes the lock's `recoveryCommand` (the `lock-discipline.mjs` unit tests already pin the library; the doctor test pins the integration — that doctor invokes the library + surfaces the report correctly)
  - Test install-requiring repair: stub prompt; assert prompt shown before any install command
  - _Requirements: FR-22; design §14_

- [ ] 38. `cmk import-anthropic-memory` + `cmk transcripts extract` (T-032)
  - Estimate: M · Depends: 5, 24
  - Scope expanded 2026-05-24 (post-bootstrap-test): both subcommands live at the same boundary (the harness's `~/.claude/projects/<slug>/` directory), share filesystem discovery logic, and together cover the full "mine pre-kit conversation history" workflow. Per design §16.8.

### 38a. `cmk import-anthropic-memory` (Anthropic-managed `MEMORY.md` → kit MEMORY.md)

- [ ] 38.1 Read `~/.claude/projects/<current-slug>/memory/MEMORY.md`
- [ ] 38.2 Compute canonical IDs via task 5; dedup against existing project MEMORY.md
- [ ] 38.3 Propose additions with `write_source: imported`, `trust: medium`
- [ ] 38.4 Implement `--dry-run` and interactive confirmation modes
- [ ]* 38.5 Write unit tests for import bridge
  - Test `--dry-run` prints proposals; no file in `context/` modified (mtime check)
  - Test no-dry-run with mocked accept-all: every proposal applied with `write_source: imported`, `trust: medium`
  - Test duplicate detection: candidate with matching canonical ID skipped; audit.log has `skipped: duplicate`
  - Test missing source file: exit 0 cleanly with "no Anthropic auto-memory found"
  - _Requirements: FR-25; design §11.2_

### 38b. `cmk transcripts extract` (harness session jsonl → readable markdown)

Promotes the existing `scripts/extract-session-transcript.mjs` (kit-dev utility) to a user-facing CLI subcommand. Lets users mine months of pre-kit conversation history at `~/.claude/projects/<slug>/<uuid>.jsonl` into clean markdown corpora they can curate from.

- [ ] 38.6 Move filter logic from `scripts/extract-session-transcript.mjs` into `packages/cli/src/transcripts.mjs`
  - Public boundary: `extractTranscript({ inputPath, outputPath, includeThinking }) → { turnsKept, outputSize, errors }`
  - Same filters as the existing script: keep user + assistant text; drop tool_use/tool_result/thinking blocks (unless `--include-thinking`); strip `<system-reminder>`, `<command-name>`, `<ide_*>`, `<local-command-*>` annotations
- [ ] 38.7 Wire `cmk transcripts extract` subcommand in `subcommands.mjs`
  - Args / flags: `--session <uuid>` | `--slug <slug>` (with `--all` for every session in the slug) | `--since YYYY-MM-DD`
  - `--output <dir>` defaults to `<cwd>/transcripts-extracted/` (created if missing)
  - `--include-thinking` flag for the rare case the user wants the agent's internal reasoning
  - On invocation: discover sessions, run extractor for each, print summary (sessions processed, total turns kept, output size)
- [ ] 38.8 Implement session-discovery helper
  - `--session <uuid>`: resolve to a specific jsonl by uuid suffix match across all slugs (or fail with a clear list of close matches)
  - `--slug <slug> --all`: walk `~/.claude/projects/<slug>/*.jsonl`, extract each
  - `--since YYYY-MM-DD`: filter jsonls by mtime, walk matching ones
  - Skip the `memory/` subdirectory + the session-directory siblings (those are not session jsonls)
- [ ]* 38.9 Write unit tests for transcripts extraction
  - Test fixture jsonl (10 turns: user + assistant + tool_use + system_reminder mix) produces expected markdown (5 turns kept, filters applied)
  - Test `--include-thinking` retains thinking blocks; default drops them
  - Test session discovery: `--session <uuid>` resolves correctly; `--session <unknown>` exits non-zero with helpful error
  - Test `--slug <slug> --all` against a tempdir-mocked harness layout: processes N jsonls, skips `memory/` subdir
  - Test `--since YYYY-MM-DD` filters by mtime correctly
  - Test boundary: extractor never writes outside the configured output directory (no path traversal via filename in jsonl)
  - _Requirements: FR-25 (broadened to cover both Anthropic-MEMORY and harness-jsonl import paths); design §11, §16.8_

- [ ] 39. `cmk repair` + `cmk roll` (T-033)
  - Estimate: M · Depends: 17, 22, 28, 33
- [ ] 39.1 Implement `cmk repair --hooks`
  - Re-registers from `hooks.json` template; idempotent
- [ ] 39.2 Implement `cmk repair --locks`
  - Removes stale locks (>1 h old); preserves live locks
- [ ] 39.3 Implement `cmk repair --index`
  - Invokes `cmk reindex --full` (task 29)
- [ ] 39.4 Implement `cmk roll` with `--scope now|today|recent`
  - Invokes SessionEnd (task 22), daily-distill (task 33), or weekly-curate (task 34) internals on demand
- [ ] 39.5 Default `cmk roll` (no scope) to `--scope now`
- [ ]* 39.6 Write unit tests for repair + roll
  - Test `cmk repair` twice in a row: second run produces no file changes (mtime check)
  - Test `--locks`: fresh 30-min lock NOT removed; stale 2-h lock removed
  - Test `--hooks` re-registers all 6 hooks; subsequent run is no-op
  - Test `--index` invokes `cmk reindex --full`; row count parity verified
  - Test `cmk roll --scope today` invokes task 33 daily-distill path
  - Test `cmk roll --scope recent` invokes task 34 weekly-curate path
  - Test `cmk roll` default = `--scope now` (task 22 compress path)
  - _Requirements: FR-19, FR-22; design §8, §14_

- [ ] 40. Cross-OS install CI matrix (T-034)
  - Estimate: M · Depends: 3, 37
- [ ] 40.1 Author `.github/workflows/install-matrix.yml`
  - Triggers on `pull_request`; matrix: `windows-2022`, `macos-14`, `ubuntu-22.04`
- [ ] 40.2 Each OS job: `cmk install` in tempdir → `cmk doctor`
- [ ] 40.3 Compare checksums of scaffolded tree across OSes (artifact compare)
- [ ] 40.4 Fail PR check on checksum mismatch or any OS doctor failure
- [ ]* 40.5 Write CI workflow tests
  - Test YAML parses + triggers on `pull_request`
  - Test job matrix includes all 3 OSes
  - Test each job runs install + doctor in clean tempdir
  - Test checksums match across all 3 OSes (post-job artifact compare)
  - Test PR check fails on any OS producing a different checksum
  - Test PR check fails on any OS doctor failure
  - _Requirements: NFR-3; design §13_

- [ ] 41. Documentation: README + INSTALL + QUICKSTART (T-035)
  - Estimate: M · Depends: 3 through 37
- [ ] 41.1 Write top-level `README.md`
  - Pitch, three-tier diagram, install one-liner, links to specs/glossary
- [ ] 41.2 Write `INSTALL-{windows,macos,linux}.md`
  - Per design §13 install paths; OS-specific gotchas documented
- [ ] 41.3 Write `QUICKSTART.md`
  - install → first memory write → `cmk doctor` → first session walkthrough
- [ ] 41.4 Implement `scripts/test-quickstart.sh`
  - Parses QUICKSTART.md; runs every fenced bash block in a tempdir; asserts documented output
- [ ]* 41.5 Write docs verification tests
  - Test `scripts/test-quickstart.sh`: extracts every command from QUICKSTART.md; runs in tempdir; asserts documented output
  - Test each `INSTALL-<os>.md` works end-to-end on a CI runner of matching OS
  - Test README.md links: all relative links resolve; all external URLs return HTTP 200 (smoke)
  - Test manual user dry-run: log 2+ user test results in `docs/quickstart-test-log.md` before release (procedural, not automated)
  - _Requirements: FR-22, FR-23, FR-24; design §13_

- [ ] 42. Checkpoint — Cross-cutting (excluding release) complete
  - All tests for tasks 1–41 green
  - CI matrix green on all 3 OSes
  - `cmk doctor` reports green on fresh installs
  - Docs verified end-to-end
  - **Pre-release code review pass** via the `code-review-excellence` skill — final filter before the v0.1.0 release tag. Focus: anything missed at earlier layer reviews, ergonomics of the public CLI surface (`cmk` subcommand consistency), security surface review of the MCP server (Task 31, even if individually reviewed at PR time), `cmk doctor` health-check coverage. Output: blocking-issue list (must fix before release) + nice-to-have list (deferred to v0.1.x)
  - Agent confirms zero failures + zero blocking review issues before task 43 (release)

---

## Release

- [ ] 43. v0.1.0 release — version, CHANGELOG, npm publish, GitHub release (T-036)
  - Estimate: S · Depends: ALL prior tasks + checkpoint 42 + Task 45 (auto-persona — tail-appended 2026-05-24; logically gates this release)
- [ ] 43.1 Bump `package.json` to `0.1.0`
- [ ] 43.2 Write `CHANGELOG.md` entry for `[0.1.0] — YYYY-MM-DD`
- [ ] 43.3 Tag `v0.1.0` and push the tag
- [ ] 43.4 Publish `@claude-memory-kit/cli@0.1.0` to npm
- [ ] 43.5 Publish GitHub Release with CHANGELOG-derived notes
- [ ]* 43.6 Write release verification tests
  - Test `package.json` version equals `0.1.0` and matches latest git tag
  - Test CHANGELOG.md has `## [0.1.0] — YYYY-MM-DD` heading with non-empty body
  - Test GitHub Release exists for tag `v0.1.0` with body derived from CHANGELOG
  - Test on fresh CI runner: `npm install -g @claude-memory-kit/cli@0.1.0` exits 0; `cmk version` outputs `0.1.0`
  - _Requirements: NFR-2_

- [ ] 44. Checkpoint — v0.1.0 released
  - Final test suite green
  - Release published on npm + GitHub
  - Install verified from clean state on all 3 OSes
  - v0.1.0 is shipped

---

## Late v0.1.0 addition (promoted from §16 v0.1.x candidate on 2026-05-24)

> **Numbering note**: Task 45 is appended at the tail rather than slotted after Task 23 because mid-stream insertion would renumber Tasks 24-44. The numbering reflects authoring order, not execution order: Task 45 logically depends on Task 23 and must ship before Task 43 (release). The Task 43 release-task entry has been updated to add Task 45 to its `Depends:` list.

- [ ] 45. Auto-persona generation (T-014)
  - Estimate: L · Depends: 7, 12, 13, 22, 23, 34 · Must ship before Task 43 (release)
  - Uses shared modules from `packages/cli/src/{tier-paths,audit-log,frontmatter,result-shapes}.mjs` + scratchpad.mjs (Task 12) + provenance.mjs (Task 13). Consumes auto-extract output from Task 23. See design.md §16.16 for full motivation + design.
  - **Pre-implementation: read [`docs/research/2026-05-24-tencentdb-agent-memory.md`](../../docs/research/2026-05-24-tencentdb-agent-memory.md) (auto-persona-every-N-facts source pattern) + [`docs/research/2026-05-25-claude-remember-code-dive.md`](../../docs/research/2026-05-25-claude-remember-code-dive.md) (identity-candidates inline-surfacing pattern — architectural simplification, see 45.1 below).** License: TencentDB is MIT (port freely with attribution); claude-remember is Community License (absorb idea, write our own).
- [ ] 45.1 Implement persona-candidate surfacing — **two design choices**
  - **Design A (separate pipeline stage)**: `cmk persona generate` subcommand reads `<userDir>/memory/` + cross-project persona-tagged facts, synthesizes via `CompressorBackend` (default `HaikuViaAnthropicApi` per §8.3), outputs candidate updates staged at `<userDir>/queues/persona-review.md` with full provenance. Triggered manually or every-N-facts from auto-extract (Task 23). Honors 120s Haiku cooldown.
  - **Design B (inline in consolidator)**: piggyback on Task 34's weekly consolidation pass. The consolidator already runs the CompressorBackend over recent.md content; extend its prompt with a "Step 3: identity candidates" instruction that surfaces persona-relevant moments at the end of recent.md as `## Identity Candidates\n- IDENTITY CANDIDATE: <description>` bullets. Zero additional API calls. `cmk persona generate` becomes a thin wrapper that reads these candidates from recent.md and stages them in `queues/persona-review.md`. **Source:** claude-remember's actual implementation (see code-dive note §"Transition 3" + the Step 3 prompt fragment); architectural simplification worth pre-implementation decision.
  - **Decision deferred to implementation time** (after Task 34 ships and we see whether the consolidator's prompt budget has headroom for the extra instruction). Recommendation: try Design B first; fall back to Design A if the consolidator can't reliably surface candidates without hurting compression quality.
- [ ] 45.2 Implement `cmk persona accept <id>` / `cmk persona reject <id>` subcommands
  - `accept`: matched bullet promoted into target scratchpad via `appendScratchpadBullet` (Task 12) with `trust: high` (manual user-attestation)
  - `reject`: candidate removed from `queues/persona-review.md`; rejection recorded as an anti-signal fact in `<userDir>/memory/persona_rejections.md` (informs future syntheses — auto-extract sees the pattern and skips it)
  - Both write audit-log entries via `appendAuditEntry` per design §6.1
- [ ] 45.3 Implement auto-apply mode behind `--auto` flag and `settings.json` opt-in
  - `cmk persona generate --auto` writes directly to target scratchpad via `appendScratchpadBullet` with `trust: medium` (system-derived, not user-attested)
  - Per-scratchpad opt-in: `settings.json` key `persona.auto_apply: ["USER.md", "HABITS.md"]` lists which scratchpads accept auto-apply (default: empty array — explicit opt-in only)
  - One audit-log entry per change, including the source-fact ID(s) the synthesis was derived from
- [ ] 45.4 Conflict-with-hand-curated handling
  - When a proposed update conflicts with an existing `trust: high` entry (substring similarity >0.85 + different text), stage in `<userDir>/queues/persona-conflict.md` rather than silent overwrite
  - Consistent with design §6.2 conflict queue + §6.8 (memory-write conflict resolution; user resolves via `cmk queue conflicts`)
  - Never silently demote a `trust: high` hand-curated entry to make room for a system-generated proposal
- [ ]* 45.5 Write unit tests
  - Test `cmk persona generate` with mocked Haiku: produces candidate bullets in `persona-review.md` with provenance
  - Test `accept` promotes candidate to scratchpad at `trust: high`; audit log records the promotion
  - Test `reject` removes candidate from queue + writes rejection fact; audit log records
  - Test `--auto` mode writes directly at `trust: medium`; opt-in gating via settings.json enforced
  - Test conflict-with-hand-curated: high-trust entry NOT overwritten; candidate staged in `persona-conflict.md`
  - Test 120s Haiku cooldown honored
  - _Requirements: FR-3, FR-10, FR-29; design §16.16 + §6.2 + §8.3_

---

## Summary

| Layer | Parent tasks | Sub-tasks (incl. tests) | Checkpoints | Required? |
| --- | --- | --- | --- | --- |
| Layer 1 — Foundation | 5 (1–5) | ~25 | 1 (#6) | Yes |
| Layer 2 — Granular archive | 4 (7–10) | ~20 | 1 (#11) | Yes |
| Layer 3 — Scratchpads | 4 (12–15) | ~17 | 1 (#16) | Yes |
| Layer 4 — Hooks + auto-extract | 10 (17–26) | ~55 | 1 (#27) | Yes |
| Layer 5 — Search | 4 (28–31) | ~22 | 1 (#32) | Optional |
| Layer 6 — Cron compression | 3 (33–35) | ~13 | 1 (#36) | Optional |
| Cross-cutting | 5 (37–41) | ~28 (Task 38 expanded 2026-05-24 to cover transcripts extraction) | 1 (#42) | Yes |
| Release | 1 (43) | 6 | 1 (#44) | Yes |
| Late addition (auto-persona) | 1 (45) | 5 | — | Yes (promoted to v0.1.0 in-scope 2026-05-24) |

**45 numbered items at the top level** (37 implementation tasks + 8 checkpoints; Task 45 added 2026-05-24 as a tail-appended in-scope addition). **~185 sub-tasks** (implementation + test). Required-only path: ~55 dev-days (Task 45 estimated L). Full surface incl. optional: ~73 dev-days.

**Critical path**: 1 → 5 → 6 (checkpoint) → 7 → 10 → 11 → 12 → 13 → 16 → 17 → 18 → 21 → 23 → 24 → 26 → 27 → 37 → 41 → 42 → **45** → 43 → 44. Task 45 (auto-persona) inserts on the critical path between Checkpoint 42 and Release Task 43 despite its high task number — Task 45 depends on Task 23 (auto-extract) and must ship before the v0.1.0 release tag per the 2026-05-24 promotion decision.

## What's deliberately not in tasks.md (audit trail)

- MCP authentication token (declined 2026-05-23 as overengineering)
- `@modelcontextprotocol/sdk` named in task 31 implementation, not in design.md
- §4.1 trust hierarchy as a separate subsection (inline §4 default mapping suffices)
- Companion skills beyond `memory-write` + `bootstrap` — v0.3+
- `<ephemeral>` privacy tag — v0.1.x candidate
- External memory provider plugin slots (Honcho/Mem0/Hindsight) — v0.2
- Web viewer rich UI — v0.2
- IDE adapters (Cursor / Windsurf / Codex) — v0.2
- Cross-project search (`cmk search --all-projects`) — v0.2

## End of tasks.md v0.1.0

44 top-level items · ~180 sub-tasks · TDD throughout · boundary tests · checkpoints between layers · glossary reference.

Each parent task ships as a PR titled `[<task #>] <description>` (e.g., `[7] Per-fact file format + writer (T-006)`) with the task's sub-task checkboxes checked off in the PR description.
