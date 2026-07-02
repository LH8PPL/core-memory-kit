<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/LH8PPL/claude-memory-kit/main/docs/public/assets/wordmark-dark.svg">
    <img src="https://raw.githubusercontent.com/LH8PPL/claude-memory-kit/main/docs/public/assets/wordmark.svg" alt="claude-memory-kit" width="340">
  </picture>
</p>

<p align="center">
  <strong>Persistent, per-project memory for <a href="https://docs.claude.com/en/docs/claude-code">Claude Code</a> — plain markdown, committed with your code, recalled by meaning.</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@lh8ppl/claude-memory-kit"><img src="https://img.shields.io/npm/v/@lh8ppl/claude-memory-kit?label=npm&color=blue" alt="npm"></a>
  <a href="https://github.com/LH8PPL/claude-memory-kit/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-yellow" alt="License: MIT"></a>
  <img src="https://img.shields.io/badge/Node.js-bundled%20%C2%B7%20none%20required-brightgreen" alt="Node.js bundled, none required">
  <a href="https://github.com/LH8PPL/claude-memory-kit/actions/workflows/ci.yml"><img src="https://github.com/LH8PPL/claude-memory-kit/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Windows-supported-0078D6?logo=windows&logoColor=white" alt="Windows supported">
  <img src="https://img.shields.io/badge/macOS-supported-000000?logo=apple&logoColor=white" alt="macOS supported">
  <img src="https://img.shields.io/badge/Linux-supported-FCC624?logo=linux&logoColor=black" alt="Linux supported">
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Claude_Code-supported-6E56CF" alt="Claude Code supported">
  <img src="https://img.shields.io/badge/Kiro-supported-6E56CF" alt="Kiro supported">
</p>

Claude forgets everything when a session ends — so every new chat you re-explain who you are, what you're building, and how you like things done. **claude-memory-kit** fixes that: it quietly captures your decisions, preferences, and project context, then hands them back at the start of every session. Everything is plain text inside your project, and it travels with the code — `git clone` brings the memory along.

> [!NOTE]
> **Not a developer?** If you can open a project in Claude Code, you're set — let Claude run the setup for you (see [Quickstart](#quickstart)).

## How it feels

You open Claude Code on a project you haven't touched in weeks. Before you say anything, Claude already knows your stack, your conventions, and what you decided last time:

```
claude-memory-kit: 23 fact(s) in context, 2 captured in the last 24h, 1 conflict pending
```

You work. It learns — automatically, no buttons. Next session, it remembers this one too.

## Features

