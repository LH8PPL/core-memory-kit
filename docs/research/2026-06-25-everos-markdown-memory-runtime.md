# EverOS — the markdown-first memory RUNTIME (server-model contrast) — 2026-06-25

Source: <https://github.com/EverMind-AI/EverOS> (EverMind-AI), Apache-2.0, Python
3.12+, ~33K LOC, DDD 5-layer. Cloned + read (732 files). The user's find: *"we can
learn from this to everything we do — is this better than us?"*

## One-line verdict

**Same thesis (markdown source of truth + local SQLite/vector index), OPPOSITE
architecture (server + cloud API keys vs the kit's no-server local CLI + hooks).**
Not "better" or "worse" — a different PRODUCT CLASS. EverOS is the
mem0/Zep/AgentCore class (a memory runtime you build apps against); the kit is the
claude-mem/OpenWolf class (makes your EXISTING coding agent remember, zero setup,
zero server).

## Where EverOS is genuinely ahead of the kit

- **Semantic search SHIPPED** — Markdown + SQLite + **LanceDB** (embedding + rerank),
  live. The kit has this DEFERRED (ADR-0015 / Task 65). They're where we want to be on
  recall.
- **Reflection / consolidation is more principled** — `ReflectionOrchestrator`:
  **Select → Merge → Re-extract → Deprecate** (clusters memcell-derived episodes,
  merges to one high-quality episode, re-extracts atomic facts, **deprecates originals
  in BOTH md frontmatter AND LanceDB** with a `deprecated_by` field;
  `src/everos/memory/reflection/orchestrator.py`). Richer than the kit's
  now→today→recent→archive rolling-window.
- **Orthogonal retrieval** — search by `user_id`/`agent_id`/`app_id`/`project_id`/
  `session_id` (vs the kit's 3-tier P/L/U).
- **User vs agent tracks as first-class** — user `episodes/profile` + agent
  `cases/skills` are separate surfaces.

## Where the KIT is ahead — the decisive architectural fork

**EverOS runs as a SERVER; the kit runs as nothing.** From their QUICKSTART, verbatim:
*"EverOS runs as a **service** — start the server, then call the HTTP API. There is no
in-process library mode; an `everos` server is always [running]."* And it **requires
two cloud API keys** (OpenRouter LLM + DeepInfra embedding/rerank) to do anything real.

The kit (D-23 no-server, ADR-0002 + local-first):
- **Zero server** — short-lived CLI + hooks; nothing runs between sessions.
- **Works with NO API key** (keyword search); Haiku is the only optional network call.
- **Installs INTO Claude Code / Kiro** and works invisibly via hooks; the user does
  nothing. EverOS can't do this without you standing up a server + wiring HTTP.

So the kit wins decisively for its actual goal ("make my coding agent remember, no
setup"); EverOS wins for "I'm building an app and want a capable memory backend."

## Direct lesson for Task 167 (the cron-liveness fix)

EverOS schedules reflection via **APScheduler cron triggers** (`apscheduler.triggers.
cron.CronTrigger`, `src/everos/infra/ome/config.py:12`) — but because it's an
**always-on server**, the scheduler runs IN-PROCESS. Same luxury as OpenWolf's PM2
daemon. **This is the third peer to confirm the Task 167 thesis: everyone who schedules
RELIABLY has a persistent process.** The kit's host-cron-without-a-process is exactly
why it needs the lazy-on-SessionStart fallback + the anacron-style heartbeat (the kit
can't keep an in-process scheduler alive, so it cannot copy EverOS/OpenWolf's
in-process cron — it must derive freshness + stamp on each fire). Validates, doesn't
challenge, the Task 167 design.

## What to STEAL (selectively — their server model is the part we reject)

1. **The reflection model** (`Select→Merge→Re-extract→Deprecate` with frontmatter
   deprecation + a `deprecated_by` backref) is more principled than the kit's
   rolling-window — **directly relevant to Task 151** (persona-promotion redesign) and
   the consolidation layer. The deprecate-in-frontmatter-not-delete pattern fits the
   kit's tombstone/decision-trail discipline.
2. **ADR-0002 validated AGAIN** — EverOS independently arrived at markdown-source-of-
   truth + rebuildable SQLite/vector index ("✅ canonical .md files, readable, editable,
   diffable, Git-versioned" — their words, our ADR). Strong convergent evidence the
   foundation is right. (Per "convention-convergence is not primary-source
   verification": this CONFIRMS a decision we already made on first-principles, it
   doesn't substitute for one.)

## What to NOT copy

The server + cloud-keys + always-on model (D-23 no-server; the kit's whole edge is
zero-setup-local). EverOS shows what the kit would become if it chased
backend-capability over zero-friction-install — a valuable contrast, not a target.

> Added to the kit's research collection as the most architecturally-complete
> markdown-first memory system found to date, and the clearest "kit-as-server-product"
> contrast. A fuller dive (their search/rerank pipeline, the OME strategy engine) is
> worth it for the v0.4.2+ recall/curation lanes.
