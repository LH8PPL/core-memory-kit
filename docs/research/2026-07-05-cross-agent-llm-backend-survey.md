# Cross-agent headless-LLM backend survey (Task 200 / D-271)

**Date:** 2026-07-05 · **Method:** 5-wave multi-agent code-read (Sonnet-5),
~7M subagent tokens · **Scope:** 41 projects deep-read (code + docs) out of a
119-project discovery manifest · **Companion decisions:** D-271 (the mandate),
D-273/D-274 (Cursor), D-275 (field mechanisms), D-276 (the codemem correction),
D-277 (no-CLI degrade + split-brain).

## Why this exists

The kit's entire automatic engine (auto-extract / compression / persona-wedge /
temporal-sweep / daily-distill / weekly-curate — **7 spawn sites**) shells out to
the local `claude` binary. A Cursor-only or Kiro-only user who never installed
Claude Code gets file-I/O (capture/search/inject/guard) but every LLM step
silently no-ops — the kit degrades to a manual note store (D-270). Task 200 routes
the "Haiku call" through the agent's OWN CLI instead.

The user rejected an early 2-search conclusion that `cursor-agent` had no Windows
path, and mandated a DEEP survey: *"I don't believe there isn't a project out
there that solved this — clone them ALL, check docs AND code."* This note is the
result, plus the one primary-source thing the survey could not settle from docs
and the user settled on their own machine.

## The headline

**Two properties matter, and almost nobody holds both:**

- **Hard-automatic** — a deterministic hook/cron fires the memory write; it does
  NOT depend on the interactive model *choosing* to.
- **Portable** — the background LLM call works on whatever agent the user has,
  not one hard-wired agent.

The field trades one for the other. **The kit's target — hard-automatic AND
portable across the agent you installed for — is the near-empty intersection.**

## How the field invokes an LLM in the background (41 projects)

| Mode | Count | What it means | Hard-auto? | Portable? |
| --- | --- | --- | --- | --- |
| **no-LLM / MCP-only** | 23 | No background LLM call at all. Recall is deterministic search; the LLM is the INTERACTIVE agent, calling a tool via MCP. Cross-agent for free. | ❌ (model-discretion) | ✅ |
| **agent-SDK / agent-own-headless** | 8 | Uses one agent's SDK/headless mode (almost always the Claude Agent SDK, which spawns `claude`). | ✅ | ❌ (Claude-locked) |
| **single-CLI** | 6 | Deterministic hook spawns ONE specific CLI (`claude -p`, `codex`, `opencode`, `q`). | ✅ | ❌ (one agent) |
| **cloud-API-key** | 4 | Bypasses the agent; calls Gemini/OpenAI/OpenRouter directly with a key. | ✅ | ✅ but needs a 2nd paid vendor |
| **multi-CLI (auto-detect)** | **1** | Auto-detects the environment and shells WHICHEVER agent CLI the user has. | ✅ | ✅ | 

**Multi-CLI routing for the background call: 1 of 41 (codemem).** (OpenHands has
multi-CLI *infrastructure* but it is user-selected and drives only the interactive
foreground agent, not the background condenser — not a counter-example for our
case.)

## The one prior-art reference: codemem (kunickiaj/codemem)

The closest project to Task 200 in the entire field, and it **validates the exact
approach** in shipping code:

- `loadObserverConfig()` (`packages/core/src/observer-client.ts`) **auto-detects**
  the environment — checks `CLAUDE_CODE_ENTRYPOINT`/`CLAUDE_CODE_SESSION` env,
  `codex` on PATH, `~/.codex/auth.json` — and shells **whichever agent CLI the
  user has authenticated**: `claude -p --output-format json` OR
  `codex exec --ephemeral -s read-only`.
- Off the user's EXISTING login (no API key required when a CLI is present),
  exactly the D-270 model.
- An **API-key/OAuth universal fallback** when no CLI is present — the D-275/D-277
  two-tier shape, confirmed by a shipping peer.
- **Native Windows first-class** (`where` vs `which`; an install-matrix doc).
- A **pure `shouldAutoSelectCodexSidecar()` function** isolating the PATH/env
  probes from the decision — unit-testable without touching the filesystem.

**codemem covers claude + codex. Nobody covers the kit's set (claude + kiro-cli +
cursor-agent).** So the kit is not reinventing an impossible thing — the technique
ships — but it IS novel in agent coverage, and (per D-277) in letting the user
CHOOSE a non-primary agent for the background call, which codemem does not.

**Directly steal:** (1) the pure selector function; (2) the auto-detect priority
chain (explicit config → detect installed agent → API-key fallback).

## Cursor on Windows — RESOLVED (my 2-search conclusion was wrong)

The survey overturned the doc-based claim, and the user then **live-verified it on
their own Windows machine** (D-274) — the strongest evidence class:

- Native Windows `cursor-agent` ships today (`irm 'https://cursor.com/install?win32=true' | iex`);
  the community "Windows ports" I had cited were PRE-native historical artifacts.
