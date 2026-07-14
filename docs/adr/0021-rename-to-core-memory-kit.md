---
adr: 0021
title: Rename the project to core-memory-kit (execute ADR-0012's deferred cross-agent name)
status: accepted
date: 2026-07-14
deciders:
  - the maintainer (the name choice — outward-facing identity)
  - Claude Opus 4.8 (the execution plan + migration design)
supersedes: 0012-npm-publish-name-and-cross-agent-future.md
superseded_by: null
related:
  - 0012-npm-publish-name-and-cross-agent-future.md
  - 0002-markdown-source-of-truth-over-opaque-db.md
tags:
  - naming
  - npm
  - rename
  - cross-agent
  - migration
---

# ADR-0021 — Rename the project to `core-memory-kit`

## Status

**Accepted** 2026-07-14. Supersedes **ADR-0012** (which deferred the cross-agent
product name). This ADR executes that deferral: it RENAMES.

## Context

ADR-0012 (2026-05-29) shipped v0.1.0 under `@lh8ppl/claude-memory-kit` and
**deferred the permanent cross-agent product name to a later version**, with the
explicit logic: *"the cost of renaming later is bounded and is paid only IF
cross-agent actually ships."* It named a trigger — re-decide when multi-agent
support is demonstrably real — and two viable shapes: (a) an umbrella rename to
an agent-neutral name, or (b) keep `claude-memory-kit` as the Claude-Code
adapter.

**The trigger fired.** Cross-agent support is now real, not planned:

- **Kiro** shipped in v0.4.0, **Cursor** in v0.4.5, **Codex** in v0.5.2 — four
  agents share one `context/` memory brain, driven through the generic
  `defineAgentProfile` seam (Task 50).
- The v0.5.3-cut minor-boundary backlog sweep (D-334) noticed the fired trigger
  and laned the decision into v0.5.4; the maintainer's call at the sweep was
  **lane it and decide**, not re-defer.

The name `claude-memory-kit` is now a **misnomer** — the kit is agent-neutral at
its core (ADR-0002: markdown is the source of truth; `context/` doesn't care
which agent reads it) and supports four agents, but the name advertises one.
There is also a **name collision** with an unrelated `claude-memory-kit` Python
product, which adds mild urgency but does not itself drive the decision.

## Decision

**Rename the project to `core-memory-kit`.** The `cmk` CLI binary is unchanged —
`core-memory-kit` was chosen partly *because* it preserves the `cmk` initialism
already in every user's muscle memory (the CLI, the MCP server key, the config
dir). The maintainer chose the name; this ADR records the choice and the
execution plan.

### What changes

1. **npm package:** publish **`@lh8ppl/core-memory-kit`** as a new package;
   `npm deprecate @lh8ppl/claude-memory-kit "renamed to @lh8ppl/core-memory-kit"`
   with a pointer. Existing v0.5.x installs keep working; new installs get the
   new name. The internal dep `@lh8ppl/cmk-canonicalize` keeps its name (already
   `cmk`-neutral).
2. **GitHub repo:** rename `LH8PPL/claude-memory-kit` → `LH8PPL/core-memory-kit`
   (GitHub auto-redirects old URLs). The plugin/marketplace manifests
   (`plugin.json`, `marketplace.json`) that hardcode the repo URL are updated.
3. **Doc + code corpus:** replace the product-name string across docs + code +
   specs + template/plugin/python, WITH the carve-outs below.
4. **In-repo memory tier:** the kit's own committed `context/` facts that mention
   the name sweep naturally over time (dogfood memory; not load-bearing, not
   hand-edited beyond the corpus pass).

### What does NOT change (the carve-outs)

These are load-bearing invariants; a blind find-replace across all of them is a
bug:

- **`cmk` binary + `MEMORY_KIT_USER_DIR` env var** — intentionally agent-neutral
  (ADR-0012's own note that `cmk` survives any rename). They stay verbatim.
- **The user-tier config directory** `~/.claude-memory-kit/` → `~/.core-memory-kit/`
  — a **direct swap of the default** (see the migration note below for why this
  is safe here). `MEMORY_KIT_USER_DIR` still overrides it.
- **`awrshift/claude-memory-kit`** — an UNRELATED third-party product referenced
  in our research notes (the name-collision, ADR context). Renaming it would
  misname someone else's repository — a factual error, not a compat concern. It
  stays verbatim wherever it appears.
- **Frozen historical records** — `docs/adr/` (except this new ADR),
  `docs/journey/` (except the live `build-log.md`/`DECISION-LOG.md`),
  `docs/conversation-log/`, `docs/research/`, `archive/`, and the dated
  `docs/process/*-self-test-*`/`cut-gate-*` guides — describe what the project
  was CALLED at the time they were written. Editing them to the new name
  rewrites history and breaks the decision-trail rule (this ADR's OWN references
  to "claude-memory-kit" are correct and stay).

### The config directory — a direct swap (no migration)

The user-tier default resolves through `defaultUserDir()` (`tier-paths.mjs`).
It becomes a one-line direct swap:

```
defaultUserDir(env):
  return env.MEMORY_KIT_USER_DIR ?? ~/.core-memory-kit
```

**Why a direct swap and not a copy-migration.** An earlier revision of this ADR
designed a copy-not-move / keep-the-old / marker-gated migration to protect an
existing user's `~/.claude-memory-kit` persona. It was built and tested (12
tests green). But the maintainer — **the sole real user** — chose (2026-07-14):
*"change everything, no need to hold back; if I need to uninstall and reinstall
for it, I'll do that."* With exactly one user who will reinstall, the migration
protects nobody: the reinstall re-scaffolds the user tier at the new path, and
`cmk remember` / auto-extract re-populate it. So the migration + its
install-time notice + its 12 tests were **removed** as dead complexity, and the
default is a plain swap. `MEMORY_KIT_USER_DIR` still overrides it.

