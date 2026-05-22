---
date: 2026-05-21
topic: Anthropic official Memory tool documentation
source: WebFetch of platform.claude.com/docs/en/agents-and-tools/tool-use/memory-tool
status: complete
informed_adrs: [0002]
tags:
  - anthropic-memory-tool
  - official-api
  - markdown-storage
---

# Research: Anthropic's official Memory tool

## Why this research

Anthropic shipped an official `Memory tool` in 2025 (beta, `type: memory_20250818`). It's API-level, not Claude Code. Understanding its design tells us how Anthropic itself thinks memory should work — and validates (or contradicts) our design choices.

## What it is

A **client-side memory tool** exposed via the Anthropic Messages API. When enabled, Claude can call the tool to create, read, update, and delete files in a `/memories` directory. The actual storage is up to the application — Claude makes tool calls; the application's handler decides where to put the files.

- **Type**: `memory_20250818` (beta)
- **Storage**: client-side, controlled by the implementer
- **Format**: markdown files at `/memories/*.md`
- **Operations**: `view`, `create`, `str_replace`, `insert`, `delete`, `rename`
- **Scope**: whatever the application decides — could be per-user, per-conversation, per-project, anything
- **Eligible for Zero Data Retention** (ZDR) for orgs with that arrangement

## Why this matters for claude-memory-kit

**Anthropic's official answer is also markdown.** This validates ADR-0002 — markdown as the source of truth, not opaque DB. Even Anthropic's recommended pattern is markdown files in a directory.

Direct quote from the docs:

> "Since this is a client-side tool, Claude makes tool calls to perform memory operations, and your application executes those operations locally. This gives you complete control over where and how the memory is stored. For security, you should restrict all memory operations to the `/memories` directory."

The memory tool is essentially **a tool-shaped interface to the same markdown-files-in-a-directory pattern we chose**. Different surface (tool calls vs. hooks), same underlying storage.

## How Anthropic thinks about sensitive content

The docs explicitly warn:

> "Claude will usually refuse to write down sensitive information in memory files. However, you may want to implement stricter validation that strips out potentially sensitive information."

This validates our **`<private>` tag pattern** (per ADR/FR in requirements.md). Anthropic's position: the model itself filters loosely, but you (the implementer) should strip aggressively. Our `<private>` tag is exactly the kind of explicit user-driven strip they describe.

## Memory protocol (auto-inserted into system prompts)

When the memory tool is enabled, this instruction is added to the system prompt automatically:

```text
IMPORTANT: ALWAYS VIEW YOUR MEMORY DIRECTORY BEFORE DOING ANYTHING ELSE.
MEMORY PROTOCOL:
1. Use the `view` command of your `memory` tool to check for earlier progress.
2. ... (work on the task) ...
     - As you make progress, record status / progress / thoughts etc in your memory.
ASSUME INTERRUPTION: Your context window might be reset at any moment, so you risk losing any progress that is not recorded in your memory directory.
```

This is structurally identical to our **frozen-snapshot pattern** — read memory first, then act. Validates the approach.

## Multi-session software development pattern

The docs describe a pattern Anthropic recommends for long-running software projects:

1. **Initializer session** sets up memory artifacts:
   - Progress log (what's done, what's next)
   - Feature checklist (defining scope)
   - Reference to startup/init script
2. **Subsequent sessions** open by reading those artifacts.
3. **End-of-session update** records progress before session ends.

Key principle from the docs: *"Work on one feature at a time. Only mark a feature complete after end-to-end verification confirms it works, not just after the code is written. This keeps the progress log trustworthy and prevents scope creep from compounding across sessions."*

This is structurally identical to our `sessions/now.md` + `sessions/today-{date}.md` rolling-window pattern, except they don't explicitly compress between layers. We do (via Haiku) — see FR-19.

## Security considerations (worth borrowing)

The docs warn about **path traversal attacks** against the memory directory:

> "Malicious path inputs could attempt to access files outside the `/memories` directory. Your implementation **MUST** validate all paths to prevent directory traversal attacks."

Safeguards they recommend:

- Validate all paths start with `/memories`
- Resolve paths to canonical form (Python's `pathlib.Path.resolve()`)
- Reject `../`, `..\\`, URL-encoded `%2e%2e%2f`

For `claude-memory-kit`: same principle applies to our `context/` directory. The auto-extract sub-Claude shouldn't be able to write outside `context/`. Already enforced in v0.0.1 via the `--allowed-tools` allowlist; should be tightened in v0.1.

## How this informed our ADRs

| Finding | Our response |
|---|---|
| Markdown files as memory storage | Confirms ADR-0002. Even Anthropic agrees. |
| `/memories` directory pattern | Mirrors our `context/` directory. Same concept, different name. |
| Privacy via implementer-side stripping | Validates `<private>` tag pattern in requirements.md FR-15. |
| Frozen-snapshot / read-first protocol | Validates our SessionStart + PreToolUse fallback pattern. |
| Multi-session pattern with progress log + initializer | Maps onto our `sessions/now.md` / `today-*.md` hierarchy. Their pattern lacks our compression layer; we add it. |
| Path traversal warning | Tighten allowlists in v0.1 auto-extract. |

## What's different (and why)

Anthropic's tool is **API-level**, not Claude Code-level. It's a tool the model calls. Ours is **infrastructure-level** — hooks fire automatically based on session lifecycle, no model call needed for capture. This is the right shape for our use case: we want capture even if Claude doesn't think to call a tool.

A future v0.X could **add** the memory tool's API surface as another layer — exposing `cmk_view`, `cmk_create`, etc. via MCP that mirror the memory tool's operations. Not in v0.1 scope.

## References

- Anthropic Memory tool docs: <https://platform.claude.com/docs/en/agents-and-tools/tool-use/memory-tool> (retrieved 2026-05-21)
- Effective context engineering for AI agents: <https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents>
- Effective harnesses for long-running agents: <https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents>
- Anthropic SDK examples (Python): <https://github.com/anthropics/anthropic-sdk-python/blob/main/examples/memory/basic.py>
- Anthropic SDK examples (TypeScript): <https://github.com/anthropics/anthropic-sdk-typescript/blob/main/examples/tools-helpers-memory.ts>
- Related ADRs: [0002-markdown-source-of-truth-over-opaque-db.md](../adr/0002-markdown-source-of-truth-over-opaque-db.md)
- Conversation context: [../conversation-log/2026-05-21.md](../conversation-log/2026-05-21.md), thread "Verifying with Anthropic's official position"
