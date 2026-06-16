<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/public/assets/wordmark-dark.svg">
    <img src="docs/public/assets/wordmark.svg" alt="claude-memory-kit" width="340">
  </picture>
</p>

<p align="center">
  <strong>Persistent, per-project memory for <a href="https://docs.claude.com/en/docs/claude-code">Claude Code</a> — plain markdown, committed with your code, recalled by meaning.</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@lh8ppl/claude-memory-kit"><img src="https://img.shields.io/npm/v/@lh8ppl/claude-memory-kit" alt="npm"></a>
  <a href="https://github.com/LH8PPL/claude-memory-kit/actions/workflows/ci.yml"><img src="https://github.com/LH8PPL/claude-memory-kit/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="license: MIT"></a>
  <img src="https://img.shields.io/badge/node-%E2%89%A520-brightgreen" alt="Node ≥20">
</p>

Claude forgets everything when a session ends — so every new chat you re-explain who you are, what you're building, and how you like things done. **claude-memory-kit** fixes that. It quietly captures your decisions, preferences, and project context, then hands them back to Claude at the start of every session. Everything is plain text inside your project, and it travels with the code (`git clone` brings the memory along).

> [!NOTE]
> **Not a developer?** If you can open a project in Claude Code, you're set — you can let Claude run the setup for you (see [Quickstart](#quickstart)).

## How it feels

You open Claude Code on a project you haven't touched in weeks. Before you say anything, Claude already knows your stack, your conventions, and what you decided last time:

```
claude-memory-kit: 23 fact(s) in context, 2 captured in the last 24h, 1 conflict pending
```

You work. It learns — automatically, no buttons. Next session, it remembers this one too.

## Features

