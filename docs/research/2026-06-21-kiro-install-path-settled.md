---
date: 2026-06-21
topic: Kiro install-path SETTLED (Task 50, v0.4.0) — 14-real-project survey + authoritative Amazon-Q Rust contract; CLI agent-config is the capture spine, set default-agent (guarded), inject=agentSpawn capture=stop
source: 15+ real .kiro project clones (Auriti/kiro-memory, mempalace, oh-my-kiro, vibekit, semio, DesignerPunk, naas, coder/registry, +more) + aws/amazon-q-developer-cli Rust hook contract (Kiro CLI = Amazon Q)
tags: [Task-50, kiro, kiro-cli, amazon-q, agent-config, default-agent, hooks, stop, agentSpawn, AGENTS.md, install-path, v0.4.0, D-182, settled]
---

# Task 50 — Kiro Install-Path Decision (v0.4.0): SETTLED

> Synthesis of a 15+ real-`.kiro`-project survey + the authoritative Amazon-Q (`aws/amazon-q-developer-cli`) agent schema & hook-firing source. This note SETTLES the two open questions: (1) which install path real projects use, and (2) whether a memory kit should set `chat.defaultAgent`.

---

## 1. Tally — what do real projects actually install for Kiro?

14 repos with a Kiro footprint (1 of the 15 surveyed — `inceptionstack/lowkey` — had no `.kiro/`, excluded).

| Install surface | Count | Repos |
|---|---|---|
| **CLI agent-config (`.kiro/agents/*.json` with `hooks{}`)** | **9** | Auriti/kiro-memory, oh-my-kiro, usalu/semio, imishinist/sandbox, 3fn/DesignerPunk, vibekit, jcarriolaa (templates), coder/registry-harleylrn, lykinsbd/naas |
| **IDE `.kiro/hooks/*.kiro.hook` files** | **3** | ngeorgieff/kiro-mempalace (7), 3fn/DesignerPunk (13), jcarriolaa (5, templates) |
| **`chat.defaultAgent` (`.kiro/settings/cli.json`)** | **2** | lykinsbd/naas (hand-authored), coder/registry-harleylrn (automated installer) |
| **MCP (`mcp.json`)** | **8** | Auriti, mempalace, oh-my-kiro, usalu/semio, 3fn, jcarriolaa (tpl), coder/registry (both modules) |
| **AGENTS.md (primary instruction surface)** | **3** | oh-my-kiro, usalu/semio, coder/registry |
| **Steering-only / instruction-only** | **3** | dynamous-hackathon, aws-OpenClaw, rewse/dotfiles |

**Dominant pattern: CLI agent-config (9/14).** It is the only Kiro surface that gives programmatic, deterministic, non-LLM hooks (real shell/node commands) **plus** `mcpServers` + `resources` + `prompt` in one file.

**What MEMORY projects specifically use** — this is the load-bearing slice (4 memory/memory-adjacent repos):

| Memory repo | Path chosen | Auto-capture mechanism |
|---|---|---|
| **Auriti/kiro-memory** (real memory system) | **CLI agent-config** (`~/.kiro/agents/contextkit.json`) | `hooks{agentSpawn, userPromptSubmit, postToolUse, stop}` → `node hooks/*.js` |
| **oh-my-kiro** (memory-adjacent framework) | **CLI agent-config** (`.kiro/agents/default.json`) | `hooks{userPromptSubmit, preToolUse, postToolUse, stop}` → `hooks/*.sh` |
| **ngeorgieff/mempalace** (real memory system) | **IDE `.kiro.hook`** (7 files) | `when:agentStop`→`then:askAgent` (LLM prompt, NOT runCommand) |
| **vibekit** (notification kit — exact memory install shape) | **CLI agent-config** (`~/.kiro/agents/default.json`) | `hooks{agentSpawn, userPromptSubmit, preToolUse, stop}` → `python3 vibenotif.py <event>` |

