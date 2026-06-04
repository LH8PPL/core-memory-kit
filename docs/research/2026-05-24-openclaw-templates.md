---
date: 2026-05-24
topic: OpenClaw memory/template architecture
source: https://docs.openclaw.ai/concepts/memory + reference/templates/*
status: complete
informed_sections: [design.md §16.9, §16.10, §16.12]
tags:
  - openclaw
  - competitive-analysis
  - template-design
  - guided-comments
---

# OpenClaw memory + template architecture (research note)

## Why this research

The user pointed at OpenClaw on 2026-05-24 while discussing whether the kit's seed templates should include richer guided comments à la "give you a default in the files as a starter." Worth a deep look because OpenClaw has clearly thought about this pattern at the file-format level.

Captured here as a research artifact so future-Claude (and the article) can reference the comparison.

## What OpenClaw does

### Workspace location

All memory + identity + tooling files live in **a single shared workspace** at `~/.openclaw/workspace/` by default. **Not per-project** — one workspace, all projects. (This is the most significant architectural divergence from claude-memory-kit, which is per-project + 3-tier.)

### File inventory (with auto-creation behavior)

| File | Purpose | Auto-created? | Notes |
| --- | --- | --- | --- |
| `AGENTS.md` | Operating instructions | ✅ on setup/first run | Loaded in both main + subagent sessions |
| `SOUL.md` | Agent disposition / persona | ✅ on setup/first run | Brief template, ~300 words, with inline coaching |
| `IDENTITY.md` | Agent name / nature / vibe / emoji | ✅ on setup/first run | Populated via the BOOTSTRAP.md ritual |
| `USER.md` | User profile | ✅ on setup/first run | Populated via the BOOTSTRAP.md ritual |
| `TOOLS.md` | Tool definitions | ✅ on setup/first run | Loaded in both main + subagent sessions |
| `HEARTBEAT.md` | Periodic scheduled tasks | ✅ on setup/first run | Empty by default; user adds tasks to populate |
| `BOOTSTRAP.md` | One-time identity-discovery ritual | ✅ only when workspace is brand new | **Not regenerated if deleted** — that's the design |
| `MEMORY.md` | Long-term durable storage | ❌ optional, NOT auto-created | When present, loaded every session |
| `memory/YYYY-MM-DD.md` | Daily working notes | ✅ daily auto-rotation | Today + yesterday auto-loaded; older indexed for search |
| `DREAMS.md` | Consolidation summaries | ❌ optional | "Dream diary" for human review |

### Loading behavior

- **Main agent sessions**: load all of `AGENTS.md` + `SOUL.md` + `IDENTITY.md` + `USER.md` + `TOOLS.md` + `MEMORY.md` (if exists) + recent `memory/*.md`.
- **Subagent sessions**: only `AGENTS.md` + `TOOLS.md` are injected — `IDENTITY.md` / `USER.md` / `SOUL.md` are kept out to reduce noise for tool-calling subagents.

This main-vs-subagent distinction is worth flagging: **OpenClaw treats subagents as semantically different**, deserving less context. Our kit doesn't distinguish — the auto-extract subagent (Task 20) gets everything the main session does via the snapshot. Worth considering whether we should differentiate.

### Write triggers

