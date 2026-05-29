# Resume here

> **2026-05-29 (LATE) UPDATE — v0.1.1 IS SHIPPED PUBLIC WITH PROVENANCE. This block supersedes everything below it. Read it first.**

## STATUS AS OF 2026-05-29 (late) — read this first

**v0.1.1 is published, public, and provenance-signed. Tasks 49 + 53 shipped. Repo is now PUBLIC.**

- ✅ **Task 49 (unify install)** merged (PR #63): `npm install -g @lh8ppl/claude-memory-kit && cmk install` is one complete entry point (`cmk install` wires the 5 hooks into `.claude/settings.json`, bare-name shell-form, cross-OS). `/plugin` marketplace is the parallel route (`.claude-plugin/marketplace.json` at repo root; `claude plugin validate` passes both manifests). Fixed install→doctor HC-2 composition bug (doctor now reads the nested `{hooks:[{command}]}` shape).
- ✅ **Task 53 (security)** merged (PR #64): CI gates on every push/PR — gitleaks (+`.gitleaks.toml` allowlists poison-guard fixtures), osv-scanner (+`osv-scanner.toml` ignores 2 dev-only advisories: esbuild/vite via vitest), `npm audit --omit=dev --audit-level=high`, CodeQL, Dependabot. `ci.yml` runs the full suite. `SECURITY.md` + ADR-0013. `bugs` URL on both packages.
- ✅ **CI provenance publish**: `publish.yml` publishes on a `v*` tag via OIDC + `npm publish --provenance`. **`@lh8ppl/claude-memory-kit@0.1.1` is LIVE on npm** with a SLSA provenance attestation (`predicateType: slsa.dev/provenance/v1`). GitHub Release v0.1.1 created. The npm token lives ONLY as the `NPM_TOKEN` GitHub Actions secret (granular, scoped, expiring) — **nothing to revoke**, not on disk. canonicalize stays 0.1.0.
- ✅ **Repo PUBLIC** (decision: "accept-and-go-public"). Pre-public privacy scrub + **git history rewrite** (`git filter-repo`) removed the regulated/banking/`tamir.bn-sh` disclosures from `main`/tags (verified 0 hits). **Accepted residual**: old closed-PR commits still pin pre-scrub copies (sector-level only, not employer name) — kept the PRs as the build paper-trail. Backup bundle: `C:/tmp/cmk-pre-rewrite-backup.bundle`.
- ✅ **README**: full professional pass — badges, TOC, "what's installed" file-tree, collapsible FAQ, Route A/B clarity + restart commands, "let Claude run it" note, slim Acknowledgments. **`docs/CLI.md`** (full command reference) + linked from README.

### ⏳ IN FLIGHT / NEXT (do in this order)

1. **★ Lior is running the in-session self-test RIGHT NOW** — building a mini FastAPI web-UI across 2 sessions per **[`docs/journey/v0.1.1-self-test-guide.md`](v0.1.1-self-test-guide.md)** to validate hooks-fire / auto-capture / recall / Route-B before handing to a friend. (CLI half already green — see [`v0.1.1-scenario-test.md`](v0.1.1-scenario-test.md).) **When he reports results: fix any findings, then it's friend-ready.**
2. **Task 54 (coverage) — IN FLIGHT**: branch **`task-54-coverage`** (pushed) has `@vitest/coverage-v8` + vitest coverage config + `test:coverage` script; measured **85.7% stmts / 78.81% branches** (>70 ratchet). **NEXT**: add a coverage job to `.github/workflows/ci.yml` (`npm run test:coverage`), optional Codecov (public repo, no token), maybe raise thresholds toward actuals, then open PR. (This is option B = vitest coverage; SonarCloud = option A, needs Lior's SonarCloud account + `SONAR_TOKEN`.) Lior wanted Task 54 done **before the friend**.
3. **Task 55 (behavioral pattern detection → habits/persona)** — v0.2 candidate, Lior endorsed. design §16.52 + tasks.md Task 55. The "clean refinement" only (NOT the bigger ECC-style procedural-skills swing).
4. **Task 44** — Lior's full real-usage live test (subsumed by the scenario self-test above).

### Decisions locked this session
Keep `@lh8ppl/claude-memory-kit` name (trademark-safe nominative; ADR-0012) · CodeQL over SonarCloud for SAST · accept-and-go-public · osv/gitleaks dev-fixture ignores documented. Dropped: adopting ECC repo or its tech (different product; redundant).

main HEAD after this: latest docs commit. All committed + pushed.

---

> **2026-05-29 UPDATE — v0.1.0 IS SHIPPED + LIVE-TESTED.** The status block immediately below supersedes the original pre-publish playbook (preserved further down for the decision-trail). Read this block first.

## STATUS AS OF 2026-05-29 (read first)

**v0.1.0 is published, tagged, released, and proven workable.** Done today:

- ✅ Renamed to `@lh8ppl` scope (ADR-0012, PR #62). Cross-agent naming deferred to v0.2 — the `claude-memory-kit` name gets reconsidered when multi-agent (codex/cursor/kiro) support lands. Core is agent-neutral (tenet T1); only the hook layer is Claude-specific.
- ✅ Published to npm: **`@lh8ppl/claude-memory-kit@0.1.0`** + **`@lh8ppl/cmk-canonicalize@0.1.0`** (both live).
- ✅ git tag `v0.1.0` pushed; GitHub release: <https://github.com/LH8PPL/claude-memory-kit/releases/tag/v0.1.0>
- ✅ npm 2FA was a WebAuthn security key (can't make a CLI OTP) → used a granular bypass-2FA token, since **revoked** by Lior.
- ✅ **Live test passed** (published package + real Haiku): session compression → auto-extract captures facts to MEMORY.md at trust:high WITHOUT "remember this" → session-2 snapshot surfaces them → search retrieves. Full report: [`v0.1.0-live-test.md`](v0.1.0-live-test.md).
- main HEAD `9a00a5f`; all committed + pushed; working tree clean.

**What's left (v0.1.1 / real-usage queue):**

0. **★ DO FIRST — Task 49: unify install** (v0.1.1, HIGH — **gates sharing the kit with any tester**). Lior 2026-05-29: he wants to give a friend the kit to test, but the current two-step install (`npm install -g` **and** a separate `/plugin install`) is too rough to hand over. Task 49 collapses it to one complete entry point. **This is now the #1 build task, ahead of Task 45.** Full sub-tasks in tasks.md Task 49; design §16.49 + §16.51; research note `2026-05-29-claude-mem-install-model.md`. ~half-day: ship the 5 hook bins as node wrappers in the npm package (Task 33/36 de-plugin-ify pattern), make `cmk install` write PATH-resolved hooks into settings.json, update docs to "pick one route", tests + stress + CI + merge + **republish v0.1.1**. Then `npm install -g @lh8ppl/claude-memory-kit && cmk install` is all a tester needs.
1. **Task 44 — real-usage live test** (Lior only, AFTER Task 49 so the install is shareable): use on a REAL project, log findings to `v0.1.0-live-test.md`.
2. **Task 45 — auto-persona** (v0.1.1, BUILD task after 49): L-sized. Design A vs B in tasks.md 45.1 (recommend B — piggyback weekly consolidator).
3. **Task 49 — unify install** (v0.1.1, HIGH): `cmk install` should wire hooks (de-plugin-ify the 5 hook bins, Task 33/36 pattern) so the npm route is a COMPLETE entry point like `npx claude-mem install`; + make the `/plugin` marketplace route a complete parallel path. Today's two-step install (npm CLI **and** separate `/plugin install`) is a UX wart — neither step is complete alone. Verified vs claude-mem: research note [`docs/research/2026-05-29-claude-mem-install-model.md`](2026-05-29-claude-mem-install-model.md); design §16.49 + §16.51.
4. **Layer 5b — semantic search** (v0.1.x): memsearch+ONNX; seam in place (ADR-0008); unlocks US-9 search-over-sessions/transcripts.
5. **Tasks 46-48** (v0.1.x): `cmk install --with-semantic` + `cmk doctor --repair` + promote ask-before-install to an NFR.
6. **Task 50 — cross-agent install** (v0.2): `cmk install --ide cursor|codex|gemini-cli` — claude-mem's verified `--ide` pattern. Core is agent-neutral (T1); only hooks are agent-specific. The "claude" name didn't block claude-mem from going multi-agent (ADR-0012). design §16.50.

**To resume building**: read CLAUDE.md + tasks.md; next code task is 45; per-task ship cycle = TDD → self-review → code-review-excellence skill → stress 5/5 → PR → CI green → merge → housekeeping. Corpus navigator is below.

---

# Original pre-publish handoff (2026-05-28)

**Stop reason**: Lior is updating VS Code + Claude Code. This is a clean handoff doc so the next AI session has everything it needs.

**Resume mandate (Lior)**: *"i want to finish all tasks and have a working memory-kit, there is nothing to choose"*. The path: ship v0.1.0, live-test, build auto-persona. _[2026-05-29: publish DONE — see status block at top.]_

---

## How to resume — 3 commands

When you come back, tell the AI: *"read docs/journey/RESUME-HERE-2026-05-28.md then go"*. The AI should:

1. Read this file + CLAUDE.md + tasks.md Task 43-44-45 sections.
2. **Verify the version state is publishable** (see "Pre-publish verification" below).
3. **Execute the publish** (see "Publish playbook" below).
4. Continue to Task 44 live-test + Task 45 auto-persona.

---

## What we wanted to build and why (intentions)

The full intent statement is in [`specs/v0.1.0/requirements.md` §1](../../specs/v0.1.0/requirements.md) — this is the executive summary so future-AI doesn't have to navigate first.

### The problem we set out to solve

> Claude Code starts every session with no memory of the last one. Without a system in place, the user must re-explain context — who they are, what they've been working on, what the project conventions are — at the start of every conversation. Over months, this re-explanation cost becomes significant and demoralizing.

We built a persistent, in-repo memory layer that survives across sessions, machines, and `git clone`s. The user opens Claude Code, makes a request, and Claude already knows the answers to who/what/why without being told.

### The 6 non-negotiable tenets (from requirements.md §1.4)

If a requirement violates a tenet, the tenet wins.

| ID | Tenet | Why |
| --- | --- | --- |
| **T1** | Markdown is the source of truth. SQLite, vector indexes are regenerable cache. | User opens MEMORY.md in VS Code, fixes a typo, system respects it. Opaque storage breaks this. |
| **T2** | Per-project memory lives in `<repo>/context/` committed to git. | Memory travels with `git clone`. New dev / new laptop up-to-speed after one clone. |
| **T3** | Cross-project user-tier memory lives in `~/.claude-memory-kit/`. | Some facts (your name, role, habits) are about *you*, not any project. |
| **T4** | Capture is mostly automatic. User-explicit triggers still work but are not required. | "Make it automatic" — Lior's hard requirement, third strike on this. |
| **T5** | Silent by default. No "I've saved that to memory" announcements. | Auto-capture should be invisible. Announcing breaks the illusion. |
| **T6** | Claude Code first. Other agents (Codex, Gemini, Hermes, Copilot) explicitly out of scope. | Don't try to be claude-mem's cross-agent surface. v0.2 if it matters. |

### Plus 2 amended tenets (added 2026-05-22, requirements-revisions-proposed.md)

- **T7**: Trust hierarchy (high/medium/low) for every observation
- **T8**: Provenance frontmatter on every bullet (~150 bytes/bullet acceptable cost for full audit trail)

### What v0.0.1 already did (baseline before this build)

The kit existed at v0.0.1 before this build started. Per-project `context/` directory, 3 bounded scratchpads (SOUL.md / USER.md / MEMORY.md), granular per-fact archive with INDEX.md, 2 Claude Code hooks (PreToolUse + Stop), `memory-write` skill that triggers on phrases, optional Layer 5 (memsearch + Milvus) for semantic recall, optional Layer 6 (cron jobs).

### What v0.1.0 added (this build)

Auto-extract subagent (Stop hook fires `claude --print` background), 3-tier memory (P/L/U), trust hierarchy + conflict queue + review queue, content-addressed citation IDs (base32, Node↔Python parity), 9 health checks (`cmk doctor`), MCP server with 6 tools, SQLite + FTS5 keyword search, hybrid search (BM25 + RRF), cross-platform cron registration (Linux/macOS/Windows), lazy compression fallback for no-cron environments, import bridge from Anthropic native auto-memory, transcripts extractor, repair + roll subcommands, cross-OS CI matrix, 1140+ tests, 8 structural validators.

---

## Full corpus navigator — where every kind of question is answered

The kit's docs corpus is large (~7200 lines across the spec stack + 2625 lines of journey log + 11 ADRs + 2 conversation logs + per-task tests). This section maps question-type → file-location so the next AI doesn't have to grep blindly.

### "What does the kit do? What is the user story?"

→ [`specs/v0.1.0/requirements.md`](../../specs/v0.1.0/requirements.md) — 512 lines, the authoritative WHAT
  - §1 Introduction (problem + tenets + baseline)
  - §2 User Stories (US-1..US-15)
  - §3 Functional Requirements (FR-1..FR-27 — plus FR-28..FR-30 in [`requirements-revisions-proposed.md`](../../specs/v0.1.0/requirements-revisions-proposed.md))
  - §4 Non-Functional Requirements (NFR-1..NFR-8; NFR-9 in the revisions doc)
  - §5 Acceptance criteria

### "How does the kit work? What are the architectural decisions?"

→ [`specs/v0.1.0/design.md`](../../specs/v0.1.0/design.md) — 2690 lines, the authoritative HOW
  - §1 System overview + data flow
  - §2 Per-fact file format
  - §3 Three-tier model (P/L/U)
  - §4 Trust hierarchy
  - §5 Hook architecture
  - §6 Auto-extract pipeline (subagent + memory-write skill + conflict/review queues)
  - §7 Snapshot assembly
  - §8 Compression pipeline (now → today → recent → archive) + cron + lazy + cooldown
  - §9 SQLite + FTS5 index
  - §10 MCP server
  - §11 Import bridge (Anthropic + transcripts)
  - §13 Install paths
  - §14 Health checks
  - §15 Trade-offs explicitly accepted
  - §16 v0.1.x candidates (~48 deferred items, each with ship trigger)
  - §17 Test discipline (five exit doors, spawn smokes, stress gate)
  - §18 Cross-platform discipline + structural validators

### "Why was decision X made? What was the rationale?"

→ [`docs/adr/`](../../docs/adr/) — 11 ADRs
  - ADR-0001: separate-project-not-fork-youtube-to-slide (why not extend youtube-to-slide's memory pattern)
  - ADR-0002: markdown-source-of-truth-over-opaque-db (T1's deeper rationale)
  - ADR-0003: per-project-with-future-cross-project-tier (T2 + T3's roadmap)
  - ADR-0004: spec-driven-development-kiro-style (why requirements → design → tasks workflow)
  - ADR-0005: three-install-paths (npm + plugin + manual)
  - ADR-0006: lifecycle-hooks-architecture (which hooks to use + why)
  - ADR-0007: content-addressed-citation-ids (base32 alphabet choice + 8-char rationale)
  - ADR-0008: bank-airgap-deferred-to-future-version (Layer 5b semantic ships in v0.1.x, not v0.1.0)
  - ADR-0009: provenance-frontmatter-per-observation (T8's deeper rationale)
  - ADR-0010: raw-transcripts-preserved-indefinitely (audit trail discipline)
  - ADR-0011: coexistence-with-anthropic-auto-memory-OPEN (still open; HC-8 surfaces detection)

### "What was the full build journey? Per-task what happened?"

→ [`docs/journey/v0.1.0-build-log.md`](../../docs/journey/v0.1.0-build-log.md) — 2625 lines, narrative
  - §0 The frustration that started this (the kit's origin)
  - §1 Starting state — v0.0.1 (May 21, 2026)
  - §2 Phase 1 — Research (what we learned from competitors)
  - §3 Phase 2 — Spec-driven development (the Kiro workflow adoption)
  - §4 Phase 3 — The four-spec-generator experiment (4 AIs wrote competing specs; we picked the best fragments)
  - §5 Phase 4 — Design decisions (the choices that shaped v0.1.0)
  - §6 Phase 5 — What it's like to work with an AI on a spec
  - §7 Phase 6 — Implementation kicks off (Tasks 1-2)
  - §7.5 Side quest — Claude Code skills audit (between Tasks 3 and 4)
  - Tasks 17-42 retrospectives (per-PR detail with skill-review findings + fix descriptions)
  - §8 What's left to build (v0.1.0 remaining work — partially stale, see this doc)
  - §9 Open questions and post-v0.1 candidates
  - §10 The conversation as raw material — what we do with it
  - §11 How to extend this file

### "What were the EXACT conversations? What questions did Lior ask?"

→ [`docs/conversation-log/`](../../docs/conversation-log/) — 2 raw conversation files
  - `2026-05-21.md` — first day; the Hightower harness paper, structural-gravity debate
  - `2026-05-22.md` — second day; tenant decisions, four-spec experiment kickoff

→ This session's Q&A arc is captured in "This session's Q&A arc" section below.

### "What's the work breakdown? What's shipped vs pending?"

→ [`specs/v0.1.0/tasks.md`](../../specs/v0.1.0/tasks.md) — 1057 lines, the WHAT-WHEN
  - 45 numbered tasks across Foundation / Layer 2-6 / Cross-cutting / Release / late additions
  - Each task: scope + estimate + dependencies + sub-tasks + acceptance criteria
  - Each shipped task has a `_shipped YYYY-MM-DD, PR #N_` annotation + `Shipped as ...` pointers per sub-task
  - Pending items: 43.3-43.5 (publish), 44 (post-release verification + live-test), 45 (auto-persona v0.1.1), 46-48 (auto-install v0.1.x queue)

### "What are the binding rules? What's project discipline?"

→ [`CLAUDE.md`](../../CLAUDE.md) — 306 lines, the project rulebook (loaded at every Claude Code session)
  - Memory routing rules
  - LLM Wiki integration (Lior's personal knowledge base)
  - Working style (Lior's preferences — terse, direct, no preamble)
  - Verification rules (the "did you check?" discipline)
  - Engineering discipline (TDD, boundary testing, five exit doors, shared modules)
  - Workflow (two-pass code review, autopilot mode, PR conventions)
  - Anti-patterns (over-engineering, ceremony, overstating commits, fix-the-test-not-the-code)
  - Campaign rules (no parallel campaign PRs)
  - Working-product milestone

### "What research informed the kit? What sources are cited?"

→ [`docs/SOURCES.md`](../../docs/SOURCES.md) — master sources index
→ [`docs/research/`](../../docs/research/) — per-finding research notes (~20 files)
  - Closest analogs: claude-mem, claude-remember, GBrain, Anthropic native auto-memory
  - Pattern sources: Simon Scrapes, Hermes Agent, OpenClaw, ChatGPT spec
  - Implementation studies: claude-remember code dive, Anthropic Auto Memory primary-source examination
  - Tooling: chokidar, js-yaml, better-sqlite3 verifications

### "What bugs were found? What were the fixes?"

→ [`docs/journey/v0.1.0-build-log.md`](../../docs/journey/v0.1.0-build-log.md) — per-task retrospectives (Tasks 28-42 added this session) document every PR's bugs + fixes
→ This doc's "Bugs found this session" table below covers PRs #44-#61
→ GitHub PR descriptions (`gh pr view <N>`) have the canonical per-PR bug list

### "What test discipline applies? How do tests work in this codebase?"

→ [`specs/v0.1.0/design.md` §17](../../specs/v0.1.0/design.md) — full test discipline
  - §17.1 Five exit doors framework (Response / State / External calls / Observability / Queues)
  - §17.2-17.7 Spawn smokes for real-binary tests (the live-Haiku class)
  - §17.8 Integration-test coverage for cross-module flows (the Task 25 generateId-named-args latent bug lesson)

→ [`CLAUDE.md`](../../CLAUDE.md) "Engineering discipline" section
→ Test files in `tests/` are the canonical examples of each pattern

---

## State at pause (commit `f32bc78` on main)

| Surface | State |
| --- | --- |
| Tests | 1140 / 58 files / 8 validators green |
| Stress | 5/5 first invocation (Task 42 + 41 + 40 + ...) |
| CI matrix | All 3 OSes green + cross-OS checksum parity on PR #60 |
| Open PRs | None — all merged |
| Tasks 1-42 | Shipped |
| Task 43 prep | Shipped (PR #61) — CHANGELOG + verification tests + this doc |
| Task 43 publish | **Pending** — irreversible; requires explicit go-ahead |
| Task 44 | Pending (post-release verification + week-long live-test) |
| Task 45 | Pending (auto-persona for v0.1.1) |
| Tasks 46-48 | v0.1.x queue (auto-install consent path) |

---

## Pre-publish verification — run these first

Before any publish action, verify the kit's state:

```bash
git log --oneline -3                                    # confirm on main at f32bc78 (or later if other docs commits landed)
node packages/cli/bin/cmk.mjs --version                 # MUST print 0.1.0
cat packages/canonicalize/package.json | grep version   # MUST be "0.1.0" not "0.1.0-dev"
cat packages/cli/package.json | grep '"version"'        # MUST be "0.1.0"
cd packages/cli && npm pack --dry-run 2>&1 | grep "template/" | wc -l  # MUST be >= 30
cd ../canonicalize && npm pack --dry-run 2>&1 | head -20  # verify canonicalize tarball clean
cd ../..
npm test 2>&1 | tail -5                                 # MUST show 1140+ tests passing, all green
```

If any check fails, **stop and investigate** before publishing. The Task 42 PR fixed these (B5 versions, B1 template-in-tarball); if regressions appear, something between f32bc78 and resume time broke them.

---

## Publish playbook (Task 43.3-43.5)

These three actions ship v0.1.0. They are irreversible (npm publish cannot be unpublished after 72 hours; git tag push is harder to retract; GitHub release is recoverable but visible).

### Step 1: tag the release

```bash
git checkout main && git pull
git tag -a v0.1.0 -m "v0.1.0 — first release"
git push origin v0.1.0
```

### Step 2: publish @lh8ppl/cmk-canonicalize FIRST

`@lh8ppl/claude-memory-kit` depends on `@lh8ppl/cmk-canonicalize: "0.1.0"` (exact pin). The cli package's `npm publish` will FAIL if the canonicalize package isn't on npm yet — so publish that first:

```bash
cd packages/canonicalize
npm publish --access public
# Verify: npm view @lh8ppl/cmk-canonicalize@0.1.0 version
```

### Step 3: publish @lh8ppl/claude-memory-kit SECOND

```bash
cd ../cli
npm publish --access public
```

The `prepublishOnly` script runs first — it executes `scripts/prepublish-copy-template.mjs` to copy `template/` into `packages/cli/template/` (without this, B1 reappears). The published tarball will contain 33 template files (verified empirically in Task 42).

### Step 4: create the GitHub Release

```bash
cd ../..
# Extract just the [0.1.0] section from CHANGELOG.md
NOTES=$(awk '/^## \[0.1.0\]/{flag=1; next} /^## \[/{flag=0} flag' CHANGELOG.md)
gh release create v0.1.0 \
  --title "v0.1.0 — first release" \
  --notes "$NOTES"
```

### Step 5: smoke-test the published package

```bash
# In a temp shell
mkdir -p /tmp/cmk-smoke && cd /tmp/cmk-smoke
npm init -y
npm install -g @lh8ppl/claude-memory-kit@0.1.0
cmk --version  # MUST print 0.1.0
mkdir -p test-project && cd test-project
cmk install    # MUST succeed (B1 fix verification)
cmk doctor     # exits 1 (some HCs fail on fresh install — expected per QUICKSTART)
node -e "import('@lh8ppl/cmk-canonicalize').then(m => console.log('canonicalize OK', Object.keys(m)))"  # B2 fix verification
```

### Step 6: flip tasks.md 43.3 / 43.4 / 43.5 to [x] + parent 43

```bash
cd /c/Projects/claude-memory-kit
# Edit specs/v0.1.0/tasks.md — flip 43.3, 43.4, 43.5 to [x] with shipped-as pointers + parent 43 to [x]
git add specs/v0.1.0/tasks.md
git commit -m "docs: post-Task-43 housekeeping — v0.1.0 SHIPPED"
git push origin main
```

---

## Task 44 — Post-release verification (after publish)

Per Lior 2026-05-28 sequencing, Task 44 absorbed the live-test gate originally on Task 42.

**What Task 44 entails** (a multi-day activity Lior performs):

1. Pick a real project (NOT this kit's repo — avoid kit-dev memory bleed)
2. Fresh install: `npm install -g @lh8ppl/claude-memory-kit@0.1.0`, then `cmk install` in the project
3. Install the kit as a Claude Code plugin (`/plugin marketplace add LH8PPL/claude-memory-kit` + `/plugin install claude-memory-kit`) — required for hooks to fire (Task 42 B4)
4. `cmk register-crons` (or skip and let lazy-fallback handle it)
5. `cmk doctor` — should report mostly green (HC-2 hooks will PASS after the plugin step; HC-3+HC-4 might fail until first session)
6. Hold real sessions in Claude Code on the project for **at least one week** to exercise weekly-curate
7. Verify in the wild:
   - Auto-extract fires on Stop → bullets appear in MEMORY.md
   - SessionStart injection works → Claude sees the snapshot
   - `cmk search "<term>"` returns relevant results
   - Cron registration actually fires nightly (recent.md gets refreshed)
   - Lazy-fallback fires if you `cmk register-crons --unregister` (sentinel removed → SessionStart spawns cmk-compress-lazy)
8. Document findings in `docs/journey/v0.1.0-live-test.md` — bugs, UX surprises, doc gaps

Any Blocking finding gates the v0.1.1 release. The autopilot pattern is established: live-test findings + Task 45 (auto-persona) + Tasks 46-48 (auto-install) ship together in v0.1.1.

---

## Task 45 — Auto-persona generation (v0.1.1)

L-estimated. Lior originally tail-appended this 2026-05-24 as a v0.1.0 release blocker, then 2026-05-28 re-prioritized to v0.1.1.

**Two design choices documented in tasks.md 45.1** (decision deferred to implementation time):

- **Design A — separate pipeline stage**: `cmk persona generate` reads `<userDir>/memory/` + cross-project persona-tagged facts, synthesizes via CompressorBackend, stages candidates at `<userDir>/queues/persona-review.md`. Honors 120s Haiku cooldown.
- **Design B — inline in consolidator**: piggyback on Task 34's weekly consolidation. Extend the prompt with "Step 3: identity candidates" instruction. Zero additional API calls. Source: claude-remember's actual implementation (research note `2026-05-25-claude-remember-code-dive.md`).

Recommendation in tasks.md: try Design B first; fall back to Design A if the consolidator's prompt budget can't absorb the extra instruction without hurting compression quality.

Then 45.2 (accept/reject CLI), 45.3 (--auto mode with settings.json opt-in), 45.4 (conflict-with-hand-curated handling), 45.5 (unit tests).

---

## This session's Q&A arc — what Lior asked + what it led to

This is the conversational thread the next session needs to understand the empirical lessons, not just the code state.

### Q1: "did you check?" (recurring throughout the autopilot run)

The load-bearing question. Triggered multiple primary-source verifications. Examples:

- Task 33: "did you update the design/requirments/tasks?" → caught the implementation-first vs spec-first discipline gap → spec stack updated retroactively before merge
- Task 37: "wait, what does other products do when there are missing prequisits?" → led to actually reading research notes instead of summarizing from memory (the lesson: don't summarize from memory when you have research files; grep them)
- Task 37: "you didnt actually told me what other products do to my quastion 'What do other projects do when there are missing prerequisites', did you actually looked into other products?" → forced WebFetch + actual research notes read

Generalized rule in CLAUDE.md "Verification rules": *"Don't summarize from memory when primary source is available. Grep / WebFetch / Read first."*

### Q2: "if memsearch is not installed, dont we install it?"

Led to the deepest UX research of the session. Initially I gave a category-style answer ("error / prompt / auto-install"). Lior pushed back twice ("look into the products that we researched", "you didnt actually told me what other products do"). I then actually read the research notes:

- **claude-mem**: auto-installs Bun + uv at INSTALL TIME (silently, since user explicitly ran the installer); at RUNTIME prints repair commands. **Our cmk doctor matches claude-mem's runtime exactly.**
- **claude-remember**: manual install everywhere; no auto-anything
- **GBrain**: bundles deps (PGLite) to eliminate friction; agent-driven install
- **Anthropic native**: zero deps

The actual finding: claude-mem's PATTERN is closer to ours than I'd implied. The open question is whether `cmk install` should auto-install Layer 5b deps at install time (which is what claude-mem does for its toolchain).

Lior's answer: "can we add tasks for the autoinstall after we finish all the tasks we have now? just adding more tasks to the end? waht do dyou think?" → Tasks 46-48 appended to tasks.md as v0.1.x queue.

Then: "maybe you are right and ask before we do anything? maybe explain if they dont install they dont get certen features?" → led to HC-1 message update: "Layer 5b semantic backend disabled. Features unavailable: `cmk search --mode=semantic` (will error), `cmk search --mode=hybrid` (will error). Keyword search (`cmk search --mode=keyword`, default) still works fully."

### Q3: "after the kit version 0.1 is ready we need to do test to see the kit in action"

Added the live-test gate to Task 42 originally. Later re-sequenced to Task 44 with "do autopilot for task 42,43,44 AND THEN 45".

### Q4: "do them by order, no skiping to other tasks unless you have to for the corrent task or you found a problem that needs a detour"

Led to the binding CLAUDE.md rule **strict task-order discipline** with 3 reasons: context locality, layer cohesion, no dependency inversion. Eliminated my "let me pick the next-best task" framing.

### Q5: "dont remove the python option, add that we are just not doing it and are using node js and why"

Led to the binding CLAUDE.md rule **decision-trail preservation**: when a documented plan changes, the new path is APPENDED to the old. Both options stay visible. Task 33's Python → Node pivot is the canonical precedent.

### Q6: "maybe you should also do code review of your own not just the skill after every pr before merge"

Led to the binding CLAUDE.md rule **two-pass code-review discipline**: self-review walks the diff anchored on implementer's mental model (catches tactical bugs you half-knew about); skill-review anchors on the diff in isolation (catches composition-class bugs the mental model hides). Empirical evidence: 17 PRs in a row, every one had at least one skill-review-only catch.

### Q7: "do autopilot for task 42,43,44 AND THEN 45"

Re-prioritized Task 45 from v0.1.0 release blocker → v0.1.1 release. Live-test moved from Task 42 → Task 44. Decision-trail preserved in tasks.md per the rule from Q5.

### Q8: "i want to update the vs code and claude code, when you finish a task, stop and document everything"

This session pause. Plus the follow-up "you need to document everything" + "what do you mean 'When you resume, you'll choose between'? i want to finish all tasks and have a working memory-kit, there is nothing to choose" — clarified that the resume mandate is "ship", not "decide what to ship".

---

## Bugs found this session (Tasks 28-42) + their fixes

For per-task detail, see the journey log retrospectives (Tasks 28-42+43 prep are at `docs/journey/v0.1.0-build-log.md` immediately after Task 36). High-level pattern:

| PR | Bug class | Fix |
| --- | --- | --- |
| #44 (T28) | SQLite FTS5 external-content trigger spec bug | DELETE FROM observations_fts WHERE rowid=old.rowid → sentinel-pattern triggers |
| #45 (instrumentation) | Stress 4/5 with no captured log | `CMK_STRESS_LOG=1` opt-in via bash-tee |
| #47 (T29) | chokidar v5 dropped glob support; field-name drift in writeFact | directory-watch + extension filtering; align reader with writer fields |
| #48 (T30) | FTS5 parse-error crash on `"user-explicit"` query | typed FTS5ParseError + try/catch |
| #49 (T31) | mk_remember `accepted:true` on queued route | 6th composition instance closed |
| #50 (T32) | Layer 5 layer-wide review — no new bugs | composition matrix verified clean |
| #51 (T33) | B1 plugin/bin path post-npm-install-g; B2 Windows schtasks /TR quoting; I1 Linux single-quote injection | moved bin into packages/cli; `command.replace(/"/g, '\\"')`; reject single quotes |
| #52 (T34) | I1 stuck-stale recent.md infinite-spawn; B1 dependency-on-deleted-file | `files.length === 0 → fresh` regardless of mtime; survived because Layer 6 still works |
| #53 (T35) | cooldown gate had ZERO tests (load-bearing composition) | added 2 tests pinning the cooldown-active skip + cooldownMs=0 override |
| #54 (T36) | B1 cron emits projectRoot-blind commands; B2 PATH unresolved; I1 stuck-stale loop | absolute-paths-triple emission; bins accept argv[2] projectRoot; detectStaleness fix |
| #55 (T37) | B1 HC-2 substring-on-stringified-JSON false-pass; I1 NFR-9 citation drift; I2 HC-8 comment lie | structural walk of `hooks.<event>[].command` (each event array); corrected citation to design §14; clarified snapshot semantics |
| #56 (T38) | B1 importAnthropicMemory bypassed appendAuditEntry; B2 tests polluted real ~/.claude | routed through canonical writer with new REASON_CODES; harnessRoot test injection |
| #57 (T39) | I1 repairHooks reads plugin/hooks/hooks.json (not in tarball post-npm-install-g); I3 cmk repair has no audit trail | embedded KIT_HOOKS_BLOCK as JS constant; new REPAIR_HOOKS_APPLIED / REPAIR_LOCK_REMOVED reason codes |
| #58 (T40) | macOS npm "Exit handler never called!" transient bug | switched to `npm ci --no-audit --no-fund` with retry |
| #59 (T41) | Stale README references (install.sh, HC-1..HC-7, python register-crons) | full rewrite + negative-assertion tests to lock out future drift |
| #60 (T42) | **5 BLOCKING release-shippers** all found by pre-release pass | template/ in tarball via prepublishOnly; @lh8ppl/cmk-canonicalize as proper dep; child-action dispatch fix; plugin install documented; version 0.1.0-dev → 0.1.0 |
| #61 (T43 prep) | None — non-destructive | n/a |

**Total**: 17 PRs, ~40 individual bugs found across self-review + skill-review, all fixed inline. Every PR ≥ 1 skill-review-only catch.

---

## CLAUDE.md additions from this session

Three new binding rules + four §16 v0.1.x candidates added during the autopilot run:

**Binding rules added**:

1. **Strict task-order discipline** (CLAUDE.md Workflow section) — work tasks.md in numerical order; "OPTIONAL" tags don't license skipping
2. **Decision-trail preservation** (CLAUDE.md Verification rules section) — when a documented plan changes, append the new path; preserve the old with date + reason
3. **Two-pass code-review discipline** (CLAUDE.md Workflow section) — every PR gets self-review + code-review-excellence skill pass before merge

**New §16 v0.1.x candidates** in design.md:

- §16.43 — `cmk register-crons --daily-only` / `--weekly-only` flags
- §16.44 — per-bullet source-day attribution in merged_from comments
- §16.45 — archive.md rotation policy when bytes exceed N MB
- §16.46 — direct unit test for `buildWindowsSchtasks` weekly branch
- §16.47 — `cmk doctor --json` flag for machine-readable output
- §16.48 — promote ask-before-install rule to a proper NFR

Plus **Tasks 46-48 appended to tasks.md** for the v0.1.1+ work:

- Task 46 — `cmk install --with-semantic` opt-in semantic-backend bootstrap (matches claude-mem's install-time pattern)
- Task 47 — `cmk doctor --repair` prompt-then-install at runtime
- Task 48 — promote ask-before-install rule to a real NFR with structural validator

---

## Open questions / uncertainties for the next session

Things we haven't decided that may surface during publish or live-test:

1. **Publish dry-run before real publish?** `npm publish --dry-run` would verify the tarball one more time before the irreversible action. Cheap insurance.

2. **What happens if `npm publish` fails for the cli package after canonicalize succeeded?** The kit would be in a broken state — `@lh8ppl/cmk-canonicalize@0.1.0` published but `@lh8ppl/claude-memory-kit@0.1.0` not. Recovery: fix the cli package's issue + re-run cli publish (canonicalize stays published).

3. **GitHub Release notes — full CHANGELOG vs extracted section?** I drafted the playbook with `awk` extracting just the `[0.1.0]` section. Could also do `--notes-file CHANGELOG.md` for the entire file; pick one based on rendering preference.

4. **Should `cmk version` be removed or made a proper alias?** Task 42 N2 flagged it as a useless self-reference (`cmk version: see \`cmk --version\``). v0.1.x candidate.

5. **HC-2 hook detection sensitivity** — Task 39 M2 noted the substring filter against KIT_COMMAND_TOKENS has a false-positive direction (user's description field containing the token text would be stripped). Accepted as-is for v0.1.0; if a user reports false-strips, tighten.

6. **Lior's working-style overrides** — confirmed binding from this session:
   - "Document everything" applies recursively — not just durable rules in CLAUDE.md but also per-task bugs+fixes in the journey log (this session's enhancement)
   - "There is nothing to choose" — when the path is clear (next task in order), just execute; don't surface artificial forks

---

## Files the next session should read first

In order:

1. **This file** (`docs/journey/RESUME-HERE-2026-05-28.md`) — you're reading it; comprehensive session handoff
2. **CLAUDE.md** — binding rules including the 3 new ones from this session
3. **specs/v0.1.0/tasks.md** — Tasks 43-44-45 sections + §"Tail-appended v0.1.x candidates" (Tasks 46-48)
4. **CHANGELOG.md** — the [0.1.0] release notes draft (correct it before publish if needed)
5. **docs/journey/v0.1.0-build-log.md** — Tasks 28-42 retrospectives just added (after Task 36 entry)

---

## Lior's working-style reminders (from CLAUDE.md + this session)

- Terse, direct responses. No filler.
- "go" / "let's continue" / "merged" = execute, no preamble
- One recommendation > four options. State a choice; he redirects if wrong.
- **"Did you check?"** is the load-bearing question. Verify external claims AND don't summarize from memory when primary sources are available.
- Fix every code-review finding inline (his standing "fix everything now")
- Strict task order: 43 → 44 → 45. No skipping.
- **"I want to finish all tasks and have a working memory-kit, there is nothing to choose"** — when next steps are clear, execute, don't surface artificial forks.
- Document everything in durable files at session pauses (this file is that, for this pause).

---

## End-of-session checklist

- [x] CHANGELOG.md drafted with v0.1.0 entry (PR #61)
- [x] release-verification.test.js shipped + green (11 tests, PR #61)
- [x] tasks.md 43.1, 43.2, 43.6 flipped to [x]; 43.3, 43.4, 43.5 documented as pending publish
- [x] tasks.md Task 42 + 44 reflect live-test gate sequencing change; Task 45 moved to v0.1.1
- [x] Journey log retrospectives for Tasks 28-42 + 43-prep appended
- [x] This RESUME-HERE file written with comprehensive session arc + per-task bug detail
- [x] CLAUDE.md updates from this session: strict-order rule, decision-trail rule, two-pass code-review rule already in (committed earlier in session)
- [ ] This commit + push (in flight)

When the next session opens, the AI should read this doc and tell Lior something like: *"State verified at f32bc78 + this enhancement commit. Ready to execute the Task 43 publish playbook. Want me to start with `npm publish --dry-run` smoke or go straight to the real publish?"* — then ship v0.1.0.