**Verdict: 3 of 4 memory-class repos chose CLI agent-config with a `stop` hook for deterministic command capture.** The one that chose IDE `.kiro.hook` (mempalace) accepted LLM-prompt-driven capture (`askAgent`), not deterministic command execution — a meaningfully weaker capture guarantee.

---

## 2. The authoritative agent-config + default-agent mechanism (corrects earlier doc-guesses)

Ground truth = `aws/amazon-q-developer-cli` Rust source (Kiro CLI is Amazon Q Developer CLI). **The published `schemas/agent-v1.json` is a STALE SUBSET — do not target it.**

### The real `hooks` schema (Rust `hook.rs` / `mod.rs:163`, the live contract)

`hooks: HashMap<HookTrigger, Vec<Hook>>` — object keyed by trigger → **array of full `Hook` objects** (serde `camelCase`).

**FIVE triggers** (the JSON schema lists only 2 — `agentSpawn`, `userPromptSubmit`):
`agentSpawn`, `userPromptSubmit`, `preToolUse`, `postToolUse`, **`stop`**.

**`Hook` fields** (the JSON schema documents only `command`):

| Field | Type | Default | Notes |
|---|---|---|---|
| `command` | string | — | **REQUIRED** |
| `timeout_ms` | u64 | **30000** | hook killed on timeout |
| `max_output_size` | usize | **10240** | output truncated past this |
| `cache_ttl_seconds` | u64 | **0** | output cache before re-run |
| `matcher` | string\|null | none | glob on tool name — `preToolUse`/`postToolUse` only |

**Correction to earlier kit doc-guesses:** any prior assumption that the hooks block is `{command}`-only with 2 events is **wrong** — that's the stale `agent-v1.json`. The kit must emit against the Rust contract: 5 triggers available, `camelCase` keys, `timeout_ms` (not `timeout`/`timeout_ms`-ambiguous — it is `timeout_ms`, u64, default 30000). The event key for session-end is literally **`stop`** (vibekit's script labels its own arg `agentStop`, but the Kiro/Q wire key is `stop` — `vibekit` confirms `stop → vibenotif.py agentStop`).

### Default-agent resolution (3-tier, `docs/default-agent-behavior.md`)

1. **`--agent <name>`** CLI flag (highest) → if missing, error + fall through.
2. **`chat.defaultAgent`** setting (`q settings chat.defaultAgent <name>`) → applies to all sessions, `--agent` overrides → if missing, error + fall through.
3. **Built-in default** (in-memory; `hooks: Default::default()` = **no hooks**).

**Zero-setting override:** drop an agent file named **`q_cli_default`** into `.amazonq/cli-agents/` (local) or `~/.aws/amazonq/cli-agents/` (global) → it replaces the built-in default with **no `--agent` and no settings write**.

### Do hooks auto-fire when the agent is active? — YES (`conversation.rs:581-606`)

On every message send (`as_sendable_conversation_state`), the **resolved-active agent's** `context_manager.hooks` run automatically — no manual command:
- `agentSpawn` → runs once, cached for the **whole conversation** (`expiry: None`, `hooks.rs:253`); output injected as context labelled "for the entire conversation". **This is the SessionStart-inject analog.**
- `userPromptSubmit` → runs per-prompt, output attached to that message; cached `cache_ttl_seconds`.

Hooks are **per-agent** — there is NO "fires for every agent globally" path. They only fire for whichever agent §3 resolves active.

---

## 3. SETTLED: should the kit set `chat.defaultAgent`?

**Decision: YES — set it (or use the `q_cli_default` named-file equivalent). This is the mechanism that makes capture automatic with no `--agent` flag.**

The earlier framing ("none of the memory repos set it, so it's an unfilled gap") is **half-right and misleading.** The memory repos didn't set `chat.defaultAgent` because they reached automatic activation a *different but equivalent* way — and the ones that DIDN'T solve activation require a manual `--agent` flag (a non-starter for "automatic memory").

**Precedent count for automatic activation (the real question):**

