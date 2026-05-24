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

- [ ] 17. `hooks.json` + 6-hook scaffold (T-014)
  - Estimate: S · Depends: 3
- [ ] 17.1 Ship `plugin/.claude-plugin/hooks/hooks.json` per design §5.1
  - All 6 hooks registered with documented matchers + timeouts
- [ ] 17.2 Ship `bin/cmk-<verb>` script stubs for each hook
  - Each prints "not yet implemented" and exits 0 with `{"continue": true}` JSON
- [ ]* 17.3 Write unit tests for hooks.json + stubs
  - Test `hooks.json` parses as valid JSON
  - Test all 6 hook events registered: `Setup`, `SessionStart`, `UserPromptSubmit`, `PostToolUse`, `Stop`, `SessionEnd`
  - Test PostToolUse has matcher `"Write|Edit|MultiEdit"`
  - Test each stub exists, is executable, exits 0 on dummy stdin
  - Test each stub's stdout parses as valid JSON containing `"continue": true`
  - _Requirements: FR-9; design §5.1_

- [ ] 18. `cmk-inject-context` — SessionStart hook (T-015)
  - Estimate: M · Depends: 14, 17
- [ ] 18.1 Implement 3-tier path discovery
  - Walks up from cwd to find project tier; resolves user tier via `$MEMORY_KIT_USER_DIR` or default
- [ ] 18.2 Read tiers in priority order (local → project → user)
  - Reads SOUL/USER/MEMORY/HABITS/LESSONS + INDEX files + latest today-*.md
- [ ] 18.3 Resolve duplicate IDs across tiers; log shadowed copies
  - Most-specific wins; shadowed → `context/.locks/shadowed_by.log` (NDJSON)
- [ ] 18.4 Exclude facts marked `private: true` from the emitted snapshot
- [ ] 18.5 Concatenate into ≤10 KB Frozen snapshot; truncate per documented priority on overflow
  - Drop lowest-tier-oldest first; log truncation events
- [ ] 18.6 Emit `additionalContext` JSON per hook protocol
  - `{"hookSpecificOutput": {"hookEventName": "SessionStart", "additionalContext": "..."}}`
- [ ]* 18.7 Write unit tests for SessionStart hook
  - Test on a 3-tier fixture project: output is valid JSON with the documented shape
  - Test assembled snapshot is ≤10 KB on the fixture
  - Test hook completes within 500 ms (timer assertion)
  - Test duplicate ID across project + user tier: project version wins; `shadowed_by.log` has the user-tier shadowing
  - Test oversized snapshot scenario: output truncated; lowest-tier-oldest dropped first; truncation event logged
  - Test fact with `private: true` containing sentinel `__PRIVATE_FACT_SENTINEL__`: sentinel does NOT appear in emitted additionalContext (grep)
  - _Requirements: FR-7, FR-9; design §1.4, §5.2, §7.1_

- [ ] 19. `cmk-capture-prompt` — UserPromptSubmit hook (T-016)
  - Estimate: S · Depends: 17
- [ ] 19.1 Strip `<private>...</private>` blocks before any disk write
  - Replace with `[private content redacted]`; literal "private content" NEVER on disk
- [ ] 19.2 Preserve `<retain>...</retain>` tags for the Stop-hook downstream
- [ ] 19.3 Append cleaned prompt to `context/transcripts/{YYYY-MM-DD}.md`
  - Timestamp + role marker per documented format
- [ ]* 19.4 Write unit tests for UserPromptSubmit hook
  - Test prompt with `<private>SENTINEL_STRING</private>`: transcript has `[private content redacted]`; grep for SENTINEL_STRING in `context/` returns 0 hits
  - Test prompt with `<retain>important</retain>`: transcript preserves the `<retain>` tags verbatim
  - Test prompt without privacy tags: transcript contains prompt verbatim with timestamp + role marker
  - Test hook returns `{"continue": true}` within 100 ms (timer assertion)
  - Test malformed stdin JSON: hook exits 0, logs error to stderr
  - _Requirements: FR-15; design §5.2, §6.6_

