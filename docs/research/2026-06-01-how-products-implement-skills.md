---
date: 2026-06-01
topic: "How the products we researched implement skills (esp. memory/capture skills) — survey to drive the Task 69.0 memory-write rewrite"
status: complete
informed_sections: [tasks.md Task 69.0/69.1, DECISION-LOG D-28]
sources:
  - https://github.com/sickn33/antigravity-awesome-skills
  - https://github.com/garrytan/gstack
  - docs/research/2026-05-21-claude-mem-architecture.md
  - docs/research/2026-05-30-gstack-skill-layer.md
  - https://code.claude.com/docs/en/skills
tags:
  - skills
  - competitive-analysis
  - memory-write-rewrite
  - skill-md-pattern
---

# How researched products implement skills (survey → Task 69.0)

## Why this research

Lior 2026-06-01: after we found the kit's own `memory-write` skill is stale + unsafe (D-28 / Task 69.0 — it grants `Read Edit Write` and tells Claude to **hand-edit** MEMORY.md, bypassing Poison_Guard + home-path sanitization = the F1 leak class), he asked: *"go over every product we researched/checked, for skills, see if any of them have similar skills and how they do it. you can also check antigravity-awesome-skills."* Goal: extract the right SKILL.md pattern for the rewrite.

## Per-product findings

| Product | Memory skill? | Write mechanism | Frontmatter shape |
| --- | --- | --- | --- |
| **gstack** (`/learn`) — closest analog to memory-write | YES — manages structured "learnings" (type/key/insight/confidence) | **Calls a BINARY**: `~/.claude/skills/gstack/bin/gstack-learnings-log '{json}'` via `Bash`. Does NOT hand-edit for adds. (Prune re-writes via Edit.) | `name`, `description`, `triggers: [list]`, `allowed-tools: [Bash, Read, Write, Edit, AskUserQuestion, Glob, Grep]`, `version`, `preamble-tier` |
| **gstack** (`/context-save`) | freeform checkpoint dump (not structured facts) | Hand-writes a markdown checkpoint via `Write`, but **sanitizes the slug in bash first** + a body gate "HARD GATE: Do NOT implement code changes." | `name`, `description`, `allowed-tools: [Bash, Read, Write, Glob, Grep, AskUserQuestion]` |
| **claude-mem** (`mem-search`) | YES — but **RECALL, not write** ("the canonical memory skill"); ~15 skills total, only 2-3 memory | capture is via hooks/MCP, not the skill | (MCP-backed) |
| **antigravity-awesome-skills** (`agent-memory-systems`) | reference/teaching skill (how to build memory: semantic/episodic/procedural) — not a write-tool | delegates to libraries/services (LangMem, vector DBs); does not hand-edit | `name`, `description`, `risk: safe`, `source`, `date_added` |
| **antigravity-awesome-skills** (`agent-memory-mcp`, `mesh-memory`) | recall/search over a hybrid store | MCP / mesh workflow | community `risk/source/date_added` |
| **claude-remember** (`/remember`) | a slash command to save | we **rejected** the slash-command in favor of phrase-triggers (research 2026-05-21) | — |
| **Hermes** (`memory` tool) | add/replace/remove tool | tool-backed (our memory-write's action model echoes this) | (tool, not a SKILL.md) |
| **basic-memory** | user-explicit capture via `<retain>` tag | tool/tag | — |

## Cross-product patterns (the actionable signal)

1. **Safe structured WRITE = route through the project's CLI/binary via `Bash`, never hand-edit.** gstack `/learn` is the cleanest example: structured facts (with validation/dedup/confidence) go through `gstack-learnings-log`, NOT the Edit tool. The reason is exactly ours: only the tool enforces schema/dedup/safety. **Our rewrite must do the same — call `cmk remember` via `Bash(cmk*)`, not Read/Edit/Write the memory files.** (gstack only hand-writes for `/context-save`, which is a freeform dump — and even then it sanitizes the slug in bash first.)
2. **`allowed-tools` must include `Bash`** to invoke the CLI. Our current skill grants `Read Edit Write` (no Bash) — which simultaneously (a) makes it *unable* to run `cmk` and (b) *enables* the unsafe hand-edit. Flip to `Bash(cmk*)` + `Read` (for the dedup pre-check), and drop `Edit`/`Write` to memory files.
3. **Skills split write vs recall; the canonical memory skill is often RECALL** (claude-mem `mem-search`, antigravity `agent-memory-mcp`). Capture is usually automated (hooks) with the skill as the explicit override — which is exactly the kit's design (auto-extract = capture; skill = override). **Candidate:** add a `cmk search` recall skill too, not just memory-write. (Beyond Task 69; note it.)
4. **A hard safety gate in the skill body is common** (gstack: "HARD GATE: Do NOT implement code changes"). Our rewrite should carry an explicit gate: **"NEVER hand-write `context/memory/` — always `cmk remember`."**
5. **Frontmatter**: everyone uses `name` + `description` + an `allowed-tools` + a "when to use" mechanism (`when_to_use` / `triggers` / folded into description). Anthropic's standard ([skills doc](https://code.claude.com/docs/en/skills)) is `name`/`description`/`allowed-tools`/`disable-model-invocation`/`disallowed-tools`. Our frontmatter shape is fine; the body + tool-grant are the problem.
6. **Skills-as-installable-package is the norm** — antigravity ships a `npx … --claude` installer that drops skills into `.claude/skills/`; claude-mem ships ~15; gstack ships 23. Validates Task 69.1 (`cmk install` scaffolds skills into `<project>/.claude/skills/`).

## Verdict → the Task 69.0 rewrite spec

Rewrite `memory-write/SKILL.md` to the **gstack-`/learn` pattern**:

- **Frontmatter:** keep `description` + `when_to_use` (Anthropic-valid); set `allowed-tools: Bash(cmk*) Read` (Bash to run the CLI; Read for the dedup pre-check). **Remove `Edit`/`Write`.**
- **Body:** instruct Claude to capture via **`cmk remember "<fact>" --why … --how … --type …`** (rich, safe path: Poison_Guard + home-path sanitization + schema). For remove/replace, use the corresponding `cmk` verbs. **Hard gate:** "NEVER hand-edit `context/MEMORY.md` or `context/memory/*` — that bypasses the safety screen; always go through `cmk`."
- **Drop** all dev-repo internal references (`packages/cli/src/…`); the user has `cmk` on PATH, not the kit source.
- **One source** (Task 69.2): this rewritten file is the single source both the plugin route and `cmk install` scaffold from.
- **Candidate (note, not in 69):** a companion `memory-search` skill wrapping `cmk search` (the recall half, which is the canonical memory skill in claude-mem/antigravity).

## Provenance note

Our `memory-write` is our own authored synthesis (Task 24): action model (add/replace/remove) ← **Hermes** `memory` tool; phrase-triggers chosen over **claude-remember**'s `/remember`; `<retain>` idea ← **basic-memory**; consolidation ← **Hermes**. The rewrite adds the **gstack `/learn`** route-through-the-binary safety pattern. Nothing lifted verbatim.

## Related

- [DECISION-LOG D-28](../journey/DECISION-LOG.md) — the skills-delivery decision + the unsafe-skill finding.
- [tasks.md Task 69](../../specs/v0.1.0/tasks.md) — the implementation (69.0 rewrite → 69.1 scaffold → 69.2 one-source+validator → 69.3 slim CLAUDE.md).
- [`2026-05-30-gstack-skill-layer.md`](2026-05-30-gstack-skill-layer.md) — prior gstack skill-layer dive (D-16).