| How they made it automatic | Repos | Count |
|---|---|---|
| **`chat.defaultAgent`** in `cli.json` | lykinsbd/naas (hand), coder/registry-harleylrn (automated: `kiro-cli settings chat.defaultAgent <name>`) | **2** |
| **Name the agent `default` + install at user tier `~/.kiro/`** (functionally the `q_cli_default` move) | vibekit, oh-my-kiro (`default.json`), Auriti ("default agent gets the hooks automatically" since machine-global) | **3** |
| **Manual `--agent` flag (NOT automatic)** | usalu/semio, imishinist, 3fn (8 named), oh-my-kiro (`--agent pilot`), Auriti (`--agent contextkit-memory`) | (the non-automatic fallback) |

So **5 of the surveyed repos achieved automatic activation**, via one of two equivalent mechanisms: explicit `chat.defaultAgent` (2) OR the name-it-`default`/`q_cli_default` override (3). **Both are the same act** — make the kit's agent the resolved-active one without a flag.

**Kit recommendation:** prefer the **`q_cli_default` named-file** route (vibekit/Auriti precedent — zero settings mutation, survives the user later setting their own `chat.defaultAgent`)... **but** that override is total — it replaces the built-in default entirely, including its `tools:["*"]` and AmazonQ.md resources. If the user already has a custom default agent, clobbering it is hostile. **Therefore the safe install logic:**
- If **no** user default agent exists → write `q_cli_default` (zero-touch automatic). 
- If the user **already** set `chat.defaultAgent` or ships a `q_cli_default` → **do NOT clobber.** Write a named `cmk` agent and either (a) merge the kit's hooks into their existing default agent's `hooks{}` block, or (b) instruct them to add `--agent cmk` / set `chat.defaultAgent cmk`. Surface this as a `cmk doctor` Kiro-layer check, not a silent overwrite.

This mirrors coder/registry-harleylrn's automated flow (`write agent JSON → kiro-cli settings chat.defaultAgent <name>`) but with non-destructive guard rails.

---

## 4. SETTLED: IDE-hook path vs CLI-agent path vs both?

**Decision: CLI agent-config is the capture spine. IDE `.kiro.hook` is NOT viable for the auto-capture pipeline.** The IDE path is optional, secondary, and only for user-triggered convenience commands.

**The disqualifying fact for IDE hooks (capture side):** across the **entire survey, ZERO IDE `.kiro.hook` files use a `runCommand` then-type for lifecycle capture.** Every automatic IDE hook observed uses `then.type: "askAgent"` — it hands the *LLM* a natural-language prompt and hopes it calls the tool; it does **not** deterministically execute a kit binary.
- mempalace's autosave: `when:agentStop → then:askAgent` (prompt says "call `mempalace_add_drawer`") — LLM may ignore it.
- 3fn (13 hooks), jcarriolaa (5 templates): `then.askAgent` 18/18.
- The supported IDE `when.types` in practice are `userTriggered` / `fileEdited` / `promptSubmit` / `manual` / `agentStop` — but `agentStop` only routes to `askAgent`, never a deterministic command in any surveyed repo.

**Why "IDE hooks are file-installable AND automatic (Taskmaster proves it)" does NOT make them the better path:**
- *File-installable*: true (Taskmaster + jcarriolaa + 3fn confirm `cp *.kiro.hook` works). But the CLI agent-config is **equally file-installable** (every memory repo `cp`s a JSON), so installability is a wash.
- *Automatic*: only in the **LLM-prompt sense** (`askAgent`), not the **deterministic-command sense** the kit needs. cmk's capture (`capture-turn` → detached `auto-extract`) is a real binary that MUST run; an `askAgent` prompt the model can skip is the exact non-determinism the kit exists to eliminate. This is the **unit-green ≠ works-on-real-input** class applied to capture: "the hook fired" ≠ "the fact got captured."
- *IDE-only*: `.kiro.hook` files are an **IDE-only surface** — they don't fire for `kiro-cli` / `q chat` sessions at all. The kit targets the CLI. mempalace had to ship BOTH IDE hooks (for IDE) and global MCP (for CLI) to cover both.

