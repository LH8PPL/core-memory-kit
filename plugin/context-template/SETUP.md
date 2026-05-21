# Memory System Bootstrap & Repair Guide

> **For Claude Code**: paste this entire file (or its path) into a fresh session as a plan. Run the steps in order. Every step is idempotent — checks state before acting. Safe to re-run on a clone, a new machine, or a partially-broken setup.

This guide installs and maintains the layered memory system used by this project. It is referenced by `CLAUDE.md` as the canonical source for both initial setup and runtime self-repair.

## TL;DR — git clone on a new machine

If you just cloned this repo onto a fresh machine, run the prerequisites for your OS (see `INSTALL-<os>.md` at the kit root), then start a Claude Code session in this project directory and paste this file. Claude will run the idempotent steps end-to-end.

Equivalently, manual bootstrap once prerequisites are installed:

```bash
# 1. Install Python dependencies for memsearch (local-only embeddings)
python -m pip install "memsearch[onnx]"

# 2. Configure memsearch (local ONNX provider, no API key needed)
memsearch config set embedding.provider onnx
memsearch config set embedding.model "gpahal/bge-m3-onnx-int8"

# 3. Bring up Milvus (Windows: docker compose; Linux/Mac: skip — use milvus-lite default)
#    Windows-specific:
cd milvus-deploy && docker compose up -d && cd ..
memsearch config set milvus.uri "http://localhost:19530"
#    Linux/Mac: leave milvus.uri at default — uses milvus-lite at ~/.memsearch/milvus.db

# 4. Initial index
memsearch index context/memory context/sessions context/transcripts

# 5. Register cron jobs (idempotent)
python scripts/register-crons.py
```

That's the whole bootstrap. The directory tree, hooks file, scratchpad files, and granular memory are already in the repo from `git clone` — only the runtime state (memsearch index, scheduled tasks, Docker stack on Windows) needs to be created locally.

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
| 5 | Search (memsearch) | Step 5 below |
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

## Step 5 — memsearch (ASK user before installing)

Goal: hybrid vector + keyword search over `context/memory/`, `context/sessions/`, `context/transcripts/`.

### 5a. Check installation

```bash
memsearch --version
```

If reports a version: skip to 5b.

If missing: ASK the user "Install `memsearch` with local ONNX embeddings (~600MB total: package + bge-m3 model on first use)?" If approved:

```bash
python -m pip install "memsearch[onnx]"
```

The `[onnx]` extra is important — without it, memsearch defaults to OpenAI and requires an API key.

**Windows gotcha**: if multiple Python installs are present, `pip` may install to a different Python than `python` resolves to. If `memsearch --help` fails with import errors after install, run `where memsearch.exe` and `python -c "import memsearch"` to confirm both point to the same Python.

### 5b. Configure embedding provider and backend

```bash
memsearch config set embedding.provider onnx
memsearch config set embedding.model "gpahal/bge-m3-onnx-int8"
```

**Windows-only extra step**: milvus-lite (the default embedded vector store) has no Windows wheels on PyPI. Use the Docker compose stack the kit ships:

```bash
cd milvus-deploy
docker compose up -d
cd ..
memsearch config set milvus.uri "http://localhost:19530"
```

Wait ~30-60 seconds for all three containers (`milvus-standalone`, `milvus-minio`, `milvus-etcd`) to report `(healthy)` via `docker compose ps`.

**Linux / macOS**: skip the docker-compose step entirely. milvus-lite is bundled with the `memsearch[onnx]` install and writes to `~/.memsearch/milvus.db`. Leave `milvus.uri` at the default — no config change needed.

### 5c. Initial index

```bash
memsearch index context/memory context/sessions context/transcripts
```

First run downloads the bge-m3 ONNX model (~558MB) into the huggingface cache. Subsequent runs are incremental.

## Step 6 — Auto-curation (ASK user before installing)

Three jobs run via the host scheduler:

- **Daily memory distill** — 23:00 daily. Reads today's session log and extracts durable facts into MEMORY.md.
- **Nightly memsearch index** — 02:00 daily. Re-indexes context/ markdown files.
- **Weekly memory curator** — Sunday 09:00. Prunes/merges/consolidates MEMORY.md.

Job specs live in `cron/jobs/*.md`. Register them with:

```bash
python scripts/register-crons.py
```

The script reads each job, translates to Task Scheduler tasks on Windows or crontab entries on Unix, and creates them. Idempotent — re-running re-registers any missing tasks without disturbing existing ones.

`scripts/register-crons.py --dry-run` previews the commands without running them. `--unregister NAME` removes a specific task.

Task names are prefixed with the project directory basename by default. Override with `CMK_TASK_PREFIX=myprefix- python scripts/register-crons.py` if you want a custom prefix.

## Health Checks (referenced by CLAUDE.md)

Run silently at session start. Each check is a simple yes/no. On failure, route to the matching repair step.

| ID | Check | How |
|---|---|---|
| HC-1 | memsearch installed | `pip show memsearch` exits 0 (or `memsearch --version` succeeds) |
| HC-2 | Stop hook registered | `.claude/settings.json` contains `transcript-capture.js` |
| HC-3 | MEMORY.md distill is fresh (≤2 days) | Parse `<!-- Last distilled: YYYY-MM-DD -->` from MEMORY.md |
| HC-4 | Transcripts are firing (≤3 days) | `ls context/transcripts/*.md` — newest mtime within 3 days |
| HC-5 | INDEX.md matches `context/memory/` | Files listed in INDEX = files present on disk |
| HC-6 | Cron jobs registered with host scheduler | Windows: `schtasks /query` returns Ready for every active job. Unix: `crontab -l` contains the matching comment line. |
| HC-7 | memsearch backend reachable | `memsearch stats` exits 0. |

## Self-repair (referenced by CLAUDE.md)

When a health check fails:

| Failed | Repair |
|---|---|
| HC-1 | Re-run Step 5a (ASK user to approve `python -m pip install "memsearch[onnx]"`). |
| HC-2 | Re-run Step 4b (register the hook in `.claude/settings.json`). |
| HC-3 | Run the distill script manually: `bash scripts/run-daily-distill.sh`. |
| HC-4 | First check whether this project is the primary cwd in Claude Code. If yes, verify Node is installed and test the hook in isolation. |
| HC-5 | Add missing files to INDEX.md, or remove stale entries. |
| HC-6 | Run `python scripts/register-crons.py` (idempotent). |
| HC-7 | **Windows**: ASK user to start Docker Desktop, then `cd milvus-deploy && docker compose up -d`. **Linux/Mac**: check that `~/.memsearch/milvus.db` is accessible. |

**Rule**: any repair that requires running an install command MUST ASK the user first. Never invoke `pip install`, `npm install`, or system-level changes silently.

## Glossary

- **Frozen snapshot pattern** — at session start, certain files are read once and form a static context. Mid-session writes persist to disk but only take effect next session. Preserves Claude's prefix cache.
- **Tiered retrieval** — when looking up past context, escalate from cheapest (already-in-context) to most expensive (memsearch over transcripts).
- **Granular archive** — per-fact files in `context/memory/<type>_<slug>.md`. Each carries frontmatter + Why + How to apply. Not loaded at startup.
- **Working scratchpad** — `context/MEMORY.md`. Bounded 2.5 KB. Hot state for the current session. Distilled daily.