- [ ] 20. `cmk-observe-edit` — PostToolUse hook (T-017)
  - Estimate: S · Depends: 17
- [ ] 20.1 Filter to only Write/Edit/MultiEdit (matcher already in hooks.json)
  - Handler defensive-checks tool_name even though matcher should block first
- [ ] 20.2 Threshold check on output line count (>50 lines)
  - Below threshold: hook exits with no-op
- [ ] 20.3 Append one-line summary to `sessions/now.md` (detached fire-and-forget)
  - Returns within 50 ms; the append work runs in the spawned subprocess
- [ ]* 20.4 Write unit tests for PostToolUse hook
  - Test invocation with 51-line Write output: `sessions/now.md` gets one summary line
  - Test invocation with 49-line Write output: `now.md` unchanged
  - Test invocation with `tool_name: "Read"`: matcher blocks at hooks.json level (integration test with stub that crashes-on-invocation)
  - Test handler returns `{"continue": true}` within 50 ms
  - Test parent termination: kill parent mid-append; summary line still lands in `now.md` (mtime watch)
  - _Requirements: FR-9; design §5.2, §1.4_

- [ ] 21. `cmk-capture-turn` — Stop hook + `stop_hook_active` guard + spawn auto-extract (T-018)
  - Estimate: M · Depends: 17, 19
- [ ] 21.1 Implement `stop_hook_active` guard at handler top
  - Payload with `stop_hook_active: true` → exit immediately with `{"continue": true}`; no spawn
- [ ] 21.2 Append assistant turn to `transcripts/{date}.md`
  - Strip `<private>`, preserve `<retain>` (parallel to task 19)
- [ ] 21.3 Spawn detached auto-extract subprocess (Unix)
  - `</dev/null >/dev/null 2>&1 & disown` pattern per claude-remember
- [ ] 21.4 Spawn detached auto-extract subprocess (Windows)
  - Node `child_process.spawn(..., {detached: true, stdio: 'ignore'})`; unref()
- [ ] 21.5 Return `{"continue": true}` within 50 ms after spawn
- [ ]* 21.6 Write unit tests for Stop hook
  - Test payload with `stop_hook_active: true`: hook exits 0; auto-extract lock file NOT created (proves no spawn)
  - Test `stop_hook_active: false`: lock file created; transcript appended
  - Test `stop_hook_active` absent: same as false
  - Test hook returns within 50 ms even when spawned subagent is slow
  - Test transcript captures `<retain>important</retain>` verbatim; `<private>secret</private>` replaced
  - Test parent kill: spawn stub subagent that writes sentinel after 2 s; kill parent at 100 ms; assert sentinel appears after 2 s (detach proof)
  - _Requirements: FR-9, FR-10, FR-15; design §5.2, §5.2.1, §6.6_

- [ ] 22. `cmk-compress-session` — SessionEnd hook (T-019)
  - Estimate: M · Depends: 17, 23
- [ ] 22.1 Read `sessions/now.md`; no-op if empty
- [ ] 22.2 Invoke CompressorBackend (task 23 ships Haiku impl)
  - Result written to `sessions/today-{YYYY-MM-DD}.md` (create or append for same day)
- [ ] 22.3 Truncate `now.md` to 0 bytes on success
- [ ] 22.4 Honor 120 s Haiku cooldown
  - If `last-haiku-call.ts` mtime within cooldown: skip + log `skipped: cooldown`
