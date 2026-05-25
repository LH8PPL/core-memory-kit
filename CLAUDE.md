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
- **Composition verification — when two components have independent budgets / contracts, check the composition, not just each in isolation.** Per-file caps must compose with snapshot caps. Per-turn extraction must compose with typical turn shapes. Trust thresholds must compose with consolidation behavior. "Separately-correct-jointly-broken" is a real failure class — every spec author was right within their own surface; nobody owned the cross-surface invariant. Three instances of the same pattern in this build: PR-14 (per-file caps interacted with seed-trust+at to break first-write), PR-22 (auto-extract spec read only the assistant turn, broke under realistic user-dictating-terse-ack flows), PR-25 (snapshot cap composed against per-file caps to drop the user tier on every default install). When writing a spec that adds a budget, contract, or invariant, look for the OTHER specs that compose with it and verify the composition explicitly.
- Verification status (`✓` / `~` / `✗`) is tracked in [`SOURCES.md`](SOURCES.md).

## Engineering discipline (binding)

**Test-driven development.** Always:

1. Write the test first (the public-contract boundary test).
2. Watch it fail.
3. Implement the code until tests pass.
4. Never change the test to make it pass. Change the code.

**Boundary testing** (per Ousterhout, _A Philosophy of Software Design_):

- Test the **public interface** of each module. Not the internal helpers.
- A good test survives refactors. If a refactor breaks a test that was testing the contract, the refactor broke the contract — that's the test working.
- The test for `writeFact()` checks what file lands where with what frontmatter. NOT how `_parseFrontmatter()` happens to handle YAML.

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
- **All tests run by the agent (Claude), not by a human.** "Tests are green" is your assertion; the user trusts that assertion until proven wrong.
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
- **Dismissing flakes / skipping live tests to keep a PR green** — binding. If a test fails or you skip it, do not ship behind "known flake" / "expected fail" / "I'll fix it later" framing. Either fix the root cause, or surface it as a blocker so the user can decide. Real precedent: PR #28's first cut shipped behind "1 known timing flake" in `cli-observe-edit`; pushback surfaced that PRs #22 and #23 had carried the *same lazy framing* for the same class of bug for two sprints. Audit then surfaced four flakes, not one. Same with `CMK_SKIP_LIVE_HAIKU=1`: I'd been using it locally to save Haiku round-trips — the skip hid a real prompt-engineering bug (Haiku interpreting the compression directive as system-prompt configuration). Skip-flags are for CI without `claude` on PATH, not for "this round-trip is expensive." When the user asks "why are we skipping this?" or "why isn't this fixed?" — they're not asking for justification; they're calling out the pattern. The right response is to investigate.
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

- **Tasks 1, 2, 3, 4** merged into main (PRs #1, #2, #3, #4)
- **127/127 tests green**
- **`cmk install`** and **`cmk uninstall`** are real subcommands; every other verb is still a stub
- **Next task**: Task 5 — `canonicalize()` + ID generation (Node + Python parity)

## Working-product milestone

The kit doesn't become usable until **Task 23** (auto-extract subagent + memory-write skill). Tasks 1-22 lay foundations. Honest with the user about this — they accepted the trade-off (architecture-first vs Cursor's MVP-first ~22-hour scope). Don't apologize for it; it was a deliberate choice.

## When in doubt

Re-read the journey log. If still in doubt, ask the user with one specific question — not four bullet-pointed options.
