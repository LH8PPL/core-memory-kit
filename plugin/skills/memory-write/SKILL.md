---
name: memory-write
description: Captures a durable fact to project memory through the kit's safe write path (Poison_Guard secret/injection screening + home-path sanitization + dedup + conflict detection) — preferring the cmk MCP tools (mk_remember / mk_forget / mk_trust) when connected, falling back to the cmk CLI. Use when the user says "remember this", "note this", "save this", "from now on", "going forward", "I prefer", "I don't like", "we decided", "we agreed", or otherwise states a durable preference, decision, or environment fact worth carrying across sessions. Also covers correcting a saved fact ("update memory: X is now Y"), removing one ("forget about X"), and adjusting how much a saved fact is trusted ("trust this", "that's important — keep it", "that's not important / I'm not sure about that / low priority"). Skip throwaway chatter and facts that only matter to the current task.
allowed-tools: mcp__cmk__mk_remember mcp__cmk__mk_forget mcp__cmk__mk_trust Bash(cmk remember *) Bash(cmk forget *) Bash(cmk trust *) Read
---

# Capturing durable memory

Durable facts — preferences, decisions, environment state — are saved through the
kit's safe write path (Poison_Guard secret screening + home-path sanitization +
dedup + conflict detection).

- **NEVER hand-edit** `context/MEMORY.md`, `context/USER.md`, or any file under
  `context/memory/`. Direct edits bypass screening and can leak a credential or a
  local path into a committed file.
- **Silent on success.** Do not announce "saved to memory" unless the user asked.

There are two equivalent surfaces onto the same safe path. **Prefer the MCP tools
when the `cmk` server is connected** — params are structured data, so backtick /
`$()` / quote-heavy rationale can't be mangled by a shell, and there's no
per-command approval prompt.

## Preferred: the cmk MCP tools (when connected)

- **Capture** → call `mk_remember` with `text`. For a preference, working-style
  rule, or constraint, also pass `why`, `how`, `title`, and `type` — this writes a
  rich Why/How fact file, not just a bullet.
- **Remove** → call `mk_forget` with the fact `id`. Two-step: the first call
  previews what would be removed and returns a `confirm_token`; call again with
  that token to tombstone (audit trail preserved). Confirm with the user first.
- **Adjust trust** → call `mk_trust` with the fact `id` and a `level` of `low`,
  `medium`, or `high`. Use when the user signals how much a saved fact matters:
  "trust this" / "that's important — keep it" → `high`; "that's not important / I'm
  not sure / low priority" → `low`. Trust drives what gets injected first and what
  ages out, so this is the user steering their own memory without editing files.

`type` is one of:

- `feedback` — how the user wants you to work
- `user` — who the user is (role, expertise)
- `project` — an ongoing goal or constraint
- `reference` — a pointer to an external resource (URL, ticket, dashboard)

## Fallback: the cmk CLI (when the MCP server isn't connected)

Capture a bullet:

```
cmk remember "<the fact, one sentence>"
```

Pick a section for facts that are not active work:

```
cmk remember "<fact>" --section "Environment Notes"
```

Sections: `Active Threads` (default), `Environment Notes`, `Pending Decisions`.

Capture WITH rationale (preference, working-style rule, project constraint):

```
cmk remember "<headline>" --type <type> --why "<why it holds>" --how "<how to apply it>" --title "<short title>"
```

For backtick / quote-heavy rationale, pass it off-shell as a JSON object so the
shell can't corrupt it (the D-81 fix):

```
cmk remember --from-file fact.json
```

Remove a fact (after confirming with the user — never remove one they did not ask
to forget):

```
cmk forget "<substring or citation id>" --yes --reason "<why>"
```

Tombstones the fact — it keeps an audit trail and is never a silent delete.

Adjust how much a saved fact is trusted (`<id>` comes from `cmk search`):

```
cmk trust <id> <low|medium|high>
```

## What NOT to capture

- Throwaway chatter ("user said hi").
- Facts about the current task only — those die with the task; they are not memory.
- Anything you would not want committed to git. Poison_Guard screens secrets, but
  do not lean on it as the first line of defense.