**Recommended shape (division of labor, mirroring 3fn's clean split):**
- **CLI agent-config `hooks{}` = the capture spine** (deterministic `runCommand` → `cmk` binary). `stop` → capture, `agentSpawn` → inject.
- **IDE `.kiro.hook` = OPTIONAL, user-triggered convenience only** (e.g. an explicit "remember this" button → `then.askAgent` "call `mk_remember`"). Ship it for IDE users as a nicety; **never** route the stop/capture pipeline through it.

---

## 5. The concrete kit Kiro installer spec

What `cmk install` (Kiro path) writes, citing the real precedent for each piece:

### A. CLI agent-config (the spine) — cite Auriti, vibekit, usalu/semio

Write `q_cli_default.json` (or `cmk.json` + activation per §3 guard) to `.amazonq/cli-agents/` (local) and/or `~/.aws/amazonq/cli-agents/` (global). Shape (Rust contract, §2):

```json
{
  "name": "q_cli_default",
  "description": "claude-memory-kit — automatic per-session memory (inject + capture)",
  "prompt": "file://./AGENTS.md",
  "mcpServers": {
    "cmk": { "command": "node", "args": ["<path>/mcp-server.mjs"], "timeout": 120000 }
  },
  "tools": ["*", "@cmk"],
  "allowedTools": ["fs_read", "@cmk/mk_search", "@cmk/mk_get"],
  "resources": [
    "file://.kiro/steering/cmk.md",
    "file://AGENTS.md"
  ],
  "hooks": {
    "agentSpawn":       [ { "command": "<cmk-dispatcher> hook agentSpawn",      "timeout_ms": 10000 } ],
    "userPromptSubmit": [ { "command": "<cmk-dispatcher> hook userPromptSubmit", "timeout_ms":  5000 } ],
    "stop":             [ { "command": "<cmk-dispatcher> hook stop",             "timeout_ms": 30000 } ]
  },
  "useLegacyMcpJson": false
}
```

- **Inject — which trigger?** `agentSpawn` (runs once, cached whole-conversation = SessionStart-inject) for the frozen snapshot. Add `userPromptSubmit` only if you want per-prompt re-injection; the kit's frozen-snapshot semantics argue for `agentSpawn`-only inject to preserve the prefix cache. **Use `agentSpawn` for inject.**
- **Capture — which trigger?** **`stop`** (the Rust enum's session-end key; vibekit `stop → agentStop` confirms). `stop` → `cmk ... hook stop` → `capture-turn` → detached `auto-extract`. This is the deterministic-command analog of cmk's Claude Code Stop hook.
- **Dispatcher pattern** (cite usalu/semio): route every event to ONE entrypoint `<cmk-dispatcher> hook <event>` — one binary fans out by `$1`. Matches the kit's existing `cmk ... hook <event>` shape on the Claude Code side, so capture/inject logic is shared cross-platform.
- **`timeout_ms`** (not `timeout`): set explicitly — default is only 30000ms; the kit's compress/extract can exceed that. Compose the inner subprocess timeout under this ceiling (the §8.5 composition rule — don't let the hook ceiling kill the parent before catch/finally/log-write).

### B. MCP — cite Auriti, coder/registry, oh-my-kiro

Merge `mcpServers.cmk` into `~/.kiro/settings/mcp.json` (or `.amazonq/mcp.json`) **and** inline it in the agent-config (Auriti does both). Merge, don't overwrite (coder/registry's `mcp add` / install.sh-merge precedent).

### C. Instruction surface — cite usalu/semio, oh-my-kiro, coder/registry

