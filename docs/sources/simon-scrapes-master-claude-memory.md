---
source_title: Master Claude Memory to Get Ahead of 99% of People
source_url: https://www.youtube.com/watch?v=rFWxRZ5D-lM
companion_url: https://scrapeshq.notion.site/claude-memory-systems
source_type: video + companion Notion writeup
source_date: 2026 (specific date on the YouTube upload page)
consulted_date: 2026-05-20 (during youtube-to-slide work) and 2026-05-21 (re-consulted for kit)
consulted_by: Claude Opus 4.7 + the maintainer
informed_adrs: [0002-markdown-source-of-truth-over-opaque-db.md, 0003-per-project-with-future-cross-project-tier.md, 0006-lifecycle-hooks-architecture.md]
tags:
  - simon-scrapes
  - memory-systems
  - hermes-pattern
  - frozen-snapshot
---

# Source: Master Claude Memory to Get Ahead of 99% of People (Simon Scrapes)

## Provenance

| Field | Value |
|---|---|
| Title | Master Claude Memory to Get Ahead of 99% of People |
| Channel | Simon Scrapes (Scrapes HQ) |
| URL | <https://www.youtube.com/watch?v=rFWxRZ5D-lM> |
| Companion writeup | <https://scrapeshq.notion.site/claude-memory-systems> |
| Type | YouTube video + Notion summary |
| Consulted | 2026-05-20 (during `youtube-to-slide` memory-system build) and 2026-05-21 (re-consulted for kit extraction) |

## Why we consulted this

Simon Scrapes' video is the **original conceptual source** for the per-project, in-repo, layered memory system. The pattern was implemented first in `youtube-to-slide` (during 2026-05-20–21) and extracted into `claude-memory-kit` (starting 2026-05-21).

Simon presents the pattern as a "way to get ahead of 99% of Claude Code users" by manually engineering what most users wait for Anthropic to ship. The video walks through the conceptual layers; the companion Notion provides the install steps and rationale.

## Summary

Simon's memory system has these core ideas:

1. **In-repo, not in `~/.claude/`.** Memory lives at `<repo>/context/` and travels with `git clone`. Per-project, isolated.
2. **Layered:** small bounded scratchpads for hot state, larger granular archive for durable typed facts.
3. **Frozen-snapshot pattern (Hermes-inspired):** at session start, certain files are read once and form a static context. Mid-session writes persist to disk but only take effect next session. Preserves Claude's prefix cache.
4. **Persona-aware:** a `SOUL.md` file captures "how Claude should show up" (tone, disposition, norms) — separate from `USER.md` ("who the user is").
5. **Memory-aware hooks:** Stop hook captures transcripts; PreToolUse hook injects snapshot before first tool call; memory-write skill auto-triggers on user phrases.
6. **Self-curation:** scheduled jobs (daily distill, nightly index, weekly curate) keep MEMORY.md bounded and the system healthy without manual intervention.

## Key claims (paraphrased)

- *"Claude has no native memory. Until that changes, you should build it."*
- *"Don't put memory in `~/.claude/projects/<slug>/`. Put it in the repo. It needs to travel with `git clone`."*
- *"The PreToolUse hook is the trick. Without it, Claude might forget to read MEMORY.md at the start of a session. With it, you guarantee the load."*
- *"The auto-extract Stop hook is what makes memory automatic. The user shouldn't have to flag 'save this' every time something durable happens."*
- *"Frozen snapshot pattern: read once at session start, treat as static, write only takes effect next session. This is how Hermes (Anthropic example agent) does long-context."*

(Exact quotes available by re-watching the video; these are paraphrases for documentation.)

## What we took from it

The entire architecture pattern. In `youtube-to-slide`:

- `context/` directory layout (SOUL.md + USER.md + MEMORY.md + memory/ + sessions/ + transcripts/).
- PreToolUse hook + Stop hook + memory-write skill.
- Frozen-snapshot pattern.
- Layered architecture (Layer 1 = location, Layer 2 = granular archive, Layer 3 = bounded scratchpads, Layer 4 = auto-extract hooks, Layer 5 = memsearch, Layer 6 = cron).
- Daily distill / nightly index / weekly curate cron pattern.

In `claude-memory-kit`:

- All of the above, generalized for portability.
- Plus: the three-tier scope model (user / project / local) which goes BEYOND what Simon's pattern strictly requires — Simon's was project-only; we added user-tier and local-tier in ADR-0003.

## What we did NOT take

- **Whatever specific hook timeouts and detachment patterns Simon used** — we re-derived these from research on claude-mem and claude-remember, which had stronger evidence (see ADR-0006).
- **Simon's specific cron scripts** — we re-implemented from scratch as our needs (auto-distill via `claude --print`) are slightly different from his patterns.
- **The "99% of people" framing** — useful as a hook for the video; not relevant to our docs.

## What we added beyond Simon's pattern

- Content-addressed citation IDs (ADR-0007) — Simon didn't address consolidation.
- Three-tier scope (ADR-0003) — Simon's pattern was project-only.
- Pluggable compressor interface (ADR-0008) — for future bank/air-gap support.
- Spec-driven workflow (ADR-0004, Kiro-style) — Simon's was conversational.

## Why this source matters

Without Simon's video, we'd have either:

- Built nothing (waited for Anthropic to ship memory).
- Built ad-hoc per-project hacks without the layered structure.
- Adopted `claude-mem`'s global opaque-storage model unquestioningly.

Simon's framing of memory as a **per-project, in-repo, layered system** was the architectural seed. Everything in `claude-memory-kit` is a refinement and extension of that core idea.

## Re-consultation triggers

We should re-consult Simon's content when:

- Simon publishes a follow-up (a "v2" memory system video).
- We're about to make a major architectural change that contradicts his pattern.
- We onboard a new contributor unfamiliar with the conceptual foundations.

## Related sources

- Anthropic's official Memory tool docs (validates the markdown approach): [../research/2026-05-21-anthropic-memory-tool.md](../research/2026-05-21-anthropic-memory-tool.md)
- claude-mem architecture survey (alternative model, rejected): [../research/2026-05-21-claude-mem-architecture.md](../research/2026-05-21-claude-mem-architecture.md)
- claude-remember architecture survey (similar model, partial overlap): [../research/2026-05-21-claude-remember-architecture.md](../research/2026-05-21-claude-remember-architecture.md)
- youtube-to-slide repo where the pattern was first implemented: <https://github.com/LH8PPL/youtube-to-slide>

## Updates / re-consultations

| Date | What we re-checked | Outcome |
|---|---|---|
| 2026-05-20 | Initial: building memory system in youtube-to-slide | All 6 layers implemented |
| 2026-05-21 | Re-consulted to extract pattern for kit | Confirmed our extraction preserves all 6 layers |
| 2026-05-21 | Re-consulted to add three-tier scope question | Pattern doesn't address; we extend it via ADR-0003 |
