---
date: 2026-06-06
topic: Native Auto Memory coexistence — why a cut-gate run captured to Anthropic's native memory instead of the kit, what the whole field does about it, and the architectural fix
source: Live investigation across cut-gate2/cut-gate3/mem-test3 + 10 competitor README fetches + Anthropic primary-source docs/changelog
tags: [native-auto-memory, coexistence, ADR-0011, competitive, capture, auto-extract, variance, D-74, Task-103, cut-gate]
---

# Native Auto Memory coexistence — investigation

> **One-line verdict:** the kit did **not** regress. A v0.2.0 cut-gate run (`cut-gate3`) happened to capture through Claude Code's **native Auto Memory** instead of the kit — but this is **model variance, not a host/version regression** (a same-version re-run, `mem-test3`, used the kit correctly). The deeper truth: the **entire competitor field captures only via the Stop hook** (immune to native); the kit's *explicit* `cmk remember` path is the one thing native can win, and it's our addition, not theirs. The fix is to make our **immune Stop-hook auto-extract write rich fact files too**, so the explicit path stops being load-bearing.

## What triggered this

During the v0.2.0 live cut-gate (`C:\Temp\cut-gate3`, Session 1), the agent stated preferences ("always .venv", a backend-architecture philosophy, uv/ruff) and **saved them to Claude Code's native Auto Memory** (`Write ~/.claude/projects/<slug>/memory/feedback_*.md`) — it **never called `cmk remember` once**. The kit's project fact store (`context/memory/`) ended up **empty**, while the prior run (`cut-gate2`) had produced **3 rich `cmk remember` fact files**. The maintainer flagged it: *"in cut-gate2 the AI told me it's using the cmk commands… now it goes to the claude built-in memory instead — that's a regression."*

## The verdict matrix (the decisive evidence)

| Run | Claude Code version | Agent's explicit-save path | Kit `context/memory/` | Native dir written |
| --- | --- | --- | --- | --- |
| `cut-gate2` | **2.1.162** | **KIT** (`cmk remember`) | 3 rich fact files | none |
| `cut-gate3` | **2.1.167** | **NATIVE** (`Write …/memory/`) | empty | 5 files |
| `mem-test3` | **2.1.167** | **KIT** (`cmk remember --why/--how`) | 1 rich fact file | none |

**Same version (2.1.167) → both outcomes.** That **kills the version-causation theory definitively**: `mem-test3` on the identical host used the kit correctly (rich fact file, no native). `cut-gate3` was a **one-off**. The cause is **model non-determinism in which memory tool the agent reaches for** — not a host change.

**Honesty note (recorded deliberately):** during the investigation the assistant twice leaned on a "the host auto-updated 2.1.162→2.1.167, native got more aggressive" theory and stated it too confidently. The maintainer pushed back both times. The version delta is real, but the primary source disproves causation (see below) and `mem-test3` is the empirical disproof (same version, kit won). The lesson is the standing one: a correlation stated as a cause is the lazy-framing class — verify against the primary source before asserting.

## Anthropic primary source (what native Auto Memory actually is)

