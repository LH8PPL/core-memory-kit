---
title: claude-mem install model — single complete entry point + --ide multi-agent
date: 2026-05-29
status: complete
source: claude-mem README Quick Start (pasted by Lior 2026-05-29 from the live repo)
related_research:
  - 2026-05-21-claude-mem-architecture.md
informed:
  - design.md §16.49 (unify install)
  - design.md §16.50 (cross-agent --ide)
  - design.md §16.51 (first-class /plugin marketplace path)
  - ADR-0012 (cross-agent naming deferral)
tags:
  - claude-mem
  - install
  - plugin
  - cross-agent
  - ux
---

# claude-mem install model — verified from README (2026-05-29)

## Why this note exists

At v0.1.0 publish + first-usage walkthrough, two questions surfaced:

1. Why does our kit need a **two-step** install (`npm install -g` + `cmk install`, AND separately `/plugin install`)? Is that a must?
2. (Earlier, ADR-0012) What happens when we want cross-agent support (codex/cursor/kiro/gemini)?

I initially answered #1 from memory of the older claude-mem research note and got the nuance wrong. Lior pasted claude-mem's actual README Quick Start, which is the primary source captured below. This corrects + sharpens the comparison.

## Primary source — claude-mem README "Quick Start" (verbatim, pasted 2026-05-29)

> ## Quick Start
>
> Install with a single command:
>
> ```bash
> npx claude-mem install
> ```
>
> Or install for Gemini CLI (auto-detects `~/.gemini`):
>
> ```bash
> npx claude-mem install --ide gemini-cli
> ```
> Or install for OpenCode:
>
> ```bash
> npx claude-mem install --ide opencode
> ```
>
> Or install from the plugin marketplace inside Claude Code:
>
> ```bash
> /plugin marketplace add thedotmack/claude-mem
> /plugin install claude-mem
> ```
>
> Restart Claude Code or Gemini CLI. Context from previous sessions will automatically appear in new sessions.
>
> > **Note:** Claude-Mem is also published on npm, but `npm install -g claude-mem` installs the **SDK/library only** — it does not register the plugin hooks or set up the worker service. Always install via `npx claude-mem install` or the `/plugin` commands above.

## What this establishes

### 1. claude-mem has TWO COMPLETE entry points (pick one)

- **Route A (npm)**: `npx claude-mem install` — registers the plugin hooks + worker service. Complete on its own.
- **Route B (Claude Code)**: `/plugin marketplace add thedotmack/claude-mem` + `/plugin install claude-mem`. Complete on its own.

The critical distinction in their Note: `npm install -g claude-mem` is **library-only** — it does NOT wire hooks. The `install` *subcommand* (`npx claude-mem install`) is what does the setup. So they cleanly separate "the library" from "the installer."

### 2. Our kit's npm route is INCOMPLETE — that's the wart

- Our `npm install -g @lh8ppl/claude-memory-kit` + `cmk install` scaffolds `context/` but does **not** wire the hooks (hook bins live in `plugin/bin/`, commands reference `${CLAUDE_PLUGIN_ROOT}`). So the user is forced to ALSO run the `/plugin` step. Both steps mandatory.
- It's not that we have "two channels" (claude-mem has two too). It's that **neither of our steps is complete alone**, whereas each of claude-mem's is.
- Diagnosis precisely: our `cmk install` should do what `npx claude-mem install` does — wire the hooks. See design §16.49.

### 3. Multi-agent is an installer flag, and the name doesn't block it

- `npx claude-mem install --ide gemini-cli` / `--ide opencode` — a single installer with an `--ide` flag that auto-detects each agent's config dir.
- claude-mem kept the name "claude-mem" while supporting Gemini + OpenCode. **The "claude" in the name did not block multi-agent.** This validates ADR-0012's call to defer the kit's cross-agent rename — and shows the rename may not even be necessary (claude-mem didn't rename).
- The concrete pattern for our v0.2: `cmk install --ide claude-code|cursor|codex|gemini-cli`. See design §16.50.

## Patterns to absorb (technique only; we write our own implementation)

| Pattern | claude-mem | Apply to kit |
| --- | --- | --- |
| Single complete npm-route installer | `npx claude-mem install` wires hooks+worker | `cmk install` should wire hooks (§16.49 / Task 49) |
| Library vs installer separation | `npm install -g` = SDK only; `install` subcommand = setup | Document the distinction; `cmk install` is the setup entry point |
| Two parallel complete entry points | npx-installer OR /plugin marketplace | Make BOTH routes complete (§16.49 + §16.51 / Task 49) |
| Multi-agent via `--ide` flag | `--ide gemini-cli\|opencode`, auto-detect config dir | `cmk install --ide <agent>` (§16.50 / Task 50, v0.2) |
| Name need not match the agent | "claude-mem" supports Gemini/OpenCode | Reinforces ADR-0012 — rename optional, not required |

## License / attribution

claude-mem (thedotmack/claude-mem) — we absorb the install-UX *patterns* (single complete entry point, `--ide` flag, library/installer split), not code or prose. Attribution in [`SOURCES.md`](../SOURCES.md). The README quote above is a short factual excerpt for comparison/criticism.