- Installs as an **`agent.cmd` shim** under `%LOCALAPPDATA%\cursor-agent\` — a
  bare-name `spawn` won't resolve it (the detector must resolve the `.cmd`, like
  Claude's `claude.cmd`).
- **Live-verified invocation** (exit 0, ~11s, off the Cursor SUBSCRIPTION, NO API
  key): `agent -p --trust --model composer-2.5-fast --output-format text "<prompt>"`.
  - `--trust` = the headless workspace-trust flag (Cursor's analog of Kiro's
    `--trust-tools=`), dodges the interactive `[a] Trust this workspace` prompt.
  - `composer-2.5-fast` = the cheap background "Haiku-role" model.
  - Auth reuses the browser-OAuth subscription login; `CURSOR_API_KEY` is only for
    headless-CI/no-browser — CORRECTS the doc-based "separate key required."

This puts Cursor at parity with Kiro (`kiro-cli chat`, live-verified earlier):
both use the login the user already has, no second vendor.

## Mechanisms the open-ended trace surfaced (that we didn't have)

Asking "trace the actual chain, flag anything that ISN'T hook→CLI or agent→MCP"
(the user's methodology catch — a leading a/b/c question would have hidden these):

- **claude-mem — persistent "Observer" agent.** Not spawn-per-event: a hook
  enqueues events into a SQLite buffer; a long-lived daemon holds ONE Agent-SDK
  conversation open per session, fed by an async generator draining the queue; a
  second isolated agent judges what's memory-worthy and emits `<observation>` XML.
- **GBrain — extraction as a side effect of a GENERIC write tool** (`put_page`
  fires `runFactsBackstop` after the write; the agent never knew), decoupled by a
  bare `queueMicrotask` loop — plus a heavyweight OS-scheduled durable-queue path
  for nightly "dream" consolidation. Two triggers, one shared primitive.
- **MemClaw — passive outcome inference from data exhaust.** Trust/success signal
  computed retrospectively on a cron tick from data that already exists
  (supersession, terminal states, git/CI status) — "INTENTIONALLY zero-cost on the
  write path, no producer hooks." (Relevant to our persona/trust evolution.)
- **Basic Memory / claude-memory-compiler — PreCompact-as-checkpoint.** Hook the
  moment the agent is about to DESTROY context and write durably then (zero-LLM
  parse, "write early enrich after"); the fast hook fire-and-forgets a DETACHED
  child that does the unbounded LLM work off the hook's clock.
- **mem0 — memory as a MITM side effect of the chat SDK** (wraps
  `chat.completions.create`; capture with no hook, no agent decision). Also: its
  famous "LLM-judged ADD/UPDATE/DELETE" is now DEAD CODE — replaced by
  additive-only extraction + deterministic MD5/cosine dedup (a training-data-known
  "fact" that's false in current code — the "did you check the source" class).
- **Filesystem-watcher as a SECOND trigger** (claude-mem, EverOS, Basic Memory):
  re-ingest when the user hand-edits the markdown. Markdown-as-truth, indexes
  derived.

## Cross-cutting confirmations for our design

- **Recursion guard is universal.** Every project that spawns its own agent CLI
  has one — claude-remember strips `CLAUDE_*` env, memsearch uses
  `MEMSEARCH_DISABLE=1`, claude-memory-compiler sets `CLAUDE_INVOKED_BY` before any
  import. Our `CMK_BACKEND_SPAWN` guard (already built) is the field-standard move.
- **Reject-gate worth adopting.** claude-remember screens the child model's output
  for refusal/clarification phrasing ("I cannot…", "could you…") and DROPS it, so a
  refusal never gets written into memory as a fact — a real bug they hit. Worth
  adding to our backend result-handling.
- **Markdown-as-source-of-truth + rebuildable derived index** is the dominant
  durable-storage choice (memsearch, EverOS, Basic Memory, GBrain) — ADR-0002
  confirmed again.

## Recommendation for the backend shape (for the user's decision)

The evidence supports a **two-tier, agent-relative backend**, which is what
codemem ships and what the field's cross-agent projects converge toward:

- **Tier 1 (default): route through the agent's own CLI** — selected by the agent
  the kit was installed for (`--ide`), overridable to a different agent for the
  background chore (`--backend`, Task 201). Uses the login the user already has.
  Live-verified for Kiro (`kiro-cli chat`) and Cursor (`cursor-agent -p`); Claude
  unchanged.
- **Tier 2 (opt-in): a cloud-API-key fallback** — only if the user opts in / no
  CLI is usable. Never automatic (can silently spend money / use an unintended
  vendor).
- **No-CLI degrade (D-277, settled): warn at `cmk install` + `cmk doctor`,
  degrade to file-only.** Capture/search/recall/guard keep working; the user is
  told, never a silent no-op.

This preserves the kit's core thesis — **automatic, not "unreliable math"** — while
being portable across agents without forcing a second paid vendor.

## What did NOT change the answer (tail-judgment, D-276)

10 tail candidates that could plausibly have been counter-examples were checked.
None were, except codemem (above). Notably even the cross-agent-BY-DESIGN,
VC-funded projects (Supermemory) chose cloud-API-key + per-native-hook adapters,
never CLI-shelling — which is why codemem stands alone as the peer that took the
harder subscription-reuse path the kit is committed to. The remaining tail
(vector DBs, research papers, security scanners, format specs, single-agent
memory tools) cannot structurally be a multi-CLI counter-example.