- [ ] 22.5 On compression failure: leave `now.md` intact, log error, exit 0 (non-fatal)
- [ ]* 22.6 Write unit tests for SessionEnd hook
  - Test non-empty `now.md` invokes mocked backend; output written to `today-{date}.md`
  - Test empty `now.md`: backend NOT invoked; hook exits 0
  - Test existing same-day `today-{date}.md`: new content appended (not overwriting)
  - Test successful compression: `now.md` truncated to 0 bytes
  - Test backend error: `now.md` untouched; error logged with category; exit 0
  - Test cooldown active: backend NOT invoked; `skipped: cooldown` logged
  - _Requirements: FR-19, FR-20; design §1.4, §8.1, §8.3_

- [ ] 23. Auto-extract subagent + CompressorBackend Haiku impl (T-020)
  - Estimate: L · Depends: 5, 7, 12, 13
  - **High-risk surface — individual PR review required** via the `code-review-excellence` skill. This task spawns external subprocesses, holds lock files, writes NDJSON logs to disk, and routes facts by trust level. Lots of edge cases. Review before merge, not deferred to the Layer 4 checkpoint review at #27
- [ ] 23.1 Implement `auto-extract-memory.sh` (Unix) and Node equivalent (Windows)
  - Reads just-captured turn from a temp file; spawns `claude --print` with documented flags
- [ ] 23.2 Implement extraction prompt for sub-Claude
  - Six writing triggers per design §6.4; output schema constrained
- [ ] 23.3 Implement trust-routing of sub-Claude output
  - `high` → memory-write (canonical), `medium` → `queues/review.md`, `low` → discard + log
- [ ] 23.4 Implement lock-file guard at `context/.locks/auto-extract.lock`
  - `set -o noclobber` pattern per claude-remember; second invocation exits without spawn
- [ ] 23.5 Implement NDJSON logging to `sessions/{date}.extract.log`
  - One line per invocation per design §6.1 schema
- [ ] 23.6 Implement `HaikuViaAnthropicApi` CompressorBackend
  - Conforms to CompressorBackend interface from design §8.3; used by task 22 + Layer 6
- [ ]* 23.7 Write unit tests for auto-extract + Haiku backend
  - Test with mocked Haiku returning 1 high-trust candidate: written to canonical MEMORY.md via memory-write
  - Test with mocked Haiku returning 1 medium-trust candidate: in `queues/review.md`; canonical unchanged
  - Test with low-trust candidate: discarded; extract.log has `skipped: nothing_durable`
  - Test lock file present: second invocation exits with `error_category: "concurrent_run"`, no spawn
  - Test mocked Haiku non-zero exit: extract.log has `success: false`, `error_category` populated; hook exits 0
  - Test NDJSON line matches design §6.1 schema (ts, success, error_category, observation_count, skipped_reason, duration_ms)
  - _Requirements: FR-10, FR-12, FR-13; design §6.1, §6.2, §8.3_

- [ ] 24. `memory-write` skill + Poison_Guard (T-021)
  - Estimate: L · Depends: 7, 9, 12, 13
  - **High-risk surface — individual PR review required** via the `code-review-excellence` skill. The Poison_Guard regex filter is the kit's last line of defense against secrets being committed to git via auto-extracted facts. False negatives = credentials in the repo. False positives = legitimate writes blocked. Pattern correctness has to be right. Review before merge
- [ ] 24.1 Implement trigger-phrase auto-invocation
  - Phrases from design §6.3; inferred action (`add` / `replace` / `remove`)
- [ ] 24.2 Implement `add` action
  - Validates → Poison_Guard → consolidates if needed → writes bullet or fact
- [ ] 24.3 Implement `replace` action
  - Substring-match against canonical text; new ID computed; old observation marked `superseded_by`
- [ ] 24.4 Implement `remove` action
  - Delegates to tombstone flow (task 9); ALWAYS prompts for confirmation
- [ ] 24.5 Implement Poison_Guard regex filter
  - Secret patterns + injection patterns per design §6.7; reject before any write reaches disk
- [ ] 24.6 Implement Poison_Guard logging (redacted)
  - Append to `.locks/poison-guard.log` (NDJSON); match text masked with `***`; user-visible rejection identifies category without echoing text
