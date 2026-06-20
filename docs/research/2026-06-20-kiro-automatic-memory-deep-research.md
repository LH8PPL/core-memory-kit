---
date: 2026-06-20
topic: Kiro support for Task 50 — how real Kiro memory systems achieve AUTOMATIC memory (default-agent registration), the corrected IDE-vs-CLI model, and the concrete fix for the kit's Kiro profile
source: Deep research — read 3 real Kiro CLI memory/integration impls (AWS bash-hooks PILOT, Amazon Bedrock AgentCore memory, langfuse) + cloned aws-samples repo + reconciled IDE-vs-CLI against kiro.dev primary docs
tags: [Task-50, kiro, kiro-cli, kiro-ide, hooks, default-agent, AGENTS.md, agentcore, automatic-memory, install-path, v0.4.0, D-181]
---


# Research Note — Kiro Support (Task 50, v0.4.0): Achieving Automatic Memory

**Status:** decision-ready. **Scope:** the THREE legs (lifecycle hooks, MCP registration, instruction block) and whether the kit's D-85/D-164 automatic-every-session thesis survives on Kiro.

**Bottom line up front:** The kit's current Kiro profile is targeting the **CLI agent-hook surface** (`agentSpawn`/`stop` in `.kiro/agents/cmk.json`) — and that surface **cannot deliver automatic memory without the user launching `kiro-cli --agent cmk` (or setting cmk as the CLI default agent) every session.** All three real CLI implementations confirm this is the binding constraint, and all three solve it the same way: **by making their agent the CLI default**. The kit's profile is missing that step entirely. Separately, the instruction leg targets custom `steering/` which the primary docs say is **dropped under a custom agent** — a second real bug. The IDE is the only surface with genuinely always-on hooks, but it has no file-based hook install path an installer can write.

---

## 1. How real Kiro memory systems actually achieve automatic memory

All three real implementations are **Kiro CLI**, not IDE. None of them relies on the model deciding to recall/capture, and none of them is "automatic" in the IDE sense (event-monitored, no agent in play). The ground truth is uniform:

**They scope hooks to a single named custom agent, then make that agent the CLI default so it spawns on every session.**

