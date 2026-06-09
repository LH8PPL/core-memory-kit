---
date: 2026-05-22
topic: Anthropic Claude Code Auto Memory (v2.1.59+) — separate from the API Memory tool
source: WebFetch of <https://code.claude.com/docs/en/memory> + Bash inspection of ~/.claude/projects/ on this machine
status: complete (informs ADR-0011 which is in "proposed" status)
informed_adrs: [0011-coexistence-with-anthropic-auto-memory]
tags:
  - anthropic-auto-memory
  - claude-code
  - native-feature
  - parallel-evolution
  - critical-finding
---

# Research: Anthropic Claude Code's built-in Auto Memory (v2.1.59+)

## Why this matters

Triggered by Faisal Haque's article *"Give Claude Permanent Memory"* (Medium, 2026-05-04, [in SOURCES.md](../SOURCES.md)) which mentioned "Auto Memory in Claude Code v2.1.59+." The user (Claude Code v2.1.140) was unaware this feature existed natively. Investigating before writing `design.md`.

**Finding**: Anthropic ships an Auto Memory feature in Claude Code that is **structurally identical to the in-repo memory system this kit builds** — same `MEMORY.md` entrypoint + `<type>_<slug>.md` granular pattern, same auto-write-during-session model — just stored at a different location (machine-local `~/.claude/projects/<slug>/memory/` instead of in-repo `<repo>/context/`).

## How Anthropic's Auto Memory works (from official docs, 2026-05-22)

| Aspect | Detail |
|---|---|
| Introduced | Claude Code v2.1.59 |
| Default | **ON** |
| Storage location | `~/.claude/projects/<project>/memory/` (where `<project>` is derived from the git repo path, slug-encoded) |
| Worktrees | All worktrees within the same repo share the auto-memory directory |
| Machine-locality | Files NOT shared across machines or cloud environments |
| Entry file | `MEMORY.md` — first 200 lines OR 25KB loaded at session start, whichever comes first |
| Topic files | `debugging.md`, `api-conventions.md`, etc. — read on demand by Claude during session |
| Who writes it | Claude itself, when it judges something is worth remembering across sessions |
| Toggle | `autoMemoryEnabled: false` in settings, OR `/memory` UI toggle, OR `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1` env var |
| Redirect | `autoMemoryDirectory: <absolute path or ~/...>` in **user-level settings only** (security: not project/local) |
| Disabled by `--bare` | Yes, along with hooks/LSP/plugins |
| Survives `/compact` | Project-root CLAUDE.md re-injected; auto-memory MEMORY.md re-read |
| Discovery | `/memory` slash command lists CLAUDE.md/CLAUDE.local.md/rules, toggles auto-memory, links to memory folder |

## How CLAUDE.md scope works (related but separate)

CLAUDE.md has a four-tier hierarchy that maps onto our ADR-0003 three-tier scope but for instructions rather than memory:

| Anthropic CLAUDE.md scope | Location | Maps to our memory tier (ADR-0003) |
|---|---|---|
| Managed policy | OS-specific (`/Library/Application Support/ClaudeCode/CLAUDE.md` on macOS, etc.) | (no equivalent — we don't have org-scope yet) |
| User instructions | `~/.claude/CLAUDE.md` | User tier (`~/.claude-memory-kit/`) |
| Project instructions | `./CLAUDE.md` or `./.claude/CLAUDE.md` | Project tier (`<repo>/context/`) |
| Local (gitignored) | `./CLAUDE.local.md` | Local tier (`<repo>/.claude/local/`) |

Load order: filesystem root downward, with `CLAUDE.local.md` after `CLAUDE.md` at each level. Subdirectory CLAUDE.md files load on-demand when Claude reads files in those directories.

## What we found on this machine (Bash inspection 2026-05-22)

The user's Claude Code v2.1.140 has been silently writing auto-memory for **four projects**:

```text
~/.claude/projects/
├── c--Projects-project-a/memory/      ← 14KB total
│   ├── MEMORY.md (2532 chars)
│   ├── feedback_autonomy.md
│   ├── feedback_clawhub_preference.md
│   ├── feedback_cli_first.md
│   ├── project_bob_gateway_restart_rule.md
│   ├── project_bob_setup.md
│   └── project_claude_mem.md
│
├── c--Projects-project-b/memory/     ← 411 bytes
│   └── MEMORY.md only
│
├── c--Projects-personal-wiki/memory/      ← ~6KB
│   ├── MEMORY.md (598 chars)
│   ├── feedback_no_sre_framing.md
│   ├── feedback_push_after_commit.md
│   ├── project_ai_agent_next.md
│   └── user_hardware.md
│
└── C--Projects-youtube-to-slide/memory/   ← EMPTY directory exists
```

**The youtube-to-slide directory being empty is significant**: this is the only project where claude-memory-kit's hooks are installed. Either:

1. Our hooks preempt Anthropic's auto-memory writes (possible — hooks fire and write to `<repo>/context/`; Claude may "see" the writes already happened and skip auto-memory).
2. Anthropic's auto-memory doesn't fire when alternative hook-driven memory is detected.
3. The user just hasn't used youtube-to-slide enough in Claude Code yet for auto-memory to trigger.

Without further investigation we can't distinguish (1) from (3). Worth a controlled test before `design.md`.

## Why this is the same pattern we designed

| What we proposed (independently) | What Anthropic ships natively |
|---|---|
| `context/MEMORY.md` entrypoint with bounded cap | `MEMORY.md` entrypoint, first 200 lines / 25KB loaded |
| `context/memory/<type>_<slug>.md` granular files | `<type>_<slug>.md` (literally — see `feedback_autonomy.md`, `project_bob_setup.md` above) |
| Topic files read on demand | Topic files read on demand |
| Claude auto-decides what's worth remembering | "Claude decides what's worth remembering based on whether the information would be useful in a future conversation" — official docs verbatim |
| Auto-extract hook fires during session | Auto-write happens during session (no hook needed) |

The convergence is striking enough to be ALMOST CERTAINLY not coincidence. Both designs likely trace back to similar source thinking — Simon Scrapes' video, Anthropic's internal Hermes patterns, the broader markdown-PKM lineage (Obsidian, Logseq). The fact that Anthropic shipped this pattern natively in v2.1.59 (released somewhere in early 2026, exact date pending verification) tells us **the pattern is correct**. We didn't accidentally invent something Anthropic wouldn't.

## Where claude-memory-kit still differentiates

Validated differentiators that hold even with native Auto Memory:

1. **Travels with `git clone`.** Anthropic's auto-memory is machine-local. Ours is in-repo, committed.
2. **3-tier scope.** Anthropic has per-project only (per-repo, worktree-shared). We add user-tier (`~/.claude-memory-kit/`) and local-tier (`<repo>/.claude/local/`) with explicit precedence rules (ADR-0003).
3. **Citation IDs.** Anthropic auto-memory has no stable observation IDs that we can see in the docs or in the inspected files.
4. **Provenance frontmatter.** Anthropic's files appear to be plain markdown — no `source_file`/`write_source`/`trust` fields.
5. **Rolling-window compression** (now → today → recent → archive). Anthropic loads first 200 lines / 25KB but doesn't appear to compress proactively.
6. **Raw transcript preservation** (`transcripts/{date}.md` indefinitely). Anthropic's design doesn't include verbatim transcript retention.
7. **Hooks for additional capture surface** (UserPromptSubmit prompt-tagging, PostToolUse delta tracking, SessionEnd compression). Anthropic's auto-memory writes opportunistically without hooks.

## Where Anthropic does things better than us (worth borrowing)

1. **`InstructionsLoaded` hook** for debugging which files load and when. We should adopt this in design.md.
2. **`@path/import` syntax** in CLAUDE.md for composing instructions. Cleaner than our PreToolUse-hook injection for CLAUDE.md content.
3. **`.claude/rules/` directory** with path-scoped rules (`paths: src/**/*.ts` frontmatter). Better than skills for "load when working in matching subdirectory."
4. **`/memory` slash command** for inspection/toggle. We should ship `cmk memory` or similar.
5. **`claudeMdExcludes` setting** for skipping irrelevant ancestor CLAUDE.md files in monorepos.
6. **HTML comments stripped from context** automatically. Validates our `<!-- Cap: 2500 chars -->` frontmatter design — those comments don't burn tokens.
7. **`/compact` survives** by re-reading project CLAUDE.md after compaction. We hadn't designed for compaction; should add a hook for this.
8. **`autoMemoryDirectory` security model**: setting accepted from policy/user/CLI flag only, NOT from project/local settings. Cloned repos can't redirect writes. We should mirror this discipline for any settings we add.

## The strategic question

Open as ADR-0011 (`status: proposed`). Three options:

- **A**: Disable Anthropic's auto-memory; our system is the only writer (`autoMemoryEnabled: false` in project settings, committed).
- **B**: Redirect Anthropic's auto-memory to write into our `context/` (`autoMemoryDirectory` in user settings — per-user, not commitable).
- **C**: Layer them; two memories at two locations.

User decision pending. See [adr/0011-coexistence-with-anthropic-auto-memory.md](../adr/0011-coexistence-with-anthropic-auto-memory.md) for the full context and decision criteria.

## Investigation to do before deciding

1. **Inspect what Anthropic auto-memory wrote on your machine** — open `/memory` in a Claude Code session, browse the files at `~/.claude/projects/c--Projects-{project-a,project-b,personal-wiki}/memory/`. Decide if Anthropic's writes are useful or noise.

2. **Test on youtube-to-slide** — start a session, do a meaningful turn (e.g. `remember that the Python version is 3.13`), watch for:
   - Does Anthropic's auto-memory write to `~/.claude/projects/C--Projects-youtube-to-slide/memory/`?
   - Does our auto-extract hook write to `<repo>/context/MEMORY.md`?
   - If both fire: do they capture the same fact, different facts, or one-of?

3. **Compare write quality** — read Anthropic's auto-memory `feedback_*.md` files vs our auto-extract entries. Same accuracy? Same conservative bias?

## References

- Anthropic Claude Code Memory docs (canonical): <https://code.claude.com/docs/en/memory>
- The Plain English article that surfaced this: <https://ai.plainenglish.io/give-claude-permanentmemory-7b4343de2d7e>
- Related: [research/2026-05-21-anthropic-memory-tool.md](2026-05-21-anthropic-memory-tool.md) — the API-level Memory tool (different feature, same company, related design language)
- Related: [adr/0011-coexistence-with-anthropic-auto-memory.md](../adr/0011-coexistence-with-anthropic-auto-memory.md) — the decision this research informs