- [ ]* 24.7 Write unit tests for memory-write + Poison_Guard
  - Test each trigger phrase invokes skill with documented action
  - Test `add` with each Poison_Guard pattern category (secret samples + injection samples): rejected with `error_category: "poison_guard"`; log has redacted line
  - Test `add` with clean text: bullet appears in MEMORY.md with provenance
  - Test `remove` flow: matches existing → mocked auto-yes → invokes task 9 tombstone path
  - Test `replace` flow: substring match → new ID → old observation `superseded_by` → both in archive
  - Test user-visible rejection identifies category (e.g., "secret") without echoing matched text
  - _Requirements: FR-10, FR-11, FR-29; design §6.3, §6.5, §6.7_

- [ ] 25. Conflict queue + `cmk queue conflicts` resolver (T-022)
  - Estimate: M · Depends: 24; optional dep on 28 (FTS5)
- [ ] 25.1 Implement similarity detection at write time
  - On every `memory-write add`: compare new vs. existing observations on same heading_path
- [ ] 25.2 Implement substring-match fallback when Layer 5 not installed
  - Logs `similarity_backend: "substring"` to audit.log
- [ ] 25.3 Implement conflict-routing
  - similarity > 0.85 + content differs + new.trust < existing.trust → `queues/conflicts.md`
- [ ] 25.4 Implement `cmk queue conflicts` interactive resolver
  - Walks pending one-at-a-time; accepts `keep-old` / `keep-new` / `merge-both` / `skip`
- [ ] 25.5 Wire `merge-both` to task 10 mergeFacts
- [ ]* 25.6 Write unit tests for conflict queue
  - Test add with similarity > 0.85 + content differs + lower trust: routed to `conflicts.md`; canonical unchanged
  - Test add with similarity > 0.85 + same-or-higher trust: canonical updated; existing marked `superseded_by`
  - Test add with similarity < 0.85: no conflict; routed to canonical normally
  - Test fallback: Layer 5 not installed → substring match used; audit.log records backend name
  - Test `cmk queue conflicts` shows pending; accepts all 4 actions; applies atomically
  - Test `merge-both` invokes task 10 merge and produces a single canonical observation citing both originals
  - _Requirements: FR-10, FR-29; design §6.8_

- [ ] 26. Review queue + `cmk queue review` resolver (T-023)
  - Estimate: M · Depends: 23, 24
- [ ] 26.1 Implement medium-trust routing in auto-extract output handler
  - Candidate appended to `queues/review.md` with full provenance; canonical untouched
- [ ] 26.2 Implement `cmk queue review` interactive resolver
  - Walks pending one-at-a-time; accepts `promote` / `discard` / `skip`
- [ ] 26.3 Implement `promote` path
  - Invokes memory-write `add` with `trust: high`; removes entry from review.md
- [ ] 26.4 Implement `discard` path
  - Removes entry from review.md; appends `audit.log` entry with `action: "review_discard"`
- [ ]* 26.5 Write unit tests for review queue
  - Test medium-trust auto-extract output: candidate in `queues/review.md` with provenance; canonical MEMORY.md unchanged
  - Test `cmk queue review` walks entries one-at-a-time
  - Test `promote`: candidate written to canonical with `trust: high`; removed from review.md
  - Test `discard`: candidate removed; audit.log line with `action: "review_discard"`
  - Test `skip`: candidate remains; no audit.log entry
  - _Requirements: FR-10, FR-29; design §6.2_

