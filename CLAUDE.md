# claude-memory-kit — project CLAUDE.md

Auto-loaded by Claude Code at session start when this repo is the primary workspace. Read in full before responding to the user.

## What this project is

A per-project, in-repo memory system for Claude Code. Fixes per-session amnesia by storing durable facts as markdown inside `<repo>/context/` (committed) + `<repo>/context.local/` (gitignored) + `~/.claude-memory-kit/` (user-tier). Architecture-first v0.1 (~50 dev-days, 36 tasks). Not Cursor's MVP shape — we're laying foundations first.

## Read these in order (10 minutes total)

1. [`docs/journey/v0.1.0-build-log.md`](docs/journey/v0.1.0-build-log.md) — full narrative. The single most important doc.
2. [`specs/v0.1.0/tasks.md`](specs/v0.1.0/tasks.md) — the 44-task build plan. Find the next `[ ]` parent task.
3. [`specs/v0.1.0/glossary.md`](specs/v0.1.0/glossary.md) — domain terms. When two docs disagree, glossary wins.
4. [`specs/v0.1.0/design.md`](specs/v0.1.0/design.md) — HOW the kit works (skim, then read sections as needed).
5. [`specs/v0.1.0/requirements.md`](specs/v0.1.0/requirements.md) — WHAT v0.1.0 must do (FR-*, NFR-*).

## Working style (locked in by the user)

The user (Lior) is direct and tight on time. Match the energy.

**Tone:**

- Terse, direct responses. No filler ("Great question!", "Sure thing!", "I'd love to help!").
- Lead with the answer. Add context only if it changes the answer.
- "go" = start the next task immediately, no preamble.
- "lets continue" / "let's continue with X" = same — execute.
- Acknowledge mistakes plainly. Don't bury them in apology. "I was wrong about X. Here's the fix."

**Decisions:**

- One recommendation > four options. State a choice; user redirects if wrong.
- Use `AskUserQuestion` only for genuine forks where you can't pick. Don't over-use it for things you should just decide.
- When asked for opinions, give a real opinion. Don't equivocate.

**Verification:**

- **"Did you check?" is the load-bearing question.** Every external claim about a project / library / API gets verified against the primary source before being stated as fact. My training data is sometimes wrong — primary-source examination has surfaced 8+ corrections during this project.
- **Convention-convergence-across-third-party-implementations is not primary-source verification.** When a project / library / API has official docs, check the docs directly. Reading two plugins that both implement convention X tells you those two authors agreed on X — it doesn't tell you X is correct. If a primary source exists (Anthropic's plugin docs, the W3C spec, the language reference manual), go there. The 2026-05-26 live-test plugin-layout bug surfaced because design.md §5.1 was written against convergent third-party evidence without checking Anthropic's docs (which would have caught the mistake instantly via a Warning callout in their structure-overview section).
- **Composition verification — when two components have independent budgets / contracts, check the composition, not just each in isolation.** Per-file caps must compose with snapshot caps. Per-turn extraction must compose with typical turn shapes. Trust thresholds must compose with consolidation behavior. Inner subprocess timeouts must compose with outer hook ceilings. "Separately-correct-jointly-broken" is a real failure class — every spec author was right within their own surface; nobody owned the cross-surface invariant. **Four instances of the same pattern in this build**: PR-14 (per-file caps interacted with seed-trust+at to break first-write), PR-22 (auto-extract spec read only the assistant turn, broke under realistic user-dictating-terse-ack flows), PR-25 (snapshot cap composed against per-file caps to drop the user tier on every default install), and PR-A of the post-PR-31 audit campaign (no inner subprocess timeout in `HaikuViaAnthropicApi.compress` meant the outer hook ceiling killed the parent without running catch / finally / log-write — composition gap between inner backend timeout and outer hook ceiling per design §8.5). When writing a spec that adds a budget, contract, or invariant, look for the OTHER specs that compose with it and verify the composition explicitly.
- **Full-research-base check on provenance questions — when asked "where did this design come from?", check the full research base before answering, not just the predecessor product you recall from this session.** The kit's research base lives in [`docs/research/`](docs/research/), [`docs/sources/`](docs/sources/), [`docs/adr/`](docs/adr/), [`docs/conversation-log/`](docs/conversation-log/), and [`SOURCES.md`](SOURCES.md). A provenance answer that names only the source freshest in your context is wrong in the same way a primary-source claim that names only one convergent third-party is wrong: it ANSWERS the question, but with a subset of the truth. Real precedent: when asked about `memory-write` skill provenance, my first answer cited only `claude-mem` / `claude-remember` and missed the Kiro / Cursor / ChatGPT / Antigravity research notes entirely — all of which had documented influence on the skill's shape. Cross-session-blind recall is the kit's whole problem; the workaround is to scan the file tree, not lean on what I happen to remember. Before answering, grep the research dirs (`grep -ri '<topic>' docs/research/ docs/sources/ docs/adr/ SOURCES.md`) and list every hit.
- Verification status (`✓` / `~` / `✗`) is tracked in [`SOURCES.md`](SOURCES.md).

