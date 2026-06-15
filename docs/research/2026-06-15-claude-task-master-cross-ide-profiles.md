---
date: 2026-06-15
topic: claude-task-master (Taskmaster) — the cross-IDE PROFILE/ADAPTER pattern as concrete prior art for our Task 50 cross-agent install (incl. real Kiro facts)
source: Cloned + read the JS source — https://github.com/eyaltoledano/claude-task-master (JS, 27.5k★, pushedAt 2026-04-28). NOT a memory system — reviewed for the cross-IDE adapter layer only.
tags: [taskmaster, cross-agent, cross-ide, adapter, profile, kiro, Task-50, rule-transformer, multi-editor, competitive-analysis]
---

# claude-task-master — cross-IDE profile/adapter pattern (Task 50 prior art)

> **What it is.** An AI task-management system (tasks-as-JSON + a `task-master` CLI + an MCP server) that "drops into" Cursor / Windsurf / Roo / Cline / VS Code / **Kiro** / Codex / Zed / Gemini / etc. 27.5k★, MIT-with-Commons-Clause, JS monorepo (turbo). **NOT a memory system** — no durable cross-session memory, no recall, no write/dedup path to compare. So the memory-write/search question doesn't apply. The one surface that overlaps US is the **multi-IDE adapter layer**, which is exactly our **Task 50** (v0.4 cross-agent install, KIRO FIRST per D-127).

## Why it's relevant despite not being a memory system

