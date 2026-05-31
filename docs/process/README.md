# Process documentation

How we work on `claude-memory-kit`. Each process doc is a self-contained markdown file explaining one part of our methodology — the spec workflow, research conventions, git discipline, etc.

## Index

| File | Topic |
|---|---|
| [kiro-spec-driven-flow.md](kiro-spec-driven-flow.md) | Our adapted Kiro spec-driven workflow: requirements → design → tasks, with review checkpoints |
| [research-prompt-design.md](research-prompt-design.md) | How to write Deep Research prompts that surface novel work, not just anchor on known systems |
| [scope-override-claude-memory.md](scope-override-claude-memory.md) | Workaround for Claude.ai's memory feature injecting unwanted prior context (e.g., bank/airgap framing) into responses |
| [git-and-versioning.md](git-and-versioning.md) | Commit message conventions, tag discipline, semver policy, ADR lifecycle |
| [live-test-plan.md](live-test-plan.md) | The plan for the in-session live tests — scenarios to run, what to capture as findings |

## When to add a new process doc

Add one when you find yourself explaining the same methodology question twice. If two contributors (or two Claude sessions) need to know how we decide X, Y, or Z, capture it here.

Process docs differ from ADRs: ADRs document a one-time decision; process docs document a repeated *practice*.
