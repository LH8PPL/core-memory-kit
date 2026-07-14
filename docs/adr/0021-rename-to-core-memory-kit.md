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
- **The user-tier config directory** `~/.claude-memory-kit/` — this is real
  users' on-disk cross-project memory. It is NOT a text swap; it is a
  **migration** (below). This is the single highest-risk line in the change.
- **Frozen historical records** — `docs/adr/` (except this new ADR),
  `docs/journey/` (except the live `build-log.md`/`DECISION-LOG.md`),
  `docs/conversation-log/`, `docs/research/`, `archive/`, and the dated
  `docs/process/*-self-test-*`/`cut-gate-*` guides — describe what the project
  was CALLED at the time they were written. Editing them to the new name
  rewrites history and breaks the decision-trail rule (this ADR's OWN references
  to "claude-memory-kit" are correct and stay).

### The config-directory migration (the gating design — the maintainer's blend)

The user-tier default resolves through `resolveUserDir()` /
`defaultUserDir()` (`tier-paths.mjs`). The migration is **copy-not-move,
marker-gated, keep-the-old**:

```
defaultUserDir():
  NEW = ~/.core-memory-kit
  if MEMORY_KIT_USER_DIR set:  return it          # explicit override always wins
  if exists(NEW):              return NEW          # already migrated, or fresh install
  if exists(OLD ~/.claude-memory-kit):
     copy OLD → NEW            (recursive copy; NEVER move)
     write NEW/.migrated-from marker               # so the next run never re-copies
     leave OLD intact          (the user's backup)
     inform: "migrated your cross-project memory to ~/.core-memory-kit;
              the old ~/.claude-memory-kit is kept as a backup you can delete"
     return NEW
  return NEW                   # brand-new user, no old dir
```

Three safety properties, chosen deliberately over a one-time move:

- **Copy-not-move** — a crash mid-copy leaves the OLD dir fully intact; nothing
  is ever orphaned. This turns the highest-risk line in the rename into a
  zero-risk one.
- **Marker-gated** — the `.migrated-from` sentinel in the NEW dir means a later
  edit to the OLD dir never silently re-overwrites the NEW one. First copy wins.
- **Keep-the-old** — the OLD dir is never deleted (and never trashed — a
  cross-platform trash needs a native dep the kit deliberately avoids, and
  trash auto-empties, which would time-limit the very backup that makes
  copy-not-move safe). Cleanup is the user's choice, surfaced as a single line
  in the **`cmk install` completion output** — the one place a user reliably
  looks right after an upgrade: *"Migrated your cross-project memory to
  `~/.core-memory-kit`; the old `~/.claude-memory-kit` is kept as a backup you
  can delete whenever you like."* We deliberately do NOT prompt (install stays
  non-interactive) and do NOT ride the SessionStart snapshot (it is
  prefix-cached + stable; a migration line there would repeat every session or
  need its own shown-once state — annoyance for no gain). Install-output only.

The `MEMORY_KIT_USER_DIR` override still wins over everything, so a user who set
a custom path is untouched.

## Consequences

### Positive

- The name finally matches the product — agent-neutral, `cmk`-preserving,
  professional. Resolves the misnomer and the collision.
- Existing users lose nothing: the config-dir migration is copy-not-move, and
  npm's deprecate-with-pointer keeps old installs working.
- The decision is captured as a superseding ADR, so a future session sees the
  full KEEP-vs-RENAME reasoning, not just the outcome.

### Negative

- A real (bounded) migration cost, larger than ADR-0012 estimated in
  2026-05-29 because real users + a 300+-file corpus now exist. The maintainer
  accepted this consciously at the sweep — the cost curve was known when the
  deferral was made.
- Two npm package names to keep alive during the deprecation window; some
  ecosystem lag (search results, cached READMEs) until the new name settles.
- A permanent-until-cleanup dual-path branch in `defaultUserDir()` (the OLD dir
  read). A future release can drop the OLD-dir read once adoption of the new dir
  is assumed universal (a tracked cleanup, not a v0.5.4 concern).

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
| **One-time MOVE of the config dir** | A move is destructive if interrupted — the exact orphaning risk the whole design exists to avoid. Copy-not-move + keep-the-old is strictly safer for zero steady-state benefit that matters (a leftover backup dir is harmless). |
| **Rename the config dir as a plain text swap** | Silently orphans every existing user's cross-project persona. This is why the config dir is a carve-out with real migration logic, not part of the corpus find-replace. |

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
| 2026-07-14 | the maintainer | Chose `core-memory-kit`; approved the copy-not-move / keep-the-old config-dir migration blend |
| 2026-07-14 | Claude Opus 4.8 | Wrote the execution plan + the migration contract + the carve-outs |