(Decision-trail note: the copy-migration design is preserved in this ADR's git
history — commit `201845b` — should a future multi-user reality revive the need.
The lesson stands: for a shared-tier default rename WITH real strangers, a
copy-not-move migration is the safe shape; here there are none.)

## Consequences

### Positive

- The name finally matches the product — agent-neutral, `cmk`-preserving,
  professional. Resolves the misnomer and the collision.
- `defaultUserDir()` stays a clean one-liner (direct swap) — no dual-path
  resolver logic to carry forward; the sole-user reinstall re-scaffolds the tier.
- npm's deprecate-with-pointer keeps any old install reference working.
- The decision is captured as a superseding ADR, so a future session sees the
  full KEEP-vs-RENAME reasoning, not just the outcome.

### Negative

- A real (bounded) corpus cost, larger than ADR-0012 estimated in 2026-05-29
  because a 300+-file corpus now exists. The maintainer accepted this
  consciously — the cost curve was known when the deferral was made.
- Two npm package names to keep alive during the deprecation window; some
  ecosystem lag (search results, cached READMEs) until the new name settles.
- The sole user must reinstall to re-point the user tier to the new dir (the
  old `~/.claude-memory-kit` is not auto-migrated — a conscious simplification,
  not an oversight; see the direct-swap note).

### Neutral

- `cmk`, `MEMORY_KIT_USER_DIR`, and `@lh8ppl/cmk-canonicalize` are unchanged —
  the daily-use surface (the command) is identical, which is the whole point of
  choosing a `cmk`-preserving name.

## Alternatives considered (and why rejected)

| Alternative | Why rejected |
|---|---|
| **KEEP `claude-memory-kit`** (ADR-0012 shape b) | The name is now demonstrably a misnomer (4 agents), collides with an unrelated product, and advertises single-agent when the core is neutral. The maintainer chose to pay the bounded rename cost now rather than let it compound with more users. |
| **Elevate `cmk` as the brand, keep the repo/npm name** (the middle path) | Cheapest + reversible, and it was the assistant's earlier lean — but it leaves the misleading `claude-memory-kit` as the canonical public/npm identity. The maintainer chose a clean umbrella rename over a half-measure. `cmk` is elevated ANYWAY (it's preserved), so this option's one benefit is subsumed. |
| **Other neutral names** (`agent-memory-kit`, `mnemo`, `recall`) | `core-memory-kit` was the maintainer's pick specifically because it keeps the `cmk` initialism (muscle memory: CLI + MCP key + config dir), which the others break. |
| **A copy-not-move MIGRATION of the config dir** | Built + tested first (the right shape IF strangers depended on the old path), then removed: the sole real user will reinstall, so a migration protects nobody. Kept in git history (commit `201845b`) as the reference design for a future multi-user need. |
| **Rename the config dir inside the bulk corpus find-replace** | The config-dir literal is still a deliberate carve-out of the CORPUS sweep (the swap lives in `tier-paths.mjs` as a one-liner, not as 51 scattered text replacements that could hit a doc example or a test fixture) — direct swap ≠ blind global replace. |

## References

- Supersedes: [ADR-0012](0012-npm-publish-name-and-cross-agent-future.md) (the deferral this executes)
- The neutral-core invariant: [ADR-0002](0002-markdown-source-of-truth-over-opaque-db.md)
- Task 195 (this task) + the D-334 backlog-sweep entry (DECISION-LOG) that laned it
- The cross-agent seam that made "4 agents, one brain" real: Task 50, and the Kiro/Cursor/Codex adapters (v0.4.0 / v0.4.5 / v0.5.2)
- The migration surface: `packages/cli/src/tier-paths.mjs` (`defaultUserDir`/`resolveUserDir`)

## Review history

| Date | Reviewer | Action |
|---|---|---|
| 2026-05-29 | the maintainer | (ADR-0012) Deferred the cross-agent name to a later version, with a fired-on-multi-agent trigger |
| 2026-07-14 | the maintainer | Chose `core-memory-kit`; then — as the sole real user — chose "change everything, I'll reinstall," so the config-dir migration was dropped for a direct swap |
| 2026-07-14 | Claude Opus 4.8 | Wrote the execution plan + carve-outs; built+tested the copy-migration, then removed it per the direct-swap call (preserved in history) |