- **Remembers across sessions** — a frozen snapshot of your project + persona injects once at session start, so Claude leads with what it knows instead of re-deriving it from code.
- **Captures automatically** — a background pass reads each turn and saves durable facts (decisions, conventions, tool quirks) as searchable notes. No "save" button.
- **Recalls by meaning** — ask in your own words ("where do credentials go") and get the right fact even with zero keyword overlap. Fully local, zero API calls — **R@5 0.941 / paraphrase 1.000** ([benchmarks](#benchmarks)).
- **Learns how you work, everywhere** — state a habit once ("always use uv, never pip") and a brand-new project cold-opens already knowing it.
- **Keeps a decision journal** — `cmk digest` maintains a committed, append-only `DECISIONS.md`: every decision and its *why*, in order, in the PR diff.
- **Stays private + bounded** — secrets are screened before any write, machine paths are abstracted to `~`, and rolling compression keeps memory small as history grows.
- **Per-project, in your repo** — `context/` lives in your project and travels with `git clone`. Each project keeps its own memory.

## Quickstart

> [!IMPORTANT]
> Pick **one** route. Each is complete on its own — both wire the same hooks.

### Route A — npm (recommended)

```bash
npm install -g @lh8ppl/claude-memory-kit
cd ~/my-project
cmk install                   # scaffold context/ + wire hooks (one step)
cmk install --with-semantic   # optional: local semantic recall (~260 MB once)
cmk doctor                    # verify, then restart Claude Code
```

`cmk install` is the whole entry point: it scaffolds `context/`, drops the memory skills into `.claude/skills/`, wires the lifecycle hooks, and registers the MCP server so Claude can drive memory as tools — no `/plugin` step needed.

> [!TIP]
> Prefer not to touch the terminal? Open the project in Claude Code and say *"install claude-memory-kit and set it up here."* Claude runs the commands; you just approve them. **Restart Claude Code once** when it's done (`/exit`, then `claude`) so the hooks load.

### Route B — Claude Code plugin

```text
/plugin marketplace add LH8PPL/claude-memory-kit
/plugin install claude-memory-kit
/claude-memory-kit:bootstrap
```

The plugin bundles the hooks + skills, so it's complete without the npm CLI. Add the CLI later only if you want `cmk search` / `cmk doctor` / cron.

Full walkthrough: **[QUICKSTART.md](QUICKSTART.md)**. Both routes are verified on Windows / macOS / Linux in CI.

## Three-tier model

| Tier | Location | Scope | What lives here |
| --- | --- | --- | --- |
| **Project** | `<repo>/context/` | committed — travels with `clone` | Decisions, conventions, file purposes |
| **Local** | `<repo>/context.local/` | gitignored, per-machine | Machine paths, local tool versions |
| **User** | `~/.claude-memory-kit/` | cross-project, per-person | Persona, cross-project lessons |

Project memory follows the **repo** (teammates get it on clone). Your persona follows **you** — it's machine-local and never committed, so your working style never leaks to everyone who clones. Carry it between your own machines with `cmk persona export` / `import`.

## CLI

The most-used commands are below — for the full reference with examples, see **[docs/CLI.md](docs/CLI.md)** or run `cmk --help`.

You rarely need to type these yourself: Claude drives the same operations as tools mid-conversation through the kit's MCP server (see **[docs/MCP.md](docs/MCP.md)**).

| Command | Purpose |
| --- | --- |
| `cmk install [--with-semantic]` | Scaffold + wire hooks + register the MCP server (complete entry point) |
| `cmk search "<query>" [--mode keyword\|semantic\|hybrid]` | Search memory — by meaning with the embedder; hybrid is the default after `--with-semantic` |
| `cmk remember "<fact>"` | Capture a fact explicitly (deduped, secret-screened, path-abstracted) |
| `cmk forget <id>` | Tombstone a fact (audit trail preserved) |
| `cmk digest` | Print a readable digest of all memory + sync the append-only `DECISIONS.md` journal |
| `cmk lessons promote <id>` | Carry one project fact into your cross-project user tier |
| `cmk doctor` | Run health checks, surface a repair command per failure |

There's more — `cmk register-crons` (scheduled compression), `cmk config`, `cmk persona generate/export/import`, `cmk import-claude-md`, `cmk repair`, and the rest. The **[full CLI reference is in docs/CLI.md](docs/CLI.md)**.

## Benchmarks

Recall quality is **measured, not claimed** — `npm run bench:recall` runs a LongMemEval-style harness through the kit's real write / index / search paths.

| pipeline | R@5 | paraphrase recall | API calls |
| --- | --- | --- | --- |
| keyword (FTS5 one-shot) | 0.176 | 0.000 | 0 |
| agentic keyword (iterative + LLM reformulation) | 0.529 | 0.300 | 1/query |
| **semantic (sqlite-vec + local bge-base, the default)** | **0.941** | **1.000** | **0** |

Keyword search structurally misses natural-language questions; the embedded semantic backend closes the paraphrase gap entirely — locally, with no API calls. The embedding model was picked by a measured ladder (the 5×-heavier bge-m3 scored *worse* on short facts): [ADR-0015](docs/adr/0015-semantic-backend-sqlite-vec-plus-local-onnx-embedder.md).

## Health checks

`cmk doctor` runs eight checks (HC-1..HC-8), each reported PASS / FAIL / SKIP with a repair command. Details + recovery paths: **[HEALTH-CHECKS.md](HEALTH-CHECKS.md)**.

> [!NOTE]
> **npm 12 (July 2026):** npm 12 skips dependency install scripts by default, which can silently block the native build `better-sqlite3` needs. `cmk install` detects this and offers to fix it inline — or install with `--allow-scripts=better-sqlite3` up front.

## Architecture

`context/` is the source of truth (plain markdown); a regenerable SQLite + FTS5 index powers search. The kit is built in six layers (in-repo storage → granular archive → bounded scratchpads → auto-extract hooks → search → compression). See **[ARCHITECTURE.md](ARCHITECTURE.md)** for the layer-by-layer breakdown + data-flow diagram, [`specs/design.md`](specs/design.md) for the full design, and [`specs/glossary.md`](specs/glossary.md) for terminology.

## Security

Every push and PR runs secret scanning (`gitleaks` + GitGuardian), CVE / supply-chain checks (`osv-scanner` + `npm audit` + Dependabot), and SAST (`CodeQL`). Releases publish from CI on a `v*` tag with a **signed npm provenance attestation**. Threat model + disclosure policy: [`SECURITY.md`](SECURITY.md).

```bash
npm view @lh8ppl/claude-memory-kit dist.attestations   # verify what you install
```

## FAQ

<details>
<summary><b>Does this send my code or memory anywhere?</b></summary>

No silent network calls. Your memory is plain markdown stored locally in your repo. The only outbound requests are the Haiku compression / auto-extract calls the kit makes on your behalf (documented), and nothing leaves unless you commit and push it yourself.
</details>

<details>
<summary><b>How is this different from Anthropic's native auto-memory?</b></summary>

They converge on the same granular `<type>_<slug>.md` pattern. The kit adds a three-tier *committed* scope (memory travels with `git clone`), content-addressed citation IDs, a trust hierarchy + conflict queues, provenance on every fact, search, and an MCP server. It also *coexists* with native auto-memory and can import its bullets via `cmk import-anthropic-memory`.
</details>

<details>
<summary><b>How is it different from claude-mem?</b></summary>

claude-mem is global, OS-level memory in an opaque SQLite store. The kit is per-project intent stored as readable markdown committed to your repo — project-scoped + git-portable vs. global + opaque. Both are defensible; pick what fits.
</details>

<details>
<summary><b>What if I can't run cron / a scheduler?</b></summary>

Compression falls back to lazy-on-read at session start, so memory stays bounded without any scheduler. Cron just makes it proactive instead of on-demand.
</details>

<details>
<summary><b>Is my memory portable to a new machine or teammate?</b></summary>

Project memory (`context/`) follows the **repo** — `git clone` brings it, and teammates get it. Your persona (the user tier) follows **you**: it's machine-local and never committed (committing your working style would leak it to everyone who clones). Carry it across your own machines with `cmk persona export` / `import` — the bundle is already path-sanitized and secret-screened. Teammates never share a persona; each keeps their own.
</details>

## Acknowledgments

See [`docs/SOURCES.md`](docs/SOURCES.md) for the complete index of cited sources and inspirations.