| Impl | Hook surface | Auto-fire mechanism | Source |
|---|---|---|---|
| **aws-bash-hooks (PILOT)** | `agents/pilot.json` `"hooks"` block; 5 events (`agentSpawn`/`userPromptSubmit`/`preToolUse`/`postToolUse`/`stop`); shell `command` + `timeout_ms` + `cache_ttl_seconds` | **Requires `kiro-cli --agent pilot` each session.** No default-agent step documented — explicitly "selecting the custom `pilot` agent is the gate." Once selected, capture/recall is automatic *within* that session. | (A) aws-bash-hooks, §5 |
| **AgentCore** | `~/.kiro/agents/kiro_memory.json` `"hooks"` block; 3 events (`agentSpawn`/`userPromptSubmit`/`stop`); `stop` has `"timeout_ms": 25000` | **Sets `{"chat.defaultAgent": "kiro_memory"}` in `~/.kiro/settings/cli.json`** → hooks fire on every session with no per-session opt-in. **This is the load-bearing step the kit is missing.** | (A) AgentCore, §3 + install step 4 |
| **langfuse** | `.kiro/agents/langfuse-observer.json` `"hooks"` block; 5 events; `command: "node hooks/hook-handler.js"` + `matcher` | **Requires `/agent swap langfuse-observer`** (or hand-merging the `hooks` field into the user's active agent). Not automatic; observability tool, so per-session activation is acceptable for its use case. | (A) langfuse, §3–4 |

**Three concrete techniques worth stealing (from AgentCore, the closest architectural match):**

1. **Default-agent registration is the whole game.** `agentSpawn`→inject and `stop`→capture only auto-fire because `kiro_memory` is set as `chat.defaultAgent`. Without it, you get PILOT/langfuse's manual `--agent` gate. *(A) AgentCore §3.*
2. **Hooks invoke the MCP server directly over stdio JSON-RPC from the shell script — they do NOT depend on the model calling the tool.** `load-preferences.sh` sends `initialize` + `tools/call search_memories`; `store-conversation.sh` sends `store_conversation`. This is a **deterministic capture path** — exactly the kit's Stop-hook→`cmk-auto-extract` model, just hitting MCP instead of the CLI. Belt-and-suspenders: the agent's system `"prompt"` *also* instructs recall-at-start/persist-at-end. *(A) AgentCore §2.*
3. **The `userPromptSubmit`→`/tmp` prompt-stash→pair-at-`stop` pattern** is the same bi-turn pairing the kit's design §6.4 solved with a temp file (composition rule PR-22). Kiro's CLI exposes a clean `userPromptSubmit` event for it — the kit can reuse its existing bi-turn shape. *(A) AgentCore §2.*

**Ground truth that beats doc-guessing:** the CLI auto-memory path is real and shipping (AgentCore proves it end-to-end), but it is **agent-scoped + default-agent-gated**, never global-hook-file-based. There is no `.kiro/`-level always-on hook file outside an agent config.

---

## 2. The corrected IDE-vs-CLI model

Each leg behaves differently across the two surfaces. The kit's current profile silently assumes one surface for some legs and another for others — the source of the bugs.

| Leg | Kiro **IDE** | Kiro **CLI** | Shared? |
|---|---|---|---|
| **MCP** | `<repo>/.kiro/settings/mcp.json` + `~/.kiro/settings/mcp.json`, `mcpServers` object, workspace wins | **Same paths/shape.** CLI agent config *also* accepts a per-agent `mcpServers` block. | **SHARED** — identical file paths on both primary-doc pages. *(C) row 1* |
| **Steering / instruction** | `.kiro/steering/*.md`, `inclusion: always|fileMatch|manual|auto`. **`AGENTS.md` is always included with no inclusion modes.** | Same dirs/files; same 3 foundation files (`product.md`/`tech.md`/`structure.md`) auto-load in **base** mode. **`AGENTS.md` always included** (workspace root or `~/.kiro/steering/`). | **SHARED PATHS, but ASYMMETRIC:** steering auto-loads in CLI **base** mode, **but is DROPPED when a custom agent is active** unless the agent re-adds `"resources": ["file://.kiro/steering/**/*.md"]`. *(C) row 2 — primary doc /docs/cli/steering/* |
| **Hooks** | Defined in **IDE UI** (Agent Hooks panel / natural language). Triggers incl. user-prompt-submit + agent-turn-completion. **Fire automatically, no agent selection.** **No file an installer can write.** | Defined in **agent-config JSON** `"hooks"` field. Events `agentSpawn`/`userPromptSubmit`/`preToolUse`/`postToolUse`/`stop`. Input via STDIN `{"hook_event_name":…}`. **Scoped to the active agent.** | **NOT SHARED.** Different surface (UI vs JSON), format (NL vs JSON), event-name casing. *(C) rows 3–5* |
| **Automatic firing** | Yes — event-monitored, no per-session agent selection. **True always-on.** | Only via the **active agent's** config. Always-on path = **set that agent as `chat.defaultAgent`** (proven by AgentCore; *unstated* in the primary docs C checked — confirmed only by the real impl). | — |

**Two asymmetries the kit must design around:**
- **(α) Custom-agent steering drop** — primary doc `/docs/cli/steering/`: *"Custom agents do NOT automatically include steering files."* So the kit's instruction leg in `.kiro/steering/claude-memory-kit.md` is **invisible the moment cmk runs as a custom agent** (which is exactly when its hooks fire). The instruction and the hooks are at war.
- **(β) AGENTS.md is the exception** — `AGENTS.md` is "always included" with **no inclusion modes** on both IDE and CLI. (Primary doc doesn't explicitly say AGENTS.md survives custom-agent mode — flag in §6.)

---

## 3. The automatic-memory question, answered

**Q: Can the kit get automatic inject + capture on Kiro CLI without a manual `--agent` each session?**

**A: YES — but ONLY by registering cmk's agent as `chat.defaultAgent`, which the current profile does not do.** This is the single highest-leverage fix.

**Exactly how (cite the real impl — AgentCore, the proven end-to-end path):**

1. Write the agent config with the `"hooks"` block to `~/.kiro/agents/cmk.json` (user-global, so it covers every project) or `.kiro/agents/cmk.json` (project-local).
2. Write `{"chat.defaultAgent": "cmk"}` to `~/.kiro/settings/cli.json`. *(A) AgentCore install step 4 — verbatim.*
3. The agent config carries `agentSpawn`→inject and `stop`→capture hooks **plus** `mcpServers` (the cmk MCP server) **plus** `"resources": ["file://.kiro/steering/**/*.md"]` to re-add steering (fixes asymmetry α) **plus** a system `"prompt"` belt-and-suspenders recall/persist instruction.
4. After that, `agentSpawn`/`stop` fire on **every** `kiro-cli` session with no `--agent` flag. *(A) AgentCore §3 — "made automatic for every session by setting it as the default agent."*

**Honest degraded modes, in order of preference:**

| Mode | Automatic? | When it applies |
|---|---|---|
| **CLI + cmk as `chat.defaultAgent`** | ✅ Yes (proven, AgentCore) | The recommended install. D-85/D-164 thesis holds. |
| **CLI base mode, no custom agent** | ❌ No hooks at all (hooks only live in agent configs; no global hook file). Instruction (AGENTS.md/steering) + MCP still load. | If the user refuses a default agent. **Inject/capture is NOT automatic** — degrades to instruction-prompted, model-compliance-dependent recall. Honest label: "passive memory." |
| **CLI + cmk agent but NOT default** | ⚠️ Automatic only when user runs `kiro-cli --agent cmk` | PILOT/langfuse mode. Per-session opt-in. |
| **IDE** | ✅ Always-on hooks — **but no file-based install path** (hooks are UI/NL-defined). MCP + steering/AGENTS.md install fine. | The kit **cannot programmatically install IDE hooks.** Best honest path: install MCP + AGENTS.md instruction; document that the user must create the inject/capture hooks via the IDE Agent-Hooks panel manually, OR rely on instruction-prompted memory. **This is a genuine not-automatic gap for IDE-only users.** |

**The thesis survives on CLI-with-default-agent; it does NOT survive on IDE without manual hook creation.** Be honest about both in the README.

---

## 4. Does Kiro need its OWN install path?

**YES — Kiro needs a real adapter, not a thin profile reusing the Claude-Code seam.** Three legs diverge structurally; only data-substitution is insufficient.

**Why a thin data-profile is not enough:**

1. **Hooks are a different mechanism, not a different path.** Claude Code: event-keyed shell-command entries in `.claude/settings.json` (the kit's `settings-hooks.mjs` block). Kiro CLI: a `"hooks"` object **inside an agent-config JSON** that **also must carry `mcpServers`, `resources`, and a system `prompt`**, and is **inert until registered as `chat.defaultAgent` in a SEPARATE file** (`~/.kiro/settings/cli.json`). There is no Claude-Code analog to "write hooks AND register a default agent in a second settings file." The profile's `hooks.mechanism: 'agent-config-json'` names this but the **default-agent registration step has no representation in the profile at all** — that's the missing leg. *(A) AgentCore; (C) rows 3–4.*
2. **The instruction leg needs a composition fix unique to Kiro** (re-add steering via the agent's `resources`, OR switch to AGENTS.md). Claude Code has no such drop. *(C) row 2, asymmetry α.*
3. **Event names + casing + field names differ** (`timeout_ms` not `timeout`; `agentSpawn`/`stop` lowercase; STDIN payload `hook_event_name`). The profile's `eventMap` handles naming but not the payload-shape / `timeout_ms` field difference. *(A) all three; (C) row 3.*

**Shape of the Kiro adapter** (one module, narrow interface, per the kit's deep-module discipline):
- `installKiro({ projectRoot, userDir, surface: 'cli' })` that:
  - emits `~/.kiro/agents/cmk.json` with the full `{hooks, mcpServers, resources, prompt, name}` agent config,
  - emits/merges `~/.kiro/settings/cli.json` `{"chat.defaultAgent": "cmk"}` (**byte-preserve other keys** — same managed-merge discipline as the Claude path),
  - emits/merges `.kiro/settings/mcp.json` (MCP leg — this one CAN reuse the shared MCP writer; same shape as Claude's `.mcp.json` modulo path/key),
  - writes the instruction to **AGENTS.md** (see §5),
  - hook scripts must **exit 0 always** (PILOT's hard-won caveat: a crashed hook breaks the Kiro session — wrap every op `|| true`). *(A) aws-bash-hooks §6.*

The kit's existing `defineAgentProfile` data seam is the right *registry*, but Kiro needs **install LOGIC** the Claude path doesn't have (the default-agent file write + the agent-config composition). Keep the profile as the declaration; add a Kiro-specific installer branch.

---

## 5. Concrete fix for the kit's Kiro profile

The current `agent-profiles.mjs` Kiro entry (verified in repo, lines 52–77) has **three defects**. Fixes:

| Leg | Current (wrong/incomplete) | Fix | Source |
|---|---|---|---|
| **Hooks** | `path: '.kiro/agents/cmk.json'` — correct surface, but **no default-agent registration** → hooks never auto-fire | Keep `.kiro/agents/cmk.json` for the hook block. **ADD a default-agent leg**: write `{"chat.defaultAgent":"cmk"}` to `~/.kiro/settings/cli.json`. Without this, memory is NOT automatic. | (A) AgentCore §3 + step 4 |
| **Instruction** | `.kiro/steering/claude-memory-kit.md` with `inclusion: always` | **PROBLEM:** custom-agent steering is dropped (asymmetry α). **Two valid fixes — recommend BOTH:** (1) switch the primary instruction surface to **`AGENTS.md`** (always-included, no inclusion modes, survives base mode; also wins the cross-tool breadth the `agents-md` profile already targets), AND (2) add `"resources": ["file://.kiro/steering/**/*.md", "file://AGENTS.md"]` to `cmk.json` so the instruction is present under the custom agent too. | (C) row 2; /docs/cli/steering/; (B) shows `inclusion:always` is the IDE/base mechanism |
| **MCP** | `.kiro/settings/mcp.json`, `mcpServers` | **Correct — keep as-is.** Verified identical on IDE + CLI primary docs. Also mirror it into `cmk.json`'s per-agent `mcpServers` so the default agent definitely sees it. | (C) row 1 |

**Recommendation: make AGENTS.md the Kiro instruction surface, not custom steering.** Rationale: (a) it survives custom-agent mode where `steering/` doesn't; (b) it's "always included" with no inclusion-mode caveat; (c) it collapses the Kiro instruction leg into the same AGENTS.md surface the kit already ships for cross-tool reach — one managed block, more tools covered. Keep the `steering/` resource re-add as belt-and-suspenders only.

**What to honestly document as NOT automatic:**
- **IDE users:** inject/capture hooks **cannot be installed from a file** — must be created in the IDE Agent-Hooks panel manually, or memory runs in instruction-prompted (passive) mode. State this plainly in the README Kiro section. *(C) row 3.*
- **CLI users who decline a default agent:** memory is passive (instruction-only), not automatic. *(A) PILOT §5.*
- **Hook exit-0 requirement:** Kiro kills the session if a hook crashes — the kit's hook scripts must be defensively `|| true` / `exit 0`. *(A) aws-bash-hooks §6.*

---

## 6. What's still unverified — live-test before shipping

These are NOT confirmed by a real impl or primary source. Resolve with `kiro-cli` (and the IDE) before claiming "automatic" in the README:

1. **[Default-agent persistence] Does `{"chat.defaultAgent":"cmk"}` in `~/.kiro/settings/cli.json` actually make `agentSpawn`/`stop` fire every session with zero `--agent` flag?** AgentCore's docs *assert* it (step 4) but the primary kiro.dev pages C checked **do not document a default-agent mechanism** — C explicitly left this "UNSTATED / leaning no without the impl." **AgentCore is the only evidence. Live-test this first — it's the load-bearing claim for the whole thesis.** *(A) AgentCore step 4 vs (C) "core question, inconclusive".*
2. **[CLI vs IDE config-file unification]** Does the IDE's hook surface read from any file at all, or is it purely UI-state? If the IDE persists hooks to a readable file, the kit might install IDE hooks too. C says UI/NL-defined; not confirmed there's no backing file. *(C) row 3.*
3. **[AGENTS.md under a custom agent]** Primary docs say `AGENTS.md` is "always included," but **do not explicitly state it survives custom-agent mode** the way they explicitly state `steering/` does NOT. Verify AGENTS.md is visible when cmk runs as the default agent — if it ISN'T, the `resources` re-add becomes mandatory, not belt-and-suspenders. *(C) row 2.*
4. **[MCP-from-hook vs MCP-from-model]** AgentCore drives MCP directly from the hook shell script over JSON-RPC (deterministic). The kit currently relies on its Stop hook → `cmk-auto-extract` (CLI). Confirm the kit's existing CLI-based capture path works when spawned from a Kiro `stop` hook (env, cwd, `MEMORY_KIT_USER_DIR`, STDIN payload shape `{"hook_event_name":…,"assistant_response":…}`). Kiro's STDIN payload field names are **not** Claude Code's — the auto-extract entry point may need a Kiro adapter to read the turn. *(A) AgentCore §2; (C) row 3.*
5. **[Transcript path]** The profile assumes `globalStorage/kiro.kiroagent/workspace-sessions` keyed by `base64url(workspacePath)`, `parse: 'json-history'` (lines 70–77). This is NOT in any source above (A/B/C) — flag it as independently-verified-elsewhere-or-guessed; live-confirm the real path + format on an actual Kiro install before relying on `cmk import-kiro`/transcript capture.
6. **[Hook payload for bi-turn pairing]** Confirm Kiro's `userPromptSubmit` STDIN gives the prompt and `stop` STDIN gives the assistant response, so the §6.4 temp-file bi-turn pairing maps cleanly. AgentCore does exactly this (`/tmp/kiro_last_prompt.txt`) — replicate its pattern but verify field names. *(A) AgentCore §2.*

**Priority order for live test:** #1 (thesis-critical) → #4 (capture actually runs) → #3 (instruction visible) → #5/#6 (transcript + pairing). Do NOT mark Task 50 "live-tested" or write "automatic" in the README until #1 and #4 pass on a real `kiro-cli`.

---

**Provenance:** §1 from (A) three real impls; §2 from (C) primary kiro.dev docs + (B) real repo; §3 from (A) AgentCore proven path; §4–5 from synthesis of all three + the in-repo profile at `c:\Projects\claude-memory-kit\packages\cli\src\agent-profiles.mjs` (lines 52–77); §6 flags everything not nailed by a real impl or primary source. The (B) aws-samples repo is a **steering/prompt repo with no agent JSON, no MCP, no AGENTS.md** — it shows the IDE always-on-steering shape (`inclusion: always` orchestrator) and the array-shaped `.kiro/hooks.json` (LLM-prompt actions, no command/timeout), which is a **different hook surface** from the CLI agent-config hooks the kit must target. Do not conflate the two.