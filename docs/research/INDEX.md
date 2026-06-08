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
| 2026-05-22 | [Anthropic Claude Code auto-memory](2026-05-22-anthropic-claude-code-auto-memory.md) | Manual survey | Complete |
| 2026-05-22 | [Claude Code leak — architecture](2026-05-22-claude-code-leak-architecture.md) | Manual survey | Complete |
| 2026-05-22 | [Primary-source examination](2026-05-22-primary-source-examination.md) | Verification pass | Complete |
| 2026-05-22 | [ChatGPT bibliography](2026-05-22-chatgpt-bibliography.md) · [Claude.ai bibliography](2026-05-22-claude-ai-bibliography.md) | Deep Research bibliographies | Complete |
| 2026-05-23 | [Cold-start bootstrap A/B test](2026-05-23-bootstrap-test.md) | In-session doc-transfer experiment | Complete |
| 2026-05-24 | [Beyond the log — time-aware memory](2026-05-24-beyond-the-log-time-aware-memory.md) | Paper/article notes | Complete |
| 2026-05-24 | [GBrain architecture](2026-05-24-gbrain-architecture.md) | Manual survey | Complete |
| 2026-05-24 | [OpenClaw templates](2026-05-24-openclaw-templates.md) | Manual survey | Complete |
| 2026-05-24 | [TencentDB agent memory](2026-05-24-tencentdb-agent-memory.md) | Paper notes | Complete |
| 2026-05-25 | [claude-remember code dive](2026-05-25-claude-remember-code-dive.md) | Source code read | Complete |
| 2026-05-26 | [Claude Code memory guide — verification](2026-05-26-claude-code-memory-guide-verification.md) | Verification pass | Complete |
| 2026-05-29 | [claude-mem install model](2026-05-29-claude-mem-install-model.md) | Manual survey | Complete |
| 2026-05-30 | [gstack skill layer](2026-05-30-gstack-skill-layer.md) | Manual survey | Complete |
| 2026-06-01 | [memory lifecycle + competitive position + Layer 5 deep-research brief](2026-06-01-memory-lifecycle-and-competitive-position.md) | Synthesis + brief | Complete |
| 2026-06-01 | [how researched products implement skills (survey → Task 69.0)](2026-06-01-how-products-implement-skills.md) | Survey (gstack/claude-mem/antigravity) | Complete |
| 2026-06-01 | [deep dive: product memory implementations (source-level) + things we don't do](2026-06-01-deep-dive-product-memory-implementations.md) | Source dive (cloned repos) | Complete |
| 2026-06-04 | [Anthropic Managed-Agents Memory Stores + Dreams — validates D-61, what to steal (Tasks 95/96)](2026-06-04-anthropic-managed-agents-memory-and-dreams.md) | Primary-source fetch (platform.claude.com) | Complete |
| 2026-06-04 | [memory-os (ClaudioDrews) review — authoritative-memory instruction (Task 75) + dynamic trust (Task 97)](2026-06-04-memory-os-review.md) | WebFetch (github) | Complete |
| 2026-06-05 | [MemPalace review — verbatim+vector recall; steal the hybrid pipeline (Task 65) + temporal model (Task 66) + a benchmark (Task 99)](2026-06-05-mempalace-review.md) | WebFetch (github README) | Complete |
| 2026-06-06 | [Competitive research brief — steal / research-the-how / re-visit, for recall+temporal+trust (D-71)](2026-06-06-competitive-recall-research-brief.md) | Synthesis (planning doc) | Brief / in-progress |
| 2026-06-06 | [Source dive: memsearch + MemPalace — the HOW (hybrid recipe + RRF k=60 + keyword/temporal weights + temporal-graph schema + benchmark) (D-72)](2026-06-06-recall-deep-dive-memsearch-mempalace.md) | Cloned + read the code | Complete |
| 2026-06-06 | [Source dive: Graphiti + mem0 + memory-os — bi-temporal, ADD/UPDATE/DELETE memory-manager, the authoritative-memory Ground-Truth wording + trust decay (D-73)](2026-06-06-recall-deep-dive-graphiti-mem0-memoryos.md) | Cloned + read the code | Complete |
| 2026-06-06 | [Native Auto Memory coexistence investigation — variance not regression; the whole field captures via the Stop hook (immune); the fix is enrich auto-extract (D-74, Task 103)](2026-06-06-native-auto-memory-coexistence-investigation.md) | Live cut-gate A/B + 10 competitor READMEs + Anthropic primary source | Complete |

### Competitor spec stacks (raw research inputs — requirements / design / tasks as written by each system)

These are external specs captured verbatim for comparison; they use their own FR/Task namespaces (not the kit's) and are excluded from the kit's reference validator.

- **ChatGPT**: [requirements](chatgpt-requirements.md) · [design](chatgpt-design.md) · [tasks](chatgpt-tasks.md)
- **Cursor**: [requirements](cursor-requirements.md) · [design](cursor-design.md) · [tasks](cursor-tasks.md)
- **Kiro**: [requirements](kiro-requirements.md) · [design](kiro-design.md) · [tasks](kiro-tasks.md)
- **Google Antigravity**: [requirements](google-antigravity-requirements.md) · [design](google-antigravity-design.md) · [tasks](google-antigravity-tasks.md)

## How research feeds into decisions

1. Research is conducted (manual or Deep Research mode).
2. Output is saved here with frontmatter.
3. Findings are summarized into either:
   - A new ADR ([adr/](../adr/)) if the research drives a decision.
   - A revision to existing requirements ([specs/requirements.md](../../specs/requirements.md)) if the research refines an existing decision.
   - A process update ([process/](../process/)) if the research changes how we work.
4. The research note's tags include the ADR numbers it informed, for traceability.

See [../process/research-prompt-design.md](../process/research-prompt-design.md) for the prompt patterns we use.