Ship **`AGENTS.md`** (referenced via `prompt: file://./AGENTS.md` + `resources`) as the primary instruction surface — it's the cross-tool convention (usalu, oh-my-kiro, coder all use it; Kiro reads it). Mirror the `claude-memory-kit:start/:end` managed-block contract so `cmk uninstall` byte-preserves the rest. Optionally also drop a `.kiro/steering/cmk.md` for Kiro-IDE steering (Auriti/mempalace precedent) — but AGENTS.md is the spine.

### D. (Optional) IDE convenience hook — cite mempalace, 3fn

For IDE users only: one `.kiro/hooks/cmk-remember.kiro.hook` with `when:userTriggered → then:askAgent` ("call `mk_remember` with the current fact"). Convenience, not the capture spine. Skippable for v0.4.0.

---

## 6. Live-test checklist (before claiming "automatic")

Per the binding live-test rule — unit-green ≠ works-on-real-input. Run against a throwaway agent dir (`MEMORY_KIT_USER_DIR=<tmp>`, sandbox `.amazonq/cli-agents/`), never the user's real Kiro config:

1. **Schema accept** — Kiro/`q chat` loads the written agent-config without a schema error (verify against the **Rust** contract, since `agent-v1.json` would reject `stop`/`timeout_ms`/`preToolUse` — confirm the live CLI accepts them, as the source says it must).
2. **Default resolution** — start `q chat` / `kiro-cli` with **NO `--agent` flag**; confirm via the injected-context header (`agentSpawn` appends "for the entire conversation") that the cmk agent is the resolved-active one. This is the "automatic, no flag" proof — the D-169 automatic-path criterion: **no manual `--agent`, no manual `cmk` command**.
3. **Inject fires** — confirm `agentSpawn` ran once and the frozen snapshot landed in context (check the injected header + that it did NOT re-run on the 2nd prompt — cached whole-conversation).
4. **Capture fires** — end a session (trigger `stop`); confirm `cmk ... hook stop` actually executed (a real file landed in `context/` / a `capture-turn` temp file appeared / audit-log NDJSON entry), NOT just "the hook was registered." Door-2 (state) + Door-4 (observability).
5. **Non-clobber guard** — install into a sandbox that ALREADY has a user `chat.defaultAgent` / `q_cli_default`; confirm the kit does NOT silently overwrite it (§3 guard) — it merges or surfaces a `cmk doctor` notice.
6. **MCP reachable** — `mk_search` / `mk_get` callable from the live Kiro session (Door-3: the cmk MCP server actually spawned with the right argv/env).
7. **Timeout composition** — force a slow extract; confirm the inner subprocess timeout trips and writes its log BEFORE the `stop` hook's `timeout_ms` ceiling kills the parent (§8.5 composition).
8. **Flag honestly what a one-shot CLI can't reach** — the IDE `.kiro.hook` `askAgent` path (if shipped) needs a real Kiro-IDE session with a human; do NOT claim "verified" for the IDE surface from a CLI test.

---

## Bottom line (the settled decisions)

1. **Dominant real pattern = CLI agent-config with a `hooks{}` block (9/14 repos; 3/4 memory repos).**
2. **Set `chat.defaultAgent` — YES**, OR the equivalent `q_cli_default` named-file override (5 repos reached automatic activation this way; 2 explicitly via `chat.defaultAgent`). Guard against clobbering a user's existing default.
3. **CLI-agent path, NOT IDE `.kiro.hook`, for capture.** IDE hooks are `askAgent`-only (LLM-prompt, non-deterministic) and IDE-surface-only — disqualified for the kit's deterministic CLI capture. IDE hook is optional user-triggered convenience.
4. **Inject = `agentSpawn`; capture = `stop`.** Both deterministic `runCommand` → one `cmk ... hook <event>` dispatcher (usalu/semio pattern). Target the **Rust** contract (5 triggers, `timeout_ms`, camelCase), NOT the stale `agent-v1.json`.

This revisits NO prior settled decision — it resolves an open question (Task 50). Append to `DECISION-LOG.md` as the Task-50 Kiro-install-path DECISION when implementing.