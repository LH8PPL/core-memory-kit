---
adr: 0014
title: Unify CLI + MCP over one in-process memory-op core (execute ADR-0006's deferred "MCP for retrieval+writes" line)
status: proposed
date: 2026-06-07
deciders:
  - the user
  - Claude Opus 4.8
supersedes: null
superseded_by: null
extends:
  - 0006-lifecycle-hooks-architecture.md
related:
  - 0002-markdown-source-of-truth-over-opaque-db.md
  - 0006-lifecycle-hooks-architecture.md
  - 0013-package-security-posture-and-ci-provenance-publish.md
tags:
  - mcp
  - cli
  - parity
  - shared-core
  - structured-input
  - task-108
---

# ADR-0014 — Unify CLI + MCP over one in-process memory-op core

## Status

**Proposed** (2026-06-07). Becomes **Accepted** when the Task 108 implementation plan is signed off. Drives Task 108 (v0.2.3). Revises design §10.3 (decision-trail-preserved) and **executes the v0.2 refactor ADR-0006 explicitly deferred**.

## Context

Three independently-surfaced facts converge on one architecture:

1. **The MCP froze; the CLI grew (drift).** The MCP surface was fixed at Task 31 (six tools: `mk_search/get/timeline/cite/remember/recent_activity`, with `mk_remember` *terse-only*). The CLI then grew rich `remember --why/--how`, `lessons promote`, `forget`, `trust`, `queue`. The two surfaces no longer match — exactly the mempalace failure mode (a 129 KB MCP and a 67 KB CLI that drift; see [the source research](../research/2026-06-07-dual-surface-cli-mcp-architecture.md)).

2. **The shell-write path is fragile (cut-gate findings).**
   - **D-81** — explicit `cmk remember` runs through bash; command-substitution silently eats backtick-bearing rich content before `cmk` reads argv. Saved facts are corrupted, silently.
   - **R2 / D-80** — the `cd "…" && cmk …` compound trips an "Allow this bash command?" prompt that the `Bash(cmk:*)` allowlist can't suppress (per-subcommand matching).
   - Both are rooted in "the operation rides a shell command line."

3. **Free speech is the interface (D-85).** The regular user — and even the maintainer — never types `cmk`; they voice intents (*"forget the API key"*, *"what did we decide about X"*) and assume it happens or happened automatically. For Claude to act on a write intent it needs a **tool**. A retrieval-only MCP + a remember-only skill leaves *"forget X" / "trust this"* with **no path at all**.

§10.3 ("MCP = retrieval; writes via the `memory-write` skill") was the right v0.1 *state* — the proven hook+skill model. But **ADR-0006's "Alternatives considered" already weighed "MCP for retrieval+writes" and deferred it to v0.2 as a possible refactor**, keeping the shell-write path only "because it's the proven model." The three findings above are the *why-now* for that deferred line.

**The basis is the kit's OWN earned evidence — not external precedent.** Everything above (the MCP/CLI drift, D-81, R2/D-80, D-85) is **first-party**: surfaced from *building and testing this product* — the cut-gate live run, the CLI↔MCP parity audit, and watching how the user (and even the maintainer) actually use it (never typing `cmk`). That is the justification; we do not lean on outside concepts for it. The kit is mature enough now that its own tested conclusions lead.

**External products only corroborate the shape (independent convergence) — they don't ground it.** Our conclusions happen to align with prior art: **basic-memory** (source-verified 2026-06-07) independently runs the same dual CLI+MCP over one `services/`+`repository/` core with MCP **write tools** (`write_note`/`edit_note`) — the strongest comparative confirmation ([source research](../research/2026-06-07-dual-surface-cli-mcp-architecture.md)); **claude-mem** (MCP-backed writes), **antigravity** (`agent-memory-mcp`), and **Hermes** (the action-model `memory` tool our own `memory-write` already borrows) sit the same way; **mempalace** is the cautionary dual-surface (no shared core → drift). The "MCP-for-writes inversion" was *first flagged*, at project start, by `codenamev/claude_memory` (an unverified [2026-05-21 Option-B note](../research/2026-05-21-claude-ai-deep-research-option-b.md)) — the oldest, weakest pointer, cited for completeness, not relied on. **Convergence across third parties is not proof (the kit's own rule); our cut-gate evidence is.** Nothing is lifted (basic-memory AGPL, mempalace MIT — patterns + citation only).

## Decision

**Unify the CLI and MCP surfaces over one in-process memory-op core, make writes first-class on both, take input off the shell, and lock parity with a structural guard.**

