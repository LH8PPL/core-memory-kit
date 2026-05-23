# Bootstrap prompt for a new Claude Code session

Copy the **fenced block below** verbatim as your opening message in a fresh Claude Code session on this repo. It tells the new Claude where to find context so it doesn't start cold.

**Before pasting**: make sure the new VS Code window has `C:\Projects\claude-memory-kit` opened as the **primary** workspace folder. The harness derives its slug from the primary cwd — opening from the wrong folder means transcripts + native auto-memory get tagged with the wrong project. (See journey log §7.7 for the "primary-cwd-determines-memory-location" lesson.)

When new tasks ship, update the **Current state** section of the prompt below and the `Next task` line. The rest of the template stays stable across the project.

---

## The prompt (copy from here)

```text
We're continuing work on claude-memory-kit v0.1.0 — a per-project in-repo
memory system for Claude Code. This is a fresh session opened with
claude-memory-kit as VS Code's primary workspace folder (deliberate — the
harness slug must match the project we're working on).

Bootstrap context by reading these files in order:

1. CLAUDE.md                          — project tone + workflow + anti-patterns.
                                        Claude Code auto-loads this, but read it
                                        carefully — Lior's working-style preferences
                                        are captured here, not just rules.
2. docs/journey/v0.1.0-build-log.md   — the full narrative (research, spec phase,
                                        four-spec-generator experiment, design
                                        decisions, all tasks shipped so far,
                                        skills audit, primary-cwd lesson, working-
                                        style preferences). The single most
                                        important doc.
3. specs/v0.1.0/tasks.md              — the 44-task build plan in Kiro flat-numbered
                                        format with TDD sub-tasks and checkpoints.
                                        Find the next [ ] parent task.
4. specs/v0.1.0/glossary.md           — canonical definitions of domain terms.
5. specs/v0.1.0/design.md             — HOW the kit works. Skim once, deep-read
                                        sections relevant to the current task.

Current state (update this section when new tasks ship):

- Tasks 1, 2, 3, 4 merged into main (PRs #1, #2, #3, #4 closed)
- 127/127 tests green
- `cmk install` + `cmk uninstall` are real subcommands; every other verb is
  still a stub printing "not yet implemented in v0.1.0 (milestone N)"

Next task: Task 5 — canonicalize() + ID generation (Node + Python parity).

  Builds the @cmk/canonicalize package (a SECOND package in the workspaces
  monorepo, separate from @claude-memory-kit/cli). Node + Python implementations
  must produce byte-identical output against a shared
  fixtures/canonicalize-vectors.json file (≥30 inputs). Base32 alphabet
  excludes ambiguous chars (0, O, 1, l, I, 8). Will introduce pytest to
  the repo for the Python side. 6 sub-tasks (5.1–5.6); 5.6 is the test
  sub-task. Branch: task-5-canonicalize-id-gen.

Workflow (locked in; full details in CLAUDE.md):

- One PR per parent task into main, squash-merge
- TDD: write tests first; agent runs them. Don't fix the test, fix the code.
- Boundary testing per Ousterhout (test public contracts, not internals)
- Each PR description ends with _Implements: FR-X; design §Y_ trace-back
- After merge: flip checkboxes in tasks.md + append entry to journey log

Available skills (auto-trigger on phrase matches):

- code-review-excellence — triggers on "review this PR / code"; gives
  structured PR reviews (severity-stratified). Trial period.
- python-pro + python-testing-patterns — useful for Task 5's Python side.
- memory-write — DO NOT actively trigger for this project's own work. It
  would write to ~/.claude/projects/<slug>/memory/ — the very leak
  claude-memory-kit aims to prevent.

When you have orientation, start the next task. If at any point you're
uncertain about a working-style call, the answer is in CLAUDE.md or the
journey log's "Lior's working-style preferences" section. Don't guess.
```

---

## How to keep this file current

When you merge a parent task and update tasks.md + journey log, also update **two lines** in the prompt above:

1. **"Current state"** bullet — bump the task list (e.g., "Tasks 1, 2, 3, 4, 5 merged"), bump the test count, list newly-real subcommands.
2. **"Next task"** paragraph — replace with the next `[ ]` parent task description and its branch name.

The rest of the prompt stays stable. Keeping the changes small means future-you can update it in 30 seconds rather than rewriting from scratch.

## When to start a new session

Best signals to restart:

- After a parent task merges (natural checkpoint)
- Between layers (after a checkpoint task in tasks.md — items 6, 11, 16, 27, 32, 36, 42, 44)
- When the current Claude starts getting slow or unfocused
- When you're taking a break longer than ~1 hour (Claude Code drops in-memory context anyway)

Don't restart:

- Mid-task (wait until PR is open or merged)
- When you're about to ask a quick follow-up question
- When you've just gotten productive momentum

## After the new session is bootstrapped

The new Claude has read CLAUDE.md + journey log + tasks.md. It knows:

- The full architectural narrative
- Lior's working-style preferences
- Where the next task is and what it requires
- The workflow (PR-per-task, TDD, squash-merge)

What it doesn't have (and can't be given via docs):

- The minute-by-minute working rhythm built up over many turns
- Tone calibration that emerged from correction cycles
- Specific in-conversation context from the prior session

Once **Task 23** (auto-extract subagent + memory-write skill) ships, the kit itself captures durable in-conversation context into `<repo>/context/MEMORY.md` between sessions. Until then, this bootstrap prompt is the bridge.
