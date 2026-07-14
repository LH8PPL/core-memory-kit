---
adr: 0012
title: Publish v0.1.0 under @lh8ppl scope; defer the cross-agent product name to v0.2
status: accepted
date: 2026-05-29
deciders:
  - the maintainer
  - Claude Opus 4.8
supersedes: null
superseded_by: 0021-rename-to-core-memory-kit.md
related:
  - 0005-three-install-paths.md
  - 0006-lifecycle-hooks-architecture.md
tags:
  - naming
  - npm
  - release
  - cross-agent
  - scope
---

# ADR-0012 — Publish v0.1.0 under `@lh8ppl` scope; defer the cross-agent product name to v0.2

## Status

**Accepted** 2026-05-29. **Superseded by [ADR-0021](0021-rename-to-core-memory-kit.md) (2026-07-14)** — the deferred cross-agent name was decided: RENAME to `core-memory-kit`. This ADR's deferral logic held exactly as written (the trigger fired when Kiro/Cursor/Codex shipped); ADR-0021 executes it. Content below is preserved unedited as the audit trail.

## Context

At v0.1.0 publish time, two naming questions converged:

1. **npm scope mechanics.** The packages were authored as `@claude-memory-kit/cli` and `@cmk/canonicalize`. npm scopes must map to either the publishing user's username (`@lh8ppl`) or an npm org the user owns. Verification at publish time found:
   - The `claude-memory-kit` org does **not exist** (404).
   - The `@cmk` scope is **not cleanly owned** by `lh8ppl` — `npm org ls cmk lh8ppl` returned empty (not a listed member), while `npm access list packages cmk` showed pre-existing `@cmk/fe_utils` + `react-techchart`. The 3-letter `@cmk` scope is desirable and likely tangled with other ownership. Publishing the kit's canonicalize package into `@cmk` could not be done safely on a guess.

