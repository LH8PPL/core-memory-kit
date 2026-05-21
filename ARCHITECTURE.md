# Architecture

The kit solves one problem: **Claude Code starts each session with no memory of the last one.** Without a system, you re-explain context every time. With it, Claude opens each session having already loaded who you are, what you've been working on, and what the conventions are.

## The six layers

Each layer solves one specific symptom of the amnesia problem. You can install just 1-3 (zero dependencies, file ops only) or add 4-6 as needed.

### Layer 1 — In-repo location

`context/` lives at the project root. Travels with `git clone`. Each project has its own — nothing crosses boundaries. Survives VS Code multi-root workspace setups where a global memory location would get confused about which project is active.

Why not `~/.claude/projects/<slug>/`? Two reasons:

1. **Cross-machine continuity**: a global path is local to one machine. Pushing `context/` to git means a new dev / new laptop is up to speed after `git clone`.
2. **Project-specific signal**: memory tuned for one project pollutes others. Per-project, in-repo enforces the separation.

### Layer 2 — Granular archive

`context/memory/` holds per-fact files: `feedback_*.md`, `project_*.md`, `user_*.md`, `reference_*.md`. Each is small, typed, and carries `**Why:**` + `**How to apply:**` lines so you can judge edge cases later.

`context/memory/INDEX.md` is a flat list of all granular files with one-line descriptions. Loaded at session start so Claude knows what exists; the underlying files are read on demand.

### Layer 3 — Bounded scratchpads

Three small files form the always-loaded snapshot:

| File | Cap | Purpose |
|---|---|---|
| `context/SOUL.md` | ~1.8 KB | Project persona / disposition / norms |
| `context/USER.md` | ~1.4 KB | Stable user identity, preferences, working style |
| `context/MEMORY.md` | ~2.5 KB | Hot working state: active threads, environment notes, pending decisions |

Caps matter. Without them, MEMORY.md balloons over months until it costs more tokens to load than it saves. The weekly curator (Layer 6) keeps it pruned.

The **frozen snapshot pattern**: these files load once per session, form static context, and don't reload mid-session. This preserves Claude's prefix cache. Writes during the session persist to disk and take effect at the *next* session start.

### Layer 4 — Auto-extract + hooks + skill

Four pieces wire together to make memory automatic:

1. **PreToolUse hook** (`pre-tool-memory.js`) — fires once per session, before the first tool call. Reads the snapshot files and injects them as `additionalContext`. Guarantees the snapshot loads regardless of whether Claude reads CLAUDE.md.
2. **Stop hook** (`transcript-capture.js`) — fires after every turn. Captures the transcript AND spawns the auto-extract script in the background.
3. **Auto-extract script** (`auto-extract-memory.sh`) — invokes `claude --print` with a fact-extraction prompt. The sub-Claude reads the turn, decides if anything durable was said, and writes via the memory-write skill if so. Silent.
4. **`memory-write` skill** — auto-triggers on phrases like "remember this", "from now on", "forget about". Handles dedup, cap enforcement, and routing to the right file/section.

Why all four? Each fixes a different reliability gap:

- **Without the PreToolUse hook**: Claude might forget to read the snapshot at session start. Hook makes it guaranteed.
- **Without the Stop hook**: facts get lost between turns. The user has to manually flag them.
- **Without auto-extract**: the user still has to say "remember this" every time. Auto-extract harvests proactively.
- **Without the skill**: writes would be ad-hoc, with duplicates and cap overruns. Skill enforces structure.

### Layer 5 — memsearch (optional)

Hybrid vector + keyword search over `context/memory/`, `context/sessions/`, `context/transcripts/`. Uses local ONNX embeddings (`gpahal/bge-m3-onnx-int8`, ~558MB on first use). No API key.

Backend:
- **Linux/macOS**: milvus-lite, embedded, no setup
- **Windows**: Milvus v2.6.16 via Docker Compose (`milvus-deploy/`). milvus-lite has no Windows wheels.