> "Just ask it: 'Remember that I prefer TypeScript'" — explicit user phrases (same as our memory-write skill's phrase trigger override)
>
> "Before compaction, OpenClaw runs a silent turn that reminds the agent to save important context to memory files."

That second mechanism is OpenClaw's equivalent of our auto-extract subagent (Task 23) — but it fires before context compaction, not after every assistant turn. Different timing, same intent.

### Bootstrap pattern (the standout finding)

`BOOTSTRAP.md` is explicitly a **single-use ritual**. The template ends with:

> *"Delete this file. You don't need a bootstrap script anymore - you're you now."*

The agent is supposed to delete the file after using it to fill in `IDENTITY.md` + `USER.md` + `SOUL.md`. **The file is NOT recreated if deleted** — that's the design intent.

This is the opposite of our `docs/BOOTSTRAP.md` (canonical, persistent template for opening new sessions). Worth thinking about whether there's a hybrid — a kit-managed canonical bootstrap (ours) PLUS a one-time first-run identity-discovery ritual (theirs).

### `HEARTBEAT.md`

> "Keep this file empty (or with only comments) to skip heartbeat API calls.
> Add tasks below when you want the agent to check something periodically."

In-session periodic checks driven by the agent itself, distinct from OS-level cron. We don't have this primitive. Could be a v0.2 addition (captured as §16.12 in design.md).

### Template style — guided coaching

OpenClaw's `SOUL.md` template opens with:

> "You're not a chatbot. You're becoming someone"

And includes inline coaching:

> "Be genuinely helpful, not performatively helpful. Skip the 'Great question!'"

This is **exactly the pattern the user named**: starter files that include comments explaining how to fill them in AND demonstrate the desired style. The template doesn't just list section headings — it carries voice.

OpenClaw's BOOTSTRAP.md uses conversational prompts:

> "Hey. I just came online. Who am I? Who are you?"
> "Don't interrogate. Don't be robotic."

The structure of identity discovery happens through dialogue, not form-filling. The template is the script for the dialogue.

## What's worth absorbing for our kit

Mapped against the kit's existing surface:

| OpenClaw pattern | Our equivalent | Worth absorbing? |
| --- | --- | --- |
| Guided-coaching template comments | `template/{project,local,user}/*.md.template` (we have minimal comments) | **Yes** — captured as design §16.9. Enrich our existing templates to match OpenClaw's coaching density. |
| Single-use BOOTSTRAP ritual | Our `docs/BOOTSTRAP.md` is persistent | Maybe. We could ADD a single-use first-run identity-discovery ritual ALONGSIDE the persistent template. v0.1.x candidate. |
| HEARTBEAT.md periodic-task primitive | No equivalent (we have cron + lazy fallback) | **v0.2 candidate** — captured as §16.12. Distinct from cron; lives in workspace. |
| Subagent-specific context (AGENTS.md + TOOLS.md only) | No equivalent — auto-extract subagent gets full snapshot | Worth considering for Task 20 refinement — subagents might benefit from a narrower context to reduce noise. |
| `memory/YYYY-MM-DD.md` daily auto-rotation | Our `sessions/today-{YYYY-MM-DD}.md` is the same pattern | We already have this. Independent convergence confirms the design. |
| DREAMS.md (consolidation summaries) | Our `sessions/recent.md` is the same shape | Already have it. |
| Single workspace (no per-project tier) | 3-tier per-project | Deliberate divergence. Per-project + 3-tier is the kit's distinguishing decision. |

## What's NOT worth absorbing (deliberate divergence)

1. **Single workspace** — OpenClaw's choice. We made the opposite call (per-project + 3-tier) deliberately. Documented in design §1.1.
2. **No content-addressed IDs** — OpenClaw doesn't have stable IDs for individual facts. We do. Different use case.
3. **No conflict / review queues** — OpenClaw's writes are direct. We have explicit medium-trust + conflict-resolution paths.
4. **No provenance trust levels** — OpenClaw doesn't track `trust: high|medium|low`. We do.

These are kit-distinguishing features; not gaps.

## What we ALREADY have that OpenClaw doesn't

Worth recording so future-Claude doesn't second-guess them:

- 3-tier scope (project / local / user)
- Content-addressed citation IDs with cross-machine determinism
- Provenance frontmatter (source, sha1, write_source, trust, created_at)
- Tombstone discipline with audit trail
- Conflict + review queues
- Poison_Guard secret + injection regex filter
- MCP server (stdio)
- Auto-extract subagent + memory-write skill split (per design §6.0)
- Cross-OS install + CI matrix
- Versioned CLAUDE.md block injection with downgrade-guard

## Specific design changes flowing from this research

1. **§16.9 added** to design.md — guided-comment templates as v0.1.x candidate.
2. **§16.10 added** — `docs/journey/` template scaffold as v0.1.x candidate; draft scaffold created at `template/docs/journey/journey-log.md.template`.
3. **§16.11 added** — "See it in action" README section.
4. **§16.12 added** — HEARTBEAT-pattern primitive as v0.2 candidate.
5. **§16.8 added** — `cmk transcripts extract` subcommand (independent of OpenClaw; from bootstrap-test research).

All five are post-bootstrap-test + OpenClaw-research v0.1.x / v0.2 candidates. None require v0.1.0 scope expansion.

## Reference URLs

- <https://docs.openclaw.ai/concepts/memory>
- <https://docs.openclaw.ai/reference/AGENTS.default>
- <https://docs.openclaw.ai/reference/templates/SOUL>
- <https://docs.openclaw.ai/reference/templates/BOOTSTRAP>
- <https://docs.openclaw.ai/reference/templates/HEARTBEAT>
- <https://docs.openclaw.ai/reference/templates/IDENTITY>
- <https://docs.openclaw.ai/reference/templates/USER>
- <https://docs.openclaw.ai/reference/templates/TOOLS>
- <https://docs.openclaw.ai/reference/templates/BOOT>

## Related research notes

- [`2026-05-21-claude-remember-architecture.md`](2026-05-21-claude-remember-architecture.md) — rolling-window pattern source
- [`2026-05-22-primary-source-examination.md`](2026-05-22-primary-source-examination.md) — verification discipline
- [`cursor-design.md`](cursor-design.md) — fourth spec-generator data point
- [`2026-05-23-bootstrap-test.md`](2026-05-23-bootstrap-test.md) — doc-based context transfer experiment
