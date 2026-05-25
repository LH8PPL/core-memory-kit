# claude-memory-kit

A per-project, in-repo memory system for [Claude Code](https://docs.claude.com/en/docs/claude-code). Fixes Claude's per-session amnesia so you don't have to re-tell the backstory every time you start a new session.

Inspired by [Simon Scrapes' "Master Claude Memory"](https://www.youtube.com/watch?v=rFWxRZ5D-lM) video.

## What it does

- **Frozen snapshot loads at session start**: a small set of files (USER.md, MEMORY.md, SOUL.md, INDEX.md, today's session log) is injected once at the first tool call, giving Claude a static context that survives across sessions.
- **Auto-extract Stop hook**: after every assistant turn, a background `claude --print` invocation reads the turn and saves any durable facts (decisions, preferences, environment changes) to memory. You don't have to flag things manually.
- **`memory-write` skill**: when you say "remember this", "from now on", "we decided", or "forget about X", the skill triggers, dedups against existing memory, enforces char caps, and writes to the right file silently.
- **Per-project, in-repo**: `context/` lives inside the project and travels with `git clone`. Multiple projects on the same machine each have their own memory. Nothing crosses boundaries.
- **Optional Layer 5 (memsearch)**: hybrid vector + keyword search over your memory, sessions, and transcripts. Uses local ONNX embeddings (no API key needed).
- **Optional Layer 6 (auto-curation)**: cron jobs that distill new facts daily, re-index for memsearch nightly, and consolidate the scratchpad weekly.

## Three install paths

Pick the one that fits.

### 1. Script install — clone + run a script

```bash
git clone https://github.com/<your-username>/claude-memory-kit
cd my-new-project
bash /path/to/claude-memory-kit/install.sh   # Linux/macOS
# or
pwsh C:\path\to\claude-memory-kit\install.ps1   # Windows
```

The script copies the template files into your project's `.claude/`, `context/`, `scripts/`, `milvus-deploy/`, and `cron/jobs/` directories. Existing files are never overwritten.

### 2. Claude Code plugin

In Claude Code:

```text
/plugin marketplace add <your-username>/claude-memory-kit
/plugin install claude-memory-kit
# Restart Claude Code, then in each project:
/claude-memory-kit:bootstrap
```

The plugin ships the hooks and skill globally; the `bootstrap` skill scaffolds per-project files.

### 3. Manual copy

Clone the kit and copy `template/.claude`, `template/context`, `template/scripts`, etc. into your project by hand. See each `INSTALL-<os>.md` for the exact commands.

## OS-specific install guides

- [INSTALL-windows.md](INSTALL-windows.md) — winget, Docker Desktop, WSL 2
- [INSTALL-macos.md](INSTALL-macos.md) — Homebrew, milvus-lite (no Docker needed)
- [INSTALL-linux.md](INSTALL-linux.md) — apt, Docker Engine, milvus-lite

## Architecture (six layers)

| Layer | What | Required? |
|---|---|---|
| 1 | In-repo location (`context/` directory tree) | Yes |
| 2 | Granular archive + INDEX.md (typed durable facts) | Yes |
| 3 | Bounded scratchpads (MEMORY.md, USER.md, SOUL.md) | Yes |
| 4 | Auto-extract Stop hook + PreToolUse hook + memory-write skill | Recommended |
| 5 | memsearch (semantic recall) | Optional |
| 6 | Auto-curation crons (distill, index, curate) | Optional |

Layers 1-3 are pure file ops. Layer 4 makes memory writes automatic. Layer 5 lets you search older memories semantically. Layer 6 keeps the scratchpad from growing stale.

See [ARCHITECTURE.md](ARCHITECTURE.md) for the full picture.

## Health checks

Seven yes/no checks run at session start. Each has a documented self-repair path. See [HEALTH-CHECKS.md](HEALTH-CHECKS.md).

## Repo layout

```
claude-memory-kit/
├── README.md                  ← this file
├── ARCHITECTURE.md            ← six-layer design
├── HEALTH-CHECKS.md           ← HC-1..HC-7 and self-repair
├── INSTALL-windows.md
├── INSTALL-macos.md
├── INSTALL-linux.md
├── install.sh                 ← script install (Linux/macOS/Git Bash)
├── install.ps1                ← script install (PowerShell)
├── LICENSE
├── template/                  ← source files copied by install scripts
│   ├── .claude/               ← settings.json, hooks/, skills/
│   ├── context/               ← USER/MEMORY/SOUL templates + SETUP.md
│   ├── scripts/               ← auto-extract, distill, curate, register-crons, etc.
│   ├── milvus-deploy/         ← Docker compose for Milvus v2.6.16
│   ├── cron/jobs/             ← cron job declarations (md frontmatter)
│   └── CLAUDE.md.template     ← orchestrator block to merge into project CLAUDE.md
├── plugin/                    ← Claude Code plugin distribution
│   ├── .claude-plugin/plugin.json
│   ├── hooks/                 ← hooks.json + JS handlers
│   ├── skills/                ← memory-write + bootstrap
│   ├── bin/                   ← auto-extract-memory.sh
│   ├── context-template/      ← template files seeded by /bootstrap
│   ├── cron-template/         ← cron jobs seeded by /bootstrap
│   ├── milvus-deploy-template/← compose seeded by /bootstrap
│   └── scripts/               ← scripts seeded by /bootstrap
├── docs/                      ← (extended docs, ADRs, examples)
└── examples/                  ← (sample projects using the kit)
```

## Development

Contributing to claude-memory-kit itself (vs. installing it in your own project)? Tests are wired through npm scripts — **do not** invoke `vitest` directly, the scripts handle Windows .cmd shim resolution and suppress the cmd.exe popup that bare `npx` invocations cause.

| Script | When to use |
| --- | --- |
| `npm test` | Single full-suite run with validate-test-ids + validate-template prerun. Live-Haiku spawn-smokes run by default (requires `claude` on PATH; gracefully skips if absent). |
| `npm run test:file -- <path>` | Iterate on a single test file. Pass `-t "test name"` after the path to target one test. Skips the slow prerun. |
| `npm run test:watch` | Interactive vitest watcher. |
| `npm run stress` | 5x full suite. Refuses to run if `CMK_SKIP_LIVE_HAIKU=1` — the point is to stress the live spawn boundaries, not to avoid them. **Run this before opening any PR that touches a spawn boundary, hook handler, or detached child.** |
| `npm run lint:test-ids` / `npm run validate:template` | Individual prerun pieces. |

The full test discipline (real-binary spawn smokes, stress-run gate, what "concurrency-sensitive" means) is documented in [`specs/v0.1.0/design.md` §17](specs/v0.1.0/design.md).

## Credit

- Based on the patterns Simon Scrapes documents in his "Master Claude Memory" video and Notion page.
- Frozen-snapshot pattern adapted from [Hermes](https://github.com/anthropics) examples.
- memsearch and the Milvus stack are open-source projects by [Zilliz](https://github.com/zilliztech/memsearch).

## License

MIT