Used for **Tier 2 retrieval** — when Tier 0 (snapshot) and Tier 1 (grep INDEX.md) miss, escalate to semantic search.

### Layer 6 — Auto-curation crons

Three scheduled jobs keep the system healthy without manual intervention:

| Job | Schedule | What |
|---|---|---|
| Daily memory distillation | 23:00 daily | Extracts durable facts from today's session log into MEMORY.md. |
| Nightly memsearch index | 02:00 daily | Re-indexes `context/` for vector search. |
| Weekly memory curator | Sun 09:00 | Prunes resolved threads, merges duplicates, drops stale entries. |

Registered via `python scripts/register-crons.py`. Translates declarative `cron/jobs/*.md` specs to Task Scheduler tasks on Windows or crontab entries on Unix.

## Data flow

```
┌─────────────────────────────────────────────────────────────────────┐
│ SESSION START                                                       │
│                                                                     │
│  PreToolUse hook fires before first tool call                       │
│       │                                                             │
│       ▼                                                             │
│  Reads context/SOUL.md, USER.md, MEMORY.md, INDEX.md,               │
│        sessions/{today}.md                                          │
│       │                                                             │
│       ▼                                                             │
│  Emits as additionalContext → Claude's context window               │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│ MID-SESSION (every assistant turn)                                  │
│                                                                     │
│  Claude responds                                                    │
│       │                                                             │
│       ▼                                                             │
│  Stop hook fires:                                                   │
│       ├─ Step 1: append to context/transcripts/{today}.md           │
│       └─ Step 2: spawn auto-extract-memory.sh (detached)            │
│                       │                                             │
│                       ▼                                             │
│                  claude --print with fact-extraction prompt         │
│                       │                                             │
│                       ▼                                             │
│                  memory-write skill writes (if anything durable)    │
│                       │                                             │
│                       ▼                                             │
│                  context/MEMORY.md, USER.md, memory/<type>_*.md     │
│                  (writes take effect NEXT session — frozen snapshot)│
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│ ASYNCHRONOUS (cron)                                                 │
│                                                                     │
│  23:00 — run-daily-distill.sh → MEMORY.md updated                   │
│  02:00 — memsearch-index-with-flush.sh → vector index refreshed     │
│  Sun 09:00 — run-weekly-curate.sh → MEMORY.md pruned                │
└─────────────────────────────────────────────────────────────────────┘
```

## When the auto-extract decides something IS durable

Claude (in the sub-process) reads the turn and checks:

1. Did the user explicitly say "remember this", "from now on", "we decided"?
2. Was there a concrete decision worth carrying forward?
3. Did the user correct the assistant on a fact?
4. Did the assistant acknowledge a new environment fact (tool version, path) not already in MEMORY.md?
5. Did the assistant identify a durable rule with `Why:` + `How to apply:`?

If yes → routes to the right file via memory-write. If no → exits silently. Most turns end in "skip: nothing durable" and that's the correct outcome — the system should NOT save everything, only what's worth remembering.

## Why per-project, not global?

A global memory at `~/.claude/memory/` would conflate projects. The fact that you prefer terse responses in your data-science project doesn't mean you want them in your wedding-planning project. Per-project lets each project's persona stay distinct.

Cross-project commonalities (you, the human, prefer X) belong in **multiple** USER.md files — copy-paste them when bootstrapping a new project. The kit doesn't try to share across projects automatically; explicit beats implicit.

## What this is NOT

- **Not a wiki replacement.** Wikis are for curated human-readable knowledge. Memory is for operational state across sessions. They serve different purposes.
- **Not a chat history archive.** Transcripts are captured (Layer 4), but the memory system's value is the *distilled* durable facts, not the raw conversation.
- **Not Claude's official memory feature.** Anthropic may ship something more polished eventually. This is a community-built pattern for the gap that exists today.
