# Memory System Bootstrap & Repair Guide

> **For Claude Code**: paste this entire file (or its path) into a fresh session as a plan. Run the steps in order. Every step is idempotent — checks state before acting. Safe to re-run on a clone, a new machine, or a partially-broken setup.

This guide installs and maintains the layered memory system used by this project. It is referenced by `CLAUDE.md` as the canonical source for both initial setup and runtime self-repair.

## TL;DR — git clone on a new machine

If you just cloned this repo onto a fresh machine, run the prerequisites for your OS (see `INSTALL-<os>.md` at the kit root), then start a Claude Code session in this project directory and paste this file. Claude will run the idempotent steps end-to-end.

Equivalently, manual bootstrap once prerequisites are installed:

```bash
# Register cron jobs (idempotent) — the only runtime step
cmk register-crons
```

That's the whole bootstrap. The directory tree, hooks file, scratchpad files, and granular memory are already in the repo from `git clone` — only the runtime state (scheduled tasks) needs to be created locally. Keyword search works out of the box; the Layer-5b semantic backend is not yet shipped.

## Architecture overview

```
context/                          [layer 1: location, in-repo]
├── SOUL.md                       [layer 3: project persona, ~1.8 KB cap]
├── USER.md                       [layer 3: user profile, ~1.4 KB cap]
├── MEMORY.md                     [layer 3: working scratchpad, ~2.5 KB cap]
├── memory/                       [layer 2: long-term granular archive]
│   ├── INDEX.md                  ← directory of per-fact files (read on demand)
│   └── <type>_<slug>.md          ← user/feedback/project/reference entries
├── sessions/                     [layer 4a: daily session logs]
│   └── {YYYY-MM-DD}.md
├── transcripts/                  [layer 4b: Stop-hook transcript captures]
│   └── {YYYY-MM-DD}.md
└── SETUP.md                      ← this file
```

Layers and what installs each:

| Layer | What | Installed by |
|---|---|---|
| 1 | In-repo location (`context/`) | Kit scaffolding |
| 2 | Granular archive + INDEX | Kit scaffolding |
| 3 | Bounded scratchpads (MEMORY.md, USER.md, SOUL.md) | Kit scaffolding |
| 4 | Auto-extract + Stop hook + PreToolUse hook + memory-write skill | Step 4 below |
| 5a | Keyword search (SQLite + FTS5) | Built in — no install |
| 5b | Semantic search (embedded vector backend) | Not yet shipped (design §9.3.1) |
| 6 | Auto-curation (cron jobs) | Step 6 below |

Layers 1-3 are pure file ops, no external dependencies. Layers 4-6 require installs and should ASK the user before running.

## Step 1 — Directory structure (always run)

```bash
test -d context              || mkdir -p context
test -d context/memory       || mkdir -p context/memory
test -d context/sessions     || mkdir -p context/sessions
test -d context/transcripts  || mkdir -p context/transcripts
```

## Step 2-3 — Scratchpad files (always run)

If `context/MEMORY.md`, `context/USER.md`, `context/SOUL.md`, or `context/memory/INDEX.md` don't exist, the kit's install script (or manual copy) seeds them from the `*.template` versions in this directory.

If they DO exist: leave them alone. They contain curated state from prior sessions.

## Step 4 — Hooks and the memory-write skill (ASK user before installing)

Layer 4 is what makes memory writes **automatic** instead of manual. Four parts work together:

| Component | What it does |
|---|---|
| **`.claude/hooks/transcript-capture.js`** (Stop hook) | Fires after every assistant turn. Step 1: appends the first ~500 chars to `context/transcripts/{today}.md`. Step 2: spawns `scripts/auto-extract-memory.sh` in the background. |
| **`scripts/auto-extract-memory.sh`** (background extractor) | Invokes `claude --print` with a focused prompt that reads the turn and decides whether anything durable was said. If yes, calls the memory-write skill to save it. Silent; logs to `context/sessions/{today}.extract.log`. |
| **`.claude/skills/memory-write/SKILL.md`** (skill) | Auto-triggers on user phrases ("remember this", "from now on", "we decided", "forget about"). Handles add / replace / remove with dedup guard and char-cap enforcement. |
| **`.claude/hooks/pre-tool-memory.js`** (PreToolUse hook) | Fires once per session before the first tool call. Reads SOUL.md + USER.md + MEMORY.md + INDEX.md + today's session log and injects them as `additionalContext`. |

Goal: the user never has to flag "save this" or "remember that." The system harvests durable content on its own.

### 4a. Check `.claude/hooks/`

```bash
test -f .claude/hooks/transcript-capture.js
test -f .claude/hooks/pre-tool-memory.js
```