1. **One in-process core.** Each memory op — `rememberRich`, `trust`, `forget`, `lessonsPromote`, `queueResolve`, `search`, `get`, `timeline`, `cite`, `recentActivity` — is a pure function: **structured object in → result out**. No shell, no Commander coupling, **no internal HTTP/ASGI/server layer** (BOTH leading dual-surface products — basic-memory's `api/`+ASGI, and claude-mem's `server/` with routes/middleware/auth/queue/jobs — run a backend server, justified by their web/cloud/multi-user scope; the kit is single-user/local/Node with none of that, so going in-process is a **deliberate, scope-justified simplification, not what the leaders do** — call the core functions directly).
2. **CLI + MCP are thin adapters** over that core — explicitly NOT mempalace's per-surface monoliths.
3. **Off-shell structured input.** CLI gains `remember --from-file <fact.json>` + `--json -` (stdin) → `JSON.parse` → the SAME object the MCP tool passes. Rich content never touches a shell command line. (`--why/--how` flags stay for quick human notes, with the backtick caveat documented.)
4. **Write/mutate parity.** MCP gains the missing write/mutate tools (rich `mk_remember`, `mk_forget`, `mk_trust`, `mk_lessons_promote`, `mk_queue_*`); the CLI gains the four read verbs it lacks (`get`/`timeline`/`cite`/`recent-activity`). This realizes ADR-0006's deferred "MCP for retrieval+writes" line.
5. **`validate-cli-mcp-parity.mjs`** wired into `npm test` — every memory op exists on both surfaces (or is explicitly marked surface-specific). The drift that produced this ADR becomes a build failure. Neither basic-memory nor mempalace has this guard; it is the kit's differentiator.
6. **Parity scope = the memory surface** (read + write + mutate). Lifecycle/host verbs (`install`, `register-crons`, `daily-distill`, `mcp serve`, `version`, `transcripts`) stay **CLI-only** — the model never runs them, so `mk_install` would be parity for its own sake. (1:1 is not sacred; neither studied product is 1:1.)
7. **Destructive MCP ops** (`mk_forget`, future `mk_purge`) require an explicit **confirm-token param** (mirrors CLI `--yes`) so the auto-invoking model cannot silently tombstone.
8. **Resolves three findings in one move:** D-81 (content off the shell), R2/D-80 (the MCP path has no `cd`-compound; `cmk install` allowlists `mcp__cmk__*` → prompt-free — Task 118), and D-85 (every voiced intent gets a Claude-mediated tool).

## Consequences

### Positive

- Every voiced intent (read AND write) has a Claude-mediated path → the free-speech model (D-85) actually works end-to-end.
- Rich capture is shell-safe (D-81) and prompt-free (R2/D-80) on the MCP path.
- One implementation per op → CLI and MCP cannot diverge in behavior; the parity guard makes drift a build failure.
- The skill becomes a thin phrase-trigger *over* the MCP tools, not a separate shell-write path.

### Negative

- More MCP tools to maintain — mitigated by the shared core (the tools are thin) + the guard (drift is caught).
- A refactor touching many call sites (every CLI action + every MCP tool re-pointed at the core). Mitigated by caller-mapping both ways before each change (the binding rule) + TDD.

### Neutral

- The `memory-write` skill stays (D-85: phrase triggers are a convenience over the tools). Hooks/auto-extract are unchanged — they already write via the core (`writeFact`/`memoryWrite`), not the shell.
- No internal HTTP API now. If `cmk view`'s web UI or a cloud/cross-agent story ever ships, basic-memory's swappable transport (in-process ASGI / network HTTP) is the blueprint to revisit — noted, not adopted.

## Alternatives considered (and why rejected)

| Alternative | Why rejected |
|---|---|
| Keep §10.3 as-is (writes via the shell skill, MCP retrieval-only) | The shell-write path corrupts rich content (D-81) + trips permission prompts (R2), and leaves `forget`/`trust` with no free-speech path (D-85). This is the status quo the cut-gate proved fragile. |
| mempalace-style: two per-surface files, no shared core | Source-verified drift: 67 KB CLI + 129 KB MCP, ~5 vs 29 ops, no parity. It's our current drift, scaled up. |
| basic-memory-style: internal FastAPI `api/` + ASGI client between surfaces and core | Real overhead (an internal server + an ASGI/HTTP boundary) justified only by their web UI + cloud product. The kit is local/single-user/Node — call the core in-process. |
| Fix only the shell-quoting on `cmk remember` (escape backticks) | Fragile (breaks on the next metachar), doesn't give `forget`/`trust` a path, and doesn't address R2. Treats a symptom. |

## References

- [Source research: dual-surface CLI+MCP architecture](../research/2026-06-07-dual-surface-cli-mcp-architecture.md) (basic-memory + mempalace, source-verified)
- [ADR-0006](0006-lifecycle-hooks-architecture.md) — the deferred "MCP for retrieval+writes" line (`codenamev/claude_memory` inversion), line "Alternatives considered"
- DECISION-LOG: D-80 (R2 edge), D-81 (backtick corruption), D-82 (this task), D-85 (free-speech principle)
- design §10 (MCP) + §10.3 (mechanism table, revised by this ADR) + §12 (CLI)
- claude-remember code-dive (stdin-from-file input); gstack (single-quoted-JSON-arg)

## Review history

| Date | Reviewer | Action |
|---|---|---|
| 2026-06-07 | the user + Claude Opus 4.8 | Proposed; pending Task 108 plan sign-off |