- [ ] 27. Checkpoint — Layer 4 (Hooks + auto-extract + skill) complete
  - All tests for tasks 1–26 green
  - End-to-end: session starts → snapshot injected → user prompts trigger memory-write → Poison_Guard catches fake API key → review queue surfaces medium-trust output → conflict routed
  - **Layer-wide code review pass** via the `code-review-excellence` skill across Tasks 17–26. **The most important review of the project** — Layer 4 has the heaviest interaction surface (six hooks + auto-extract subagent + memory-write skill + Poison_Guard + conflict/review queues). Focus: coupling between hooks, race conditions in subprocess spawning, security regex correctness, audit-log uniformity across the new write paths, error-handling consistency. Note that Tasks 23 (auto-extract) and 24 (memory-write + Poison_Guard) should already have had individual PR reviews; this is the cross-task layer review on top
  - Agent confirms zero failures + zero blocking review issues before Layer 5 (or skipping to cross-cutting if Layer 5 deferred)

---

## Layer 5 — Search (OPTIONAL)

> If deferred, task 25 falls back to substring match for conflict detection; `cmk search` is unavailable.

- [ ] 28. SQLite + FTS5 schema + WAL config (T-024)
  - Estimate: M · Depends: 2
- [ ] 28.1 Implement `observations` table + indexes per design §9.1
- [ ] 28.2 Implement FTS5 virtual table + sync triggers
- [ ] 28.3 Implement `files` checkpoint table
- [ ] 28.4 Configure WAL mode + synchronous=NORMAL pragmas
- [ ]* 28.5 Write unit tests for SQLite schema
  - Test `cmk reindex --boot` creates `memory.db` with all documented tables/indexes (inspect via `sqlite_master`)
  - Test FTS5 virtual table exists with documented columns
  - Test PRAGMA `journal_mode` == `wal`; `synchronous` == `NORMAL`
  - Test insert into `observations`: FTS5 mirror row created via trigger
  - Test update on `observations.body`: FTS5 mirror updated via trigger
  - Test delete from `observations`: FTS5 mirror row deleted via trigger
  - _Requirements: FR-16; design §9.1_

- [ ] 29. Reindex strategy (boot / runtime / recovery) (T-025)
  - Estimate: M · Depends: 28
- [ ] 29.1 Implement `cmk reindex --boot`
  - Walks markdown; diffs mtime/sha1 vs `files` table; re-indexes changed only
- [ ] 29.2 Implement runtime file-watcher
  - `chokidar` with 500 ms debounce
- [ ] 29.3 Implement `cmk reindex --full`
  - Drops DB; rebuilds from markdown
- [ ]* 29.4 Write unit tests for reindex
  - Test `--boot` with no changes: 0 files re-indexed; timer <200 ms
  - Test `--boot` after editing one fact: only that file re-indexed
  - Test runtime watcher: touch a file; FTS5 reflects within 1 s
  - Test `--full`: drops DB; walks all markdown; row count == markdown fact count
  - Test concurrent writers (one `--boot` + one runtime): no errors, no duplicate rows
  - _Requirements: FR-16; design §9.2_

- [ ] 30. `cmk search` hybrid CLI (T-026)
  - Estimate: M · Depends: 28, 29
- [ ] 30.1 Implement keyword backend (FTS5 BM25)
- [ ] 30.2 Implement semantic backend stub (gated on memsearch+Milvus install)
  - Clear error + exit 2 when not installed (NO silent fallback)
- [ ] 30.3 Implement hybrid mode (reciprocal-rank fusion 0.5/0.5)
- [ ] 30.4 Implement filter flags: `--min-trust`, `--tier`, `--since`, `--limit`, `--include-tombstoned`
- [ ]* 30.5 Write unit tests for `cmk search`
  - Test keyword on 10k-observation fixture: results in <100 ms
  - Test `--mode semantic` without Layer 5b: exit 2; stderr contains "memsearch not installed"
  - Test `--mode hybrid` with both mocked: reciprocal-rank fusion (0.5/0.5)
  - Test `--min-trust medium` excludes low-trust results
  - Test `--tier P` excludes user/local results
  - Test `--since 2026-05-01` excludes older observations
  - Test tombstoned excluded by default; included with `--include-tombstoned`
  - _Requirements: FR-16, FR-17, FR-18, FR-30; design §9.3_