If both exist: skip to 4b.

If missing: re-run the install script, or copy them from `kit/template/.claude/hooks/`.

### 4b. Register hooks in `.claude/settings.json`

The kit ships a `.claude/settings.json` that registers both hooks. If you merged this project with an existing `.claude/settings.json`, ensure the hooks block contains both entries:

```json
"hooks": {
  "Stop": [
    { "hooks": [{ "type": "command", "command": "node .claude/hooks/transcript-capture.js" }] }
  ],
  "PreToolUse": [
    { "hooks": [{ "type": "command", "command": "node .claude/hooks/pre-tool-memory.js" }] }
  ]
}
```

### 4c. The memory-write skill

`.claude/skills/memory-write/SKILL.md` ships with the kit. Claude Code auto-discovers skills on session start. No registration step.

**Important — primary working directory caveat**: Claude Code fires hooks AND discovers skills from the **primary** working directory's `.claude/` only. If you opened Claude Code with a different project as primary and this one as an added/additional directory, neither the hooks nor the skill in this project will activate. Fix: open Claude Code with this project as the primary cwd.

## Step 5 — Search

**Keyword search works out of the box** — SQLite + FTS5, no install required: `cmk search "<query>"`.

**Semantic / hybrid search (Layer 5b) is not yet shipped.** The embedded vector backend is a future release; the `semanticBackend` DI seam is already in place (see the kit's `specs/design.md` §9.3.1 for the deferred backend choice). Until it lands, `cmk search --mode=semantic` / `--mode=hybrid` error with a clear "not yet shipped" message — use the default keyword mode.

## Step 6 — Auto-curation (ASK user before installing)

Three jobs run via the host scheduler:

- **Daily memory distill** — 23:00 daily. Reads today's session log and extracts durable facts into MEMORY.md.
- **Weekly memory curator** — Sunday 09:00. Prunes/merges/consolidates MEMORY.md.

Register them with:

```bash
cmk register-crons
```

The command translates to crontab entries (Linux), LaunchAgents (macOS), or Task Scheduler tasks (Windows) and creates them. Idempotent — re-running overwrites existing entries cleanly. Entry names are kit-level constants (`cmk-daily-distill`, `cmk-weekly-curate`) — no per-project prefix in v0.1.0 (see design §16.43 for the v0.1.x `--daily-only` / `--weekly-only` flags).

`cmk register-crons --dry-run` previews the platform-detected commands without running them. `cmk register-crons --unregister` removes both entries.

## Health Checks (referenced by CLAUDE.md)

Run silently at session start. Each check is a simple yes/no. On failure, route to the matching repair step.

| ID | Check | How |
|---|---|---|
| HC-1 | Stop hook registered | `.claude/settings.json` contains `transcript-capture.js` |
| HC-2 | MEMORY.md distill is fresh (≤2 days) | Parse `<!-- Last distilled: YYYY-MM-DD -->` from MEMORY.md |
| HC-3 | Transcripts are firing (≤3 days) | `ls context/transcripts/*.md` — newest mtime within 3 days |
| HC-4 | INDEX.md matches `context/memory/` | Files listed in INDEX = files present on disk |
| HC-5 | Cron jobs registered with host scheduler | Windows: `schtasks /query` returns Ready for every active job. Unix: `crontab -l` contains the matching comment line. |

## Self-repair (referenced by CLAUDE.md)

When a health check fails:

| Failed | Repair |
|---|---|
| HC-1 | Re-run Step 4b (register the hook in `.claude/settings.json`). |
| HC-2 | Run the distill once: `cmk daily-distill` (or `cmk compress --lazy` for the no-cron fallback). |
| HC-3 | First check whether this project is the primary cwd in Claude Code. If yes, verify Node is installed and test the hook in isolation. |
| HC-4 | Add missing files to INDEX.md, or remove stale entries. |
| HC-5 | Run `cmk register-crons` (idempotent — overwrites existing entries cleanly). |

**Rule**: any repair that requires running an install command MUST ASK the user first. Never invoke `pip install`, `npm install`, or system-level changes silently.

## Glossary

- **Frozen snapshot pattern** — at session start, certain files are read once and form a static context. Mid-session writes persist to disk but only take effect next session. Preserves Claude's prefix cache.
- **Tiered retrieval** — when looking up past context, escalate from cheapest (already-in-context) to most expensive (search over transcripts).
- **Granular archive** — per-fact files in `context/memory/<type>_<slug>.md`. Each carries frontmatter + Why + How to apply. Not loaded at startup.
- **Working scratchpad** — `context/MEMORY.md`. Bounded 2.5 KB. Hot state for the current session. Distilled daily.
