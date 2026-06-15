---
date: 2026-06-15
topic: SpillwaveSolutions/project-memory — the Claude skill the user used BEFORE building this kit; the kit's origin/ancestor. What it did, what the kit deliberately fixed, and two reinforced signals (error→fix schema, AGENTS.md cross-tool interop).
source: Cloned + read https://github.com/SpillwaveSolutions/project-memory (Claude skill, markdown-only, 82★, MIT, pushedAt 2025-12-29). The user 2026-06-15: "before i started this project i used to use this."
tags: [project-memory, spillwave, predecessor, origin-story, error-fix-memory, agents-md, cross-agent, poison-guard, privacy, Task-55, Task-50, validation, competitive-analysis]
---

# project-memory (SpillwaveSolutions) — the kit's ancestor

> **What it is + why it matters here.** A small Claude Code **skill** (`/project-memory`) — markdown only, no code — that the USER used BEFORE building claude-memory-kit. So this isn't a competitor scan; it's the **origin artifact**. Reading it explains *why the kit is shaped the way it is*: nearly every kit feature is a deliberate fix for a limitation visible here.

## What it does

`/project-memory` scaffolds **four flat markdown files** in `docs/project_notes/` and wires `CLAUDE.md` (+ `AGENTS.md`) to be memory-aware:

- **`bugs.md`** — bug log: Issue / Root Cause / Solution / Prevention, dated, chronological
- **`decisions.md`** — Architectural Decision Records (ADRs)
- **`key_facts.md`** — config / ports / URLs / non-sensitive constants (with a big manual "NEVER store secrets here" warning)
- **`issues.md`** — work log with ticket IDs

CLAUDE.md is configured to: check memory before proposing changes, search for known solutions to familiar bugs, document new decisions/bugs/work. **All maintenance is manual / Claude-when-told** — no CLI, no search index, no auto-extract, no hooks, no tiers, no provenance, no compression, no dedup.

## The kit is the answer to this tool's limitations (the origin story)

| project-memory (the ancestor) | claude-memory-kit (what we built instead) |
| --- | --- |
| Hand-maintained / "Claude, when told" | **Auto-extract** (Stop hook captures durably each turn; the user never has to ask — design §6.0) |
| 4 flat append-only files | **Granular per-fact archive + INDEX + FTS5/semantic search** (recall scales past a flat file) |
| No provenance | **Trust (high/medium/low) + source + content-addressed IDs + audit log** |
| Single project, single tier | **3 tiers** (user/project/local) + the cross-project **persona** wedge |
| "Remember to update it" | **Hooks** (Stop capture, SessionStart inject, the per-prompt hint) |
| No compression / unbounded growth | **Rolling-window compression** (now → today → recent → archive) + bounded snapshot |
| Manual "NEVER store secrets" prose warning | **Poison_Guard** (refuse-to-commit secret screen) + `<private>` strip + home-path sanitization + auto-judged privacy (D-150) |

**Every row is a deliberate kit decision.** Seeing the ancestor makes the kit's whole thesis legible: it's "project-memory, but automated, scalable, provenanced, multi-tier, and safe-by-default." Worth keeping in the origin record.

## Three things genuinely worth taking / noting

### 1. The error→fix SCHEMA — concrete input for Task 55 (and now a TWICE-confirmed signal)

`bugs_template.md` defines a clean error→fix shape: **Issue / Root Cause / Solution / Prevention** (dated, chronological, "focus on what was learned"). This is the SECOND source in two days to surface error→fix as a first-class memory category — the AWS build slides ("Errors" + `errors-and-fixes/`) were the first, and **this is a tool the user actually USED**, which is stronger evidence than a slide. The signal is no longer one data point. **For Task 55's design:** the `Issue/Root-Cause/Solution/Prevention` quadruple is a ready-made schema for an `error`/`fix` fact type (the "Prevention" field especially — that's the durable, cross-project lesson, the part that belongs in HABITS/LESSONS). _Strengthens the AWS-slides error→fix design input already on Task 55._

### 2. Poison_Guard is the AUTOMATED answer to their manual warning — validates the privacy thesis

project-memory's `key_facts.md` ships a prominent **manual** "⚠️ NEVER store passwords/keys — this file is committed to version control" warning with ❌/✅ lists. That's the human-must-remember model the kit explicitly rejects. The kit's entire privacy subsystem — **Poison_Guard** (refuses to commit secrets), `<private>` strip, home-path → `~` sanitization, and the **D-150 auto-judged-privacy** direction — is the AUTOMATED version of this exact warning. Confirms (from the tool the user came from) that automating the secret-screen was the right call: the predecessor left it to a prose warning a user will eventually ignore; the kit made it structural.

### 3. AGENTS.md as the cross-tool interop convention — a Task-50 / D-157 data point

project-memory configures **both `CLAUDE.md` AND `AGENTS.md`** so non-Claude tools (Cursor, etc.) read the same memory — using the **`AGENTS.md` convention as the cross-tool lingua franca.** That's a concrete, cheap interop path for our v0.4 cross-agent lane (D-157 / Task 50): beyond per-agent adapters (the Taskmaster `createProfile` pattern), simply **emitting/maintaining a managed `AGENTS.md` block** (which several non-Claude agents already read) reaches multiple tools with one artifact — a low-cost complement to bespoke per-agent profiles. Also the **`docs/project_notes/` naming rationale** ("looks like standard engineering docs, not AI tooling, to increase human adoption") is the same instinct behind the kit's committed-`context/` + human-readable-markdown choice — convergent design reasoning worth remembering when we frame the kit's files.

## What we would NOT take

- **The flat-file, hand-maintained model** — the kit already surpassed it on every axis (auto-extract, search, tiers, provenance). Going back would undo the kit's reason to exist.
- **`docs/project_notes/` as our path** — we chose `context/` (committed) + `context.local/` (gitignored) + the user tier; their single committed dir has no gitignored/per-machine or cross-project tier.

## Net

**The kit's origin artifact** — a hand-maintained 4-file Claude skill (bugs/decisions/key_facts/issues) that the user replaced by building this kit; every kit feature reads as a deliberate fix for a limitation here. Three durable takeaways: (1) the **error→fix `Issue/Root-Cause/Solution/Prevention` schema** is concrete input for Task 55 and a SECOND (and stronger — actually-used) confirmation of the error→fix-as-first-class signal from the AWS slides; (2) the kit's **Poison_Guard/auto-privacy is the automated answer** to this tool's manual "never store secrets" warning — validates the privacy thesis; (3) **AGENTS.md as a one-artifact cross-tool interop path** is a cheap complement for the Task-50/D-157 cross-agent lane. No new task; signals slotted to Task 55 + the cross-agent gate.

## Reference

- Repo: <https://github.com/SpillwaveSolutions/project-memory> (Claude skill, markdown-only, 82★, MIT, pushedAt 2025-12-29)
- Relates: the kit's whole thesis (auto-extract design §6.0, tiers, provenance, Poison_Guard §6.7, D-150 auto-privacy — all answers to this ancestor's limitations), Task 55 (error→fix schema — the Issue/Root-Cause/Solution/Prevention shape; reinforces the AWS-slides signal), Task 50 + D-157 (AGENTS.md cross-tool interop data point), the AWS AgentCore + build-slides note (the other error→fix source), ADR-0002 (human-readable committed markdown — convergent naming rationale).
