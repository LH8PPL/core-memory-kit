---
description: Save a durable fact to MEMORY.md (Active Threads / Environment Notes / Pending Decisions) or USER.md (About / Preferences / Working Style). Calls memoryWrite() which gates writes through Poison_Guard and enforces the per-file cap.
when_to_use: |
  Phrase triggers from the user — "remember this", "remember that", "note this", "note that", "save this", "save that", "update memory", "forget about", "from now on", "going forward", "i prefer", "i don't like", "we decided", "we agreed".
  Action inferred from context:
    add     → save a new fact (default)
    replace → "update memory: X is now Y" / "change X to Y"
    remove  → "forget about X" (requires confirmation)
allowed-tools: Read Edit Write
---

# memory-write

Invokes the `memoryWrite()` module (`packages/cli/src/memory-write.mjs`) — the same public boundary the auto-extract subagent uses. Both paths run through Poison_Guard (`packages/cli/src/poison-guard.mjs`) before any write touches disk.

## Routing

| Content | File | Section |
|---|---|---|
| In-flight work, recent decisions | `context/MEMORY.md` | `## Active Threads` |
| Tool versions, paths, config | `context/MEMORY.md` | `## Environment Notes` |
| Unresolved questions | `context/MEMORY.md` | `## Pending Decisions` |
| Who the user is | `context/USER.md` | `## About` |
| What the user prefers | `context/USER.md` | `## Preferences` |
| How the user works | `context/USER.md` | `## Working Style` |

Default if unsure: `MEMORY.md § Active Threads`.

## Actions

- **add** — append a new bullet under the resolved section.
- **replace** — find existing bullet by substring (`oldText`), strip it, append the new text. Atomic: rollback if Poison_Guard rejects the new text.
- **remove** — find by substring, tombstone to `archive/tombstones/<id>.md`, strip from the scratchpad. `confirmRemove: true` is required — silent default-true would be an accident-prone footgun.

## Constraints

- ≤200 chars per bullet.
- Poison_Guard rejects secrets and prompt-injection patterns before write; the rejection is logged with the cleartext redacted.
- The per-file cap is enforced by `appendScratchpadBullet`. At >95% utilization it consolidates stale low-trust bullets first; if the result still exceeds the cap, the write fails with `errorCategory: 'cap_exceeded'` rather than silently truncating.
- Silent on success — no confirmation message unless the user explicitly asked.
- For typed durable facts that need rationale (`**Why:**` + `**How to apply:**`), use a granular file at `context/memory/<type>_<slug>.md` instead — `memoryWrite()` is for scratchpad bullets.