2. **The product name itself.** The user raised the strategic question: *"we are calling it 'claude-memory-kit' because at first we thought about making this for claude, but what happens when i want to use it for other ai like codex/kiro/cursor/etc., like we plan to do?"*

   This is a real tension. The name bakes in "claude", but:
   - Tenet **T6** (requirements.md §1.4) explicitly scopes v0.1.0 to Claude Code only.
   - design.md §16.6 plans v0.2+ IDE/cross-agent adapters (`cursor-hooks/`, `.codex-plugin/`, `.windsurf/`).
   - The architecture is **already agent-neutral at its core** (tenet T1: markdown is the source of truth — `context/` files don't care which agent reads them). Only the *hook layer* (Stop/SessionStart hooks, the `claude --print` auto-extract subagent, the MCP server) is Claude-specific.

   So the name is accurate **today** (v0.1.0 IS Claude-only) but may become a misnomer when cross-agent support lands.

## Decision

**Publish v0.1.0 under the user's personal `@lh8ppl` npm scope. Do NOT create a `claude-memory-kit` org. Defer the permanent cross-agent product name to v0.2.**

Concretely:

- `@claude-memory-kit/cli` → **`@lh8ppl/claude-memory-kit`** (install: `npm install -g @lh8ppl/claude-memory-kit`; the `cmk` CLI binary name is unchanged)
- `@cmk/canonicalize` → **`@lh8ppl/cmk-canonicalize`** (internal dependency; users never type its name)

The GitHub repo stays `LH8PPL/claude-memory-kit`. The project's internal identity (CLAUDE.md, docs, the `cmk` command) stays `claude-memory-kit`. Only the **published npm package names** change to the `@lh8ppl` scope.

### Why `@lh8ppl` and not a `claude-memory-kit` org

The name itself is under reconsideration (point 2 above). Creating org infrastructure (`claude-memory-kit` org) around a name we might change at v0.2 would entrench a decision we're explicitly deferring. The personal `@lh8ppl` scope is the **lowest-commitment** option — it ships v0.1.0 today without building org scaffolding that a v0.2 rename would orphan.

### Why defer the cross-agent name rather than rename now

- **The name is accurate for v0.1.0.** Shipping a Claude-only release as "claude-memory-kit" is honest, not misleading.
- **Cross-agent support is genuinely v0.2+ work**, not imminent — each agent (Codex, Cursor, Gemini, Kiro) has a different hook system + session-transcript format, requiring new adapter modules. Renaming now is naming for a future that may shift.
- **A full project rename is out of scope for "finish v0.1.0."** It would touch the repo name, every doc, CLAUDE.md, the plugin manifest, the GitHub marketplace ref — days of work + re-testing. That is squarely a v0.2 undertaking.
- **npm has a clean rename story** (publish the new name, deprecate the old with a pointer). The cost of renaming later is bounded and is paid only IF cross-agent actually ships.
- Per CLAUDE.md anti-patterns: naming-for-a-hypothetical-future is the over-engineering trap the user has pushed back on before ("what if we also add X").

### What the v0.2 cross-agent name decision looks like (when it arrives)

When cross-agent support actually materializes, that major-version bump is the natural moment to choose the permanent identity. Two architecturally-viable shapes (both work because the core is agent-neutral):

1. **Umbrella rename**: rebrand the whole project to an agent-neutral name (e.g., `agent-memory-kit`, `mnemo`, `recall`), with per-agent adapters underneath.
2. **Keep `claude-memory-kit` as the Claude Code adapter** within a larger multi-package family.

The `cmk` CLI command (three letters, barely Claude-branded in daily use) can survive either path.

## Consequences

### Positive

- v0.1.0 ships **today** — no blocked-on-org-creation, no contested `@cmk` scope, no premature rename.
- Zero org infrastructure to maintain or orphan if v0.2 renames.
- The cross-agent naming question is **captured, not lost** — this ADR is the durable record so v0.2 starts from a decision, not a re-litigation.
- The architecture's agent-neutrality (T1) is documented, so the v0.2 path is an adapter addition, not a rewrite.

### Negative

- `@lh8ppl/claude-memory-kit` is a less-polished public name than `@claude-memory-kit/cli` would have been. Acceptable: v0.1.0 is a first release from a personal account; the polished name comes with the v0.2 identity decision.
- A future rename means existing v0.1.x users will need to migrate package names. npm's deprecate-with-pointer flow handles this, but it's a real (bounded) cost paid later.

### Neutral

- The internal project name (`claude-memory-kit`, the repo, the `cmk` command, all docs) is unchanged. Only the npm-published package identity moved to `@lh8ppl`. This intentional split keeps the rename surface minimal.

## Alternatives considered (and why rejected)

| Alternative | Why rejected |
|---|---|
| Create a `claude-memory-kit` npm org now | Entrenches a name under active reconsideration; builds infra a v0.2 rename would orphan. Also requires org-name availability we couldn't confirm. |
| Publish `@cmk/canonicalize` into the existing `@cmk` scope | `@cmk` ownership by `lh8ppl` could not be confirmed (org-membership query came back empty). Betting the release on an ambiguous scope is reckless. |
| Rename the whole project to an agent-neutral name now | Days of work (repo + every doc + CLAUDE.md + plugin manifest + marketplace ref) + re-testing. Out of scope for finishing v0.1.0. Naming for a future that may shift. |
| Unscoped names (`claude-memory-kit`, `cmk-canonicalize`) | Cleanest install, but both names must be globally free on npm (unverified) and it still bakes "claude" into the published name. |
| Keep `@claude-memory-kit/cli` and just don't publish | Defeats the entire point — The user's mandate is a working, installable kit. |

## References

- Tenet T6 (Claude Code first, other agents out of scope for v0.1.0): [requirements.md §1.4](../../specs/requirements.md)
- Tenet T1 (markdown source of truth → core is agent-neutral): [requirements.md §1.4](../../specs/requirements.md)
- v0.2 cross-agent adapter plan: [design.md §16.6](../../specs/design.md)
- npm scope verification (2026-05-29): `npm org ls claude-memory-kit` → 404; `npm org ls cmk lh8ppl` → empty; `npm access list packages cmk` → pre-existing `@cmk/*` packages.
- Session handoff capturing the decision: [docs/journey/RESUME-HERE-2026-05-28.md](../journey/RESUME-HERE-2026-05-28.md)

## Review history

| Date | Reviewer | Action |
|---|---|---|
| 2026-05-29 | the user | Raised the cross-agent naming tension; chose `@lh8ppl` scope for v0.1.0 + defer permanent name to v0.2 |
