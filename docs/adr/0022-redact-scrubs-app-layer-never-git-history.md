---
adr: 0022
title: "Redact scrubs the app layer completely; the kit NEVER rewrites git history (guided one-time team operation instead)"
status: proposed
date: 2026-07-16
deciders:
  - the maintainer (compliance-claim scope — what `redact` promises is outward-facing)
  - Claude Fable 5 (the layered design + primary-source survey)
supersedes: null
superseded_by: null
related:
  - 0002-markdown-source-of-truth-over-opaque-db.md
tags:
  - security
  - compliance
  - redact
  - git-history
  - purge
---

# ADR-0022 — Redact scrubs the app layer; the kit never rewrites git history

## Context

Task 96 (D-62/D-218) ships the compliance scrub: truly remove a leaked
secret/PII from a fact — the live file, every tombstone/superseded/archive
copy, the INDEX and derived surfaces — while keeping an audit entry
"redacted on DATE for REASON."

The hard tension (D-27): the `context/` tier is **committed to git** — that
is the kit's defensible niche (portable, team-shareable, survives clone).
Git actively resists history deletion: a true history scrub needs
`git filter-repo`/BFG plus a **force-push, which breaks every teammate's
clone** — an operation squarely at odds with the niche, and one a memory
tool has no business executing on its own.

Primary-source survey (captured in the Task 96 entry, 2026-06-28 deep-read):
**nobody solves this cleanly.** mem0's only hard-scrub is `reset()` →
`DROP TABLE history` (all-or-nothing nuke, no targeted redact); letta's
`BlockHistory` CASCADE-deletes whole blocks (coarse — not "redact one secret,
keep the fact"); letta-git and basic-memory keep everything in git forever.
A targeted scrub over a git-committed store is genuinely novel — and the
git half is why.

Also load-bearing: **a secret that reached git history is compromised
regardless of any scrub.** Clones, CI caches, forks and reflogs may already
hold it. The real remediation is ROTATION; scrubbing is hygiene that limits
future exposure, not a substitute.

## Decision

**Layered scrub. The kit owns the app layer completely; the git layer is a
guided, human-run, documented one-time team operation the kit never
executes.**

1. **`cmk redact <id> --pattern <secret> [--reason <text>]`** (CLI-only)
   scrubs the matched span from:
   - the live fact file (body + title + frontmatter-adjacent surfaces),
   - every archive copy — `archive/tombstones/`, `archive/superseded/`,
   - the scratchpad bullet if the fact is dual-written,
   - the INDEX + the search index (reindex),
   - composing with Task 210's deletion-propagation check for derived
     surfaces (`recent.md`, `archive.md`, snapshots).
   The span is replaced with `[redacted: <reason> <date>]`. An audit entry
   records the redaction WITHOUT the secret (span redacted in the log
   itself, Poison_Guard-style `***`).

2. **The honest git advisory.** After the app-layer scrub, the command
   prints — clearly, every time —
   - that **git history still contains the secret**, and rotation is the
     real fix (rotate first, scrub second);
   - the exact, path-scoped `git filter-repo` invocation to purge the
     affected `context/` paths, labeled as a **deliberate one-time team
     operation** (coordinate, force-push, teammates re-clone), documented
     in SECURITY.md;
   - the kit NEVER runs it. Not behind a flag, not with confirmation. A
     memory tool force-pushing a user's repo is out of remit (ADR-0018's
     posture: the kit proposes; the human owns git).

3. **`cmk purge --hard <id>`** (CLI-only, explicit-human, NEVER an MCP tool
   — the §6.5 separate-destructive-path contract) is the whole-fact
   irreversible delete at the app layer: live + every archive copy + index
   rows, audit entry kept. Same git advisory on exit.

4. **The recovery half stays thin** (per the 2026-06-28 reframe): git
   already gives point-in-time (`git show <sha>:context/...`); at most a
   `cmk recover <id> --as-of <date>` sugar wrapper ships IF cheap, and it
   is explicitly out of this ADR's scope to build more than that.

## Options considered and rejected

- **(a) Kit-executed history rewrite (`filter-repo` + force-push behind a
  flag).** Rejected: breaks every clone (the D-27 niche), catastrophic
  blast radius for a memory tool, unrecoverable when mis-scoped, and it
  still can't reach forks/CI caches/other remotes — a false "it's gone"
  claim. Every surveyed system avoids it.
- **(b) Orphan-branch restart (write a new history-free branch).** Rejected:
  destroys the history VALUE the niche exists for, the secret persists on
  the old branch/reflog/remotes anyway, and teammates still face a breaking
  migration — all of (a)'s costs with worse ergonomics.
- **(c) Do nothing (tombstone is enough).** Rejected: D-62's compliance
  need is real (a tombstone preserves the secret verbatim in the archive
  copy — the opposite of a scrub); the app-layer scrub is genuinely
  achievable and valuable on its own.

## Consequences

- The kit's compliance claim is precise and honest: **"redacted from the
  live store and all kit archives; git history requires the documented
  team operation; rotate the secret regardless."** Docs must never say
  "removed from history."
- `redact` is idempotent and audit-preserving; `purge --hard` is the only
  irreversible verb and stays off the MCP surface.
- SECURITY.md gains the leaked-secret runbook (rotate → `cmk redact` →
  optional filter-repo team operation).
- Task 210's propagation checker treats `[redacted: …]` spans as the
  expected post-state; a derived surface still holding the original span
  is a FAIL.
