---
name: memory-write
description: >
  Saves durable facts to context/MEMORY.md or context/USER.md. Auto-triggers
  on phrases the user uses to flag worth-remembering content: "remember this",
  "remember that", "note this", "note that", "save this", "update memory",
  "forget about", "let's remember", "going forward", "from now on", "i prefer",
  "i don't like". Also triggers automatically from the auto-extract Stop hook
  after every assistant turn when a durable fact is detected.
  Three actions: add, replace, remove (confirm with user first).
  Enforces caps (MEMORY.md 2,500 chars, USER.md 1,375 chars) with a dedup guard.
---

# memory-write

## Purpose

Make memory writes **automatic and reliable**. Instead of the user reminding Claude to "save this to memory," the skill captures durable facts the moment they're spoken or decided, with the right structure and the right file.

## When this skill fires

**User-explicit signals**: "remember this/that", "note this/that", "save this/that", "update memory", "forget about X", "from now on", "going forward", "i prefer", "we decided", "we agreed".

**Auto-extract signals** (from the Stop hook): assistant turn contains a durable rule, decision, correction, or environment fact.

## Where to write — file routing

| Content type | File | Section |
|---|---|---|
| Current active work | `context/MEMORY.md` | `## Active Threads` |
| Tool versions, paths, URLs | `context/MEMORY.md` | `## Environment Notes` |
| Open decisions | `context/MEMORY.md` | `## Pending Decisions` |
| Stable user identity | `context/USER.md` | `## About` |
| Persistent preferences | `context/USER.md` | `## Preferences` |
| Working style | `context/USER.md` | `## Working Style` |
| Typed durable fact with rationale | `context/memory/<type>_<slug>.md` | Granular archive |

If unsure: scratchpad (MEMORY.md) is the default.

## How to write

1. Read the target file in full. Need current state to dedup against.
2. **Dedup check**: substring or near-paraphrase match → skip if duplicate.
3. **Cap check**: `wc -c <file>`. If over cap, consolidate FIRST, then add.
4. **Write** single bullet, < 200 chars.
5. **Silent** — no announcement unless the user explicitly asked.

## Actions

- **add** — default. Append under the appropriate section.
- **replace** — when updating an existing fact. Find by substring, swap.
- **remove** — when user says "forget about X". CONFIRM with user first.

## Rules

- Never exceed the cap. Consolidate first.
- Always dedup. Don't accumulate near-duplicates.
- Replace > add when updating existing facts.
- Removal requires confirmation.
- Silent by default.
- Typed durable facts with `**Why:**` + `**How to apply:**` → `context/memory/<type>_<slug>.md` + one-line INDEX.md entry. NOT MEMORY.md.
