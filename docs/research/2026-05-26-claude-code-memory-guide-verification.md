---
date: 2026-05-26
source: docs/sources/gul-jabeen-claude-memory-guide-2026.md (dropped into the repo by the user via IDE; article from Medium / Data Science Collective, Gul Jabeen, 2026-03-17, https://medium.com/data-science-collective/claude-code-memory-management-the-complete-guide-2026-b0df6300c4e8)
method: primary-source verification per CLAUDE.md "Did you check?" rule. Each factual claim about Claude Code cross-checked against code.claude.com/docs/en/memory (the canonical Anthropic source after the docs.claude.com → code.claude.com migration) + the kit's existing research base (Anthropic memory tool docs, claude-mem deep-dive, hook payload research).
verdict: ~ (PARTIAL) — broadly accurate on the 4-layer architecture, file paths, and core commands; specific numbers fabricated; factually wrong on the claude-mem description.
---

# Article verification — "Claude Code Memory Management: The Complete Guide (2026)"

## Why this verification exists

The user dropped the article into the repo between PR-D1's merge and PR-D2's start. The verification is a direct application of CLAUDE.md's primary-source rule + the campaign's verification meta-rules (rules #1, #2, #6 specifically — "Did you check?", "convention-convergence is not primary-source verification", "lazy framing hides real bugs"). The article is the kind of secondary source those rules were written to catch.

## Verified against Anthropic primary docs

The following claims match [code.claude.com/docs/en/memory](https://code.claude.com/docs/en/memory) verbatim or near-verbatim:

- **4 memory tiers**: Managed Policy / User / Project / Auto Memory. The Anthropic table lists Managed policy, User instructions, Project instructions, Local instructions, plus a separate "Auto memory" section — same shape with one naming difference (Anthropic separates "Local instructions" `./CLAUDE.local.md` from the project tier; the article folds them together as "Layer 3").
- **`~/.claude/CLAUDE.md`** for user instructions — ✓ exact match.
- **`./CLAUDE.md` or `./.claude/CLAUDE.md`** for project — ✓ exact match.
- **`@filename` import syntax** — *"CLAUDE.md files can import additional files using `@path/to/import` syntax"*. Import depth: 4 hops max. Both relative and absolute paths allowed.
- **`/init` command** generates project CLAUDE.md — *"Run `/init` to generate a starting CLAUDE.md automatically. Claude analyzes your codebase and creates a file with build commands, test instructions, and project conventions it discovers."*
- **Auto memory location `~/.claude/projects/<project>/memory/`** — ✓ exact match. Plus: derived from the git repo root; all worktrees share the same memory directory.
- **Auto memory captures** debugging insights, preferences, build commands — ✓ Anthropic phrasing: *"build commands, debugging insights, architecture notes, code style preferences, and workflow habits"*.
- **"Remember that…" force-saves to memory** — ✓ *"When you ask Claude to remember something, like 'always use pnpm, not npm'… Claude saves it to auto memory."*
- **`.claude/rules/` subdirectory with topic-scoped files** — ✓ exact match.
- **Path-scoped rules via `paths:` YAML frontmatter** — ✓ exact format including `paths: ["src/api/**/*.ts"]`. Glob syntax supported (`**/*.ts`, `src/**/*`, brace expansion `*.{ts,tsx}`).
- **`/memory` command** — ✓ *"lists all CLAUDE.md, CLAUDE.local.md, and rules files loaded in your current session, lets you toggle auto memory on or off, and provides a link to open the auto memory folder."*
- **"200K token context window"** — ✓ `MAX = 200000` in the context-window simulation.
- **CLAUDE.md survives `/compact`** — ✓ *"Project-root CLAUDE.md survives compaction: after `/compact`, Claude re-reads it from disk and re-injects it into the session."*

## Verified with one critical detail the article got wrong

### MEMORY.md loading threshold

**Article**: *"Only the first 200 lines of MEMORY.md are loaded at session start."*
**Anthropic**: *"The first 200 lines of `MEMORY.md`, **or the first 25KB, whichever comes first**, are loaded at the start of every conversation."*

The 25KB clause is load-bearing. A bullet-heavy `MEMORY.md` with short lines could easily fit 200 lines in <25KB; a paragraph-heavy file could exceed 25KB in <200 lines. The article omits the byte-ceiling entirely.

**Implication for the kit**: design.md cites the 200-line rule but doesn't currently encode the 25KB ceiling. Could affect snapshot-cap composition (design §7.1) — flagged below as a v0.1.x candidate.

### CLAUDE.md size threshold

**Article**: *"Keep it under 150 lines. Above 200 lines, Claude starts ignoring parts of it silently."*
**Anthropic**: *"target under 200 lines per CLAUDE.md file. Longer files consume more context and reduce adherence."*

The article invents two specific numbers (150-line target, 200-line silent-ignore cliff) around Anthropic's actual recommendation (under 200 lines, soft "reduce adherence"). The "silent ignore" framing is folklore — Anthropic describes a soft adherence reduction, not a hard cliff.

This is a clean example of the **specific-numbers-feel-cited** failure mode: the numbers sound authoritative + are easy to repeat + don't appear in any primary source.

## Unverifiable claims (specific numbers NOT in Anthropic's docs)

| Article claim | Status |
| --- | --- |
| "Real usable space is ~160–170K" | Not in primary docs |
| "Performance degrades around 147K" | Not in primary docs |
| "Problems start around 70% usage" | Not in primary docs |
| "Run `/compact` around 65–70%" | Anthropic recommends `/compact` *"when context starts affecting performance"* — no percentage |

These four together form a **folklore cluster** — specific enough to feel sourced, none of them in any Anthropic doc. Either the author has internal knowledge (no claim of insider status) or fabricated round numbers for credibility.

## Factual error (matters)

**Article claim**: *"claude-mem combines SQLite (structured storage) + Vector embeddings (semantic search) + Automatic context injection… stores entities, relationships, observations."*

**Reality**: this fuses the name of one project (`thedotmack/claude-mem`) with the data model of another (`modelcontextprotocol/servers/memory`).

| Project | Storage | Schema | Search |
| --- | --- | --- | --- |
| **`thedotmack/claude-mem`** (the name in the article) | SQLite | `observations` + `observations_fts` (no entities, no relationships) | **FTS5 lexical** (not vector embeddings) |
| **`modelcontextprotocol/servers/memory`** (the data model in the article) | JSONL | `Entity { name, entityType, observations[] }`, `Relation { from, to, relationType }` | none built-in; consumer queries the graph |

Source: the kit's [`docs/research/2026-05-21-claude-ai-deep-research-option-b.md`](2026-05-21-claude-ai-deep-research-option-b.md) deep-dive verified both projects against their actual source (`src/services/sqlite/migrations.ts` for claude-mem; `modelcontextprotocol/servers/src/memory` for the knowledge-graph server).

A reader who installs `claude-mem` expecting entity/relationship queries gets a different product. The article's conflation is a real interoperability hazard.

## Patterns presented as community-but-not-Anthropic (correctly framed)

These are not failures — the article frames them as community workflows, not official features. Just naming them for completeness:

- **primer.md** (`~/.claude/primer.md` + agent-rule to rewrite at session end) — community pattern.
- **Git post-commit hook → `.claude-memory.md`** — community recipe.
- **Hooks pattern "SessionStart → PostToolUse → Stop"** — 3 real hooks but **incomplete**. Claude Code's canonical hook list per the kit's [`docs/research/2026-05-21-claude-ai-deep-research-option-b.md`](2026-05-21-claude-ai-deep-research-option-b.md): SessionStart, UserPromptSubmit, PreToolUse, PostToolUse, Stop, SessionEnd, PreCompact, Notification — plus the `InstructionsLoaded` hook documented in Anthropic's memory docs as a debug aid. Article picks 3 as a recommended starting pattern; readers might miss the rest.

## Verification surfaced these items NOT in the article (Anthropic primary docs)

Working through Anthropic's actual memory docs to verify the article surfaced four facts the kit didn't have in its research base:

1. **`InstructionsLoaded` hook** — *"Use the `InstructionsLoaded` hook to log exactly which instruction files are loaded, when they load, and why."* Useful for debugging path-specific rules or lazy-loaded subdirectory CLAUDE.md files. The kit's hook research didn't surface this. **v0.1.x candidate** — could be useful for `cmk doctor` HC-* diagnostics or as a debug aid during the spec-reference validator's rollout.
2. **`CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD` env var** — when set to `1`, `--add-dir` paths also load their CLAUDE.md files. The kit's multi-tier story doesn't currently address `--add-dir` interaction. **Worth a design §1.2 note**.
3. **MEMORY.md 25KB-OR-200-lines threshold** — see "Verified with critical detail wrong" above. **Should be cross-checked against the kit's snapshot-cap composition rule** (design §7.1).
4. **Block-level HTML comments stripped from CLAUDE.md context** — *"Block-level HTML comments (`<!-- maintainer notes -->`) in CLAUDE.md files are stripped before the content is injected into Claude's context. Use them to leave notes for human maintainers without spending context tokens on them."* Could be useful for the kit's own template CLAUDE.md scaffolding to add maintainer notes that don't burn tokens. **v0.1.x candidate**.
5. **`claudeMdExcludes` setting** — exclude specific CLAUDE.md files in monorepos by path/glob. Not currently addressed in the kit's design. v0.2+ note for monorepo users.
6. **Symlink-as-AGENTS.md trick** — `ln -s AGENTS.md CLAUDE.md` for cross-tool compatibility (Cursor / Codex / etc). v0.2+ note.

**Meta-observation**: the verification's most useful output was NOT validation of the article's claims — it was the **side findings from Anthropic's primary docs that the article triggered me to read**. Items #1, #3, #4 above are real candidates for the kit. This is exactly the pattern CLAUDE.md's verification rules describe: the act of verifying against the primary source surfaces things the verifier didn't know to look for.

## Outcome

- **Catalogue**: SOURCES.md entry with `~` marker (partial verification, factual errors noted). The article is a reasonable beginner guide for the 4-layer architecture; not authoritative on specific limits or claude-mem.
- **v0.1.x candidates not opened in this session** (per the user's scope choice for this verification): items #1 (InstructionsLoaded hook), #3 (MEMORY.md 25KB ceiling vs kit cap composition), #4 (HTML-comment stripping). Linked from here for future capture.
- **No action on the claude-mem mischaracterization** beyond this research note (kit's own claude-mem citations live in `docs/research/2026-05-21-claude-ai-deep-research-option-b.md` and are independently verified — no rot to fix).

## Resumes

PR-D2 (Part 5/6 of the post-PR-31 audit campaign) starts after this entry lands.