- [ ] 31. MCP server with 6 tools (stdio transport) (T-027)
  - Estimate: L · Depends: 28, 29, 30
  - **High-risk surface — individual PR review required** via the `code-review-excellence` skill. MCP is a protocol implementation + a security boundary (stdio with path-traversal validation on every read/write). Subtle bugs in JSON-RPC framing, newline handling, or path validation can introduce real CVEs. Review before merge
- [ ] 31.1 Implement stdio JSON-RPC transport per MCP 2025-06-18 spec
  - newline-delimited; no embedded newlines; stdout for messages only
- [ ] 31.2 Implement path-traversal validation
  - Reject `..`, URL-encoded traversal (`%2e%2e`), any path outside `<repo>/context/` or `<repo>/context.local/` or `~/.claude-memory-kit/`
- [ ] 31.3 Implement `mk_search`, `mk_get`, `mk_timeline`, `mk_cite`
- [ ] 31.4 Implement `mk_remember`, `mk_recent_activity`
- [ ] 31.5 Implement logging-to-stderr discipline
  - All logs to stderr (or `sessions/{date}.mcp.log`); stdout pure
- [ ]* 31.6 Write unit tests for MCP server
  - Test `cmk mcp serve` reads valid `initialize` request from stdin → responds with valid `InitializeResult` on stdout
  - Test stdout-purity: send 10 requests; stdout has exactly 10 JSON-RPC lines, no other content
  - Test newline-delimited: split-on-newline yields valid JSON per line; no embedded newlines
  - Test path traversal: arg with `..`, `%2e%2e`, or `/etc/passwd` → JSON-RPC error `code: -32602`
  - Test each of the 6 tools returns documented response shape on valid input
  - Test malformed JSON-RPC input → JSON-RPC parse error `code: -32700`; server keeps running
  - _Requirements: FR-26, NFR-6; design §10_

- [ ] 32. Checkpoint — Layer 5 (Search) complete _(skip if Layer 5 deferred)_
  - All tests for tasks 1–31 green
  - End-to-end: index built → `cmk search` returns ranked hits → MCP server handles all 6 tools via stdio
  - Agent confirms zero failures before Layer 6 (or skipping to cross-cutting if Layer 6 deferred)

---

## Layer 6 — Cron compression (OPTIONAL)

> If deferred, task 35 (lazy compression fallback) covers no-cron environments.

- [ ] 33. Daily distill cron (T-028)
  - Estimate: M · Depends: 22, 23
- [ ] 33.1 Implement `scripts/run-daily-distill.sh`
  - Reads last 7 days of `today-*.md`; writes fresh `sessions/recent.md`
- [ ] 33.2 Implement `python scripts/register-crons.py` (idempotent across platforms)
  - macOS launchd, Linux cron, Windows Task Scheduler
- [ ] 33.3 Honor 120 s Haiku cooldown; defer + retry on next cron fire
- [ ]* 33.4 Write unit tests for daily distill
  - Test fixture with 7 days of `today-*.md`: script produces single `recent.md` with compressed consolidation
  - Test `register-crons.py` idempotency: re-run adds no duplicate entries (platform-specific check)
  - Test cooldown active: script exits `skipped: cooldown`; no output
  - Test 0 `today-*.md` files: script exits 0 cleanly; recent.md unchanged
  - _Requirements: FR-19; design §1.4, §8.1_

- [ ] 34. Weekly curate cron (T-029)
  - Estimate: M · Depends: 10, 33
- [ ] 34.1 Implement `scripts/run-weekly-curate.sh`
  - Moves `today-*.md` >7d into `archive.md` (appended); deletes originals
- [ ] 34.2 Merge high-similarity bullets across days via task 10
  - Records `merged_from` correctly
