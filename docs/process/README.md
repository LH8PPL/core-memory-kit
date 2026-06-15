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
| [cut-gate.md](cut-gate.md) | **CURRENT** — the single, version-agnostic full-test + cut gate to run before tagging ANY release (D-24/D-130). Reused every cut; the per-version banner names that cut's specific gates. Used for the v0.3.x lane. |
| [v0.2.0-self-test-guide.md](v0.2.0-self-test-guide.md) | Live-test script + full feature sweep across 2 sessions (capture/recall/cold-open + tick every CLI command). The v0.2.0 cut gate (D-24). _Superseded as the live gate by the version-agnostic [cut-gate.md](cut-gate.md); kept as the 2-session app-build scenario._ |
| [v0.2.0-self-test-guide-pdf.md](v0.2.0-self-test-guide-pdf.md) | Print-friendly (PDF-export) rendering of the v0.2.0 self-test guide. |
| [v0.1.1-self-test-guide.md](v0.1.1-self-test-guide.md) | Prior-version live-test **script** — build a small app across 2 sessions to exercise capture + recall organically (superseded by the v0.2.0 guide above) |
| [v0.1.1-scenario-test.md](v0.1.1-scenario-test.md) | Reusable 13-scenario test **matrix** (CLI half + in-session half) — the friend/tester walkthrough |

## When to add a new process doc

Add one when you find yourself explaining the same methodology question twice. If two contributors (or two Claude sessions) need to know how we decide X, Y, or Z, capture it here.

Process docs differ from ADRs: ADRs document a one-time decision; process docs document a repeated *practice*.