## Engineering discipline (binding)

**Test-driven development.** Always:

1. Write the test first (the public-contract boundary test).
2. Watch it fail.
3. Implement the code until tests pass.
4. Never change the test to make it pass. Change the code.

**Boundary testing** (per Ousterhout, *A Philosophy of Software Design*):

- Test the **public interface** of each module. Not the internal helpers.
- A good test survives refactors. If a refactor breaks a test that was testing the contract, the refactor broke the contract — that's the test working.
- The test for `writeFact()` checks what file lands where with what frontmatter. NOT how `_parseFrontmatter()` happens to handle YAML.

**The five exit doors** (per Goldberg's *nodejs-testing-best-practices*) — when writing a test, walk this checklist and assert every applicable door:

1. **Response** — what does the public function return? (action / errorCategory / id / path / …)
2. **State** — what changed on disk / in the audit log / in the scratchpad / in the tombstone archive?
3. **External calls** — what subprocesses got spawned with what argv + env? (use the spawn-smoke pattern from design §17 for the real-binary side)
4. **Observability** — what NDJSON entry landed in the right log with the right shape? (audit.log, extract.log, compress.log, poison-guard.log)
5. (Message queues — N/A for the kit; no MQ surface.)

Most kit tests assert (1) and (2). The ones that miss (3) or (4) are the ones where a future bug ships silently. Pin all four whenever they apply.

**Over-mutation guard** — for any operation that mutates a subset of state (remove one bullet, replace one fact, tombstone one observation), the test must assert *the other records are untouched*. Seed N records, mutate one, assert N-1 remain. Goldberg calls this "test undesired side effects (delete-one doesn't delete-all)" and it catches off-by-one splices, wrong-section walkers, and over-eager regex matches that happy-path tests miss because the matched record disappears as expected. Specific instance: `tests/cli-memory-write.test.js` has explicit over-mutation tests for `remove` and `replace`.

**Walk all four doors before considering a test "done"** — when writing a new test or opening an existing test file, explicitly run through the five-exit-doors checklist (Response / State / External calls / Observability / [Queues — N/A]) and pin every door that applies. Doors 3 and 4 are the ones future bugs hide behind when missed — Door 3 (external calls) because mock-only tests miss spawn-layer breakage (the PR #22 lesson), Door 4 (observability) because NDJSON log assertions are the audit trail for production debugging.

**Deep modules with simple interfaces:**

- Wrap related code into broad modules that expose narrow surfaces.
- Don't fragment cohesive logic into many shallow helpers.
- Example: `install.mjs` is one module with one public boundary (`install({ ... })`) backed by ~10 internal helpers.

**Incremental build:**

- Each task produces working, integrated code. No orphaned code.
- After any sub-task, the codebase should still pass all tests.

**Test fixture IDs must pass `ID_PATTERN`** — enforced via [`scripts/validate-test-ids.mjs`](scripts/validate-test-ids.mjs), wired as a pre-test step in `npm test`. Use only the kit's base32 alphabet (excludes `0`, `O`, `1`, `l`, `I`, `8`) or copy a real id from [`fixtures/canonicalize-vectors.json`](fixtures/canonicalize-vectors.json). For tests that deliberately use a malformed id (e.g. asserting `readBullet` rejects bad input), add `// validate-test-ids: ignore` on the same line.

**Shared modules** (established post-Checkpoint-11, 2026-05-24):

When implementing new task modules under [`packages/cli/src/`](packages/cli/src/), use the shared helpers — don't roll your own:

| Concern | Use this module | Don't |
| --- | --- | --- |
| Tier path resolution (`P/L/U`, projectRoot, userDir) | [`tier-paths.mjs`](packages/cli/src/tier-paths.mjs) | Re-derive `homedir() + .claude-memory-kit` inline |
| Frontmatter read/write (YAML in fact files, HTML-comment in scratchpads) | [`frontmatter.mjs`](packages/cli/src/frontmatter.mjs) (js-yaml–backed) | Write a "tiny shallow split-on-colon" parser |
| Audit-log appends (any mutating operation) | [`audit-log.mjs`](packages/cli/src/audit-log.mjs) — `appendAuditEntry()` | `appendFileSync` to `.locks/audit.log` directly |
| Error / result shape | [`result-shapes.mjs`](packages/cli/src/result-shapes.mjs) — `errorResult()` / `notFoundResult()` + `ERROR_CATEGORIES` enum | Hand-roll `{action: 'error', errorCategory: 'schema', ...}` per file |

Why: the Layer-2 review surfaced 4 modules independently reimplementing the same helpers with small variations — drift was already producing bugs (e.g. `INDEX.md` not filtered from one writer's dedup scan; audit-log shape divergence across writers). Future Layer 3/4/5/6 modules import from these shared sources. See [design §1.3](specs/v0.1.0/design.md) for the architectural note and [glossary](specs/v0.1.0/glossary.md) entries for [[Audit log]] + [[Result shape]] + [[Provenance frontmatter]].

## Workflow

- **One PR per parent task** in tasks.md (1, 2, 3, ..., not sub-tasks). Branch: `task-N-short-name`. Squash-merge into main. Delete branch on merge.
- **Flip each sub-task checkbox the moment it ships, not at end-of-PR**. Binding. As soon as a sub-task is implemented + tested green, flip its `[ ]` → `[x]` in `tasks.md` in the same commit that ships it. Batching the flips for the end-of-task housekeeping commit is error-prone — Task 23 shipped with 23.8 unchecked even though the work was in PR #26, and only got caught when Lior asked "did you really do all the tasks in 23?" mid-Task-24. Apply this to every task from Task 24 onward.
- **All tests run by the agent (Claude), not by a human.** "Tests are green" is your assertion; the user trusts that assertion until proven wrong.
- **Never invoke tests manually — always through an `npm run …` script.** Binding (Lior 2026-05-26: *"please write all tests in scripts… never do tests manually"*). The repo provides:
  - `npm test` — full suite (one run, validate-test-ids + validate-template prerun, live-Haiku spawn-smokes enabled by default)
  - `npm run test:file -- <path>` — targeted single-file or specific-test-name iteration (skips the slow prerun; pass any extra vitest args after `--`, e.g. `-t "test name"`)
  - `npm run test:watch` — interactive vitest
  - `npm run stress` — 5x full suite, refuses to run if `CMK_SKIP_LIVE_HAIKU=1` is set; this is the gate before opening any PR whose surface touches spawn boundaries, detached children, hook handlers, or anything else where concurrency-class flakes hide
  - `npm run lint:test-ids` / `npm run validate:template` — individual prerun pieces
  - **Do not** type `npx vitest run …` directly; use `test:file`. **Do not** type `for i in 1..5; do npm test; done`; use `stress`. **Do not** set `CMK_SKIP_LIVE_HAIKU=1` to save round-trips; if a script's too slow, fix the script. The rule's job is to make the next-session-me invoke the same flow as this-session-me, without re-deriving it. New common invocations get a new `npm run` script, not a new shell habit.
- **PR title format**: `[N] <description> (T-NNN)` (T-NNN is the legacy ID; current convention is the bare number).
- **PR description ends with**: `_Implements: FR-X; design §Y_` traceability footer.
- **After merge**:
  1. Pull main locally.
  2. Flip the task's checkboxes in `tasks.md` from `[ ]` to `[x]`. Annotate the parent task with `_shipped YYYY-MM-DD, PR #N_`.
  3. Append a task entry to the journey log under §6 — Implementation.
  4. Commit + push (direct to main, no PR for docs updates).
  5. Start the next task on a fresh branch off main.

## Anti-patterns (user has pushed back on these)

- **Over-engineering**. MCP auth tokens for a stdio-only local server; splitting one PR-sized task into 8 micro-PRs; "what if we also add X" detours. Don't. If the user wanted X, they'd ask.
- **Ceremony**. Excessive `AskUserQuestion` use; listing 4 options when you should just pick one; preamble before action.
- **Overstating commits**. Don't claim things are in a commit if they aren't. Read the actual diff before writing the commit message.
- **Fix the test, not the code**. If a test fails, the answer is almost always to fix the code. The exception is when the test is genuinely wrong — and in that case, say so explicitly and explain why.
- **Lazy framing hides real bugs — multi-sided rule.** Binding. Dismissive framings like "known flake", "expected fail", "doc consistency", "I'll fix it later", "skip live-X to save round-trips", "low-signal", "amortize across future PRs" hide real bugs four times out of four in this build's history. The pattern is multi-sided: the framing can come from the implementer (in a PR body), the reviewer (in a review summary), or the merger (accepting a PR whose body carries one of those framings without pushing back at merge time). When you are any of those three roles, your job is to push back at the other two:
  - **As implementer**: do not write a disclaimer into a PR body to make the merge easier. Either fix the root cause, or open the PR explicitly flagged for the user's decision — never both green and disclaimed.
  - **As reviewer**: when a review surfaces something that *looks* low-signal, check whether the framing itself is doing the work. "Amortize later" / "stylistic noise" / "long tail of low-yield audits" are exactly the framings that mask high-leverage gaps in the audit's head.
  - **As merger** (the user, or anyone with merge rights): treat any "known / expected / non-blocking / low-signal / amortize / skip" phrasing in a PR body or review summary as a blocker until you understand WHY it's there. Three of this build's four instances shipped because the merge step accepted a disclaimer; the bug surfaced from the next problem the disclaimer caused, not from the merge being independently wrong.

  Four instances in this build:
  1. **PR-22 plugin layout** — design.md §5.1 wrote the plugin manifest under `plugin/.claude-plugin/hooks/` because of "convergence across third-party plugins" framing (implementer-side). Anthropic's primary docs put it at `plugin/hooks/`. Plugin failed to load in the live test.
  2. **PRs #22 + #23 "known cli-capture-turn flake"** — both PR bodies carried `(known cli-capture-turn flake under full-suite concurrency on Windows; 15/15 in isolation)` (implementer-side). Both merged with the disclaimer (merger-side acceptance). The PR-29 audit then surfaced four flakes of the same Windows-cold-start class, not one.
  3. **PR-28 `CMK_SKIP_LIVE_HAIKU=1`** — habit of setting the skip env var locally to save Haiku round-trips (implementer-side habit during testing). The skip hid a real prompt-engineering bug where Haiku interpreted the compression directive as system-prompt configuration. Surfaced only on the first non-skipped full-suite run.
  4. **PR-30 audit "amortize across future PRs"** — my own reviewer-side framing on whether to do the four-doors audit upfront vs. opportunistically (reviewer-side). The "low signal on long tail" frame was load-bearing on the punt; would have shipped 11 missing-assertion gaps across the audited files.

  Lior's note (2026-05-26): *"I'm also the one who merged PRs #22, #23, and #28 WITH the disclaimers in the bodies. The pushbacks came after merge, in response to the next problem the disclaimers caused. So the accept-at-merge step is where these actually shipped — and that's me."* This is the multi-sided point. Both Claude and Lior can be the source of dismissals or the gate that lets them ship; the discipline is mutual.
- **Padding**. Don't repeat the user's question back. Don't explain what you're about to do unless it's non-obvious. End-of-turn summaries should be 1-2 sentences.

## Skill agency (binding — don't make the user the orchestrator)

Skills are **your tools, not the user's commands**. When the work matches a skill's domain, **invoke the Skill tool yourself — without being asked, without confirmation**. The user shouldn't have to say "use python-pro for this" any more than they should have to say "use the Read tool for this." Implicit agency on skills mirrors implicit agency on tools.

Mapping for this project (invoke proactively at the start of the task or sub-task that matches):

| Work domain | Skill to invoke |
| --- | --- |
| Writing Python code | `python-pro` |
| Writing pytest tests | `python-testing-patterns` |
| Reviewing a PR (yours or the user's request to review) | `code-review-excellence` |

Concrete rule: at the start of a task whose sub-tasks include the domain above, call the Skill tool BEFORE writing the code or doing the review. Example: Task 5.3 (Python implementation of canonicalize) → invoke `python-pro` first. Task 5.6 (writing pytest cases) → invoke `python-testing-patterns` first.

Skills that **should NOT auto-trigger for this project**:

- **`memory-write`** — the existing predecessor skill. Its phrase-based trigger model is the very pattern claude-memory-kit replaces (the auto-extract subagent + memory-write skill in Tasks 21+23 do this without requiring user phrases). Triggering the existing `memory-write` skill during work on claude-memory-kit would write to `~/.claude/projects/<slug>/memory/` — the wrong location. Until the kit's own auto-extract ships, durable facts that arise during these sessions go into the journey log via explicit `Edit`, **NOT** via the predecessor skill.

## On memory in this project (mental model)

The memory model the kit is building (and the model these notes are written under):

- **Auto-extract is the default.** Future-Claude takes notes naturally based on what's worth noting. The user does not need to say "remember this." See [`specs/v0.1.0/design.md`](specs/v0.1.0/design.md) §6.0 for the full mental model.
- **User phrase triggers are an override**, for cases where the user wants immediate explicit capture.
- **Until Tasks 21 + 23 ship**, this project doesn't have working auto-extract for itself. So the practical workaround during the build: when something genuinely durable comes up in conversation (architectural decision, design rationale, user preference, anti-pattern discovered), explicitly capture it into the journey log via an `Edit`. **Don't wait for the user to say "remember this"** — that's exactly the broken pattern the kit replaces.

## Current state (update as we ship)

- **Tasks 1-24 merged** (PRs #1-#30); Task 23 has 10 sub-tasks including 23.9 (subprocess timeout per design §8.5, PR #32) and 23.10 (lock-file discipline per design §6.9, PR #33), both retroactive from the post-PR-31 audit campaign
- **775/775 tests green** with live-Haiku spawn-smokes enabled (~5% live-Haiku external-API jitter remains the only flake class — queued spawn-smoke retry-on-timeout followup tracked from PR #28)
- **Post-PR-31 audit campaign in flight** — converts prose-only verification rules into enforcement validators where shape admits. **Task 25 PAUSED** until PR-D merges. Authoritative tracker: [`docs/journey/v0.1.0-build-log.md` §"Post-PR-31 audit campaign tracker"](docs/journey/v0.1.0-build-log.md). Read that section first if resuming work — it carries the queue status, structured deferrals from earlier PRs (capture-turn spawn-failed observability → PR-D), the skill-experiment audit-note discipline for PR-D, and the resume criteria for Task 25.
- **Campaign queue**: PR-A `[MERGED]` (#32) → PR-B `[MERGED]` (#33) → PR-C `audit-spec-stack-references` (NEXT) → PR-D `audit-completeness-and-enforcement`. Each PR runs `code-review-excellence` before opening + `npm run stress` 5x before opening + names "Part N of 4 in the post-PR-31 audit campaign" in its description.

## Working-product milestone

The kit doesn't become usable until **Task 23** (auto-extract subagent + memory-write skill). Tasks 1-22 lay foundations. Honest with the user about this — they accepted the trade-off (architecture-first vs Cursor's MVP-first ~22-hour scope). Don't apologize for it; it was a deliberate choice.

## When in doubt

Re-read the journey log. If still in doubt, ask the user with one specific question — not four bullet-pointed options.
