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
- **Captures automatically, prompt-free** — a background pass reads each turn and saves durable facts (decisions, conventions, tool quirks) as searchable notes. No "save" button. When you *do* say "remember this" mid-conversation, the kit auto-approves its **own** memory tools and skills (a `PermissionRequest` hook scoped to `mcp__cmk__*` + the kit's skills) so the save happens without an "Allow?" prompt — nothing else is auto-approved.
- **Recalls by meaning** — ask in your own words ("where do credentials go") and get the right fact even with zero keyword overlap. Fully local, zero API calls — **R@5 0.941 / paraphrase 1.000** ([benchmarks](#benchmarks)).
- **Learns how you work, everywhere** — state a habit once ("always use uv, never pip") and a brand-new project cold-opens already knowing it.
- **Stays private + bounded** — secrets are screened before any write, machine paths are abstracted to `~`, and rolling compression keeps memory small as history grows.
- **Guards your memory from accidental deletion** — `cmk install` wires a hook that **blocks** a destructive command (`rm`, `Remove-Item`, `del`, `git clean`, `git reset --hard`, `find … -delete`, `truncate`, `>`-truncate) the moment it's aimed at a memory path — before it runs, on both Claude Code and Kiro. A safe command, or a delete of anything else, runs untouched.
- **Works across your agents** — the same memory brain on **Claude Code**, the **Kiro IDE**, and the **`kiro-cli`** terminal. One `cmk install --ide kiro` wires Kiro end-to-end (IDE + terminal), and a project's `context/` is shared, so memory you build in one agent is there in the others. The kit pre-trusts its own hooks, tools, and skills so everything runs prompt-free — no per-call "Allow?" approvals. See **[Working with Kiro](#working-with-kiro)**.
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
cmk install --ide kiro        # target a different agent (Kiro) instead of Claude Code
cmk doctor                    # verify, then restart Claude Code
```

`cmk install` is the whole entry point: it scaffolds `context/`, drops the memory skills into `.claude/skills/`, wires the lifecycle hooks, and registers the MCP server so Claude can drive memory as tools — no `/plugin` step needed. Use `--ide <agent>` to target an agent other than Claude Code — see **[Working with Kiro](#working-with-kiro)** below. The memory core (store / search / compression) is identical across agents; only the per-agent wiring differs.

> [!TIP]
> Prefer not to touch the terminal? Open the project in Claude Code and say *"install claude-memory-kit and set it up here."* Claude runs the commands; you just approve them. **Restart Claude Code once** when it's done (`/exit`, then `claude`) so the hooks load.

### Route B — Claude Code plugin

```text
/plugin marketplace add LH8PPL/claude-memory-kit   # add this repo as a plugin source (once per machine)
/plugin install claude-memory-kit                  # install the global machinery — hooks + skills (once per machine)
cd ~/my-project                                    # the project you want memory in — bootstrap scaffolds into the CURRENT dir
/claude-memory-kit:bootstrap                        # scaffold this project's context/ memory tree (once per project)
```

The first two commands are **global** (per machine); the last is **per project** — so you run `bootstrap` again (after a `cd`) in each project you want memory in. The plugin bundles the hooks + skills, so it's complete without the npm CLI. Add the CLI later only if you want `cmk search` / `cmk doctor` / cron.

Full walkthrough: **[QUICKSTART.md](QUICKSTART.md)**. Both routes are verified on Windows / macOS / Linux in CI.

### Updating to a new version

Updating has **two parts on both routes**: update the machinery, then re-stamp each project's scaffold. `cmk doctor` (HC-9) tells you when a project is behind, so you don't have to remember the per-project step.

**Route A — npm:**

```bash
# Close Claude Code first — on Windows its MCP servers hold native DLLs and npm can't
# overwrite a loaded file (EBUSY). On macOS/Linux you can skip this.
npm install -g @lh8ppl/claude-memory-kit@latest   # 1. update the global cmk CLI
cd ~/my-project
cmk install                                        # 2. re-stamp THIS project's scaffold (per project)
cmk doctor                                          # 3. verify (HC-9), then restart Claude Code
```

> Updating the npm package **alone** does not update a project — the committed `context/` + CLAUDE.md block + hooks stay at the old version until `cmk install` re-runs there. `cmk doctor` flags any project that's behind.

**Route B — Claude Code plugin** (all inside Claude Code):

```text
/plugin marketplace update claude-memory-kit   # 1. refresh available versions (third-party marketplace = no auto-update)
/plugin update claude-memory-kit               # 2. update the plugin (new hooks + skills)
/reload-plugins                                # 3. apply it — hooks keep the OLD version until you reload
cd ~/my-project
/claude-memory-kit:bootstrap                    # 4. re-scaffold THIS project (per project — like `cmk install`)
```

> The parallel holds: both routes are *update the machinery + re-stamp each project*. The plugin's `/plugin update` refreshes the global hooks/skills but not a project's `context/` scaffold, so re-run `bootstrap` per project (mirrors the npm `cmk install` re-run).

## Working with Kiro

[Kiro](https://kiro.dev) (the AWS agentic IDE + `kiro-cli`, built on Amazon Q) is a first-class target. One command wires it for **both** the IDE and the terminal:

```bash
cd ~/my-project
cmk install --with-semantic --ide kiro   # wire Kiro (IDE + kiro-cli) in this project
cmk doctor                                # verify, then RESTART Kiro so the hooks load
```

What `--ide kiro` writes:

| Surface | Location | For |
| --- | --- | --- |
| **MCP server** | `.kiro/settings/mcp.json` (with `autoApprove`) | the **IDE** — drives memory as tools (`mk_remember` etc.), pre-approved so they run prompt-free |
| **Steering** | `.kiro/steering/cmk.md` (`inclusion: always`) | both — memory-awareness in context |
| **AGENTS.md** | `<repo>/AGENTS.md` | both — Kiro's always-loaded instruction file |
| **Skills** | `.kiro/skills/memory-search` + `memory-write` | both |
| **IDE hooks** | `.kiro/hooks/cmk-{capture,inject,guard,observe}.json` (Kiro IDE 1.0+ v1 format) + legacy `cmk-{capture,inject}.kiro.hook` (older Kiro) | the **GUI** — recall + capture + a delete-guard (`PreToolUse`) + large-edit observation (`PostToolUse`) |
| **CLI agent** | `~/.kiro/agents/cmk.json` + a `chat.defaultAgent` pointer in `~/.kiro/settings/cli.json` | **`kiro-cli`** — `agentSpawn`/`stop`/`userPromptSubmit`/`postToolUse` hooks (auto inject + capture + prompt-capture + large-edit observation) + the `cmk remember`/`cmk search` shell commands for explicit memory (`tools: ['*']` enables them; no MCP, so no console-window popup) |
| **Trusted commands** | `.vscode/settings.json` (`kiroAgent.trustedCommands`) + the CLI agent's `allowedCommands` (`cmk hook *`, `cmk-guard-memory`, `cmk remember`, `cmk search`) | both — auto-approve the kit's commands (no per-turn "Run / Reject") |
| **Auto-approved MCP tools** | `autoApprove` in `mcp.json` | the **IDE** — the kit's 11 memory tools run without a per-call "Reject / Trust / Run" (kiro-cli uses the shell commands instead) |
| **Workspace permissions** (Kiro IDE 1.0+) | `~/.kiro/workspace-roots/<hash>/permissions.yaml` | the **IDE 1.0** — pre-trusts the kit's hooks, 11 MCP tools, and its two skills so even the first "Load skill: memory-write" runs with **no Allow prompt** (Kiro 1.0's per-workspace trust store) |

Notes:

- **Restart Kiro** to activate the hooks; steering / skills / MCP are immediate.
- The kit **pre-trusts only its own hook commands** (`cmk hook *`, `cmk-guard-memory`) so they run silently — Kiro normally asks you to approve each hook command, which would prompt every turn. Your own trusted commands are preserved; the kit never adds a blanket wildcard.
- The CLI agent registers as Kiro's **default agent** so its hooks auto-fire — but **guarded**: if you already have a default agent, the kit installs a named `cmk` agent instead and prints how to opt in (`kiro-cli --agent cmk`, or set `chat.defaultAgent` to `cmk`).
- A Kiro install does **not** write Claude-Code-only files (`CLAUDE.md`, `.claude/skills/`) — Kiro reads `AGENTS.md` + steering instead.
- The hook command is platform-correct (`cmd.exe /c cmk hook …` on Windows, where Kiro routes hooks through WSL).

**Using both Claude Code and Kiro on the same repo?** The installs are additive — run both (`cmk install` and `cmk install --ide kiro`), in any order. Each writes only its own wiring and never clobbers the other's; they share one `context/` memory brain. `--with-semantic` set by either is preserved by the other.

## Uninstalling

`cmk uninstall` is **conservative** — it removes only the kit's managed wiring for one agent and **never deletes your `context/` memory** (your data) or any content outside the kit's markers.

```bash
cmk uninstall              # remove the Claude Code surface (CLAUDE.md block + hooks)
cmk uninstall --ide kiro   # remove the Kiro surface (.kiro/ blocks + skills + IDE hooks + AGENTS.md block + the ~/.kiro CLI agent + the kit's permissions.yaml rules)
```

- On a **dual-agent** project, uninstall one agent and the other keeps working — the shared `context/` is untouched either way.
- To remove the memory data too, delete `context/` (and `context.local/`) yourself — the kit won't do it for you.
- Plugin route: `/plugin uninstall claude-memory-kit` removes the global machinery; the project's `context/` stays.

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
| `cmk install [--with-semantic] [--ide claude-code\|kiro]` | Scaffold + wire hooks + register the MCP server (complete entry point). `--ide` targets a different agent (default `claude-code`; `kiro` wires Kiro for IDE + `kiro-cli` — MCP + steering + AGENTS.md + skills + IDE hooks + CLI agent-config). See [Working with Kiro](#working-with-kiro). |
| `cmk uninstall [--ide claude-code\|kiro]` | Remove one agent's managed wiring (conservative — never deletes `context/`). Default removes the Claude Code surface; `--ide kiro` removes the Kiro surface. See [Uninstalling](#uninstalling). |
| `cmk search "<query>" [--mode keyword\|semantic\|hybrid] [--scope facts\|transcripts\|decisions]` | Search memory — by meaning with the embedder (hybrid is the default after `--with-semantic`); `--scope decisions` recalls how a decision evolved ("what did we reject / why did X change") from the append-only journal |
| `cmk remember "<fact>"` | Capture a fact explicitly (deduped, secret-screened, path-abstracted) |
| `cmk forget <id>` | Tombstone a fact (audit trail preserved) |
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

`cmk doctor` runs ten checks (HC-1..HC-10), each reported PASS / FAIL / SKIP with a repair command — including **HC-9**, which flags a project whose scaffold is behind your installed `cmk` (re-run `cmk install` there), and **HC-10**, an informational heads-up if your optional scheduled compaction stops firing (memory self-heals each session regardless). Details + recovery paths: **[HEALTH-CHECKS.md](HEALTH-CHECKS.md)**.

> [!NOTE]
> **npm 12 (July 2026):** npm 12 skips dependency install scripts by default, which can silently block the native build `better-sqlite3` needs. `cmk install` detects this and offers to fix it inline — or install with `--allow-scripts=better-sqlite3` up front.

## Architecture

`context/` is the source of truth (plain markdown); a regenerable SQLite + FTS5 index powers search. The kit is built in six layers (in-repo storage → granular archive → bounded scratchpads → auto-extract hooks → search → compression). See **[ARCHITECTURE.md](ARCHITECTURE.md)** for the layer-by-layer breakdown + data-flow diagram, [`specs/design.md`](specs/design.md) for the full design, and [`specs/glossary.md`](specs/glossary.md) for terminology.

## Security

Every push and PR runs secret scanning (`gitleaks` + GitGuardian), CVE / supply-chain checks (`osv-scanner` + `npm audit` + Dependabot), and SAST (`CodeQL`). Releases publish from CI on a `v*` tag with a **signed npm provenance attestation**. Threat model + disclosure policy: [`SECURITY.md`](SECURITY.md).

**Delete-guardrail.** `cmk install` wires a `PreToolUse` hook (`cmk-guard-memory`) that inspects every shell command the agent is about to run and **blocks it** when it's a destructive command aimed at a memory path (`context/`, the `~/.claude-memory-kit` persona tier, `MEMORY.md` / `DECISIONS.md`). It covers both agents — Claude Code (`Bash` / `PowerShell`) and Kiro (`execute_bash`) — and is **fail-open** (a broken guard never wedges your session; it just stops guarding). It's intentionally broad: a false block is recoverable by rephrasing, a false allow is the data loss it exists to prevent.

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
