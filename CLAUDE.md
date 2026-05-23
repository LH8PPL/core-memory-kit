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
- **Padding**. Don't repeat the user's question back. Don't explain what you're about to do unless it's non-obvious. End-of-turn summaries should be 1-2 sentences.

## Skills active in this project

- **`code-review-excellence`** — auto-triggers on review-related phrases. Gives structured PR reviews (severity-stratified). Trial period.
- **`python-pro` + `python-testing-patterns`** — useful for Task 5's Python parity work.
- **`memory-write`** — predecessor of what we're building. **Do NOT actively trigger it for this project's own work.** It would write to `~/.claude/projects/<slug>/memory/` — the wrong location given we're building the replacement.

## Current state (update as we ship)

- **Tasks 1, 2, 3, 4** merged into main (PRs #1, #2, #3, #4)
- **127/127 tests green**
- **`cmk install`** and **`cmk uninstall`** are real subcommands; every other verb is still a stub
- **Next task**: Task 5 — `canonicalize()` + ID generation (Node + Python parity)

## Working-product milestone

The kit doesn't become usable until **Task 23** (auto-extract subagent + memory-write skill). Tasks 1-22 lay foundations. Honest with the user about this — they accepted the trade-off (architecture-first vs Cursor's MVP-first ~22-hour scope). Don't apologize for it; it was a deliberate choice.

## When in doubt

Re-read the journey log. If still in doubt, ask the user with one specific question — not four bullet-pointed options.