From [code.claude.com/docs/en/memory](https://code.claude.com/docs/en/memory) (fetched 2026-06-06):

- Native Auto Memory = **"notes Claude writes itself"** — the **agent** writes `~/.claude/projects/<project>/memory/` files **during the session** when it judges something worth remembering. *"When you ask Claude to remember something, like 'always use pnpm'… Claude saves it to auto memory."*
- **On by default since v2.1.59.** Disabled via `autoMemoryEnabled: false`, `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1`, or the `/memory` toggle.
- **CLAUDE.md cannot reliably override it:** *"Both are loaded as **context, not enforced configuration**… **To block an action regardless of what Claude decides, use a PreToolUse hook instead.**"* and *"there's **no guarantee of strict compliance**."*

**Changelog:** searched [code.claude.com/docs/en/changelog](https://code.claude.com/docs/en/changelog) — **no Auto Memory behavior change in 2.1.160–2.1.167** (last memory-related entry was 2.1.144, a performance fix). So the version theory has no documented support, consistent with the `mem-test3` disproof.

## What the whole field does (10 competitor READMEs fetched + our source-level dives)

**Capture mechanism per product** (from the READMEs + [`2026-06-01-deep-dive-product-memory-implementations.md`](2026-06-01-deep-dive-product-memory-implementations.md)):

| Product | Disables native? | Capture path |
| --- | --- | --- |
| claude-mem | no / not mentioned | Stop-hook auto-summarize + MCP (search-only) |
| claude-remember | no / not mentioned | hooks (SessionStart/UserPromptSubmit/PostToolUse auto-save) |
| memsearch | no / not mentioned | **Stop hook** → `claude -p haiku` → 2–10 bullets → daily md → reindex |
| MemPalace | no — **"complements"** native | hooks (save periodically + pre-compaction) |
| memory-os | no (a *Hermes* plugin, not Claude Code) | pre/post-LLM hooks |
| gstack / gbrain | no / not mentioned | git commits / MCP |
| Noema / supermemory | no — **"supplement"** | MCP |
| claude_memory | no / not mentioned | hooks + MCP + slash command |
| Hermes | n/a (own runtime) | per-turn background-review agent → memory tools |

**The pattern (the answer to "what does everyone do about native?"):**

1. **Nobody disables native.** None even mention it. The kit is the **only** product with a `disable-native-memory` command.
2. **Nobody has an agent-invoked "remember this" command running inside the conversation.** The entire field captures **only through the Stop hook** (or an after-turn background pass) that auto-summarizes the conversation. The agent never *chooses* a capture tool → **native has nothing to compete with.**
3. **Our `cmk-auto-extract` Stop hook is the SAME shape** as memsearch's/Hermes' (our deep-dive note: *"Same shape"*). The kit **added** an explicit path (`cmk remember` / `mk_remember`) **on top** (our note: *"our 5-tool surface adds `mk_remember` for explicit user-driven saves"*). **That explicit path is our differentiator AND the only surface native can hijack.**

## What is actually at risk when native wins a turn (bounded)

Verified against `cut-gate3` (where native won the explicit saves), the kit's Stop-hook auto-extract **still captured independently**:

| Tier | Survived native-win via Stop-hook auto-extract? |
| --- | --- |
| **Cross-project persona** (USER/HABITS — the wedge, the v0.2.0 wow) | **YES** — 5 promotions filled despite native |
| Project terse bullets (`MEMORY.md`) | **YES** — `.venv` bullet landed (`write: auto-extract`) |
| **Rich project fact files** (B2, Why/How) | **NO** — only the explicit `cmk remember` writes those |

So native-interception costs **rich *project* fact files only** — the least-critical, project-specific recall tier. The **persona/wedge is immune** because the Stop-hook auto-extract owns it (the hook reads the conversation; the agent's tool choice is irrelevant). Caveat: auto-extract is a Haiku judgment pass — a *strong* backstop, not a *guaranteed* one (it graded some `cut-gate3` turns `nothing_durable`).

## Conclusions

1. **Not a regression; not a v0.2.0 blocker.** The kit captures correctly on 2.1.167 (`mem-test3`), and the cross-project wedge is immune to native by construction. `cut-gate3` was variance.
2. **The disable-by-default case (ADR-0011 reversal) is weaker than it first looked** — native-interception is *intermittent* and costs only the rich-fact tier, not the persona. Proportionate response: **make `cmk disable-native-memory` prominent + recommended**, not forced-by-default.
3. **The real architectural fix** (and it aligns us with the entire field while keeping our richness): **enrich `cmk-auto-extract` to write rich Why/How fact files**, so rich capture rides the **immune** Stop-hook path instead of the native-vulnerable explicit path. Then explicit `cmk remember` becomes a bonus, native winning a turn costs nothing, and we match how everyone captures while keeping git-portability + provenance + 3-tier scope as differentiators. Filed as **Task 103**.
4. A CLAUDE.md line steering off native is cheap belt-and-suspenders but, per Anthropic's own docs, **won't reliably hold** — so it cannot be the primary fix. A **PreToolUse hook** is the only *hard* block — **REJECTED by the user (2026-06-06)**: intercepting Claude Code's own tool calls is too invasive/fragile for an intermittent issue.

_Relates ADR-0011 (coexistence; the user's 2026-05-31 coexist-default decision stands, reaffirmed by this evidence), Task 103 (enrich auto-extract), Task 60 (`disable-native-memory`), D-74, the 2026-06-06 competitor README survey, [`2026-05-22-anthropic-claude-code-auto-memory.md`](2026-05-22-anthropic-claude-code-auto-memory.md), [`2026-06-01-deep-dive-product-memory-implementations.md`](2026-06-01-deep-dive-product-memory-implementations.md)._
