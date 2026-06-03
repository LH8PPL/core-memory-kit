---
name: memory-write
description: Captures a durable fact to project memory by running `cmk remember`, the kit's safe write path (Poison_Guard secret/injection screening + home-path sanitization + dedup + conflict detection). Use when the user says "remember this", "note this", "save this", "from now on", "going forward", "I prefer", "I don't like", "we decided", "we agreed", or otherwise states a durable preference, decision, or environment fact worth carrying across sessions. Also covers correcting a saved fact ("update memory: X is now Y") and removing one ("forget about X"). Skip throwaway chatter and facts that only matter to the current task.
allowed-tools: Bash(cmk remember *) Bash(cmk forget *) Read
---

# Capturing durable memory

Durable facts — preferences, decisions, environment state — are saved by running
the kit's CLI. The CLI is the only safe way to write memory.

## MUST / NEVER

- **MUST** capture every durable fact by running `cmk remember` (or `cmk forget`
  to remove). Run the command as shown; do not modify its shape.
- **NEVER** hand-edit `context/MEMORY.md`, `context/USER.md`, or any file under
  `context/memory/`. Direct edits bypass secret screening and home-path
  sanitization and can leak a credential or a local path into a committed file.
- **Silent on success.** Do not announce "saved to memory" unless the user asked.

## Capture a fact (default)

```
cmk remember "<the fact, one sentence>"
```

Writes a bullet to `context/MEMORY.md`. Use it for in-flight work, decisions,
tool versions, paths, and environment facts.

When the fact is not active work, pick its section:

```
cmk remember "<fact>" --section "Environment Notes"
```

Sections: `Active Threads` (default), `Environment Notes`, `Pending Decisions`.

## Capture a fact WITH rationale (preferences, working style, lasting rules)

When the fact carries a reason or a how-to — a user preference, a working-style
rule, a project constraint — capture it richly so the reasoning survives:

```
cmk remember "<headline>" --type <type> --why "<why it holds>" --how "<how to apply it>" --title "<short title>"
```

`--type` is one of:

- `feedback` — how the user wants you to work
- `user` — who the user is (role, expertise)
- `project` — an ongoing goal or constraint
- `reference` — a pointer to an external resource (URL, ticket, dashboard)

This writes a granular fact file with the rationale attached, not just a bullet.

## Correct a fact

Capture the corrected version with `cmk remember`, then remove the stale entry
with `cmk forget` (below) if it is now wrong. Do not hand-edit the old bullet.

## Remove a fact

After confirming with the user (never remove a fact they did not ask to forget):

```
cmk forget "<substring or citation id>" --yes --reason "<why>"
```

Tombstones the fact — it keeps an audit trail and is never a silent delete.

## What NOT to capture

- Throwaway chatter ("user said hi").
- Facts about the current task only — those die with the task; they are not memory.
- Anything you would not want committed to git. Poison_Guard screens secrets, but
  do not lean on it as the first line of defense.
