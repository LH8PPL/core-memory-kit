# Bootstrap prompt for a new Claude Code session

Open this repo as VS Code's **primary** workspace folder (the harness derives its slug from the primary cwd — opening from the wrong folder tags transcripts + native auto-memory with the wrong project), then paste the block below as your opening message.

```text
We're continuing work on core-memory-kit — a per-project in-repo memory
system for Claude Code. Read these, in order, before responding:

1. docs/DOCUMENTATION-MAP.md           — where every doc lives (registry + routing rules)
2. specs/tasks.md → "Current state — what's next"  — where we are + the next action
3. docs/journey/DECISION-LOG.md        — settled decisions + why (don't re-open without new evidence)
4. CLAUDE.md                           — working style + binding rules

Then tell me, in your own words, the current state and the next action — and wait.
```

> This prompt carries **no state** — state lives in the Spine (`tasks.md`). Do not add a "current state" section to this file; update `tasks.md` instead. (Per [`DOCUMENTATION-MAP.md`](DOCUMENTATION-MAP.md).)