- **Remembers across sessions** — a frozen snapshot of your project + persona injects once at session start, so Claude leads with what it knows instead of re-deriving it from code.
- **Captures automatically, prompt-free** — a background pass reads each turn and saves durable facts as searchable notes. No "save" button. When you *do* say "remember this," the kit auto-approves its **own** tools and skills so the save happens with no "Allow?" prompt — nothing else is touched.
- **Recalls by meaning** — ask in your own words ("where do credentials go") and get the right fact even with zero keyword overlap. Fully local, zero API calls — **R@5 0.941 / paraphrase 1.000** ([benchmarks](#benchmarks)).
- **Learns how you work, everywhere** — state a habit once ("always use uv, never pip") and a brand-new project cold-opens already knowing it.
- **Stays TRUE as it ages, not just stored** — facts carry a temporal shape ("ongoing state" vs "happened once" vs "planned"), facts with a shelf life expire on their own (`--expires 2026-08-01` → hidden from recall, recoverably archived), and a weekly pass catches state changes: when a newer fact supersedes an older one ("cut-gate in progress" → "published to npm"), the old state's validity window closes so recall answers with the *current* state — history intact, and the next session opens with a one-line note of what was resolved.
- **Stays private + bounded** — secrets are screened before any write, machine paths are abstracted to `~`, and rolling compression keeps memory small as history grows.
- **Guards against accidental deletion** — a hook **blocks** a destructive command (`rm`, `git reset --hard`, …) the moment it targets a memory path, before it runs.
- **Works across your agents** — the same memory brain on **Claude Code** and **[Kiro](https://kiro.dev)** (IDE + `kiro-cli`). A project's `context/` is shared, so memory you build in one is there in the other.
- **Per-project, in your repo** — `context/` lives in your project and travels with `git clone`. Each project keeps its own memory.

## Quickstart

> [!IMPORTANT]
> Pick **one** route — both wire the same hooks and are complete on their own.

### Route A — npm (recommended)

Install the CLI once, then run `cmk install` in each project — pick your agent:

```bash
npm install -g @lh8ppl/claude-memory-kit
cd ~/my-project
```

**Claude Code:**

```bash
cmk install                   # scaffold context/ + wire hooks (one step)
cmk install --with-semantic   # optional: local semantic recall (~260 MB, once)
cmk doctor                    # verify, then restart Claude Code
```

**Kiro** (IDE + `kiro-cli` — see [the Kiro guide](https://github.com/LH8PPL/claude-memory-kit/blob/main/docs/KIRO.md)):

```bash
cmk install --ide kiro                   # wire Kiro end-to-end
cmk install --ide kiro --with-semantic   # …with local semantic recall
cmk doctor                                # verify, then restart Kiro
```

`cmk install` is the whole entry point: it scaffolds `context/`, drops the memory skills, wires the lifecycle hooks, and registers the MCP server so the agent can drive memory as tools — no `/plugin` step needed. A project can carry **both** agents — run both installs; they share one `context/`.

> [!TIP]
> Prefer not to touch the terminal? Open the project in Claude Code and say *"install claude-memory-kit and set it up here."* Claude runs the commands; you just approve them. **Restart Claude Code once** afterward (`/exit`, then `claude`) so the hooks load.

### Route B — Claude Code plugin

```text
/plugin marketplace add LH8PPL/claude-memory-kit   # add this repo as a plugin source (once per machine)
/plugin install claude-memory-kit                  # install hooks + skills (once per machine)
cd ~/my-project
/claude-memory-kit:bootstrap                        # scaffold this project's memory (once per project)
```

The plugin bundles the hooks + skills, so it's complete without the npm CLI. Add the CLI later only if you want `cmk search` / `cmk doctor` / cron.

> [!NOTE]
> **Updating** has two parts on both routes: update the machinery, then re-stamp each project (`cmk install` again, or `/claude-memory-kit:bootstrap`). `cmk doctor` flags any project that's behind so you don't have to remember.

## How it works

`context/` is the source of truth — plain markdown, committed with your code. A regenerable SQLite + FTS5 index (plus an optional local embedder) powers search. Memory lives in three tiers:

| Tier | Location | Scope | What lives here |
| --- | --- | --- | --- |
| **Project** | `<repo>/context/` | committed — travels with `clone` | Decisions, conventions, file purposes |
| **Local** | `<repo>/context.local/` | gitignored, per-machine | Machine paths, local tool versions |
| **User** | `~/.claude-memory-kit/` | cross-project, per-person | Persona, cross-project lessons |

Project memory follows the **repo** (teammates get it on clone). Your persona follows **you** — machine-local, never committed. Carry it between your own machines with `cmk persona export` / `import`.

## CLI

You rarely type these yourself — Claude drives the same operations as tools mid-conversation through the kit's **MCP server** (full tool reference: **[docs/MCP.md](https://github.com/LH8PPL/claude-memory-kit/blob/main/docs/MCP.md)**). The commands:

| Command | Purpose |
| --- | --- |
| `cmk install [--with-semantic] [--ide claude-code\|kiro]` | Scaffold + wire hooks + register the MCP server (complete entry point) |
| `cmk uninstall [--ide claude-code\|kiro]` | Remove one agent's wiring — conservative, never deletes `context/` |
| `cmk doctor` | Run HC-1..HC-10 health checks; surface a repair command per failure |
| `cmk repair --hooks` / `--locks` / `--index` / `--all` | Idempotent self-repair |
| `cmk search "<query>" [--mode keyword\|semantic\|hybrid] [--scope facts\|transcripts\|decisions]` | Search memory by meaning (hybrid default after `--with-semantic`); `--scope transcripts` = raw session record; `--scope decisions` = the decision journal (history / "what did we reject") |
| `cmk remember "<fact>"` | Capture a fact explicitly (deduped, secret-screened, path-abstracted). `--from-file fact.json` for backtick/quote-heavy rich facts |
| `cmk get <id…>` / `cmk timeline <id>` / `cmk cite <id>` / `cmk recent-activity` | Read the index back — full fact bodies + provenance, context around an observation, a citation link, recent changes (the CLI side of the `mk_*` MCP read tools) |
| `cmk forget <id>` | Tombstone a fact — gone from `cmk search` immediately (audit trail preserved) |
| `cmk lessons promote <id> [--to USER.md\|HABITS.md]` | Promote one project fact to your cross-project **user tier** so it applies in **every** project |
| `cmk roll --scope now\|today\|recent` | Manually trigger a compression pipeline |
| `cmk register-crons [--dry-run] [--unregister]` | Register daily + weekly compression jobs (cron / launchd / Task Scheduler) |
| `cmk disable-native-memory` / `enable-native-memory` | Opt out of Claude Code's built-in Auto Memory so the kit is your single, lean layer |
| `cmk persona generate` · `export <file>` · `import <file>` | Synthesize your cross-project persona on demand; carry it to another of **your** machines (private — never committed) |
| `cmk import-claude-md [file]` · `import-anthropic-memory` | Seed memory from an existing `CLAUDE.md` / `.cursorrules` / `AGENTS.md`, or merge Anthropic's native auto-memory bullets (`--dry-run` previews) |

Full reference with examples: **[docs/CLI.md](https://github.com/LH8PPL/claude-memory-kit/blob/main/docs/CLI.md)** or `cmk --help`.

## Working with Kiro

[Kiro](https://kiro.dev) (the AWS agentic IDE + `kiro-cli`) is a first-class target — `cmk install --ide kiro` wires it end-to-end for both the IDE and the terminal, and a project's `context/` is shared with Claude Code. The full setup, surface table, and dual-agent notes are in **[the Kiro guide](https://github.com/LH8PPL/claude-memory-kit/blob/main/docs/KIRO.md)**.

## Uninstalling

`cmk uninstall` is **conservative** — it removes only the kit's managed wiring for one agent and **never deletes your `context/` memory** (your data) or anything outside the kit's markers.

**Claude Code:**

```bash
cmk uninstall              # remove the CLAUDE.md block + hooks
```

**Kiro:**

```bash
cmk uninstall --ide kiro   # remove the .kiro/ blocks + skills + IDE hooks + AGENTS.md + ~/.kiro CLI agent
```

On a dual-agent project, uninstall one and the other keeps working. To remove the memory data too, delete `context/` (and `context.local/`) yourself — the kit won't do it for you.

## Benchmarks

Recall quality is **measured, not claimed** — `npm run bench:recall` runs a LongMemEval-style harness through the kit's real write / index / search paths.

| Pipeline | R@5 | Paraphrase recall | API calls |
| --- | --- | --- | --- |
| Keyword (FTS5 one-shot) | 0.176 | 0.000 | 0 |
| Agentic keyword (iterative + LLM reformulation) | 0.529 | 0.300 | 1/query |
| **Semantic (sqlite-vec + local bge-base, the default)** | **0.941** | **1.000** | **0** |

Keyword search structurally misses natural-language questions; the embedded semantic backend closes the paraphrase gap entirely — locally, with no API calls.

## Requirements

- Node.js ≥ 20
- Claude Code (for the hook-driven auto-memory loop) — or [Kiro](https://kiro.dev)
- Optional: `cmk install --with-semantic` for semantic/hybrid recall (installs the local `@huggingface/transformers` embedder, ~260 MB once — no API, no Python)

## Documentation

Full docs, architecture, and design live in the repository:
**<https://github.com/LH8PPL/claude-memory-kit>**

## License

MIT © the maintainer