- [ ] 34.3 Rebuild `recent.md` from current week's files
- [ ]* 34.4 Write unit tests for weekly curate
  - Test fixture with 14 days of files: first 7 moved chronologically to `archive.md`; originals deleted; recent week untouched
  - Test bullets across days with similarity > 0.85: merged via task 10; `merged_from` populated correctly
  - Test `recent.md` rebuilt from current 7 days
  - Test idempotency: second run is no-op (archive doesn't grow further)
  - _Requirements: FR-19, FR-21; design §1.4, §8.1_

- [ ] 35. Lazy compression fallback for no-cron envs (T-030)
  - Estimate: S · Depends: 18, 23
- [ ] 35.1 Implement SessionStart-side staleness detector
  - Checks `recent.md` mtime vs. cron schedule
- [ ] 35.2 Implement `cmk compress --lazy` detached spawn
  - Runs T-028 or T-029 work depending on what's stale
- [ ] 35.3 Implement cron-detection sentinel
  - If `.locks/cron-registered` exists: skip + log `skipped: cron-active`
- [ ]* 35.4 Write unit tests for lazy compression fallback
  - Test SessionStart with stale `recent.md` (mtime 8d): `cmk compress --lazy` spawned; SessionStart hook still returns within 500 ms
  - Test SessionStart with fresh `recent.md`: no spawn
  - Test `cmk compress --lazy` runs daily-distill work when only daily is stale, weekly-curate work when weekly is stale
  - Test with cron-registered sentinel: lazy detector exits `skipped: cron-active`
  - _Requirements: FR-19; design §8.2.1_

- [ ] 36. Checkpoint — Layer 6 (Cron + Lazy) complete _(skip if Layer 6 deferred)_
  - All tests for tasks 1–35 green
  - Cron registration idempotent on all 3 OSes
  - Agent confirms zero failures before cross-cutting layer

---

## Cross-cutting

- [ ] 37. `cmk doctor` health checks HC-1..HC-8 (T-031)
  - Estimate: M · Depends: 3
- [ ] 37.1 Implement HC-1..HC-7 from design §14
  - memsearch installed; hooks registered; distill freshness; transcripts firing; INDEX consistency; cron registered; memsearch backend reachable
- [ ] 37.2 Implement HC-8 — native Anthropic Auto Memory detector
  - Inspect `~/.claude/projects/<slug>/memory/`; log to `.locks/native-memory-status.log`
- [ ] 37.3 Implement structured report output (per-check pass/fail/skip)
- [ ] 37.4 Wire repair-command suggestions on failure
- [ ] 37.5 Prompt user before invoking any install-requiring repair
- [ ]* 37.6 Write unit tests for `cmk doctor`
  - Test all 8 HCs run in order; report line per check (`PASS` / `FAIL` / `SKIP`)
  - Test full run completes within 5 s on 10k-observation fixture
  - Test failed HC (e.g., HC-2 missing hook): repair command in stderr
  - Test HC-8 with `~/.claude/projects/<slug>/memory/` populated: log shows `active: true` + file count + last_modified
  - Test HC-8 with empty auto-memory dir: log shows `active: false`
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
  - Estimate: L · Depends: 7, 12, 13, 22, 23 · Must ship before Task 43 (release)
  - Uses shared modules from `packages/cli/src/{tier-paths,audit-log,frontmatter,result-shapes}.mjs` + scratchpad.mjs (Task 12) + provenance.mjs (Task 13). Consumes auto-extract output from Task 23. See design.md §16.16 for full motivation + design.
- [ ] 45.1 Implement `cmk persona generate` subcommand
  - Reads `<userDir>/memory/` + cross-project persona-tagged facts (via `cmk search --tier U` or direct file walk)
  - Synthesizes user-profile state via `CompressorBackend` (default `HaikuViaAnthropicApi` per design §8.3)
  - Output: candidate updates staged at `<userDir>/queues/persona-review.md` with full provenance (one bullet per proposed update)
  - Honors 120s Haiku cooldown shared with the rest of the kit
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
