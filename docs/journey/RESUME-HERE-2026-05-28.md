# Resume here — 2026-05-28 session pause

**Stop reason**: Lior is updating VS Code + Claude Code. This is a clean handoff doc so the next AI session has everything it needs.

**Resume mandate (Lior)**: *"i want to finish all tasks and have a working memory-kit, there is nothing to choose"*. The path is clear: ship v0.1.0 (Task 43 publish actions), do live-test (Task 44), build auto-persona (Task 45 for v0.1.1). No decisions to surface; just execute.

---

## How to resume — 3 commands

When you come back, tell the AI: *"read docs/journey/RESUME-HERE-2026-05-28.md then go"*. The AI should:

1. Read this file + CLAUDE.md + tasks.md Task 43-44-45 sections.
2. **Verify the version state is publishable** (see "Pre-publish verification" below).
3. **Execute the publish** (see "Publish playbook" below).
4. Continue to Task 44 live-test + Task 45 auto-persona.

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

### Step 2: publish @cmk/canonicalize FIRST

`@claude-memory-kit/cli` depends on `@cmk/canonicalize: "0.1.0"` (exact pin). The cli package's `npm publish` will FAIL if the canonicalize package isn't on npm yet — so publish that first:

```bash
cd packages/canonicalize
npm publish --access public
# Verify: npm view @cmk/canonicalize@0.1.0 version
```

### Step 3: publish @claude-memory-kit/cli SECOND

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
npm install -g @claude-memory-kit/cli@0.1.0
cmk --version  # MUST print 0.1.0
mkdir -p test-project && cd test-project
cmk install    # MUST succeed (B1 fix verification)
cmk doctor     # exits 1 (some HCs fail on fresh install — expected per QUICKSTART)
node -e "import('@cmk/canonicalize').then(m => console.log('canonicalize OK', Object.keys(m)))"  # B2 fix verification
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
2. Fresh install: `npm install -g @claude-memory-kit/cli@0.1.0`, then `cmk install` in the project
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
| #60 (T42) | **5 BLOCKING release-shippers** all found by pre-release pass | template/ in tarball via prepublishOnly; @cmk/canonicalize as proper dep; child-action dispatch fix; plugin install documented; version 0.1.0-dev → 0.1.0 |
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

2. **What happens if `npm publish` fails for the cli package after canonicalize succeeded?** The kit would be in a broken state — `@cmk/canonicalize@0.1.0` published but `@claude-memory-kit/cli@0.1.0` not. Recovery: fix the cli package's issue + re-run cli publish (canonicalize stays published).

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