Task 50 says: *"per-agent adapter modules: each knows (a) the agent's hook/lifecycle-event names, (b) its settings-file location + schema, (c) its session-transcript format. Memory store + compression + search + CLI stay identical."* Taskmaster has **already built and shipped exactly this shape** across 16 editors, including Kiro. It's the most direct prior art we've found for the cross-agent install architecture — worth taking the PATTERN (not the code; it's task-management, not memory).

## How their adapter layer works (the pattern)

`src/profiles/` — one thin profile per editor (`cursor.js`, `kiro.js`, `windsurf.js`, `roo.js`, `cline.js`, `vscode.js`, `codex.js`, `gemini.js`, `zed.js`, `amp.js`, `kilo.js`, `opencode.js`, `trae.js`, `claude.js`) built on a **`createProfile({...})` factory** (`base-profile.js`).

Each profile declares ONLY what differs per editor:

| Field | What it captures | Maps to our Task 50… |
| --- | --- | --- |
| `profileDir` (e.g. `.kiro`, `.cursor`) | where the editor keeps its config | (b) settings-file location |
| `rulesDir` (e.g. `.kiro/steering`, `.cursor/rules`) | where rule/instruction files go | (b) — our CLAUDE.md-block analogue per agent |
| `mcpConfig` + `mcpConfigName` (e.g. `.kiro/settings/mcp.json`) | the editor's MCP registration file | (b) — our `.mcp.json` registration per agent |
| `targetExtension` (`.md` / `.mdc`) | the editor's rule-file format | the per-agent file format |
| `fileMap` | canonical rule filename → editor-specific filename | the canonical→agent rename |
| `customReplacements` | regex transforms (paths, terminology, frontmatter) from the canonical rule set into the editor's dialect | the "rule-transformer" |
| `onAdd` / `onRemove` / `onPostConvert` | lifecycle hooks (e.g. copy Kiro `.kiro.hook` files on install) | (a) hook/lifecycle wiring |

**The key idea — a "rule-transformer":** ONE canonical rule set (`assets/rules/*.mdc`) is transformed per-editor via `fileMap` (rename) + `customReplacements` (regex rewrite of paths/terminology/frontmatter). Adding a new editor = one small profile object, not a fork. **This is precisely the "store/CLI stay identical, only the adapter differs" architecture Task 50 specifies.** They also split **solo vs team** rule modes (`RULE_MODES`) — local-file storage rules vs cloud/API ("Hamster") rules; team mode is exclusive. (Loosely echoes our project-tier vs a future team layer, Task 127 — but theirs is a paid-cloud split, not our git-native model.)

## Concrete KIRO facts (primary-source-adjacent — verify at build, but a strong head start)

From `src/profiles/kiro.js` — the real Kiro integration details, which we'd otherwise have to derive from kiro.dev:

- **Rules/steering live in `.kiro/steering/`** (NOT `.kiro/rules` — they explicitly rewrite that).
- **MCP config at `.kiro/settings/mcp.json`** (in a `settings/` subdir, created directly there).
- **Hooks are `.kiro/hooks/*.kiro.hook` files**, copied in via an `onPostConvert` lifecycle hook from a `kiro-hooks/` asset dir.
- **Steering-file frontmatter uses `inclusion: always`** (they regex-transform Cursor's `description/globs/alwaysApply` frontmatter into Kiro's `inclusion: always`).
- `displayName: 'Kiro'`, `url: 'kiro.dev'`, `docsUrl: 'kiro.dev/docs'`, `targetExtension: '.md'`.

**Caveat (the "did you check the primary source" rule):** these are Taskmaster's encoding of Kiro's conventions, current as of their 2026-04-28 push — convergent third-party evidence, NOT Kiro's own docs. When we build Task 50, **verify each against kiro.dev directly** (the design.md §5.1 plugin-layout bug is the precedent: convergent-third-party ≠ primary source). But this gives us the SHAPE + the specific paths to confirm, which is most of the discovery work.

## What's worth taking (for Task 50)

1. **The `createProfile()` factory + thin-per-agent-profile pattern.** Adopt the ARCHITECTURE: a base adapter factory + one small declaration per agent (Kiro first). Each declares profileDir / rulesDir(=where our CLAUDE.md block + skills go) / mcpConfigName(=where we register `mcp__cmk__*`) / lifecycle hooks (=where we wire the Stop/SessionStart equivalents). This is a cleaner shape than a big switch-on-agent; it's the deep-module-narrow-interface principle applied to multi-agent install. _Design input for Task 50.2 ("per-agent adapter modules")._
2. **The lifecycle-hook seam (`onPostConvert`) for per-agent hook installation.** Kiro hooks aren't settings entries — they're `.kiro.hook` files copied into `.kiro/hooks/`. Our install already wires Claude Code hooks via settings.json; a per-agent `onInstall` seam that does the agent-specific hook wiring (file-copy for Kiro, settings-entry for Claude Code) is the generalization Task 50 needs. _Design input for Task 50 (a) hook/lifecycle wiring._
3. **The Kiro path/format facts above** — a verified-at-build head start on Task 50's KIRO-FIRST discovery.

## What we would NOT take

- **The code itself** — it's task-management (tasks.json, PRD-parsing, task-expansion), not memory; nothing in the write/search/dedup space to reuse.
- **The solo/team "Hamster" cloud split** — a paid SaaS backend; our team story (Task 127) is git-native + local-first, deliberately not a cloud brain (D-119).
- **A 16-editor launch.** Task 50 is KIRO-FIRST by the user's call (D-127 — daily-IDE dogfood beats breadth); we add agents one at a time after Kiro, not a big-bang matrix.
- **`.mdc` canonical format + regex-rewrite-per-editor.** Our canonical surface is markdown + the managed CLAUDE.md block + skills; we'd transform from THAT, not adopt their Cursor-`.mdc`-centric source format.

## Net

**Not a memory system → nothing for write/search/recall.** The one real yield is **architectural prior art for Task 50** (v0.4 cross-agent, Kiro-first): the `createProfile()` factory + thin-per-agent-profile + rule-transformer + lifecycle-hook seam is the exact adapter shape Task 50 specifies, already proven across 16 editors — and `kiro.js` hands us the concrete `.kiro/steering/` + `.kiro/settings/mcp.json` + `.kiro/hooks/*.kiro.hook` + `inclusion: always` facts to verify against kiro.dev when we build it. No new task (Task 50 already exists, v0.4-gated); logged as its design input.

## Reference

- Repo: <https://github.com/eyaltoledano/claude-task-master> (JS, 27.5k★, MIT+Commons-Clause, pushedAt 2026-04-28)
- Relates: Task 50 (cross-agent install, KIRO FIRST — D-127, the v0.4 headline), ADR-0005 (install paths), ADR-0012 (cross-agent future), Task 127 (team layer — their solo/team split is a contrast, not a model).
