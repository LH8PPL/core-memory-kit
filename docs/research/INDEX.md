# Research notes — index

Outputs from research sessions. Each file is a dated, self-contained markdown report — either a manual survey we conducted, a Deep Research run from Claude.ai or ChatGPT, or notes on a paper/article.

## Conventions

- Filename: `{YYYY-MM-DD}-{topic-slug}.md`
- Frontmatter: required (`date`, `topic`, `source`, `tags`).
- Body: structured with clear headings; raw research output retained verbatim where useful.
- Citations: full URLs inline, not bare references.

## Index

| Date | Topic | Source | Status |
| --- | --- | --- | --- |
| 2026-05-21 | [claude-mem architecture survey](2026-05-21-claude-mem-architecture.md) | Manual survey via gh CLI + WebFetch | Complete |
| 2026-05-21 | [claude-remember architecture survey](2026-05-21-claude-remember-architecture.md) | Manual survey via WebFetch | Complete |
| 2026-05-21 | [Anthropic Memory tool documentation notes](2026-05-21-anthropic-memory-tool.md) | Manual fetch of platform.claude.com docs | Complete |
| 2026-05-21 | [Claude.ai Deep Research — Option B (targeted)](2026-05-21-claude-ai-deep-research-option-b.md) | Claude.ai Deep Research mode | Complete |
| 2026-05-22 | [ChatGPT Deep Research — Option A (broad landscape)](2026-05-22-chatgpt-deep-research-option-a.md) | ChatGPT Deep Research mode | Complete |

## How research feeds into decisions

1. Research is conducted (manual or Deep Research mode).
2. Output is saved here with frontmatter.
3. Findings are summarized into either:
   - A new ADR ([adr/](../adr/)) if the research drives a decision.
   - A revision to existing requirements ([specs/v0.1.0/requirements.md](../../specs/v0.1.0/requirements.md)) if the research refines an existing decision.
   - A process update ([process/](../process/)) if the research changes how we work.
4. The research note's tags include the ADR numbers it informed, for traceability.

See [../process/research-prompt-design.md](../process/research-prompt-design.md) for the prompt patterns we use.
