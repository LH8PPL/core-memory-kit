---
name: memory-write
description: >
  Saves durable facts to context/MEMORY.md or context/USER.md. Auto-triggers
  on phrases the user uses to flag worth-remembering content: "remember this",
  "remember that", "note this", "note that", "save this", "update memory",
  "forget about", "let's remember", "going forward", "from now on", "i prefer",
  "i don't like". Also triggers automatically from the auto-extract Stop hook
  after every assistant turn when a durable fact is detected.
  Three actions: add (append under correct section), replace (substring match
  + swap), remove (confirm with user first). Enforces caps (MEMORY.md 2,500
  chars, USER.md 1,375 chars) with a dedup guard so duplicate or near-duplicate
  facts don't accumulate.
---

# memory-write

## Purpose

Make memory writes **automatic and reliable**. Instead of the user reminding Claude to "save this to memory," the skill captures durable facts the moment they're spoken or decided, with the right structure and the right file.

## When this skill fires

**User-explicit signals**:

- "remember this" / "remember that" / "remember our X"
- "note this" / "note that"
- "save this" / "save that"
- "update memory" / "add to memory"
- "forget about X" → remove operation
- "from now on" / "going forward" / "i prefer" / "i don't like" → preference signals
- "we decided" / "we agreed" / "let's use X not Y" → decision signals

**Auto-extract signals** (from the Stop hook):

- Assistant turn contains a "Why:" or "How to apply:" line implying a durable rule
- Assistant turn explicitly acknowledges a user correction ("you're right", "fair point", "i was wrong")
- Assistant turn states a new decision or environment fact that wasn't in MEMORY.md before

## Where to write — file routing

| Content type | File | Section |
|---|---|---|
| Current active work / open threads | `context/MEMORY.md` | `## Active Threads` |
| Tool versions, paths, URLs, env state | `context/MEMORY.md` | `## Environment Notes` |
| Things the user still has to decide | `context/MEMORY.md` | `## Pending Decisions` |
| Stable user identity, role, expertise | `context/USER.md` | `## About` |
| Persistent preferences ("i prefer X") | `context/USER.md` | `## Preferences` |
| How the user approaches work | `context/USER.md` | `## Working Style` |
| Typed durable fact with rationale | `context/memory/<type>_<slug>.md` | Granular archive, with frontmatter + `**Why:**` + `**How to apply:**` |

If unsure: scratchpad (MEMORY.md) is the default. If the fact has long-term reasoning, promote it to a granular file later.

## How to write — the steps

1. Read the target file in full (MEMORY.md or USER.md). Need current state to dedup against.
2. **Dedup check**: scan for substring or near-paraphrase match. If the fact already exists, skip; don't append a duplicate.
3. **Cap check**: `wc -c context/MEMORY.md` (or USER.md). If over the cap:
   - For MEMORY.md: consolidate existing entries first (merge similar bullets, drop stale ones older than 14 days with no current reference), THEN add the new fact.
   - For USER.md: same pattern. USER.md should rarely change — most additions go to MEMORY.md.
4. **Write** the new fact under the appropriate section. Single bullet, concise (< 200 chars).
5. **Confirm silently** — do not announce "saved to memory" unless the user explicitly asked. Auto-extract should be invisible.

## Actions

- **add** — default. Append a new bullet under the appropriate section.
- **replace** — when the user says "update memory: X is now Y", or "we decided to switch from X to Y". Find the existing bullet by substring match and swap.
- **remove** — when the user says "forget about X" or "we changed our mind on X". Confirm with the user FIRST before deleting. Removal is the only action that requires confirmation; add and replace are silent.

## Examples

**Explicit user trigger:**

> User: "remember that we're standardizing on Python 3.13"

Action: add to `MEMORY.md` § Environment Notes:
```
- Python 3.13 is the standard. Older 3.10 envs should be uninstalled to avoid PATH conflicts.
```

**Auto-extract trigger (silent):**

> Assistant turn (after a debugging session): "...so the issue was the system PATH resolving wrong. Fix uses absolute executable paths. Going forward, scheduled tasks should never rely on bare command names."

Auto-extract recognizes "Going forward" + concrete rule → add to `MEMORY.md` § Environment Notes:
```
- Scheduled tasks must use absolute executable paths (not bare command names) — system PATH can resolve to the wrong binary.
```

**Replace trigger:**

> User: "actually we bumped to v2.6.16 from v2.5.27"

Action: find existing "v2.5.27" bullet in MEMORY.md, replace the version. Silent.

**Remove trigger:**

> User: "forget about the daily-distill cron — we're going to do something different"

Action: Ask the user "Remove the daily-distill entries from MEMORY.md Active Threads? (y/n)" before deleting.

## Rules

- Never exceed the cap. Consolidate first if needed.
- Always check for duplicates / near-duplicates before adding.
- Replace is preferred over add when updating existing facts (avoids accumulating contradictory bullets).
- Removal requires user confirmation.
- For typed durable facts with explicit `**Why:**` / `**How to apply:**` structure, write to `context/memory/<type>_<slug>.md` and add a one-line entry to INDEX.md instead of MEMORY.md.
- **Silent by default.** Do not narrate memory writes unless the user explicitly asked. The whole point is invisible bookkeeping.

## Common mistakes to avoid

- Don't write conversational chatter to MEMORY.md ("user said hello"). Only durable facts.
- Don't duplicate. Always check first.
- Don't blow the cap. Consolidate first.
- Don't announce. Silent unless asked.
- Don't promote everything to the granular archive — the scratchpad is the default. Granular files are for facts with explicit rationale that have long shelf life.
